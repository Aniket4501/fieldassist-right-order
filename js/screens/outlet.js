// Outlet details: who the outlet is, what it ordered, when the next visit is, schemes, rep notes, Book order.

import { getData } from '../data.js';
import { getStore } from '../store.js';
import { formatDate, relativeDay } from '../dates.js';
import { inr, num, casesLabel, plural } from '../format.js';
import {
  h, icon, card, chip, button, filterChip, stepper, appHeader, actionBar, emptyState, disclosure, factList, barRow,
} from '../components/ui.js';
import { recommend } from '../engine/recommendationEngine.js';

const HOME = '#/home';
const OUTLETS = '#/outlets';

// Where Back points for the outlet that is open. It is set when the user arrives from the route or
// from the outlet list, and kept when they come back from the order screens.
let origin = { outletId: null, href: HOME };

function backHrefFor(outletId, from) {
  if (from === HOME || from === OUTLETS) origin = { outletId, href: from };
  else if (origin.outletId !== outletId) origin = { outletId, href: HOME };
  return origin.href;
}

/**
 * coldChain(cooler) → { label, icon, tone, detail }
 * The outlet's cold-chain state in words, built from outlet.cooler. `label` is the short chip text
 * ("Bottler cooler", "2 bottler coolers", "Own fridge", "Ice box", "No cooler"); `detail` adds the litres.
 */
export function coldChain(cooler) {
  const type = cooler && cooler.type;
  const count = cooler && Number(cooler.count) > 1 ? Number(cooler.count) : 1;
  const litres = cooler && Number(cooler.litres) > 0 ? `${num(cooler.litres)} L` : null;
  const size = litres && (count > 1 ? `${litres} each` : litres);
  const named = (one, many) => (count > 1 ? `${num(count)} ${many}` : one);
  const withSize = (label) => [label, size].filter(Boolean).join(' · ');

  if (type === 'bottler') {
    const label = named('Bottler cooler', 'bottler coolers');
    return { label, icon: 'snow', tone: 'chill', detail: withSize(label) };
  }
  if (type === 'own') {
    const label = named('Own fridge', 'own fridges');
    return { label, icon: 'snow', tone: 'neutral', detail: withSize(label) };
  }
  if (type === 'icebox') {
    const label = named('Ice box', 'ice boxes');
    return { label, icon: 'snow', tone: 'neutral', detail: withSize(label) };
  }
  if (type === 'none') return { label: 'No cooler', icon: 'minus', tone: 'neutral', detail: 'No cooler' };
  return { label: 'Cooler not known', icon: 'info', tone: 'neutral', detail: 'Not known' };
}

function section(id, title, ...children) {
  return h('section', { class: 'section', attrs: { 'aria-labelledby': id } },
    h('h3', { class: 'section__title', id, text: title }),
    children);
}

function dateLine(iso, demoDate) {
  const relative = relativeDay(iso, demoDate);
  return [formatDate(iso, 'long'), relative].filter(Boolean).join(' · ');
}

// --------------------------------------------------------------------------
// Sections
// --------------------------------------------------------------------------

function identity(data, outlet) {
  const cold = coldChain(outlet.cooler);
  const plan = data.routePlan && data.routePlan[outlet.id];
  const onRoute = Array.isArray(plan) && plan.includes(data.demoDate);

  return h('div', { class: 'outlet__identity' },
    h('h2', { class: 'outlet__name', text: outlet.name || outlet.id }),
    h('p', { class: 'outlet__where num', text: [outlet.area, outlet.id].filter(Boolean).join(' · ') }),
    outlet.address && h('p', { class: 'outlet__where num', text: outlet.address }),
    h('div', { class: 'outlet__chips' },
      outlet.channel && chip(outlet.channel),
      outlet.segment && chip(outlet.segment, { tone: 'primary' }),
      chip(cold.label, { tone: cold.tone, icon: cold.icon }),
      onRoute && chip('On today’s route', { tone: 'ok', icon: 'route' })));
}

function lastOrderCard(data, outlet) {
  const last = data.lastOrder(outlet.id);
  if (!last) {
    return card({ class: 'panel' }, h('p', { class: 'outlet__plain', text: 'No orders yet.' }));
  }
  const today = last.demo && last.date === data.demoDate;
  return card({ class: 'panel' },
    h('div', { class: 'stat' },
      h('span', { class: 'stat__value num', text: inr(last.value) }),
      h('span', { class: 'stat__label num', text: `${casesLabel(last.cases)} · before scheme discount` })),
    h('p', { class: 'meta-line' },
      icon('calendar', { size: 16 }),
      // "Booked today" already says when.
      h('span', { class: 'num', text: today ? formatDate(last.date, 'long') : dateLine(last.date, data.demoDate) }),
      today && chip('Booked today', { tone: 'ok', icon: 'check' })));
}

function weeksSection(data, outlet) {
  const summary = data.orderSummary(outlet.id);
  const weeks = Array.isArray(summary.weeks) ? summary.weeks : [];
  const done = weeks.filter((week) => !week.current);
  return section('outlet-weeks', `Last ${plural(done.length || 8, 'week', 'weeks')}`, weeksCard(summary, weeks, done));
}

function weeksCard(summary, weeks, done) {
  const anyCases = weeks.some((week) => week.cases > 0);
  if (!weeks.length || !anyCases) {
    return card({ class: 'panel' },
      h('p', { class: 'outlet__plain num', text: `No orders in the last ${plural(done.length || 8, 'week', 'weeks')}.` }));
  }

  const first = done[0];
  const lastDone = done[done.length - 1];
  const bars = weeks.map((week) => ({
    value: week.cases,
    text: num(week.cases),
    outlined: week.current,
    caption: week.current ? 'This week'
      : week === first || week === lastDone ? formatDate(week.start, 'dm') : '',
    align: week.current ? 'center' : week === first ? 'start' : 'end',
  }));
  // The same row in words, for a screen reader.
  const spoken = 'Cases booked each week. ' + weeks.map((week) => (week.current
    ? `This week so far: ${casesLabel(week.cases)}.`
    : `Week of ${formatDate(week.start, 'dm')}: ${casesLabel(week.cases)}.`)).join(' ');

  return card({ class: 'panel' },
    h('div', { class: 'stat' },
      h('span', { class: 'stat__value num', text: num(summary.avgCasesPerWeek, 1) }),
      h('span', { class: 'stat__label', text: 'cases a week, on average' })),
    barRow(bars, { label: spoken }),
    h('p', { class: 'meta-line num', text: `${plural(summary.orderCount, 'order', 'orders')} · ${casesLabel(summary.totalCases)} in ${plural(done.length, 'week', 'weeks')}` }));
}

function nextVisitCard(data, outlet) {
  const next = data.nextVisit(outlet.id);
  if (!next) {
    return card({ class: 'panel' }, h('p', { class: 'outlet__plain', text: 'No next visit in the plan.' }));
  }
  return card({ class: 'panel' },
    h('div', { class: 'stat' },
      h('span', { class: 'stat__value stat__value--20 num', text: formatDate(next, 'long') }),
      h('span', { class: 'stat__label num', text: relativeDay(next, data.demoDate) })));
}

// The scheme's terms as a sentence, built from its fields.
function schemeTerms(scheme) {
  const pooled = scheme.pooled && Array.isArray(scheme.skus) && scheme.skus.length > 1;
  const parts = [];
  if (scheme.type === 'buy_x_get_y') {
    parts.push(`Buy ${casesLabel(scheme.buyCases)}, get ${casesLabel(scheme.freeCases)} free.`);
  } else if (scheme.type === 'pct_off_min_qty') {
    parts.push(`${num(scheme.pctOff, Number.isInteger(scheme.pctOff) ? 0 : 1)}% off when you buy ${casesLabel(scheme.minCases)} or more.`);
  } else {
    return '';
  }
  if (pooled) parts.push('Cases of these products add up together.');
  if (Number(scheme.capPerMonth) > 0) parts.push(`Up to ${plural(scheme.capPerMonth, 'time', 'times')} a month.`);
  return parts.join(' ');
}

function schemeItem(data, scheme) {
  const names = (Array.isArray(scheme.skus) ? scheme.skus : [])
    .map((sku) => (data.productsBySku[sku] ? data.productsBySku[sku].name : sku));
  const terms = schemeTerms(scheme);
  return h('li', { class: 'scheme' },
    h('div', { class: 'scheme__head' },
      h('span', { class: 'scheme__name', text: scheme.name || scheme.id }),
      scheme.eligible
        ? chip('Eligible', { tone: 'ok', icon: 'check' })
        : chip('Not eligible', { icon: 'close' })),
    !scheme.eligible && scheme.reasonIfNot && h('p', { class: 'scheme__detail', text: `${scheme.reasonIfNot}.` }),
    terms && h('p', { class: 'scheme__terms num', text: terms }),
    names.length > 0 && h('p', { class: 'scheme__detail num', text: `On: ${names.join(', ')}` }),
    scheme.validTo && h('p', { class: 'scheme__detail num', text: `Ends ${formatDate(scheme.validTo, 'long')}` }));
}

function schemesCard(data, outlet) {
  const schemes = data.schemesActiveOn(data.demoDate, outlet);
  if (!schemes.length) {
    return card({ class: 'panel' }, h('p', { class: 'outlet__plain', text: 'No scheme is running today.' }));
  }
  return card({ class: 'row-list' }, h('ul', { role: 'list' }, schemes.map((scheme) => schemeItem(data, scheme))));
}

function factsCard(outlet) {
  const glass = outlet.glass;
  const visits = Number(outlet.visitsPerMonth);
  return card({ class: 'panel' }, factList([
    { label: 'Shop type', value: outlet.shopType },
    { label: 'Location', value: outlet.locationContext },
    { label: 'Cold chain', value: coldChain(outlet.cooler).detail },
    { label: 'Visit plan', value: Number.isFinite(visits) && visits > 0 ? plural(visits, 'visit a month', 'visits a month') : null },
    glass && { label: 'Glass crates held', value: num(glass.cratesHeld) },
    glass && { label: 'Empties on hand', value: num(glass.emptiesOnHand) },
  ]));
}

// Rep-only: the retailer may be looking at the screen, so this stays closed until the rep opens it,
// and the closed label shows no amounts.
function repNotes(data, outlet) {
  const credit = outlet.credit || {};
  const room = data.availableCredit(outlet.id);   // the figure the review banner uses
  const overdue = Number(credit.overdue) > 0
    ? [inr(credit.overdue), Number(credit.overdueSinceDays) > 0 && `for ${plural(credit.overdueSinceDays, 'day', 'days')}`].filter(Boolean).join(' · ')
    : 'None';
  const unlinked = outlet.predecessorId && !data.outletsById[outlet.predecessorId];
  const notes = (Array.isArray(outlet.notes) ? outlet.notes : [])
    .filter((note) => note && note.text)
    .slice()
    .sort((a, b) => (String(a.date) < String(b.date) ? 1 : String(a.date) > String(b.date) ? -1 : 0));

  return disclosure({
    title: 'Rep notes',
    hint: 'Credit and visit notes',
    icon: 'lock',
    content: [
      factList([
        { label: 'Credit limit', value: inr(credit.limit) },
        { label: 'Outstanding', value: inr(credit.outstanding) },
        room.bookedToday > 0 && { label: 'Booked today', value: inr(room.bookedToday) },
        { label: 'Available', value: inr(room.available) },
        { label: 'Overdue', value: overdue },
      ]),
      unlinked && h('p', { class: 'note__text num', text: `Earlier history is not linked. Old outlet code: ${outlet.predecessorId}.` }),
      h('div', { class: 'notes' },
        h('p', { class: 'notes__title', text: 'Visit notes' }),
        notes.length
          ? notes.map((note) => h('div', { class: 'note' },
            h('span', { class: 'note__date num', text: formatDate(note.date, 'long') || 'No date' }),
            h('p', { class: 'note__text num', text: note.text })))
          : h('p', { class: 'note__text outlet__plain', text: 'No visit notes.' })),
    ],
  });
}

// --------------------------------------------------------------------------
// Right Order card (FEATURE-SLOT: outlet-details)
// --------------------------------------------------------------------------

const STOCK_CHIPS = [0, 1, 2, 3, 4];   // the sixth chip is "5+"
const STOCK_MANY = 5;
const MAX_CARD_LINES = 3;
const MAX_STOCK_ROWS = 4;

function safeRecommend(ctx) {
  try { return recommend(ctx) || null; } catch (err) { console.error(err); return null; }
}

// The estimate in whole cases, as the chips above count them.
function estimateWords(n) {
  const cases = Math.round(Number(n));
  return cases < 1 ? 'under 1' : `~${num(cases)}`;
}

// The quiet card's mark follows the outlet badge, so it matches the landing: an icon plus a tone.
const QUIET_MARKS = {
  golight: { icon: 'arrow-down', warn: true },
};
const QUIET_MARK = { icon: 'check', warn: false };

/**
 * rightOrderCard(data, outlet) → { element, destroy }
 * Built once; every cart or stock-check change updates it in place.
 */
function rightOrderCard(data, outlet) {
  const store = getStore();
  const nameOf = (sku) => (data.productsBySku[sku] && data.productsBySku[sku].name) || sku;
  const compute = (state) => safeRecommend({
    outlet,
    cart: state.cart && state.cart.outletId === outlet.id ? state.cart : null,
    visit: state.visit && state.visit.outletId === outlet.id ? state.visit : null,
    data,
    demoDate: data.demoDate,
  });
  const countedOf = (state, sku) => {
    const visit = state.visit;
    const value = visit && visit.outletId === outlet.id && visit.stockOnHand ? visit.stockOnHand[sku] : null;
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
  };

  let result = null;
  let open = false;
  let markIcon = 'check';
  const rows = new Map();   // sku → the stock row's controls

  // A tap must not move the control under the finger: after the card has redrawn, the page is
  // scrolled by however far that control moved.
  function act(control, action) {
    const before = control.getBoundingClientRect().top;
    store.dispatch(action);
    const moved = control.getBoundingClientRect().top - before;
    if (moved) window.scrollBy(0, moved);
  }

  const tick = h('span', { class: 'ro-card__tick', hidden: true }, icon('check', { size: 20 }));
  const headline = h('h3', { class: 'ro-card__headline num', id: 'ro-card-title' });
  const lines = h('ul', { class: 'ro-card__lines', role: 'list' });
  const flagText = h('span', { class: 'num' });
  const flag = h('p', { class: 'ro-card__flag', hidden: true }, icon('info', { size: 16 }), flagText);
  const top = h('div', { class: 'ro-card__top' },
    h('p', { class: 'ro-card__eyebrow' }, icon('snow', { size: 16 }), h('span', { text: 'Right Order' })),
    h('div', { class: 'ro-card__head' }, tick, headline),
    lines,
    flag);

  const start = button('Start order with suggestion', {
    icon: 'cart',
    block: true,
    onClick: () => {
      if (!result) return;
      const candidates = new Set(result.lines.map((line) => line.sku));
      const state = store.getState();
      const next = {};
      const cartLines = (state.cart && state.cart.outletId === outlet.id && state.cart.lines) || {};
      for (const [sku, cases] of Object.entries(cartLines)) {
        if (!candidates.has(sku) && Number(cases) > 0) next[sku] = cases;
      }
      for (const [sku, cases] of Object.entries((result.quickSets && result.quickSets.suggested) || {})) {
        if (Number(cases) > 0) next[sku] = cases;
      }
      store.dispatch({ type: 'cart/replace', lines: next });
      location.hash = `#/order/${encodeURIComponent(outlet.id)}`;
    },
  });

  const toggleLabel = h('span', { class: 'num' });
  const panel = h('div', { class: 'ro-stock', id: 'ro-stock-panel', hidden: true },
    h('p', { class: 'ro-stock__title', text: 'Cases in the shop now' }));
  const toggle = h('button', {
    class: 'ro-link', type: 'button',
    attrs: { 'aria-expanded': 'false', 'aria-controls': 'ro-stock-panel' },
    onClick: () => {
      open = !open;
      panel.hidden = !open;
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    },
  }, toggleLabel, icon('chevron-down', { size: 20 }));

  const root = h('section', { class: 'card ro-card', attrs: { 'aria-labelledby': 'ro-card-title' } },
    top, start, toggle, panel);

  function stockRow(sku) {
    const name = nameOf(sku);
    const set = (control, cases) => act(control, { type: 'visit/setStock', sku, cases });
    const chips = STOCK_CHIPS.map((n) => {
      const el = filterChip(String(n), { onClick: () => set(el, n) });
      el.setAttribute('aria-label', `${name}: ${casesLabel(n)} in the shop`);
      return el;
    });
    const many = filterChip(`${STOCK_MANY}+`, {
      onClick: () => { if (!many.pressed) set(many, STOCK_MANY); },
    });
    many.setAttribute('aria-label', `${name}: ${STOCK_MANY} cases or more in the shop`);
    const exact = stepper({
      value: STOCK_MANY, min: STOCK_MANY, label: `${name}, cases in the shop`,
      onChange: (n) => set(exact, n),
    });
    const exactRow = h('div', { class: 'ro-stock__exact', hidden: true },
      h('span', { class: 'ro-stock__exact-label', text: 'Exact count' }), exact);
    const skip = filterChip('Skip — use estimate', { onClick: () => set(skip, null) });
    skip.classList.add('ro-stock__skip');
    const el = h('div', { class: 'ro-stock__row', role: 'group', attrs: { 'aria-label': `Stock check: ${name}` } },
      h('p', { class: 'ro-stock__name num', text: name }),
      h('div', { class: 'ro-stock__chips' }, chips, many),
      exactRow,
      skip);
    return { el, chips, many, exact, exactRow, skip, name };
  }

  function paintStock(state, keyLines) {
    const wanted = new Set(keyLines.map((line) => line.sku));
    for (const line of keyLines) {
      let row = rows.get(line.sku);
      if (!row) {
        row = stockRow(line.sku);
        rows.set(line.sku, row);
        panel.appendChild(row.el);
      }
      const counted = countedOf(state, line.sku);
      row.chips.forEach((chipEl, n) => chipEl.setPressed(counted === n));
      row.many.setPressed(counted !== null && counted >= STOCK_MANY);
      row.exactRow.hidden = !(counted !== null && counted >= STOCK_MANY);
      if (counted !== null && counted >= STOCK_MANY && row.exact.value !== counted) row.exact.setValue(counted);
      row.skip.setPressed(counted === null);
      const estimate = line.stock && Number.isFinite(Number(line.stock.estimate)) && line.stock.estimate !== null
        ? estimateWords(line.stock.estimate) : null;
      const label = estimate === null ? 'Skip — use estimate' : `Skip — use estimate ${estimate}`;
      const labelEl = row.skip.querySelector('.fchip__label');
      if (labelEl && labelEl.textContent !== label) labelEl.textContent = label;
      row.skip.setAttribute('aria-label', `${row.name}: ${label}`);
    }
    for (const [sku, row] of rows) row.el.hidden = !wanted.has(sku);
  }

  function paint(state) {
    result = compute(state);
    const kind = result && (result.state === 'active' || result.state === 'quiet') ? result.state : 'none';
    const allLines = result && Array.isArray(result.lines) ? result.lines : [];
    const keyLines = kind === 'none' ? [] : allLines.filter((line) => line && line.isKey).slice(0, MAX_STOCK_ROWS);
    root.dataset.state = kind;

    const fallback = result && result.state === 'not_applicable'
      ? 'No suggestion for this outlet today' : 'Not enough history for a suggestion';
    const head = kind === 'none' ? fallback
      : (result.headline || (kind === 'quiet' ? 'Nothing more needed today' : 'Suggested order'));
    if (headline.textContent !== head) headline.textContent = head;
    tick.hidden = kind !== 'quiet';
    const mark = (kind === 'quiet' && Object.prototype.hasOwnProperty.call(QUIET_MARKS, result.outletBadge)
      && QUIET_MARKS[result.outletBadge]) || QUIET_MARK;
    if (mark.icon !== markIcon) { markIcon = mark.icon; tick.replaceChildren(icon(mark.icon, { size: 20 })); }
    tick.classList.toggle('ro-card__tick--warn', mark.warn);

    const till = result && result.window ? formatDate(result.window.coversTill, 'short') : '';
    const toAdd = kind !== 'active' ? [] : keyLines
      .filter((line) => line.status === 'missing' || line.status === 'short')
      .map((line) => ({ line, add: Number(line.recommendedCases) - (Number(line.cartCases) || 0) }))
      .filter((item) => item.add > 0)
      .sort((a, b) => Number(b.line.recommendedCases) - Number(a.line.recommendedCases))
      .slice(0, MAX_CARD_LINES);
    // The headline counts every product; the lines show the top few, so the rest is named in one line.
    const shownSkus = new Set(toAdd.map((item) => item.line.sku));
    const others = kind !== 'active' ? [] : allLines
      .filter((line) => line && !shownSkus.has(line.sku))
      .map((line) => Number(line.recommendedCases) - (Number(line.cartCases) || 0))
      .filter((add) => add > 0);
    const rest = others.reduce((sum, add) => sum + add, 0);
    const rows = toAdd.map(({ line, add }) => h('li', { class: 'ro-line' },
      h('p', { class: 'ro-line__main num' },
        h('span', { class: 'ro-line__add', text: `+${num(add)}` }),
        h('span', { class: 'ro-line__what' },
          h('span', { text: nameOf(line.sku) }),
          till && h('span', { class: 'ro-line__till', text: ` · lasts till ${till}` }))),
      line.reasonShort && h('p', { class: 'ro-line__reason num', text: line.reasonShort })));
    // Only nodes go to replaceChildren: the browser would print a false as the word "false".
    if (toAdd.length > 0 && rest > 0) {
      rows.push(h('li', { class: 'ro-line ro-line--rest' },
        h('p', { class: 'ro-line__reason num', text: `+${num(rest)} on ${plural(others.length, 'other item', 'other items')}` })));
    }
    lines.replaceChildren(...rows);
    lines.hidden = toAdd.length === 0;

    const flagWords = kind === 'none' ? null : result.window && result.window.flag;
    flag.hidden = !flagWords;
    if (flagWords && flagText.textContent !== flagWords) flagText.textContent = flagWords;

    const suggested = (result && result.quickSets && result.quickSets.suggested) || {};
    start.hidden = !(kind === 'active' && Object.values(suggested).some((cases) => Number(cases) > 0));

    toggle.hidden = keyLines.length === 0;
    const toggleWords = `Check stock (${plural(keyLines.length, 'item', 'items')})`;
    if (toggleLabel.textContent !== toggleWords) toggleLabel.textContent = toggleWords;
    if (keyLines.length === 0) panel.hidden = true;
    else panel.hidden = !open;
    paintStock(state, keyLines);

  }

  let shown = store.getState();
  paint(shown);
  const unsubscribe = store.subscribe((state, action) => {
    if (action && action.type === 'demo/reset') return;
    const changed = state.cart !== shown.cart || state.visit !== shown.visit;
    shown = state;
    if (changed && state.currentOutletId === outlet.id) paint(state);
  });

  return { element: root, destroy: unsubscribe };
}

// --------------------------------------------------------------------------
// Screen
// --------------------------------------------------------------------------

export function render(container, params) {
  const data = getData();
  const id = params && params.id;
  const outlet = id ? data.outletsById[id] : null;

  if (!outlet) {
    container.append(
      appHeader({ title: 'Outlet details', backHref: OUTLETS, backLabel: 'Back to all outlets' }),
      h('div', { class: 'screen' },
        emptyState({
          icon: 'store',
          title: 'Outlet not found',
          text: 'This outlet is not in the data.',
          action: button('All outlets', { href: OUTLETS, icon: 'store', block: true }),
        })));
    return;
  }

  // Brings back this outlet's saved cart and stock check.
  getStore().dispatch({ type: 'outlet/select', outletId: outlet.id });

  const backHref = backHrefFor(outlet.id, params.from);

  let rightOrder = null;
  try { rightOrder = rightOrderCard(data, outlet); } catch (err) { console.error(err); }

  container.append(
    appHeader({
      title: 'Outlet details',
      backHref,
      backLabel: backHref === OUTLETS ? 'Back to all outlets' : 'Back to today’s route',
    }),
    h('div', { class: 'screen outlet' },
      identity(data, outlet),

      // FEATURE-SLOT: outlet-details — the Right Order card.
      h('div', { class: 'slot', id: 'slot-outlet-details', dataset: { slot: 'outlet-details', outletId: outlet.id } },
        rightOrder && rightOrder.element),

      section('outlet-last-order', 'Last order', lastOrderCard(data, outlet)),
      weeksSection(data, outlet),
      section('outlet-next-visit', 'Next visit', nextVisitCard(data, outlet)),
      section('outlet-schemes', 'Schemes today', schemesCard(data, outlet)),
      section('outlet-facts', 'Outlet facts', factsCard(outlet)),
      repNotes(data, outlet)),
    actionBar(button('Book order', { href: `#/order/${encodeURIComponent(outlet.id)}`, icon: 'cart', block: true })),
  );

  return () => { if (rightOrder) rightOrder.destroy(); };
}

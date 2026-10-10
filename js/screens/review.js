// Order review: check the lines, the scheme benefits, the totals and the credit, then submit.

import { getData } from '../data.js';
import { getStore } from '../store.js';
import { inr, num, casesLabel, plural } from '../format.js';
import { recommend } from '../engine/recommendationEngine.js';
import { formatDate } from '../dates.js';
import { h, icon, card, chip, filterChip, button, appHeader, actionBar, emptyState, stepper, banner, toast } from '../components/ui.js';
import { packFacts, lineNote, openCart, priceOrder } from './order.js';

const HOME = '#/home';
const OUTLETS = '#/outlets';
const MAX_CASES = 999;
const NO_PRODUCTS = 'This order has no products yet.';

function section(id, title, ...children) {
  return h('section', { class: 'section', attrs: { 'aria-labelledby': id } },
    h('h2', { class: 'section__title', id, text: title }),
    children);
}

// What the retailer gets from one scheme, in words. '' when the scheme gives nothing for this cart.
function benefitText(scheme, productsBySku) {
  if (!scheme.eligible) return '';
  if (scheme.freeCases > 0) {
    const product = scheme.freeSku ? productsBySku[scheme.freeSku] : null;
    const name = product ? product.name : scheme.freeSku;
    return name ? `${casesLabel(scheme.freeCases)} of ${name} free.` : `${casesLabel(scheme.freeCases)} free.`;
  }
  if (scheme.discountValue > 0) {
    const pct = Number(scheme.discountPct);
    return `${num(pct, Number.isInteger(pct) ? 0 : 1)}% off. ${inr(scheme.discountValue)} less to pay.`;
  }
  return '';
}

// The credit check. `room` is the engine's result.credit ({ known, available, bookedToday, fits, text }),
// or data.availableCredit(outlet.id) when there is no engine result; both use the same figures:
// available credit = limit − outstanding − what the outlet already booked today in this demo.
// It informs the rep; it never blocks the order.
// → { tone, title, text } for banner(), and `over` (true when the order is more than the available credit).
function creditCheck(credit, toPay, room) {
  const figures = credit || {};
  const days = Number(figures.overdueSinceDays);
  const overdue = Number(figures.overdue) > 0
    ? `Overdue ${inr(figures.overdue)}${days > 0 ? ` for ${plural(days, 'day', 'days')}` : ''}.`
    : null;

  const available = Number(room && room.available);
  if (!room || !room.known || !Number.isFinite(available)) {
    return { over: false, tone: 'info', title: 'Credit limit not known', text: [`To pay ${inr(toPay)}.`, overdue].filter(Boolean).join(' ') };
  }
  const after = room.bookedToday > 0 ? ' after today’s orders' : '';
  const availableText = available > 0 ? `Available credit ${inr(available)}${after}.` : `No credit available${after}.`;
  const fits = typeof room.fits === 'boolean' ? room.fits : toPay <= available;
  if (fits) {
    // An overdue amount is a warning even when the order fits: the icon must not say "all clear".
    return {
      over: false,
      tone: overdue ? 'warn' : 'ok',
      title: overdue ? 'Fits the credit. Payment is overdue.' : 'Order fits the available credit',
      text: [availableText, `${inr(Math.max(0, available - toPay))} left after this order.`, overdue].filter(Boolean).join(' '),
    };
  }
  // What fits and what to book first, in the engine's words; the plain figures when it has none.
  const lead = typeof room.text === 'string' && room.text
    ? (/[.!?]$/.test(room.text) ? room.text : `${room.text}.`)
    : `${availableText} To pay ${inr(toPay)}.`;
  return {
    over: true,
    tone: 'warn',
    title: `${inr(Math.max(0, toPay - available))} more than the available credit`,
    text: [lead, overdue, 'You can still submit.'].filter(Boolean).join(' '),
  };
}

// --------------------------------------------------------------------------
// Right-order check: what to say about the order before it is submitted
// --------------------------------------------------------------------------

const MAX_ITEMS = 3;
const MAX_SUPPLY = 2;

// A line far above what the shop sells needs a reason; a short or missing one may have one.
const REASONS = {
  over: [
    { value: 'retailer_asked', label: 'Retailer asked' },
    { value: 'event', label: 'Event or catering' },
    { value: 'other', label: 'Other' },
  ],
  under: [
    { value: 'has_stock', label: 'Has stock' },
    { value: 'cash_tight', label: 'Cash tight' },
    { value: 'wants_less', label: 'Wants less' },
    { value: 'buys_elsewhere', label: 'Buys elsewhere' },
  ],
};

const KINDS = {
  over: { word: 'Over', tone: 'warn', icon: 'warn', reasons: 'over', ask: 'Why more? Pick one' },
  short: { word: 'Short', tone: 'chill', icon: 'minus', reasons: 'under', ask: 'Why less? If you know' },
  missing: { word: 'Not in order', tone: 'neutral', icon: 'plus', reasons: 'under', ask: 'Why not? If you know' },
};
const KIND_ORDER = ['over', 'short', 'missing'];

// The key lines to talk about, most important first: over, then short, then missing. Every over
// line is kept (its reason is required); the others fill up to MAX_ITEMS.
function checkItems(result) {
  const lines = result && Array.isArray(result.lines) ? result.lines : [];
  const all = [];
  for (const kind of KIND_ORDER) {
    for (const line of lines) {
      if (line && line.isKey && line.status === kind) all.push({ kind, line });
    }
  }
  const over = all.filter((item) => item.kind === 'over');
  const rest = all.filter((item) => item.kind !== 'over').slice(0, Math.max(0, MAX_ITEMS - over.length));
  return { shown: over.concat(rest), all };
}

// The picked reason of a line when it fits what the line is now, else null.
function validReason(kind, picked) {
  const set = KINDS[kind] ? REASONS[KINDS[kind].reasons] : [];
  return set.some((option) => option.value === picked) ? picked : null;
}

// { [sku]: reason } for the key lines that are over, short or missing now. Older picks are left out.
function reasonsThatApply(result, picked) {
  const out = {};
  const chosen = picked || {};
  for (const { kind, line } of checkItems(result).all) {
    const reason = validReason(kind, chosen[line.sku]);
    if (reason) out[line.sku] = reason;
  }
  return out;
}

// One row of the check, built once per product. update() changes the words, and rebuilds the
// reason chips only when the line moves between "over" and "short or missing".
function checkRow(sku, name, onReason) {
  const mark = h('span', { class: 'ro-check__mark' });
  const hint = h('p', { class: 'ro-check__hint num' });
  const ask = h('p', { class: 'ro-check__ask' });
  const chips = h('div', { class: 'ro-check__reasons', role: 'group' });
  const el = h('li', { class: 'ro-check__item', dataset: { sku } },
    h('div', { class: 'ro-check__head' },
      h('span', { class: 'ro-check__name', text: name }),
      mark),
    hint, ask, chips);

  let shownKind = null;
  let shownSet = null;
  let buttons = [];
  let current = null;

  function update(kind, line, picked) {
    const spec = KINDS[kind];
    if (kind !== shownKind) {
      mark.replaceChildren(chip(spec.word, { tone: spec.tone, icon: spec.icon }));
      ask.textContent = spec.ask;
      el.dataset.kind = kind;
      shownKind = kind;
    }
    if (spec.reasons !== shownSet) {
      buttons = REASONS[spec.reasons].map((option) => {
        // One at a time; a second tap on the chosen chip clears it.
        const chipEl = filterChip(option.label, { onClick: () => onReason(sku, current === option.value ? null : option.value) });
        return { value: option.value, el: chipEl };
      });
      chips.replaceChildren(...buttons.map((entry) => entry.el));
      chips.setAttribute('aria-label', `${spec.reasons === 'over' ? 'Reason, needed' : 'Reason, optional'}: ${name}`);
      shownSet = spec.reasons;
    }
    hint.textContent = (line && line.hint) || '';
    current = validReason(kind, picked);
    for (const entry of buttons) {
      if (entry.el.pressed !== (entry.value === current)) entry.el.setPressed(entry.value === current);
    }
    el.classList.toggle('ro-check__item--open', kind === 'over' && !current);
  }

  return { el, update };
}

// A quiet line of the check: an icon and a sentence.
function checkNote(iconName, tone) {
  const text = h('p', { class: 'ro-check__text num' });
  const extra = h('div', { class: 'slot ro-check__extra' });
  const el = h('div', { class: ['ro-check__note', tone && `ro-check__note--${tone}`], hidden: true },
    icon(iconName), h('div', { class: 'ro-check__body' }, text, extra));
  return { el, text, extra };
}

// One row per cart line, built once. update() changes only what the cart changed.
function lineRow(sku, product, onChange) {
  const name = (product && product.name) || sku;
  const qty = stepper({ max: MAX_CASES, label: name, onChange });
  const label = h('span', { class: 'review__label' });
  const free = h('span', { class: 'product__free num' });
  const value = h('span', { class: 'product__value num' });

  const el = h('li', { class: 'product', dataset: { sku } },
    h('div', { class: 'product__body' },
      h('span', { class: 'product__name', text: name }),
      product && h('span', { class: 'product__pack num' }, packFacts(product))),
    h('div', { class: 'product__side' }, qty),
    h('div', { class: 'product__in' }, label, value, free));

  // line: this product's priced cart line, or null once the rep has taken it to 0.
  function update(line) {
    const cases = line ? line.cases : 0;
    if (qty.value !== cases) qty.setValue(cases);
    label.textContent = line ? 'Line value' : 'Removed from the order';
    value.textContent = inr(line ? line.netValue : 0);   // never empty, so the row keeps its height
    free.textContent = line ? lineNote(line) : '';
  }

  return { el, update };
}

// --------------------------------------------------------------------------
// Screen
// --------------------------------------------------------------------------

export function render(container, params) {
  const data = getData();
  const store = getStore();
  const id = params && params.id;
  const outlet = id ? data.outletsById[id] : null;

  if (!outlet) {
    container.append(
      appHeader({ title: 'Review order', backHref: OUTLETS, backLabel: 'Back to all outlets' }),
      h('div', { class: 'screen' },
        emptyState({
          icon: 'store',
          title: 'Outlet not found',
          text: 'This outlet is not in the data.',
          action: button('All outlets', { href: OUTLETS, icon: 'store', block: true }),
        })));
    return;
  }

  openCart(store, data, outlet);

  const { demoDate } = data;
  const orderHref = `#/order/${encodeURIComponent(outlet.id)}`;

  // ---- lines

  const rows = new Map();   // sku → { el, update }: the cart's products, and those taken to 0 on this screen
  const list = h('ul', { role: 'list' });
  const linesCard = card({ class: 'row-list' }, list);
  const emptyCard = card({ hidden: true }, emptyState({
    icon: 'cart',
    level: 3,
    title: 'Add at least one line',
    text: NO_PRODUCTS,
  }));
  const emptyText = emptyCard.querySelector('.empty__text');
  const addItems = button('Add items', { variant: 'secondary', href: orderHref, icon: 'plus', block: true });

  // ---- scheme benefits, totals, credit check

  const benefits = h('ul', { role: 'list' });
  const benefitsSection = section('review-benefits', 'Scheme benefits', card({ class: 'row-list' }, benefits));
  const totalCases = h('dd', { class: 'totals__value num' });
  const totalFree = h('dd', { class: 'totals__value num' });
  const totalGross = h('dd', { class: 'totals__value num' });
  const totalDiscount = h('dd', { class: 'totals__value num' });
  const totalPay = h('dd', { class: 'totals__value totals__value--key num' });
  const discountRow = h('div', { class: 'totals__row' }, h('dt', { class: 'totals__label', text: 'Scheme discount' }), totalDiscount);
  const totalsSection = section('review-totals', 'Totals', card(null, h('dl', { class: 'totals' },
    h('div', { class: 'totals__row' }, h('dt', { class: 'totals__label', text: 'Total cases' }), totalCases),
    h('div', { class: 'totals__row' }, h('dt', { class: 'totals__label', text: 'Free cases' }), totalFree),
    h('div', { class: 'totals__row' },
      h('dt', { class: 'totals__label' }, 'Order value', h('span', { class: 'totals__note', text: 'at price to retailer' })),
      totalGross),
    discountRow,
    h('div', { class: 'totals__row totals__row--key' }, h('dt', { class: 'totals__label', text: 'To pay' }), totalPay))));
  const credit = h('div', { class: 'slot' });

  // FEATURE-SLOT: review-check — the Right-order check, directly under the order lines.
  // Built once; sync() fills it in place. Hidden while the order is empty.
  const checkRows = new Map();   // sku → { el, update }
  const checkList = h('ul', { class: 'ro-check__items', role: 'list' });
  const clearNote = checkNote('check', 'ok');
  const schemeNote = checkNote('tag', 'chill');
  const supplyNotes = [];
  for (let i = 0; i < MAX_SUPPLY; i += 1) supplyNotes.push(checkNote('truck', 'warn'));
  const checkSection = h('section', { class: 'section ro-check', hidden: true, attrs: { 'aria-labelledby': 'review-check' } },
    h('h2', { class: 'section__title', id: 'review-check', text: 'Right order check' }),
    card({ class: 'ro-check__card' }, checkList, clearNote.el, schemeNote.el, supplyNotes.map((note) => note.el)));
  const check = h('div', { class: 'slot', id: 'slot-review-check', dataset: { slot: 'review-check', outletId: outlet.id } }, checkSection);
  const setReason = (sku, reason) => store.dispatch({ type: 'visit/setReason', sku, reason });

  let shownOrder = null;
  let shownNudge = null;
  // → the number of over key lines that still need a reason.
  function syncCheck(result, visit, empty) {
    checkSection.hidden = empty;
    if (empty) return 0;
    const picked = (visit && visit.reasons) || {};
    const { shown } = checkItems(result);

    for (const { line } of shown) {
      if (checkRows.has(line.sku)) continue;
      const product = data.productsBySku[line.sku];
      checkRows.set(line.sku, checkRow(line.sku, (product && product.name) || line.sku, setReason));
    }
    const orderKey = shown.map((item) => item.line.sku).join('|');
    if (orderKey !== shownOrder) {
      checkList.replaceChildren(...shown.map((item) => checkRows.get(item.line.sku).el));
      shownOrder = orderKey;
    }
    let open = 0;
    for (const { kind, line } of shown) {
      checkRows.get(line.sku).update(kind, line, picked[line.sku]);
      if (kind === 'over' && !validReason(kind, picked[line.sku])) open += 1;
    }
    checkList.hidden = shown.length === 0;

    // Nothing to say about the lines: one calm line.
    const state = result ? result.state : null;
    const till = result && result.window ? formatDate(result.window.coversTill, 'short') : '';
    clearNote.el.hidden = shown.length > 0;
    if (state === 'active' || state === 'quiet') {
      clearNote.text.textContent = till ? `Every key item lasts till ${till}` : 'Every key item is covered';
    } else {
      clearNote.text.textContent = 'No sales history here yet. Nothing to check.';
    }

    const scheme = result && result.scheme && result.scheme.text ? result.scheme : null;
    schemeNote.el.hidden = !scheme;
    if (scheme) {
      schemeNote.text.textContent = scheme.name ? `${scheme.name}: ${scheme.text}` : scheme.text;
      const action = scheme.nudge && scheme.nudge.action;
      const nudge = action && Number.isFinite(action.setCases) && scheme.nudge.text ? scheme.nudge : null;
      const nudgeKey = nudge ? `n|${nudge.text}|${action.sku}|${action.setCases}` : (scheme.honestNote ? `h|${scheme.honestNote}` : '');
      if (nudgeKey !== shownNudge) {
        if (nudge) {
          const { sku, setCases } = nudge.action;
          schemeNote.extra.replaceChildren(button(nudge.text, {
            variant: 'secondary', icon: 'plus', block: true,
            onClick: () => store.dispatch({ type: 'cart/setQty', sku, cases: setCases }),
          }));
        } else if (scheme.honestNote) {
          schemeNote.extra.replaceChildren(h('p', { class: 'ro-check__sub num', text: scheme.honestNote }));
        } else {
          schemeNote.extra.replaceChildren();
        }
        shownNudge = nudgeKey;
      }
    }

    const supply = (result && Array.isArray(result.nudges) ? result.nudges : [])
      .filter((nudge) => nudge && nudge.type === 'supply' && nudge.text);
    supplyNotes.forEach((note, i) => {
      note.el.hidden = !supply[i];
      note.text.textContent = supply[i] ? supply[i].text : '';
    });
    return open;
  }

  // ---- footer: the amount to pay stays in view beside Submit, with a flag when it is over the credit

  const barCases = h('span', { class: 'order-bar__cases num' });
  const barFlag = h('span', { class: 'slot' });
  const barPay = h('span', { class: 'order-bar__value num' });
  const submitButton = button('Submit order', { icon: 'check', block: true, onClick: submit });
  // Why Submit is off, in words, right above it. Takes no space when Submit is on.
  // The reason chips can be a screen away, so a tap on the note brings the check into view.
  const barWhy = h('button', {
    class: 'ro-submit-why', type: 'button', hidden: true, attrs: { 'aria-live': 'polite' },
    // With an empty cart there is nothing to pick: the same tap goes to the order screen, as Add items does.
    onClick: () => {
      if (checkSection.hidden) location.hash = orderHref;
      else check.scrollIntoView({ block: 'center', behavior: 'smooth' });
    },
  }, icon('info', { size: 16 }), h('span', { class: 'ro-submit-why__text num' }));
  const barWhyText = barWhy.lastChild;

  // The engine never throws by contract; a broken result must still leave the order usable.
  function advise(state) {
    try {
      const result = recommend({ outlet, cart: state.cart, visit: state.visit, data, demoDate });
      return result && typeof result === 'object' ? result : null;
    } catch (error) {
      return null;
    }
  }

  // ---- live: every cart or visit change recomputes schemes, prices and the check, then updates in place

  let shownCart = null;
  let shownVisit = null;
  let shownBenefits = null;
  let shownCredit = null;
  let submitted = false;
  function sync() {
    const state = store.getState();
    if (submitted || state.currentOutletId !== outlet.id) return;
    if (state.cart === shownCart && state.visit === shownVisit) return;
    shownCart = state.cart;
    shownVisit = state.visit;

    const { schemeResults, totals } = priceOrder(data, outlet, state.cart);
    const empty = totals.lines.length === 0;
    const result = advise(state);

    // Rows are never rebuilt, moved or taken away while the screen is open, so every stepper stays
    // under the finger. A line taken to 0 stays in its place at 0 (a tap on + brings it back) and
    // is left out of the totals; it is gone the next time the screen opens.
    const lineBySku = new Map(totals.lines.map((line) => [line.sku, line]));
    let added = false;
    for (const line of totals.lines) {
      if (rows.has(line.sku)) continue;
      rows.set(line.sku, lineRow(line.sku, data.productsBySku[line.sku],
        (cases) => store.dispatch({ type: 'cart/setQty', sku: line.sku, cases })));
      added = true;
    }
    if (added) {
      // Product-master order, without the lines at 0.
      for (const sku of Array.from(rows.keys())) {
        if (!lineBySku.has(sku)) rows.delete(sku);
      }
      list.replaceChildren(...totals.lines.map((line) => rows.get(line.sku).el));
    }
    for (const [sku, row] of rows) row.update(lineBySku.get(sku) || null);
    linesCard.hidden = rows.size === 0;
    emptyCard.hidden = !empty;
    if (emptyText) emptyText.textContent = rows.size ? 'Every line is at 0. Tap + on a line, or add items.' : NO_PRODUCTS;

    const gains = schemeResults
      .map((scheme) => ({ name: scheme.name || scheme.schemeId, text: benefitText(scheme, data.productsBySku) }))
      .filter((gain) => gain.text);
    const gainsKey = gains.map((gain) => `${gain.name}|${gain.text}`).join('\n');
    if (gainsKey !== shownBenefits) {
      benefits.replaceChildren(...gains.map((gain) => h('li', { class: 'scheme' },
        h('span', { class: 'scheme__name', text: gain.name }),
        h('p', { class: 'scheme__terms num', text: gain.text }))));
      shownBenefits = gainsKey;
    }
    benefitsSection.hidden = gains.length === 0;

    totalCases.textContent = num(totals.cases);
    totalFree.textContent = totals.freeCases > 0 ? `+${casesLabel(totals.freeCases)}` : 'None';
    totalGross.textContent = inr(totals.grossValue);
    totalDiscount.textContent = inr(-totals.discount);
    discountRow.hidden = !(totals.discount > 0);
    totalPay.textContent = inr(totals.netValue);
    totalsSection.hidden = empty;

    const room = result && result.credit && typeof result.credit === 'object' ? result.credit : data.availableCredit(outlet.id);
    const verdict = empty ? null : creditCheck(outlet.credit, totals.netValue, room);
    const creditKey = verdict ? `${verdict.tone}|${verdict.title}|${verdict.text}` : '';
    if (creditKey !== shownCredit) {
      credit.replaceChildren(...(verdict ? [banner(verdict)] : []));
      // Words and an icon, no amount: the retailer may be looking.
      barFlag.replaceChildren(...(verdict && verdict.over ? [chip('Over credit', { tone: 'warn' })] : []));
      shownCredit = creditKey;
    }
    barCases.textContent = casesLabel(totals.cases);
    barPay.textContent = inr(totals.netValue);

    const open = syncCheck(result, state.visit, empty);
    submitButton.disabled = empty || open > 0;
    const why = empty ? 'Add at least one line' : (open > 0 ? `Pick a reason for ${plural(open, 'line', 'lines')} above` : '');
    if (barWhyText.textContent !== why) barWhyText.textContent = why;
    barWhy.hidden = !why;
  }

  // Saves the order and goes back to today's route. A second tap does nothing.
  function submit() {
    const state = store.getState();
    if (submitted || state.currentOutletId !== outlet.id) return;
    const { totals } = priceOrder(data, outlet, state.cart);
    if (!totals.lines.length) return;

    const visit = state.visit || {};
    const result = advise(state);
    const { all } = checkItems(result);
    const reasons = reasonsThatApply(result, visit.reasons);
    // The same rule as the disabled button, for a tap that gets through.
    if (all.some((item) => item.kind === 'over' && !reasons[item.line.sku])) return;

    submitted = true;
    submitButton.disabled = true;
    store.dispatch({
      type: 'order/submit',
      order: {
        outletId: outlet.id,
        lines: totals.lines.map((line) => ({ sku: line.sku, cases: line.cases, freeCases: line.freeCases })),
        value: totals.netValue,
        recommendationSnapshot: result,
        reasons,                                        // { sku: reasonCode }, only for lines that are over, short or missing now
        stockOnHand: { ...(visit.stockOnHand || {}) },  // what the rep counted in this visit
      },
    });
    toast(`Order saved · ${casesLabel(totals.cases)} · ${inr(totals.netValue)}`, { tone: 'ok' });
    location.hash = HOME;
  }

  sync();
  const unsubscribe = store.subscribe((state, action) => {
    if (action && action.type === 'demo/reset') return;   // the page is about to reload
    sync();
  });

  container.append(
    appHeader({ title: 'Review order', subtitle: outlet.name || outlet.id, backHref: orderHref, backLabel: 'Back to add items' }),
    h('div', { class: 'screen review' },
      section('review-lines', 'Order lines', linesCard, emptyCard, addItems),
      check,
      benefitsSection,
      totalsSection,
      credit),
    actionBar(h('div', { class: 'order-bar' },
      h('div', { class: 'order-bar__totals' },
        h('div', { class: 'order-bar__left' }, barCases, barFlag),
        h('div', { class: 'order-bar__right' }, barPay, h('span', { class: 'order-bar__note', text: 'To pay' }))),
      barWhy,
      submitButton)),
  );

  return () => unsubscribe();
}

// Order booking: find products, set cases, see the order total. The cart lives in the store, one per outlet.

import { getData } from '../data.js';
import { getStore } from '../store.js';
import { inr, num, casesLabel, plural } from '../format.js';
import { evaluateSchemes } from '../engine/schemes.js';
import { priceCart } from '../engine/pricing.js';
import { recommend, CANDIDATE_DAYS } from '../engine/recommendationEngine.js';
import {
  h, icon, card, chip, button, appHeader, actionBar, emptyState, textField, stepper, tabs, filterChip, factList, openSheet,
} from '../components/ui.js';

const OUTLETS = '#/outlets';
const USUAL = Symbol('usual');   // the "Usual items" tab; every other tab's value is a product category
const USUAL_WINDOW = `the last ${plural(CANDIDATE_DAYS / 7, 'week', 'weeks')}`;   // the engine's window, in words
const MAX_CASES = 999;
const LIST_ID = 'order-list';

// How a line's status looks under the stepper: an icon and a tone. The words come from the engine (line.hint).
const HINT_LOOK = {
  missing: { icon: 'plus', tone: 'add' },
  short: { icon: 'warn', tone: 'warn' },
  over: { icon: 'warn', tone: 'warn' },
  right: { icon: 'check', tone: 'ok' },
  none_needed: { icon: 'check', tone: 'ok' },
  unavailable: { icon: 'info', tone: 'neutral' },
};
const NO_HISTORY = 'No sales history here';
const NO_SUGGESTION = 'Not enough history for a suggestion';

function wholeCases(value) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n > 0 ? Math.min(MAX_CASES, n) : 0;
}

function sumCases(set) {
  return Object.values(set || {}).reduce((sum, cases) => sum + wholeCases(cases), 0);
}

function swapIcon(holder, name, size) {
  if (holder.dataset.icon === name) return;
  holder.dataset.icon = name;
  holder.replaceChildren(icon(name, { size }));
}

function capitalise(word) {
  const text = String(word || '');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function categoryOf(product) {
  return product.category || 'other';
}

// The scheme's offer in a few words, built from its fields. '' for a type this screen does not know.
function schemeOffer(scheme) {
  if (scheme.type === 'buy_x_get_y') return `Buy ${num(scheme.buyCases)}, get ${num(scheme.freeCases)} free`;
  if (scheme.type === 'pct_off_min_qty') {
    return `${num(scheme.pctOff, Number.isInteger(scheme.pctOff) ? 0 : 1)}% off from ${casesLabel(scheme.minCases)}`;
  }
  return scheme.name || '';
}

// Units per case and the price to retailer per case. Two short facts, so a narrow row breaks between them.
export function packFacts(product) {
  const units = Number(product.unitsPerCase);
  return [
    units > 0 && `${num(units)} per case`,
    `${inr(product.ptrCase)} a case`,
  ].filter(Boolean).map((text) => h('span', { text }));
}

// What a scheme gives on one priced cart line, in a few words. '' when it gives nothing.
export function lineNote(line) {
  return [
    line.freeCases > 0 && `+${casesLabel(line.freeCases)} free`,
    line.discount > 0 && `${inr(line.discount)} off`,
  ].filter(Boolean).join(' · ');
}

// Brings back the outlet's saved cart. A saved line for a product that is no longer in the data
// cannot be shown or priced, so it is dropped.
export function openCart(store, data, outlet) {
  store.dispatch({ type: 'outlet/select', outletId: outlet.id });
  for (const sku of Object.keys(store.getState().cart.lines)) {
    if (!data.productsBySku[sku]) store.dispatch({ type: 'cart/remove', sku });
  }
}

// Schemes and prices for a cart: the one place the screens price an order. The scheme engine picks
// this month's orders out of the outlet's history itself (it needs them for the monthly limit).
export function priceOrder(data, outlet, cart) {
  const schemeResults = evaluateSchemes(cart, outlet, data.schemes, data.products, data.demoDate, data.ordersFor(outlet.id));
  return { schemeResults, totals: priceCart(cart, data.products, schemeResults) };
}

function matchesQuery(product, query) {
  return [product.name, product.flavour, product.sku].some((text) => String(text || '').toLowerCase().includes(query));
}

// --------------------------------------------------------------------------
// The two feature slots (Right Order) and the See why sheet
// --------------------------------------------------------------------------

const panels = new WeakMap();   // slot element -> the strip's parts, built once

// One-tap button used in the strip: an icon holder and a label that are changed in place.
function stripButton(className, onClick) {
  const mark = h('span', { class: 'ro-tap__icon' });
  const label = h('span', { class: 'ro-tap__label num' });
  const el = h('button', { class: ['ro-tap', className], type: 'button', onClick }, h('span', { class: 'ro-tap__pill' }, mark, label));
  return { el, mark, label };
}

function buildBookingPanel(slot, handlers) {
  const on = handlers || {};
  const parts = { result: null, chips: new Map(), nudgeAction: null };

  parts.pitch = h('p', { class: 'ro-strip__pitch num' });
  parts.flagText = h('span', { class: 'num' });
  parts.flag = h('p', { class: 'ro-strip__flag', hidden: true }, icon('info', { size: 16 }), parts.flagText);

  const quick = (which) => () => {
    if (typeof on.onQuickSet === 'function' && parts.result) on.onQuickSet(which, parts.result);
  };
  parts.suggested = filterChip('Suggested', { onClick: quick('suggested') });
  parts.minimum = filterChip('Minimum', { onClick: quick('minimum') });
  parts.quick = h('div', { class: 'ro-strip__quick', role: 'group', attrs: { 'aria-label': 'Set the order' } }, parts.suggested, parts.minimum);

  parts.missing = h('div', { class: 'ro-strip__missing', role: 'group', hidden: true, attrs: { 'aria-label': 'Not in the order yet' } });
  // One row for both: it is there from the first paint and scrolls sideways inside itself, so chips that
  // come and go never change the strip's height.
  parts.actions = h('div', { class: 'ro-strip__actions', hidden: true }, parts.quick, parts.missing);

  parts.schemeText = h('span', { class: 'num' });
  parts.schemeLine = h('p', { class: 'ro-strip__scheme-text' }, icon('tag', { size: 16 }), parts.schemeText);
  parts.nudge = stripButton('ro-tap--nudge', () => {
    const action = parts.nudgeAction;
    if (!action || typeof on.onSetCases !== 'function') return;
    on.onSetCases(action.sku, action.setCases);
  });
  parts.note = h('p', { class: 'ro-strip__note num', hidden: true });
  // One line of fixed height: the count, then the offer button or the note. They come and go without moving the list.
  parts.scheme = h('div', { class: 'ro-strip__scheme', hidden: true }, parts.schemeLine, parts.nudge.el, parts.note);

  parts.onSetCases = on.onSetCases;
  parts.root = h('section', { class: 'ro-strip', attrs: { 'aria-label': 'Right Order' } },
    h('div', { class: 'ro-strip__say' }, parts.pitch, parts.flag),
    parts.actions, parts.scheme);
  slot.replaceChildren(parts.root);
  return parts;
}

function missingChip(parts, sku) {
  const made = stripButton('ro-tap--add', () => {
    if (made.cases > 0 && typeof parts.onSetCases === 'function') {
      parts.onSetCases(sku, made.cases);
    }
  });
  made.cases = 0;
  parts.chips.set(sku, made);
  parts.missing.append(made.el);
  return made;
}

// FEATURE-SLOT: booking-panel — the strip above the product list: pitch, Suggested / Minimum, missing items, scheme.
// Built on the first call and updated in place after that. ctx: { cart, nameOf(sku), onQuickSet(which, result),
// onSetCases(sku, cases) }.
function renderBookingPanel(slot, result, ctx) {
  const view = ctx || {};
  if (!result) { slot.replaceChildren(); panels.delete(slot); return; }
  let parts = panels.get(slot);
  if (!parts) { parts = buildBookingPanel(slot, view); panels.set(slot, parts); }
  parts.result = result;

  const lines = Array.isArray(result.lines) ? result.lines : [];
  const cartLines = (view.cart && view.cart.lines) || {};
  const nameOf = typeof view.nameOf === 'function' ? view.nameOf : String;
  const bare = result.state === 'insufficient_data' || result.state === 'not_applicable' || !lines.length;

  parts.root.classList.toggle('ro-strip--bare', bare);
  parts.pitch.textContent = bare ? NO_SUGGESTION : (result.pitch || result.headline || '');
  parts.pitch.hidden = !parts.pitch.textContent;
  const flag = !bare && result.window && result.window.flag;
  parts.flag.hidden = !flag;
  parts.flagText.textContent = flag || '';

  // Suggested / Minimum: which one the cart equals is worked out here, never stored.
  const sets = result.quickSets || {};
  const totals = { suggested: sumCases(sets.suggested), minimum: sumCases(sets.minimum) };
  parts.actions.hidden = bare || !(totals.suggested > 0 || totals.minimum > 0);
  for (const which of ['suggested', 'minimum']) {
    const set = sets[which] || {};
    const same = lines.every((line) => wholeCases(cartLines[line.sku]) === wholeCases(set[line.sku]));
    const chipEl = parts[which];
    chipEl.disabled = !(totals[which] > 0);   // a set with nothing in it would only empty the order
    chipEl.setPressed(!parts.actions.hidden && same && totals[which] > 0);   // an empty cart is not a choice made
    const word = which === 'suggested' ? 'Suggested' : 'Minimum';
    const label = chipEl.querySelector('.fchip__label');
    const text = `${word} · ${num(totals[which])}`;
    if (label && label.textContent !== text) label.textContent = text;
    chipEl.setAttribute('aria-label', `${word}: ${casesLabel(totals[which])}`);
  }

  // Missing key items: one chip each, in the engine's order, shown only while the item is not in the order.
  // The chips sit in the action row, which scrolls sideways, so a chip that comes or goes moves nothing.
  let anyChip = false;
  const bySku = new Map(lines.map((line) => [line.sku, line]));
  if (!bare) {
    for (const line of lines) {
      if (line.isKey && wholeCases(line.recommendedCases) > 0 && !parts.chips.has(line.sku)) missingChip(parts, line.sku);
    }
  }
  for (const [sku, made] of parts.chips) {
    const line = bySku.get(sku);
    const target = line ? wholeCases(line.recommendedCases) : 0;
    const open = !bare && Boolean(line) && line.isKey && line.status === 'missing' && target > 0;
    // A chip that goes away under the keyboard hands its focus to the next thing in the row.
    if (!open && !made.el.hidden && made.el.ownerDocument.activeElement === made.el) parts.suggested.focus();
    made.el.hidden = !open;
    made.cases = open ? target : 0;
    if (!open) continue;
    anyChip = true;
    swapIcon(made.mark, 'plus', 16);
    const text = `${num(target)} ${nameOf(sku)}`;
    if (made.label.textContent !== text) made.label.textContent = text;
    made.el.setAttribute('aria-label', `Add ${casesLabel(target)}: ${nameOf(sku)}`);
  }
  parts.missing.hidden = !anyChip;

  // Scheme bar
  const scheme = bare ? null : result.scheme;
  parts.scheme.hidden = !scheme;
  if (scheme) {
    parts.schemeText.textContent = scheme.text || scheme.name || '';
    parts.schemeLine.hidden = !parts.schemeText.textContent;
    const nudge = scheme.nudge && scheme.nudge.action && scheme.nudge.text ? scheme.nudge : null;
    parts.nudgeAction = nudge ? nudge.action : null;
    if (nudge) {
      if (parts.nudge.label.textContent !== nudge.text) parts.nudge.label.textContent = nudge.text;
      parts.nudge.el.setAttribute('aria-label', nudge.text);
      swapIcon(parts.nudge.mark, 'tag', 16);
    }
    parts.nudge.el.hidden = !nudge;
    const note = !nudge && scheme.honestNote ? scheme.honestNote : '';
    parts.note.hidden = !note;
    parts.note.textContent = note;
    // Where an offer can still come, the line keeps the button's height from the start.
    parts.scheme.classList.toggle('ro-strip__scheme--live', Boolean(scheme.eligible || nudge || note));
  }
}

// FEATURE-SLOT: line-hint — the words under one product's stepper. `line` is the engine's line for the product
// (or null), `cases` what the cart holds. The button is built once; a tap opens See why.
function renderLineHint(slot, line, cases, onWhy) {
  let parts = slot.hintParts;
  if (!parts) {
    const mark = h('span', { class: 'hint__icon' });
    const text = h('span', { class: 'hint__text num' });
    const why = h('button', { class: 'hint__why', type: 'button', hidden: true, onClick: () => parts.onWhy && parts.onWhy() }, mark, text);
    const plain = h('p', { class: 'hint__plain', hidden: true, text: NO_HISTORY });
    parts = { mark, text, why, plain, onWhy: null };
    slot.hintParts = parts;
    slot.replaceChildren(why, plain);
  }
  parts.onWhy = typeof onWhy === 'function' ? onWhy : null;

  const words = line ? String(line.hint || '') : '';
  const showWhy = Boolean(line && words);
  const showPlain = !line && cases > 0;
  parts.why.hidden = !showWhy;
  parts.plain.hidden = !showPlain;
  slot.hidden = !(showWhy || showPlain);
  if (!showWhy) return;

  // Nothing needed because nothing sells is a plain fact, not a good state: no tick.
  const idle = line.status === 'none_needed' && !(Number(line.weeklyRate) > 0) && !(cases > 0);
  const look = idle ? HINT_LOOK.unavailable : (HINT_LOOK[line.status] || HINT_LOOK.unavailable);
  swapIcon(parts.mark, look.icon, 16);
  if (parts.why.dataset.tone !== look.tone) parts.why.dataset.tone = look.tone;
  if (parts.text.textContent !== words) parts.text.textContent = words;
  parts.why.setAttribute('aria-label', `${words}. See why`);
}

// See why: the reason, the facts, what to say and how the number is made, for one line.
function openWhy(product, line) {
  if (!line) return;
  const why = line.why || {};
  const pairs = (list) => (Array.isArray(list) ? list : [])
    .filter((item) => item && item.label)
    .map((item) => ({ label: String(item.label), value: item.value === null || item.value === undefined ? '' : String(item.value) }));
  const facts = pairs(why.facts).slice(0, 6);
  const steps = pairs(why.steps).slice(0, 4);
  const points = (Array.isArray(why.talkingPoints) ? why.talkingPoints : []).filter(Boolean).slice(0, 3);

  openSheet({
    title: (product && product.name) || line.sku,
    content: h('div', { class: 'why' },
      line.reasonShort && h('p', { class: 'why__reason num', text: line.reasonShort }),
      line.confidenceText && !facts.some((fact) => fact.label.toLowerCase() === 'confidence') && h('p', { class: 'why__sure num' },
        h('span', { class: 'why__sure-label', text: 'Confidence' }), h('span', { text: line.confidenceText })),
      facts.length > 0 && factList(facts),
      points.length > 0 && h('div', { class: 'why__block' },
        h('h3', { class: 'why__head', text: 'What to say' }),
        h('ul', { class: 'why__points', role: 'list' }, points.map((text) => h('li', { class: 'num' }, icon('check', { size: 16 }), h('span', { text: String(text) }))))),
      steps.length > 0 && h('div', { class: 'why__block' },
        h('h3', { class: 'why__head', text: 'How this number is made' }),
        factList(steps))),
  });
}

// --------------------------------------------------------------------------
// Product row
// --------------------------------------------------------------------------

// One row per product, built once. update() changes only what the cart changed.
function productRow(product, schemes, onChange, onWhy) {
  const qty = stepper({ max: MAX_CASES, label: product.name || product.sku, onChange });
  const chips = h('div', { class: 'product__chips slot' });
  const free = h('span', { class: 'product__free num' });
  const value = h('span', { class: 'product__value num' });
  const inOrder = h('div', { class: 'product__in', hidden: true },
    h('span', { class: 'product__mark' }, icon('check', { size: 16 }), h('span', { text: 'In order' })),
    free,
    value);

  // FEATURE-SLOT: line-hint — the container under the stepper; renderLineHint() fills it.
  const hint = h('div', { class: 'hint slot', hidden: true, dataset: { slot: 'line-hint', sku: product.sku } });

  const el = h('li', { class: 'product', dataset: { sku: product.sku } },
    h('div', { class: 'product__body' },
      h('span', { class: 'product__name', text: product.name || product.sku }),
      h('span', { class: 'product__pack num' }, packFacts(product)),
      chips),
    h('div', { class: 'product__side' }, qty, hint),
    inOrder);

  let shown = null;

  // view: { cases, line, hintLine, usedUp }. line is this product's priced cart line (or null),
  // hintLine its recommendation line (or null), usedUp the ids of schemes whose monthly limit is reached.
  function update(view) {
    const line = view.line;
    const hintLine = view.hintLine;
    const used = schemes.map((scheme) => (view.usedUp.includes(scheme.id) ? 1 : 0)).join('');
    const key = [view.cases, line && line.netValue, line && line.freeCases, line && line.discount,
      hintLine && hintLine.status, hintLine && hintLine.hint, used].join('|');
    if (key === shown) return;

    if (qty.value !== view.cases) qty.setValue(view.cases);
    el.classList.toggle('product--in', view.cases > 0);
    inOrder.hidden = !(view.cases > 0);
    value.textContent = line ? inr(line.netValue) : '';
    free.textContent = line ? lineNote(line) : '';

    if (shown === null || used !== shown.split('|').pop()) {
      chips.replaceChildren(...schemes.map((scheme) => (view.usedUp.includes(scheme.id)
        ? chip('Monthly scheme limit reached', { icon: 'tag' })
        : chip(schemeOffer(scheme), { tone: 'primary', icon: 'tag' }))));
    }
    renderLineHint(hint, hintLine, view.cases, onWhy);
    shown = key;
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
      appHeader({ title: 'Book order', backHref: OUTLETS, backLabel: 'Back to all outlets' }),
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
  const products = data.products.filter((product) => product && typeof product.sku === 'string');
  // Only schemes this outlet can use are shown on a product.
  const schemes = data.schemesActiveOn(demoDate, outlet).filter((scheme) => scheme.eligible && schemeOffer(scheme));
  // Usual items are the products the engine has a line for, so the tab and the line hints cannot disagree.
  const candidates = new Set(recommend({ outlet, cart: null, visit: null, data, demoDate }).lines.map((line) => line.sku));
  const usual = new Set(products.filter((product) => candidates.has(product.sku)).map((product) => product.sku));
  const categories = Array.from(new Set(products.map(categoryOf)));

  let hints = new Map();   // the engine's line per product, from the latest recompute (See why reads it)

  const rows = new Map(products.map((product) => [product.sku, productRow(
    product,
    schemes.filter((scheme) => Array.isArray(scheme.skus) && scheme.skus.includes(product.sku)),
    (cases) => store.dispatch({ type: 'cart/setQty', sku: product.sku, cases }),
    () => openWhy(product, hints.get(product.sku)),
  )]));

  // ---- list: search and tabs

  let tab = usual.size || !categories.length ? USUAL : categories[0];
  const search = textField({ label: 'Search products', name: 'product-search', placeholder: 'Search products', icon: 'search', inputmode: 'search', hideLabel: true });
  search.input.setAttribute('enterkeyhint', 'search');
  const tabRow = tabs({
    label: 'Products',
    controls: LIST_ID,
    value: tab,
    options: [{ value: USUAL, label: 'Usual items' }, ...categories.map((category) => ({ value: category, label: capitalise(category) }))],
    onChange: (value) => { tab = value; paintList(); },
  });
  const found = h('p', { class: 'order__found num', role: 'status', hidden: true });
  const list = h('div', { id: LIST_ID, role: 'tabpanel', attrs: { 'aria-label': 'Products' } });

  function clearSearch() {
    search.input.value = '';
    paintList();
  }

  // Rows are moved, never rebuilt, so a row keeps its stepper and its state.
  function paintList() {
    const query = search.input.value.trim().toLowerCase();
    const shown = query
      ? products.filter((product) => matchesQuery(product, query))
      : products.filter((product) => (tab === USUAL ? usual.has(product.sku) : categoryOf(product) === tab));

    // While searching, the tabs do not choose what is listed.
    tabRow.classList.toggle('tabs--paused', Boolean(query));
    list.setAttribute('aria-label', query ? 'Search results' : 'Products');
    found.hidden = !query;
    found.textContent = query ? `${plural(shown.length, 'product', 'products')} found` : '';

    if (shown.length) {
      list.replaceChildren(card({ class: 'row-list' }, h('ul', { role: 'list' }, shown.map((product) => rows.get(product.sku).el))));
    } else if (query) {
      list.replaceChildren(card(null, emptyState({
        icon: 'search',
        title: 'No product matches',
        text: 'Try a product name, a flavour or a code.',
        action: button('Clear search', { variant: 'secondary', icon: 'close', block: true, onClick: () => { clearSearch(); search.input.focus(); } }),
      })));
    } else if (tab === USUAL) {
      list.replaceChildren(card(null, emptyState({
        icon: 'cart',
        title: 'No usual items yet',
        text: `No orders in ${USUAL_WINDOW}. Pick a product type above.`,
      })));
    } else {
      list.replaceChildren(card(null, emptyState({ icon: 'cart', title: 'No products', text: 'The data has no products here.' })));
    }
  }

  search.input.addEventListener('input', paintList);
  // A tab tap while searching goes back to the tabs.
  tabRow.addEventListener('click', (event) => {
    if (search.input.value && event.target.closest('[role="tab"]')) clearSearch();
  });

  // ---- footer

  const totalCases = h('span', { class: 'order-bar__cases num' });
  const totalFree = h('span', { class: 'order-bar__free slot' });
  const totalValue = h('span', { class: 'order-bar__value num' });
  const totalNote = h('span', { class: 'order-bar__note num' });

  // FEATURE-SLOT: booking-panel — the container above the product list; renderBookingPanel() fills it.
  const panel = h('div', { class: 'slot', id: 'slot-booking-panel', dataset: { slot: 'booking-panel', outletId: outlet.id } });

  // What the strip needs: the cart, product names and its two actions.
  const setCases = (sku, cases) => store.dispatch({ type: 'cart/setQty', sku, cases: wholeCases(cases) });
  // Suggested / Minimum set every line the engine has; a cart line it has no line for stays as it is.
  const setQuick = (which, result) => {
    const set = (result.quickSets && result.quickSets[which]) || {};
    const lines = { ...store.getState().cart.lines };
    for (const line of result.lines) {
      const cases = wholeCases(set[line.sku]);
      if (cases > 0) lines[line.sku] = cases;
      else delete lines[line.sku];
    }
    store.dispatch({ type: 'cart/replace', lines });
  };
  const nameOf = (sku) => (data.productsBySku[sku] && data.productsBySku[sku].name) || sku;
  const panelContext = (cart) => ({ cart, nameOf, onQuickSet: setQuick, onSetCases: setCases });

  // ---- live: every cart or visit change recomputes schemes, prices and the recommendation, then updates in place

  let shownCart = null;
  let shownVisit = null;
  function sync() {
    const state = store.getState();
    if (state.currentOutletId !== outlet.id || (state.cart === shownCart && state.visit === shownVisit)) return;
    shownCart = state.cart;
    shownVisit = state.visit;

    const cart = state.cart;
    const { schemeResults, totals } = priceOrder(data, outlet, cart);
    const result = recommend({ outlet, cart, visit: state.visit, data, demoDate });

    const lineBySku = new Map(totals.lines.map((line) => [line.sku, line]));
    const hintBySku = new Map((Array.isArray(result.lines) ? result.lines : []).map((line) => [line.sku, line]));
    hints = hintBySku;
    const usedUp = schemeResults.filter((scheme) => scheme.capReached && scheme.triggers === 0).map((scheme) => scheme.schemeId);
    for (const [sku, row] of rows) {
      const line = lineBySku.get(sku) || null;
      row.update({ cases: line ? line.cases : 0, line, hintLine: hintBySku.get(sku) || null, usedUp });
    }

    totalCases.textContent = casesLabel(totals.cases);
    if (totals.freeCases > 0) totalFree.replaceChildren(chip(`+${casesLabel(totals.freeCases)} free`, { tone: 'ok', icon: 'tag' }));
    else totalFree.replaceChildren();
    totalValue.textContent = inr(totals.netValue);
    totalNote.textContent = totals.discount > 0 ? `After ${inr(totals.discount)} scheme discount` : 'Order value';
    renderBookingPanel(panel, result, panelContext(cart));
  }

  sync();
  paintList();
  const unsubscribe = store.subscribe((state, action) => {
    if (action && action.type === 'demo/reset') return;   // the page is about to reload
    sync();
  });

  const outletHref = `#/outlet/${encodeURIComponent(outlet.id)}`;
  container.append(
    appHeader({ title: 'Book order', subtitle: outlet.name || outlet.id, backHref: outletHref, backLabel: 'Back to outlet details' }),
    h('div', { class: 'screen order' },
      panel,
      h('div', { class: 'order__find' }, search, tabRow),
      h('div', { class: 'order__results' }, found, list)),
    actionBar(h('div', { class: 'order-bar' },
      h('div', { class: 'order-bar__totals' },
        h('div', { class: 'order-bar__left' }, totalCases, totalFree),
        h('div', { class: 'order-bar__right' }, totalValue, totalNote)),
      button('Review', { href: `#/review/${encodeURIComponent(outlet.id)}`, iconEnd: 'chevron-right', block: true }))),
  );

  return () => unsubscribe();
}

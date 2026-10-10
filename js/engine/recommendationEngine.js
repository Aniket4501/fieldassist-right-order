// Right Order: recommend(ctx) and its result contract. The UI talks only to this function.
//
// For each product the outlet sells, it works out how many cases to add so the shop lasts till the
// next delivery (the recommendation), how few still last if sales are normal (low) and how many is
// too much (high), then reads the cart against those three numbers. The arithmetic is in cover.js
// and every coefficient is in params.js.
//
// Pure: no DOM, no storage, no clock. Runs in Node and in the browser. Never throws.

import { isValidISO, addDays, diffDays, formatDate } from '../dates.js';
import { inr, num, casesLabel, plural } from '../format.js';
import { evaluateSchemes, cartLines } from './schemes.js';
import { priceCart } from './pricing.js';
import { PARAMS } from './params.js';
import { roundHalfUp, windowFor, historyFor, calendarFor, seasonPhase, numbersFor, runOutDate, statusOf } from './cover.js';

const ENGINE_VERSION = PARAMS.engineVersion;
export const CANDIDATE_DAYS = 7 * PARAMS.candidateWeeks;   // a product is a candidate when it was booked in this window

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fit(text, max) {
  const s = String(text);
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + '…';
}

function one(n) {
  return num(Math.round(n * 10) / 10, Number.isInteger(Math.round(n * 10) / 10) ? 0 : 1);
}

function day(iso) {
  return formatDate(iso, 'short');
}

function shortDay(iso) {
  return formatDate(iso, 'dm');
}

function weeksText(weeks) {
  if (!Number.isFinite(weeks) || weeks >= PARAMS.overTextCapWeeks) return `${PARAMS.overTextCapWeeks}+ weeks`;
  if (weeks < 1.5) return 'more than 1 week';
  return `~${roundHalfUp(weeks)} weeks`;
}

function blank(state, inputs) {
  return {
    engineVersion: ENGINE_VERSION, state, headline: null, horizon: null, window: null,
    outletBadge: state === 'not_applicable' ? null : 'checkdata',
    lines: [], nudges: [],
    quickSets: { suggested: {}, minimum: {} },
    pitch: '',
    credit: { known: false, available: null, bookedToday: 0, cartValue: 0, fits: null, priority: [], unlockByCollecting: 0, text: null },
    scheme: null,
    explain: { inputs, steps: [] },
  };
}

// A product the outlet can take instead of one the distributor cannot deliver: same category and
// serve, available, the same flavour first, then the nearest pack size. Read from the product master.
function substituteFor(product, outlet, data) {
  const items = isObject(data.distributorStock) && Array.isArray(data.distributorStock.items) ? data.distributorStock.items : [];
  const out = new Set(items.filter((item) => isObject(item) && item.status === 'out').map((item) => item.sku));
  let best = null;
  let bestScore = Infinity;
  for (const other of Array.isArray(data.products) ? data.products : []) {
    if (!isObject(other) || typeof other.sku !== 'string' || other.sku === product.sku || out.has(other.sku)) continue;
    if (other.category !== product.category || other.serve !== product.serve) continue;
    if (other.returnable === true && !isObject(outlet.glass)) continue;
    const score = (other.flavour === product.flavour ? 0 : 10000) + (other.returnable === true ? 5000 : 0)
      + Math.abs((Number(other.packMl) || 0) - (Number(product.packMl) || 0));
    if (score < bestScore) { best = other; bestScore = score; }
  }
  return best ? { sku: best.sku, name: best.name || best.sku } : null;
}

/**
 * @param {{ outlet, cart, visit, data, demoDate }} ctx   data = the view from data.js
 * @returns the result described in PROGRESS.md §7.7
 */
export function recommend(ctx) {
  const c = isObject(ctx) ? ctx : {};
  const outlet = isObject(c.outlet) ? c.outlet : null;
  const data = isObject(c.data) ? c.data : {};
  const demoDate = isValidISO(c.demoDate) ? c.demoDate : (isValidISO(data.demoDate) ? data.demoDate : null);
  const inputs = {
    outletId: outlet && outlet.id !== undefined ? outlet.id : null,
    demoDate, nextVisit: null, nextDelivery: null, days: null, windowDays: null, engineVersion: ENGINE_VERSION,
  };

  if (!outlet) return blank('not_applicable', inputs);
  if (!demoDate || typeof data.ordersFor !== 'function') return blank('insufficient_data', inputs);

  const cart = cartLines(c.cart);
  const visit = isObject(c.visit) && (c.visit.outletId === undefined || c.visit.outletId === outlet.id) && isObject(c.visit.stockOnHand)
    ? c.visit.stockOnHand : {};
  const products = (Array.isArray(data.products) ? data.products : []).filter((p) => isObject(p) && typeof p.sku === 'string');
  const nameOf = (sku) => {
    const product = products.find((p) => p.sku === sku);
    return product && product.name ? product.name : sku;
  };

  const win = windowFor(outlet, data, demoDate);
  const hist = historyFor(outlet, data, demoDate);
  const cal = calendarFor(outlet, data, demoDate, hist.weekly);
  const phase = seasonPhase(data, demoDate);
  const till = day(win.coversTill);
  inputs.nextVisit = win.nextVisit;
  inputs.nextDelivery = win.nextDelivery;
  inputs.days = win.horizonDays;
  inputs.windowDays = win.days;

  const horizon = { nextVisit: win.planned ? win.nextVisit : null, days: Math.max(1, diffDays(demoDate, win.nextVisit)) };
  const window = {
    days: win.days, horizonDays: win.horizonDays, capped: win.capped, nextDelivery: win.nextDelivery, coversTill: win.coversTill,
    flag: win.capped ? `Visit gap ${plural(win.horizonDays, 'day', 'days')} — covers 2 weeks. Ask for a top-up` : null,
  };

  // ---- candidates: booked in the last 12 weeks, or a focus product the peer level gives a rate for
  const found = [];
  for (const product of products) {
    if (product.returnable === true && !isObject(outlet.glass) && !hist.history.some((o) => o.lines.some((l) => isObject(l) && l.sku === product.sku))) continue;
    const checked = Object.prototype.hasOwnProperty.call(visit, product.sku) ? visit[product.sku] : null;
    const numbers = numbersFor({ product, outlet, data, demoDate, win, hist, cal, phase, checked });
    if (numbers.lastBooked > 0 || (product.focus === true && numbers.weekly > 0)) found.push({ product, numbers });
  }

  if (!found.length) {
    const none = blank('insufficient_data', inputs);
    none.horizon = horizon;
    none.window = window;
    none.headline = 'Not enough history for a suggestion';
    return none;
  }

  const ranked = found.slice().sort((a, b) => b.numbers.mu - a.numbers.mu);
  const keySkus = new Set(ranked.filter((entry) => entry.numbers.mu > 0 || entry.numbers.unavailable).slice(0, PARAMS.keyCount).map((entry) => entry.product.sku));

  const weeksOfHistory = hist.orderingWeeks;   // weeks in which the outlet booked an order
  const closure = cal.closures
    .filter((item) => item.end >= demoDate && item.start <= addDays(demoDate, win.days + PARAMS.ceilingExtraDays - 1))
    .sort((a, b) => (a.start < b.start ? -1 : 1))[0] || null;
  const effect = cal.effects.find((item) => item.event.start <= addDays(demoDate, win.days - 1) && item.event.end >= demoDate) || null;
  const asOf = isObject(data.distributorStock) && isValidISO(data.distributorStock.asOf) ? data.distributorStock.asOf : null;

  // ---- lines
  const lines = found.map(({ product, numbers }) => {
    const sku = product.sku;
    const cartCases = cart[sku] || 0;
    const status = statusOf(numbers, cartCases);
    const lastsTill = runOutDate(numbers, cal, demoDate, numbers.stock + cartCases);
    const weeks = numbers.weekly > 0 ? (numbers.stock + cartCases) / numbers.weekly : Infinity;
    const substitute = numbers.unavailable ? substituteFor(product, outlet, data) : null;
    const { recommended, low, high } = numbers;

    let hint;
    if (status === 'unavailable') hint = substitute ? `Unavailable · try ${substitute.name}` : 'Unavailable at the distributor';
    else if (status === 'missing') hint = `Add ${num(recommended)} · lasts till ${till}`;
    else if (status === 'none_needed') hint = numbers.inTransit > 0 ? `On the way · covered till ${till}` : (numbers.weekly > 0 ? `Covered till ${till}` : 'No sales in the last 4 weeks');
    else if (status === 'short') hint = `Short · runs out ~${day(lastsTill || demoDate)}`;
    else if (status === 'over') {
      if (numbers.glassCap !== null && cartCases > numbers.glassCap) hint = `Over · only ${plural(numbers.glassCap, 'crate', 'crates')} against empties`;
      else if (closure && numbers.flags.includes('closure') && (lastsTill === null || lastsTill >= closure.start)) hint = `Over · still in stock when closed ${shortDay(closure.start)}`;
      else hint = `Over · ${weeksText(weeks)} of stock`;
    } else hint = cartCases >= recommended ? `Lasts till ${till}` : `Lasts till ${till} if sales are normal`;

    let reason;
    const change = Math.round((numbers.stepUp - 1) * 100);
    // Few ordering weeks here and the number leans on similar shops: the screens must say so.
    const fewOrders = weeksOfHistory < PARAMS.confidenceWeeks && numbers.flags.includes('peer');
    if (numbers.unavailable) reason = asOf ? `Out at the distributor as of ${day(asOf)}` : 'Out at the distributor';
    else if (numbers.flags.includes('glass_cap') && recommended >= numbers.glassCap) reason = `Only ${plural(numbers.glassCap, 'crate', 'crates')} against empties`;
    else if (numbers.inTransit > 0 && recommended === 0) reason = 'Order on the way covers this';
    else if (!(numbers.weekly > 0)) reason = 'No orders in the last 4 weeks';
    else if (closure && numbers.flags.includes('closure')) reason = `${closure.name || 'Closed'} from ${shortDay(closure.start)}`;
    else if (effect && numbers.flags.includes('event')) reason = `${effect.event.name || 'Event'}: ×${one(effect.ratio)} last year`;
    else if (numbers.counted) reason = `Counted stock: ${casesLabel(numbers.onHand)}`;
    else if (recommended === 0 && numbers.weekly > 0) reason = `Stock covers till ${till}`;
    else if (fewOrders) reason = 'Few orders here · leans on similar shops';
    else if (change >= 10) reason = `Season: ~${num(change)}% more than the last 4 weeks`;
    else if (change <= -10) reason = `Season: ~${num(-change)}% less than the last 4 weeks`;
    else if (numbers.shrunk) reason = 'Based on similar shops';
    else reason = 'Based on the last 4 weeks';

    const checks = { stock: numbers.counted, history: weeksOfHistory >= PARAMS.confidenceWeeks, horizon: !win.capped };
    const failed = Object.values(checks).filter((ok) => !ok).length;
    const confidence = failed === 0 ? 'high' : failed === 1 ? 'medium' : 'low';
    const word = confidence.charAt(0).toUpperCase() + confidence.slice(1);
    const range = low === high ? num(low) : `${num(low)}–${num(high)}`;

    const stockText = (numbers.counted ? `${casesLabel(numbers.onHand)} (counted)` : `about ${casesLabel(Math.round(numbers.estimate * 10) / 10)} (estimate)`)
      + (numbers.inTransit > 0 ? ` + ${casesLabel(numbers.inTransit)} on the way` : '');
    const ignoredText = numbers.ignored.length
      ? numbers.ignored.map((week) => `${shortDay(week.from)}–${shortDay(week.to)}`).join(', ') + ' (distributor ran out)'
      : (numbers.lyGap ? `Last year ${shortDay(numbers.lyGap.start)}–${shortDay(numbers.lyGap.end)} (distributor ran out)` : 'None');
    const facts = [
      { label: 'This week last year', value: numbers.lyGap && numbers.lyThisWeek === 0 ? 'No order (distributor ran out)' : (numbers.lyThisWeek > 0 ? casesLabel(numbers.lyThisWeek) : 'No order that week') },
      { label: 'Last 4 weeks', value: `${casesLabel(numbers.rate)} a week${numbers.shrunk ? ' (with similar shops)' : ''}` },
      { label: 'Stock now', value: stockText },
      { label: 'Next delivery', value: `${day(win.nextDelivery)} · ${plural(win.horizonDays, 'day', 'days')}${win.capped ? ' (order covers 14)' : ''}` },
      { label: 'Ignored weeks', value: ignoredText },
      { label: 'Confidence', value: `${word} · ${low === high ? casesLabel(low) : `${range} cases`}` },
    ];

    const points = [];
    if (numbers.unavailable) points.push(substitute ? `The distributor is out of this. ${substitute.name} is available.` : 'The distributor is out of this as of the last report.');
    if (numbers.flags.includes('glass_cap')) points.push(`Glass comes only against empties: ${plural(numbers.glassCap, 'crate', 'crates')} today. A deposit gets more.`);
    if (closure && numbers.flags.includes('closure')) points.push(`${closure.name || 'The closure'} starts ${day(closure.start)}. Anything beyond that would sit.`);
    if (effect && numbers.flags.includes('event')) points.push(`${effect.event.name || 'This event'}: last year that week was ×${one(effect.ratio)} your normal.`);
    if (fewOrders && !numbers.unavailable) points.push('Few orders here, so this leans on shops like this one.');
    if (numbers.lyGap) points.push(`Last year the distributor ran out on ${shortDay(numbers.lyGap.start)}, so last year’s orders understate what you sold.`);
    if (numbers.inTransit > 0) points.push(`${casesLabel(numbers.inTransit)} booked today is on the way and is counted.`);
    if (!numbers.unavailable && Math.abs(change) >= 10 && numbers.stepUpFrom !== 'none') {
      const who = numbers.stepUpFrom === 'own' ? 'Last year you sold' : (numbers.stepUpFrom === 'peer' ? 'Shops like this sell' : 'You and shops like this sell');
      points.push(`${who} about ${num(Math.abs(change))}% ${change > 0 ? 'more' : 'less'} in the coming days than in the 4 weeks before.`);
    }
    if (!numbers.unavailable && numbers.buffer > 0) points.push('A little extra is added for hot days: small packs sell out first.');
    if (!numbers.unavailable && numbers.buffer === 0 && numbers.packGroup === 'takehome') points.push('Big packs get no extra, so nothing sits after the season.');
    if (confidence === 'low' && !numbers.counted) points.push('Counting the stock makes this number exact for this shop.');

    const steps = [
      { label: 'Sales now', value: `About ${casesLabel(numbers.rate)} a week over the last 4 weeks.` },
      { label: `Next ${plural(win.days, 'day', 'days')}`, value: `About ${casesLabel(numbers.mu)}${change !== 0 ? ` (season: ${num(Math.abs(change))}% ${change > 0 ? 'more' : 'less'})` : ''}.` },
    ];
    if (numbers.buffer > 0) steps.push({ label: 'Hot-day extra', value: `+${casesLabel(numbers.buffer)}, small packs only.` });
    steps.push({ label: 'Less stock', value: `${one(numbers.stock)} in the shop${numbers.inTransit > 0 ? ' and on the way' : ''} → add ${casesLabel(recommended)}.` });

    return {
      sku, isKey: keySkus.has(sku),
      recommendedCases: recommended, rangeLow: low, rangeHigh: high, cartCases, status,
      lastsTill, hint: fit(hint, PARAMS.hintMax), reasonShort: fit(reason, PARAMS.reasonMax),
      confidence, confidenceText: `${word} · ${range}`, flags: numbers.flags,
      substitute,
      stock: { cases: Math.round(numbers.stock * 10) / 10, counted: numbers.counted, inTransit: numbers.inTransit, estimate: Math.round(numbers.estimate * 10) / 10 },
      weeklyRate: Math.round(numbers.weekly * 10) / 10,
      why: { facts, talkingPoints: points.slice(0, 3), steps },
    };
  });
  const numbersBySku = new Map(found.map((entry) => [entry.product.sku, entry.numbers]));
  const lineBySku = new Map(lines.map((line) => [line.sku, line]));

  // ---- quick sets: the recommendation, and the least that still lasts if sales are normal
  const quickSets = { suggested: {}, minimum: {} };
  for (const line of lines) {
    if (line.recommendedCases > 0) quickSets.suggested[line.sku] = line.recommendedCases;
    if (line.rangeLow > 0) quickSets.minimum[line.sku] = line.rangeLow;
  }

  // ---- scheme: the pooled buy-and-get scheme, with a nudge only when the extra cases would not sit
  const history = data.ordersFor(outlet.id);
  const schemeResults = evaluateSchemes(cart, outlet, data.schemes, data.products, demoDate, history);
  const pooled = schemeResults.find((s) => s.type === 'buy_x_get_y' && Array.isArray(s.skus) && s.skus.some((sku) => lineBySku.has(sku)))
    || schemeResults.find((s) => s.type === 'buy_x_get_y') || null;
  let scheme = null;
  if (pooled) {
    const perTrigger = pooled.triggers > 0 ? pooled.freeCases / pooled.triggers : null;
    const master = (Array.isArray(data.schemes) ? data.schemes : []).find((s) => isObject(s) && s.id === pooled.schemeId) || {};
    const freeEach = perTrigger || Number(master.freeCases) || 1;
    const limitReached = pooled.capReached && pooled.triggers === 0;
    let text;
    if (!pooled.eligible) text = pooled.reasonIfNot || 'Not eligible';
    else if (limitReached) text = 'Monthly scheme limit reached';
    else if (pooled.triggers > 0) text = `${num(pooled.freeCases)} free ✓${pooled.casesToNextTrigger ? ` · next at ${num(pooled.qualifyingCases + pooled.casesToNextTrigger)}` : ''}`;
    else text = `${num(pooled.qualifyingCases)}/${num(pooled.threshold)} → ${num(freeEach)} free`;

    let nudge = null;
    let honestNote = null;
    const gap = pooled.casesToNextTrigger;
    if (pooled.eligible && !pooled.capReached && gap > 0 && gap <= PARAMS.schemeNudgeGap) {
      const pool = pooled.skus.map((sku) => lineBySku.get(sku)).filter((line) => line && line.status !== 'unavailable');
      const room = pool.reduce((sum, line) => sum + line.rangeHigh, 0);
      const target = pool.slice().sort((a, b) => (b.rangeHigh - b.cartCases) - (a.rangeHigh - a.cartCases))[0] || null;
      // Within the pooled ceiling, and the line that takes the extra cases stays inside its own range.
      if (target && pooled.qualifyingCases + gap <= room && target.cartCases + gap <= target.rangeHigh) {
        const next = { ...cart, [target.sku]: target.cartCases + gap };
        const after = evaluateSchemes(next, outlet, data.schemes, data.products, demoDate, history).find((s) => s.schemeId === pooled.schemeId);
        const freeProduct = after && after.freeSku ? products.find((p) => p.sku === after.freeSku) : null;
        const worth = freeProduct && Number(freeProduct.ptrCase) > 0 ? ` (${inr(Number(freeProduct.ptrCase) * freeEach)})` : '';
        nudge = {
          text: fit(`+${num(gap)} ${nameOf(target.sku)} → ${num(freeEach)} free${worth}`, PARAMS.headlineMax),
          action: { sku: target.sku, addCases: gap, setCases: target.cartCases + gap },
        };
      } else {
        const weekly = pool.reduce((sum, line) => sum + (numbersBySku.get(line.sku).weekly || 0), 0);
        const held = pool.reduce((sum, line) => sum + numbersBySku.get(line.sku).stock + line.cartCases, 0) + gap + freeEach;
        honestNote = `${plural(gap, 'more case gets', 'more cases get')} a free one, but leaves ${weeksText(weekly > 0 ? held / weekly : Infinity)} of stock — not suggested`;
      }
    }
    scheme = {
      schemeId: pooled.schemeId, name: pooled.name, eligible: pooled.eligible, reasonIfNot: pooled.reasonIfNot,
      pooledCases: pooled.qualifyingCases, threshold: pooled.threshold, toNext: pooled.casesToNextTrigger,
      freeCases: pooled.freeCases, capReached: pooled.capReached, limitReached, text, nudge, honestNote,
    };
  }

  // ---- credit (for the review screen): does the order fit, and which line to protect first
  const totals = priceCart(cart, data.products, schemeResults);
  const room = typeof data.availableCredit === 'function' ? data.availableCredit(outlet.id) : { known: false, available: null, bookedToday: 0 };
  const cartSkus = Object.keys(cart);
  const runsOut = (sku) => {
    const numbers = numbersBySku.get(sku);
    return numbers ? (runOutDate(numbers, cal, demoDate, numbers.stock) || '9999-12-31') : '9999-12-32';
  };
  const priority = cartSkus.slice().sort((a, b) => (runsOut(a) < runsOut(b) ? -1 : runsOut(a) > runsOut(b) ? 1 : 0));
  const fits = room.known ? totals.netValue <= room.available : null;
  const overdue = isObject(outlet.credit) && Number(outlet.credit.overdue) > 0 ? Number(outlet.credit.overdue) : 0;
  const unlock = fits === false && overdue > 0 ? Math.min(overdue, totals.netValue - room.available) : 0;
  let creditText = null;
  if (fits === false) {
    creditText = `Fits ${inr(Math.max(0, Number(room.available) || 0))}`
      + (priority.length ? ` — first: ${nameOf(priority[0])} (runs out first)` : '')
      + (unlock > 0 ? `. Collect ${inr(unlock)} to add the rest` : '');
  }
  const credit = {
    known: room.known === true, available: room.available, bookedToday: room.bookedToday || 0,
    cartValue: totals.netValue, fits, priority, unlockByCollecting: unlock, text: creditText,
  };

  // ---- the outlet as a whole
  const keyLines = lines.filter((line) => line.isKey);
  const needs = keyLines.filter((line) => line.status === 'missing' || line.status === 'short');
  const settled = keyLines.every((line) => line.status === 'right' || line.status === 'none_needed' || line.status === 'unavailable');
  const weeklyNow = found.reduce((sum, entry) => sum + entry.numbers.rate, 0);
  const totalRec = lines.reduce((sum, line) => sum + line.recommendedCases, 0);
  const toAdd = lines.reduce((sum, line) => sum + Math.max(0, line.recommendedCases - line.cartCases), 0);
  // Badge (04 §F): stock-up talk = a key line is missing or short and the outlet needs at least a week
  // of its sales; go light = a closure or the season's tail clips the order; covered otherwise. A key
  // line that needs a small top-up keeps the badge at covered but the state active, so the card speaks.
  // Go light also when nothing is needed yet: it tells the rep not to load this outlet. Once an order
  // is booked today and every key line is settled, the outlet reads covered like any other.
  const light = Boolean(closure) || phase === 'tail';
  const bookedToday = Object.keys(hist.transit).length > 0;
  let outletBadge;
  if (light && !(settled && bookedToday)) outletBadge = 'golight';
  else if (settled) outletBadge = 'covered';
  else if (needs.length && totalRec >= PARAMS.stockUpWeeks * weeklyNow) outletBadge = 'stockup';
  else outletBadge = 'covered';
  const state = settled ? 'quiet' : 'active';
  const lowConfidence = keyLines.length > 0 && keyLines.every((line) => line.confidence === 'low');
  const thinHistory = weeksOfHistory < PARAMS.confidenceWeeks;
  const add = toAdd > 0 ? toAdd : totalRec;

  let headline;
  if (settled && (!light || bookedToday)) headline = `Covered till ${till}`;
  else if (closure) headline = `${closure.name || 'Closed'} from ${shortDay(closure.start)} · ${settled ? 'nothing more needed' : `order for ${plural(win.days, 'day', 'days')}`}`;
  else if (phase === 'tail') headline = settled ? 'Season is ending · nothing more needed' : `Season is ending · order light, lasts till ${till}`;
  else if (!needs.length) headline = `Over on ${plural(keyLines.filter((line) => line.status === 'over').length, 'key item', 'key items')} · covered past ${till}`;
  else if (outletBadge === 'stockup') headline = `Add ~${casesLabel(add)} · lasts till ${till}`;
  else headline = `Top up ~${casesLabel(add)} · lasts till ${till}`;

  let pitch;
  const s1 = totalRec === 1 ? 's' : '';   // "1 case keeps", "17 cases keep"
  const selling = `You sell about ${one(weeklyNow)} cases a week now.`;
  // The pitch speaks about the recommendation, not about the cart, so it does not change as lines are edited.
  if (totalRec === 0) pitch = closure ? `${closure.name || 'The closure'} starts ${day(closure.start)}. Your stock already lasts till ${till}; more would sit.` : `Your stock covers you till ${till}. Nothing more is needed today.`;
  else if (closure) pitch = `${closure.name || 'The closure'} starts ${day(closure.start)}. ${casesLabel(totalRec)} last${s1} till ${till}; more would sit.`;
  else if (thinHistory) pitch = `Few orders here so far: start with ${casesLabel(totalRec)}, and we top up next visit.`;
  else if (win.capped) pitch = `${selling} Next visit is ${plural(win.horizonDays, 'day', 'days')} away: ${casesLabel(totalRec)} cover${s1} 2 weeks.`;
  else if (effect) pitch = `${selling} With ${effect.event.name || 'the event'}, ${casesLabel(totalRec)} keep${s1} you stocked till ${till}.`;
  else if (totalRec >= PARAMS.stockUpWeeks * weeklyNow) pitch = `${selling} ${casesLabel(totalRec)} keep${s1} you stocked till ${till}, the next delivery.`;
  else pitch = `${selling} A top-up of ${casesLabel(totalRec)} keeps every key item in stock till ${till}.`;

  // ---- nudges: the short messages the screens may show
  const nudges = [];
  if (scheme && scheme.nudge) nudges.push({ type: 'scheme', sku: scheme.nudge.action.sku, text: scheme.nudge.text, action: { sku: scheme.nudge.action.sku, setCases: scheme.nudge.action.setCases } });
  for (const line of lines) {
    const numbers = numbersBySku.get(line.sku);
    if (line.status === 'unavailable' && (line.isKey || line.cartCases > 0)) {
      nudges.push({ type: 'supply', sku: line.sku, text: fit(`${nameOf(line.sku)}: unavailable${asOf ? ` (as of ${day(asOf)})` : ''}${line.substitute ? ` · try ${line.substitute.name}` : ''}`, 90) });
    } else if (numbers.glassCap !== null && line.cartCases > numbers.glassCap) {
      nudges.push({ type: 'supply', sku: line.sku, text: `Only ${plural(numbers.glassCap, 'crate', 'crates')} against empties — deposit for more` });
    } else if (numbers.supply === 'low' && line.cartCases > 0) {
      nudges.push({ type: 'supply', sku: line.sku, text: fit(`${nameOf(line.sku)}: ${numbers.supplyNote || 'low at the distributor'}`, 90) });
    }
  }
  if (window.flag) nudges.push({ type: 'event', text: window.flag });
  if (closure) nudges.push({ type: 'event', text: fit(`${closure.name || 'Closure'} from ${day(closure.start)} — order for ${plural(win.days, 'day', 'days')}`, 90) });
  if (lowConfidence && keyLines.some((line) => !numbersBySku.get(line.sku).counted)) nudges.push({ type: 'stock_check', text: 'Count stock on the key items to tighten the range' });

  const steps = keyLines.map((line) => ({ label: nameOf(line.sku), value: line.why.steps.map((step) => step.value).join(' ') }));

  return {
    engineVersion: ENGINE_VERSION, state,
    headline: fit(headline, PARAMS.headlineMax),
    horizon, window, outletBadge, lines, nudges, quickSets,
    pitch: fit(pitch, PARAMS.pitchMax),
    credit, scheme,
    explain: { inputs, steps },
  };
}

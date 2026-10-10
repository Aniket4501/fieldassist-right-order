// Scheme evaluation for a cart. Pure: no DOM, no storage, no clock. Runs in Node and in the browser.
// Never throws on imperfect input; an unusable scheme or cart gives zeros.

import { isValidISO, monthKey } from '../dates.js';

// ---------------------------------------------------------------- shared helpers

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

const MAX_CASES = 1000000;   // above this a quantity is a typing error, and money sums stop being exact

// Numbers and numeric strings above 0, up to MAX_CASES; anything else counts as 0.
function toCases(value) {
  if (typeof value !== 'number' && (typeof value !== 'string' || value.trim() === '')) return 0;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n <= MAX_CASES ? n : 0;
}

function positive(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

// A monthly cap is a number from 0 up; null (or anything else) means no cap.
function capOf(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

// The cart as a clean { [sku]: cases } map with no prototype. Takes the store's cart object
// ({ outletId, lines }) or just the lines map. Zero, negative and non-numeric quantities are dropped.
export function cartLines(cart) {
  const out = Object.create(null);
  if (!isObject(cart)) return out;
  // A cart object whose lines are missing is an empty cart, not a lines map with a sku called outletId.
  const isCartObject = 'lines' in cart || 'outletId' in cart;
  const lines = isObject(cart.lines) ? cart.lines : (isCartObject ? {} : cart);
  for (const sku of Object.keys(lines)) {
    const cases = toCases(lines[sku]);
    if (cases > 0) out[sku] = cases;
  }
  return out;
}

// Products as a map keyed by sku, with no prototype. Takes the products array or a map.
export function productIndex(products) {
  const out = Object.create(null);
  if (Array.isArray(products)) {
    for (const product of products) {
      if (isObject(product) && product.sku !== undefined && product.sku !== null) out[product.sku] = product;
    }
  } else if (isObject(products)) {
    for (const sku of Object.keys(products)) {
      if (isObject(products[sku])) out[sku] = products[sku];
    }
  }
  return out;
}

// Booked cases of an order as a { [sku]: cases } map. Order lines may be an array or a map.
function orderLines(order) {
  const out = Object.create(null);
  if (!isObject(order)) return out;
  if (Array.isArray(order.lines)) {
    for (const line of order.lines) {
      if (!isObject(line) || line.sku === undefined || line.sku === null) continue;
      const cases = toCases(line.cases);
      if (cases > 0) out[line.sku] = (out[line.sku] || 0) + cases;
    }
    return out;
  }
  return cartLines(order.lines);
}

function priceOf(bySku, sku) {
  const product = bySku[sku];
  const raw = product ? product.ptrCase : null;
  // null, '' and true would all turn into a number; they mean "no price".
  const price = typeof raw === 'number' || (typeof raw === 'string' && raw.trim() !== '') ? Number(raw) : NaN;
  return Number.isFinite(price) && price >= 0 ? price : null;
}

function roundHalfUp(n) {
  return Math.floor(n + 0.5);
}

// 'Gold' · 'Gold and Silver' · 'Diamond, Gold and Silver'
function listInWords(items) {
  return items.length > 1 ? items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1] : items.join('');
}

// ---------------------------------------------------------------- the two scheme types

function totalOver(lines, skus) {
  let total = 0;
  for (const sku of skus) total += lines[sku] || 0;
  return total;
}

// Triggers a set of lines earns, before any monthly cap.
function rawTriggers(lines, skus, buyCases, pooled) {
  if (pooled) return Math.floor(totalOver(lines, skus) / buyCases);
  let triggers = 0;
  for (const sku of skus) triggers += Math.floor((lines[sku] || 0) / buyCases);
  return triggers;
}

// Cases still needed to reach the next multiple of `step`. Exactly on a multiple, the next
// one is a full step away. Not pooled: the smallest gap over the scheme skus in the cart.
function gapToNextStep(lines, skus, step, pooled) {
  if (pooled) return step - (totalOver(lines, skus) % step);
  let gap = null;
  for (const sku of skus) {
    if (!lines[sku]) continue;
    const g = step - (lines[sku] % step);
    if (gap === null || g < gap) gap = g;
  }
  return gap === null ? step : gap;
}

// The scheme sku in the cart with the lowest PTR. Ties: the larger cart quantity, then scheme
// sku order. A sku with no known price is chosen only when no priced one is in the cart.
function cheapestInCart(lines, skus, bySku) {
  let best = null;
  for (const sku of skus) {
    if (!lines[sku]) continue;
    const price = priceOf(bySku, sku);
    const rank = price === null ? Infinity : price;
    if (best === null || rank < best.rank || (rank === best.rank && lines[sku] > best.cases)) {
      best = { sku, rank, cases: lines[sku] };
    }
  }
  return best ? best.sku : null;
}

function evaluateBuyXGetY(result, scheme, lines, bySku, monthOrders) {
  const buyCases = positive(scheme.buyCases);
  result.threshold = buyCases;
  if (buyCases === null || !result.eligible) return;

  // Triggers already earned this month, from each order's booked cases.
  let used = 0;
  for (const order of monthOrders) {
    if (order.date < scheme.validFrom || order.date > scheme.validTo) continue;
    used += rawTriggers(orderLines(order), result.skus, buyCases, result.pooled);
  }
  const cap = result.capPerMonth;
  if (cap !== null) used = Math.min(used, cap);
  const remaining = cap === null ? Infinity : Math.max(0, cap - used);

  const triggers = Math.min(rawTriggers(lines, result.skus, buyCases, result.pooled), remaining);
  result.triggersUsedThisMonth = used;
  result.triggers = triggers;
  result.freeCases = triggers * (positive(scheme.freeCases) || 0);
  result.capReached = cap !== null && used + triggers >= cap;
  result.casesToNextTrigger = result.capReached ? null : gapToNextStep(lines, result.skus, buyCases, result.pooled);
  result.freeSku = triggers > 0 ? cheapestInCart(lines, result.skus, bySku) : null;
}

function evaluatePctOff(result, scheme, lines, bySku) {
  const minCases = positive(scheme.minCases);
  const pctOff = positive(scheme.pctOff);
  result.threshold = minCases;
  result.discountPct = pctOff;
  if (minCases === null || !result.eligible) return;

  // Pooled: every scheme line is discounted once the total reaches the minimum.
  // Not pooled: only the skus that reach it on their own.
  let discounted;
  let gap;
  if (result.pooled) {
    const met = result.qualifyingCases >= minCases;
    discounted = met ? result.skus.filter((sku) => lines[sku]) : [];
    gap = met ? 0 : minCases - result.qualifyingCases;
  } else {
    discounted = result.skus.filter((sku) => (lines[sku] || 0) >= minCases);
    gap = 0;
    if (!discounted.length) {
      const inCart = result.skus.filter((sku) => lines[sku]);
      gap = inCart.length ? Math.min(...inCart.map((sku) => minCases - lines[sku])) : minCases;
    }
  }

  let value = 0;
  for (const sku of discounted) value += lines[sku] * (priceOf(bySku, sku) || 0);
  result.triggers = discounted.length ? 1 : 0;
  result.casesToNextTrigger = gap;
  // Never more than the value of the discounted lines, whatever pctOff says.
  result.discountValue = discounted.length && pctOff !== null ? Math.min(roundHalfUp(value), roundHalfUp(value * pctOff / 100)) : 0;
}

// ---------------------------------------------------------------- public

// One result per scheme that is valid on `date`, in file order.
// monthToDateOrders: this outlet's orders in the same calendar month as `date` (history and
// demo orders), needed for the monthly trigger cap. May be missing.
export function evaluateSchemes(cart, outlet, schemes, products, date, monthToDateOrders) {
  if (!isValidISO(date)) return [];
  const lines = cartLines(cart);
  const bySku = productIndex(products);
  const segment = isObject(outlet) && outlet.segment !== undefined && outlet.segment !== null && outlet.segment !== ''
    ? outlet.segment : null;
  const outletId = isObject(outlet) && outlet.id !== undefined && outlet.id !== null ? String(outlet.id) : null;

  // Keep only orders that can count: a valid date in this month up to `date`, and not another outlet's.
  const month = monthKey(date);
  const monthOrders = asArray(monthToDateOrders).filter((order) => isObject(order)
    && isValidISO(order.date) && monthKey(order.date) === month && order.date <= date
    && (outletId === null || order.outletId === undefined || order.outletId === null || String(order.outletId) === outletId));

  const results = [];
  for (const scheme of asArray(schemes)) {
    if (!isObject(scheme) || !isValidISO(scheme.validFrom) || !isValidISO(scheme.validTo)) continue;
    if (date < scheme.validFrom || date > scheme.validTo) continue;

    // A sku listed twice counts once.
    const skus = asArray(scheme.skus).filter((sku, i, all) => typeof sku === 'string' && all.indexOf(sku) === i);
    const segments = asArray(scheme.eligibleSegments);
    const eligible = segment !== null && segments.includes(segment);
    let reasonIfNot = null;
    if (!eligible) {
      reasonIfNot = segment === null
        ? 'Outlet segment not known'
        : 'Only for ' + (segments.length ? listInWords(segments) : 'no') + ' outlets. This outlet is ' + segment;
    }

    const result = {
      schemeId: scheme.id === undefined ? null : scheme.id,
      name: scheme.name === undefined ? null : scheme.name,
      type: scheme.type === undefined ? null : scheme.type,
      skus,
      pooled: scheme.pooled === true,
      eligible,
      reasonIfNot,
      qualifyingCases: totalOver(lines, skus),
      threshold: null,
      triggers: 0,
      freeCases: 0,
      casesToNextTrigger: null,
      capPerMonth: capOf(scheme.capPerMonth),
      triggersUsedThisMonth: 0,
      capReached: false,
      freeSku: null,
      discountPct: null,
      discountValue: 0,
    };

    if (scheme.type === 'buy_x_get_y') evaluateBuyXGetY(result, scheme, lines, bySku, monthOrders);
    else if (scheme.type === 'pct_off_min_qty') evaluatePctOff(result, scheme, lines, bySku);
    results.push(result);
  }
  return results;
}

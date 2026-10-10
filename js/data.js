// Data loading and the read-only data view. No DOM, no localStorage, no clock.
// Only loadAll() touches the network; everything else is pure and runs in Node.

import { isValidISO, isoWeek, isoWeekStart, addDays } from './dates.js';

export const DATA_FILES = {
  config: 'config.json',
  outlets: 'outlets.json',
  products: 'products.json',
  orders: 'orders_history.json',
  routePlan: 'route_plan.json',
  schemes: 'schemes.json',
  distributorStock: 'distributor_stock.json',
  calendar: 'calendar.json',
  clusterBenchmarks: 'cluster_benchmarks.json',
};

const REQUIRED = {
  outlet: ['id', 'name', 'area', 'channel', 'segment', 'visitsPerMonth', 'cooler', 'credit'],
  product: ['sku', 'name', 'category', 'unitsPerCase', 'ptrCase', 'serve'],
  order: ['id', 'outletId', 'date', 'lines'],
  scheme: ['id', 'type', 'skus', 'eligibleSegments', 'validFrom', 'validTo'],
};

const MAX_WARNINGS_PER_FILE = 12;
const MAX_SUMMARY_WEEKS = 520;

// ---------------------------------------------------------------- small helpers

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return isObject(value) ? value : {};
}

function isMissing(value) {
  return value === undefined || value === null || value === '';
}

// 'Gold' · 'Gold and Silver' · 'Diamond, Gold and Silver'
function listInWords(items) {
  return items.length > 1 ? items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1] : items.join('');
}

function toCases(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// Lines may be an array [{ sku, cases, freeCases, deliveredCases }] or a map { sku: cases }.
// A demo order is not delivered yet, so its deliveredCases is always null.
function normaliseLines(lines, demo) {
  const out = [];
  if (Array.isArray(lines)) {
    for (const line of lines) {
      if (!isObject(line) || isMissing(line.sku)) continue;
      const delivered = Number(line.deliveredCases);
      out.push({
        sku: String(line.sku),
        cases: toCases(line.cases),
        freeCases: toCases(line.freeCases),
        deliveredCases: demo || isMissing(line.deliveredCases) || !Number.isFinite(delivered) ? null : delivered,
      });
    }
  } else if (isObject(lines)) {
    for (const sku of Object.keys(lines)) {
      out.push({ sku, cases: toCases(lines[sku]), freeCases: 0, deliveredCases: null });
    }
  }
  return out;
}

// Returns a clean Order, or null when the record cannot be placed (no outlet or no valid date).
function normaliseOrder(order, demo, fallbackId) {
  if (!isObject(order) || isMissing(order.outletId) || !isValidISO(order.date)) return null;
  const clean = {
    id: isMissing(order.id) ? fallbackId : String(order.id),
    outletId: String(order.outletId),
    date: order.date,
    lines: normaliseLines(order.lines, demo),
  };
  if (demo) clean.demo = true;
  return clean;
}

// ---------------------------------------------------------------- validation

function checkList(warnings, list, label, fields, idField) {
  if (!Array.isArray(list)) {
    warnings.push(label + ': expected an array');
    return;
  }
  let reported = 0;
  let hidden = 0;
  list.forEach((item, index) => {
    const name = isObject(item) && !isMissing(item[idField]) ? String(item[idField]) : '#' + index;
    const missing = isObject(item) ? fields.filter((field) => isMissing(item[field])) : fields;
    if (!missing.length) return;
    if (reported < MAX_WARNINGS_PER_FILE) {
      warnings.push(label + ' ' + name + ': missing ' + missing.join(', '));
      reported += 1;
    } else {
      hidden += 1;
    }
  });
  if (hidden) warnings.push(label + ': ' + hidden + ' more records with missing fields');
}

// Pure. Human-readable warnings for missing required fields; never throws.
export function validateRaw(raw) {
  const warnings = [];
  try {
    const r = asObject(raw);

    if (!isObject(r.config)) {
      warnings.push('config: missing or not an object');
    } else {
      if (isMissing(r.config.demoDate)) warnings.push('config: missing demoDate');
      else if (!isValidISO(r.config.demoDate)) warnings.push('config: demoDate is not a YYYY-MM-DD date');
      if (!isObject(r.config.rep) || isMissing(r.config.rep.name)) warnings.push('config: missing rep.name');
    }

    checkList(warnings, r.outlets, 'outlet', REQUIRED.outlet, 'id');
    checkList(warnings, r.products, 'product', REQUIRED.product, 'sku');
    checkList(warnings, r.orders, 'order', REQUIRED.order, 'id');
    checkList(warnings, r.schemes, 'scheme', REQUIRED.scheme, 'id');

    if (!isObject(r.routePlan)) {
      warnings.push('routePlan: missing or not an object');
    } else {
      for (const outlet of asArray(r.outlets)) {
        if (!isObject(outlet) || isMissing(outlet.id)) continue;
        if (!Array.isArray(r.routePlan[outlet.id])) warnings.push('routePlan: no entry for outlet ' + outlet.id);
      }
    }

    // References that do not resolve: reported once each, as a count.
    const outletIds = new Set(asArray(r.outlets).filter(isObject).map((o) => String(o.id)));
    const skus = new Set(asArray(r.products).filter(isObject).map((p) => String(p.sku)));
    let unknownOutlets = 0;
    let unknownSkus = 0;
    let badDates = 0;
    for (const order of asArray(r.orders)) {
      if (!isObject(order)) continue;
      if (!isMissing(order.outletId) && !outletIds.has(String(order.outletId))) unknownOutlets += 1;
      if (!isMissing(order.date) && !isValidISO(order.date)) badDates += 1;
      for (const line of normaliseLines(order.lines, false)) {
        if (!skus.has(line.sku)) unknownSkus += 1;
      }
    }
    if (unknownOutlets) warnings.push('orders: ' + unknownOutlets + ' with an outletId that is not in outlets');
    if (unknownSkus) warnings.push('orders: ' + unknownSkus + ' lines with a sku that is not in products');
    if (badDates) warnings.push('orders: ' + badDates + ' with a date that is not YYYY-MM-DD (ignored)');

    if (!isObject(r.distributorStock)) warnings.push('distributorStock: missing or not an object');
    if (!isObject(r.calendar)) warnings.push('calendar: missing or not an object');
    if (!isObject(r.clusterBenchmarks)) warnings.push('clusterBenchmarks: missing or not an object');
  } catch (error) {
    warnings.push('validation stopped early: ' + (error && error.message ? error.message : String(error)));
  }
  return warnings;
}

// ---------------------------------------------------------------- the data view

// Pure. raw = { config, outlets, products, orders, routePlan, schemes, distributorStock,
// calendar, clusterBenchmarks }. Never throws on imperfect data.
export function buildData(raw, submittedOrders = []) {
  const r = asObject(raw);
  const config = asObject(r.config);
  const demoDate = isValidISO(config.demoDate) ? config.demoDate : null;

  const outlets = asArray(r.outlets).filter((o) => isObject(o) && !isMissing(o.id));
  const products = asArray(r.products).filter((p) => isObject(p) && !isMissing(p.sku));
  const schemes = asArray(r.schemes).filter(isObject);
  const routePlan = asObject(r.routePlan);
  const clusterBenchmarks = asObject(r.clusterBenchmarks);
  const stockIn = asObject(r.distributorStock);
  const distributorStock = { ...stockIn, asOf: isMissing(stockIn.asOf) ? null : stockIn.asOf, items: asArray(stockIn.items) };
  const calendarIn = asObject(r.calendar);
  const calendar = {
    ...calendarIn,
    events: asArray(calendarIn.events),
    supplyHistory: asArray(calendarIn.supplyHistory),
    weeklyMaxTempC: asObject(calendarIn.weeklyMaxTempC),
  };

  // No prototype, so a direct read such as outletsById['constructor'] is undefined.
  const outletsById = Object.create(null);
  for (const outlet of outlets) outletsById[outlet.id] = outlet;
  const productsBySku = Object.create(null);
  for (const product of products) productsBySku[product.sku] = product;

  // History first, then demo orders; the sort is stable, so a demo order lands after
  // the history orders of the same date.
  // An order dated after the demo date has not happened yet: it is left out here, so no selector sees it.
  const happened = (order) => !demoDate || order.date <= demoDate;
  const allOrders = [];
  asArray(r.orders).forEach((order, index) => {
    const clean = normaliseOrder(order, false, 'H-' + index);
    if (clean && happened(clean)) allOrders.push(clean);
  });
  asArray(submittedOrders).forEach((order, index) => {
    const clean = normaliseOrder(order, true, 'D-' + index);
    if (clean && happened(clean)) allOrders.push(clean);
  });
  allOrders.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const ordersByOutlet = Object.create(null);
  for (const order of allOrders) {
    if (!Object.prototype.hasOwnProperty.call(ordersByOutlet, order.outletId)) ordersByOutlet[order.outletId] = [];
    ordersByOutlet[order.outletId].push(order);
  }

  function has(map, key) {
    return typeof key === 'string' && Object.prototype.hasOwnProperty.call(map, key);
  }

  function linesOf(order) {
    if (!isObject(order)) return [];
    return normaliseLines(order.lines, false);
  }

  function orderCases(order) {
    let total = 0;
    for (const line of linesOf(order)) total += line.cases;
    return total;
  }

  function orderValue(order) {
    let total = 0;
    for (const line of linesOf(order)) {
      const product = has(productsBySku, line.sku) ? productsBySku[line.sku] : null;
      const price = product ? Number(product.ptrCase) : 0;
      total += line.cases * (Number.isFinite(price) ? price : 0);
    }
    return total;
  }

  // Booked cases of an order, for one SKU or for all of them.
  function casesIn(order, sku) {
    let total = 0;
    for (const line of order.lines) {
      if (sku === undefined || sku === null || line.sku === sku) total += line.cases;
    }
    return total;
  }

  function ordersFor(outletId) {
    return has(ordersByOutlet, outletId) ? ordersByOutlet[outletId] : [];
  }

  function lastOrder(outletId) {
    // The latest order up to the demo date: an order dated later has not happened yet.
    const list = ordersFor(outletId);
    let order = null;
    for (let i = list.length - 1; i >= 0 && !order; i -= 1) {
      if (!demoDate || list[i].date <= demoDate) order = list[i];
    }
    if (!order) return null;
    return {
      id: order.id,
      date: order.date,
      lines: order.lines,
      cases: orderCases(order),
      value: orderValue(order),
      demo: order.demo === true,
    };
  }

  function orderSummary(outletId, options) {
    const weeks = isObject(options) && options.weeks !== undefined ? options.weeks : 8;
    const requested = Math.floor(Number(weeks));
    const count = Number.isFinite(requested) && requested >= 1 ? Math.min(requested, MAX_SUMMARY_WEEKS) : 8;
    const summary = { weeks: [], totalCases: 0, totalValue: 0, orderCount: 0, avgCasesPerWeek: 0, topSkus: [] };
    if (!demoDate) return summary;

    // `weeks` counts completed ISO weeks: the array holds those, oldest first, then the
    // demo date's own week (current: true). Totals, topSkus and the average cover the
    // completed weeks only; the current week's numbers live in its own entry.
    const currentStart = isoWeekStart(demoDate);
    const byWeek = {};
    for (let i = count; i >= 0; i -= 1) {
      const start = addDays(currentStart, -7 * i);
      const entry = { isoWeek: isoWeek(start), start, cases: 0, value: 0, orders: 0, current: i === 0 };
      summary.weeks.push(entry);
      byWeek[entry.isoWeek] = entry;
    }

    const skuCases = Object.create(null); // no inherited keys, whatever a sku is called
    for (const order of ordersFor(outletId)) {
      const entry = byWeek[isoWeek(order.date)];
      if (!entry) continue;
      const cases = orderCases(order);
      const value = orderValue(order);
      entry.cases += cases;
      entry.value += value;
      entry.orders += 1;
      if (entry.current) continue;
      summary.totalCases += cases;
      summary.totalValue += value;
      summary.orderCount += 1;
      for (const line of order.lines) {
        if (line.cases > 0) skuCases[line.sku] = (skuCases[line.sku] || 0) + line.cases;
      }
    }

    const completed = summary.weeks.filter((week) => !week.current);
    if (completed.length) {
      let completedCases = 0;
      for (const week of completed) completedCases += week.cases;
      summary.avgCasesPerWeek = completedCases / completed.length;
    }

    summary.topSkus = Object.keys(skuCases)
      .map((sku) => ({ sku, cases: skuCases[sku] }))
      .sort((a, b) => b.cases - a.cases || (a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0));
    return summary;
  }

  function weeklyCases(outletId, sku) {
    const out = {};
    for (const order of ordersFor(outletId)) {
      const cases = casesIn(order, sku);
      if (cases === 0 && sku !== undefined && sku !== null) continue;
      const key = isoWeek(order.date);
      out[key] = (out[key] || 0) + cases;
    }
    return out;
  }

  function casesBetween(outletId, from, to, sku) {
    if (!isValidISO(from) || !isValidISO(to)) return 0;
    let total = 0;
    for (const order of ordersFor(outletId)) {
      if (order.date >= from && order.date <= to) total += casesIn(order, sku);
    }
    return total;
  }

  function planFor(outletId) {
    return has(routePlan, outletId) ? asArray(routePlan[outletId]).filter(isValidISO) : [];
  }

  function nextVisit(outletId) {
    if (!demoDate) return null;
    let next = null;
    for (const date of planFor(outletId)) {
      if (date > demoDate && (next === null || date < next)) next = date;
    }
    return next;
  }

  function todaysRoute() {
    if (!demoDate) return [];
    return outlets.filter((outlet) => planFor(outlet.id).includes(demoDate));
  }

  function visitedToday(outletId) {
    if (!demoDate) return false;
    return ordersFor(outletId).some((order) => order.demo === true && order.date === demoDate);
  }

  // What each outlet has already booked today in this demo, at the stored amount to pay.
  const bookedToday = Object.create(null);
  asArray(submittedOrders).forEach((order) => {
    if (!isObject(order) || !demoDate || order.date !== demoDate || typeof order.outletId !== 'string') return;
    const value = Number(order.value);
    if (isMissing(order.value) || !Number.isFinite(value)) return;
    bookedToday[order.outletId] = (has(bookedToday, order.outletId) ? bookedToday[order.outletId] : 0) + value;
  });

  // The one rule for available credit: limit − outstanding − what the outlet booked today in the demo,
  // never below 0. `known` is false (and `available` null) when the limit or the outstanding amount is missing.
  function availableCredit(outletId) {
    const outlet = has(outletsById, outletId) ? outletsById[outletId] : null;
    const credit = asObject(outlet && outlet.credit);
    const limit = Number(credit.limit);
    const outstanding = Number(credit.outstanding);
    const known = !isMissing(credit.limit) && !isMissing(credit.outstanding) && Number.isFinite(limit) && Number.isFinite(outstanding);
    const booked = has(bookedToday, outletId) ? bookedToday[outletId] : 0;
    return { known, bookedToday: booked, available: known ? Math.max(0, limit - outstanding - booked) : null };
  }

  function schemesActiveOn(date, outlet) {
    if (!isValidISO(date)) return [];
    const segment = isObject(outlet) && !isMissing(outlet.segment) ? outlet.segment : null;
    const active = [];
    for (const scheme of schemes) {
      if (!isValidISO(scheme.validFrom) || !isValidISO(scheme.validTo)) continue;
      if (date < scheme.validFrom || date > scheme.validTo) continue;
      const segments = asArray(scheme.eligibleSegments);
      const eligible = segment !== null && segments.includes(segment);
      let reasonIfNot = null;
      if (!eligible) {
        reasonIfNot = segment === null
          ? 'Outlet segment not known'
          : 'Only for ' + (segments.length ? listInWords(segments) : 'no') + ' outlets. This outlet is ' + segment;
      }
      active.push({ ...scheme, eligible, reasonIfNot });
    }
    return active;
  }

  return {
    config, demoDate,
    outlets, products, schemes, calendar, distributorStock, clusterBenchmarks, routePlan,
    outletsById, productsBySku,
    ordersByOutlet,
    ordersFor, lastOrder, orderSummary, weeklyCases, casesBetween,
    nextVisit, todaysRoute, visitedToday, availableCredit, schemesActiveOn,
    orderCases, orderValue,
  };
}

// ---------------------------------------------------------------- loading and the cached view

let cachedRaw = null;
let cachedSubmitted = [];
let cachedView = null;

async function fetchJson(base, file) {
  const url = base + file;
  let response;
  try {
    response = await fetch(url, { cache: 'no-cache' });
  } catch (error) {
    throw new Error('Could not load ' + url + ' (' + (error && error.message ? error.message : 'network error') + ')');
  }
  if (!response.ok) throw new Error('Could not load ' + url + ' (HTTP ' + response.status + ')');
  try {
    return await response.json();
  } catch (error) {
    throw new Error('Could not read ' + url + ' (not valid JSON)');
  }
}

// Fetches all 9 files in parallel with relative URLs, warns about validation problems,
// then builds and caches the view. Rejects only when a file cannot be fetched or parsed;
// the Error message names the file.
export async function loadAll(base = 'data/') {
  const prefix = typeof base === 'string' && base !== '' && !base.endsWith('/') ? base + '/' : (base || '');
  const keys = Object.keys(DATA_FILES);
  const loaded = await Promise.all(keys.map((key) => fetchJson(prefix, DATA_FILES[key])));
  const raw = {};
  keys.forEach((key, index) => { raw[key] = loaded[index]; });

  const warnings = validateRaw(raw);
  if (warnings.length) console.warn('Data validation: ' + warnings.length + ' problem(s)\n- ' + warnings.join('\n- '));

  cachedRaw = raw;
  cachedView = buildData(cachedRaw, cachedSubmitted);
  return cachedView;
}

// The current view. Throws if loadAll() has not resolved.
export function getData() {
  if (!cachedView) throw new Error('Data is not loaded yet: wait for loadAll() before calling getData()');
  return cachedView;
}

// Rebuilds the current view with demo orders merged in, and returns it.
export function setSubmittedOrders(submittedOrders) {
  if (!cachedRaw) throw new Error('Data is not loaded yet: wait for loadAll() before calling setSubmittedOrders()');
  cachedSubmitted = Array.isArray(submittedOrders) ? submittedOrders : [];
  cachedView = buildData(cachedRaw, cachedSubmitted);
  return cachedView;
}

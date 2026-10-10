// Right Order arithmetic for one outlet: the cover window, the calendar, and for each product the
// run-rate, the seasonal step-up, the stock position and the three numbers (low, recommended, high).
// Pure: no DOM, no storage, no clock. Never throws. Everything is read from the data view.

import { isValidISO, addDays, diffDays, isoWeek, isoWeekStart } from '../dates.js';
import { PARAMS } from './params.js';

export function roundHalfUp(n) {
  return Math.floor(n + 0.5);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finite(value, fallback) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clip(n, range) {
  return Math.min(range[1], Math.max(range[0], n));
}

function mean(list) {
  return list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0;
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart <= bEnd && bStart <= aEnd;
}

function appliesTo(event, outlet) {
  const to = event.appliesTo;
  if (to === 'all') return true;
  if (Array.isArray(to)) return to.includes(outlet.id);
  if (isObject(to) && Array.isArray(to.channels)) return to.channels.includes(outlet.channel);
  return false;
}

// --------------------------------------------------------------------------
// Window: how many days this order has to cover
// --------------------------------------------------------------------------

// H = (next visit + delivery lead) − today. W = min(H, 14). With no planned visit, the visit gap
// comes from the outlet's visits per month.
export function windowFor(outlet, data, demoDate) {
  const distributor = isObject(data.config) && isObject(data.config.distributor) ? data.config.distributor : {};
  const lead = Math.max(0, roundHalfUp(finite(distributor.deliveryLeadDays, 1)));
  let nextVisit = typeof data.nextVisit === 'function' ? data.nextVisit(outlet.id) : null;
  const planned = isValidISO(nextVisit) && diffDays(demoDate, nextVisit) > 0;
  if (!planned) {
    const visits = finite(outlet.visitsPerMonth, 0);
    nextVisit = addDays(demoDate, visits > 0 ? Math.max(1, roundHalfUp(30 / visits)) : 7);
  }
  const nextDelivery = addDays(nextVisit, lead);
  const horizonDays = Math.max(1, diffDays(demoDate, nextDelivery));
  // The 14-day limit is on the visit gap: the delivery lead is not counted against it, so an outlet
  // visited every 14 days is covered to its next delivery and is not flagged.
  const capped = horizonDays > PARAMS.maxCoverDays + lead;
  const days = capped ? PARAMS.maxCoverDays : horizonDays;
  return {
    nextVisit, planned, lead, nextDelivery, horizonDays, days,
    capped,
    coversTill: addDays(demoDate, days),
  };
}

// --------------------------------------------------------------------------
// History: what was booked, and what is on its way
// --------------------------------------------------------------------------

// Orders booked in this demo are in transit: they count as stock, never as sales history.
export function historyFor(outlet, data, demoDate) {
  const orders = typeof data.ordersFor === 'function' ? data.ordersFor(outlet.id) : [];
  const history = [];
  const transit = Object.create(null);
  const weekly = new Map();   // Monday of the week → cases of every product
  for (const order of Array.isArray(orders) ? orders : []) {
    if (!isObject(order) || !Array.isArray(order.lines) || !isValidISO(order.date)) continue;
    if (order.demo === true) {
      for (const line of order.lines) {
        if (!isObject(line) || typeof line.sku !== 'string') continue;
        transit[line.sku] = (transit[line.sku] || 0) + Math.max(0, finite(line.cases, 0)) + Math.max(0, finite(line.freeCases, 0));
      }
    } else if (order.date < demoDate) {
      history.push(order);
      const week = isoWeekStart(order.date);
      let cases = 0;
      for (const line of order.lines) cases += isObject(line) ? Math.max(0, finite(line.cases, 0)) : 0;
      weekly.set(week, (weekly.get(week) || 0) + cases);
    }
  }
  return { history, transit, weekly, orderingWeeks: weekly.size, firstDate: history.length ? history[0].date : null };
}

// Booked cases of one product (or of all, with sku null) from `from` to `to`, and how many orders held it.
function booked(history, sku, from, to) {
  let cases = 0;
  let orders = 0;
  for (const order of history) {
    if (order.date < from || order.date > to) continue;
    let inOrder = 0;
    for (const line of order.lines) {
      if (isObject(line) && (sku === null || line.sku === sku)) inOrder += Math.max(0, finite(line.cases, 0));
    }
    if (inOrder > 0) { cases += inOrder; orders += 1; }
  }
  return { cases, orders };
}

// --------------------------------------------------------------------------
// Calendar: closures and recurring short events
// --------------------------------------------------------------------------

// Last year's event week against its neighbouring ordering weeks, from the outlet's own orders.
// null when the outlet did not order in that week or has no neighbours to compare with.
function eventWeekRatio(weekly, event) {
  const first = isoWeekStart(event.start);
  const last = isoWeekStart(event.end);
  const during = [];
  for (let week = first; week <= last; week = addDays(week, 7)) {
    const cases = weekly.get(week) || 0;
    if (cases > 0) during.push(cases);
  }
  if (!during.length) return null;
  const near = [];
  for (const [anchor, step] of [[first, -7], [last, 7]]) {
    for (let i = 1, found = 0; i <= 4 && found < 2; i += 1) {
      const cases = weekly.get(addDays(anchor, step * i)) || 0;
      if (cases > 0) { near.push(cases); found += 1; }
    }
  }
  if (near.length < 2) return null;
  return mean(during) / mean(near);
}

// Closure days count as zero demand. A recurring short event multiplies its days by the outlet's own
// last-year event-week ratio, only when the event also happened last year and that week clearly
// differed from its neighbours.
export function calendarFor(outlet, data, demoDate, weekly) {
  const all = isObject(data.calendar) && Array.isArray(data.calendar.events) ? data.calendar.events : [];
  const events = all.filter((event) => isObject(event) && isValidISO(event.start) && isValidISO(event.end)
    && event.start <= event.end && appliesTo(event, outlet));
  const closures = events.filter((event) => event.type === 'closure');
  const short = events.filter((event) => event.type !== 'closure' && diffDays(event.start, event.end) + 1 <= PARAMS.eventMaxDays);

  const material = [];   // past short events whose week clearly differed: they make last year's window unclean
  const effects = [];    // events from today on that change demand on their days
  for (const event of short) {
    if (event.end < demoDate) {
      const ratio = eventWeekRatio(weekly, event);
      if (ratio !== null && Math.abs(ratio - 1) >= PARAMS.eventMaterial) material.push({ event, ratio });
      continue;
    }
    if (typeof event.series !== 'string' || !event.series) continue;
    let twin = null;
    for (const other of short) {
      if (other !== event && other.series === event.series && other.end < event.start && (!twin || other.start > twin.start)) twin = other;
    }
    if (!twin) continue;
    const ratio = eventWeekRatio(weekly, twin);
    if (ratio === null || Math.abs(ratio - 1) < PARAMS.eventMaterial) continue;
    effects.push({ event, twin, ratio: clip(ratio, [PARAMS.eventRatioFloor, PARAMS.eventRatioCap]) });
  }

  function factor(date) {
    for (const closure of closures) {
      if (closure.start <= date && date <= closure.end) return 0;
    }
    let f = 1;
    for (const effect of effects) {
      if (effect.event.start <= date && date <= effect.event.end) f *= effect.ratio;
    }
    return clip(f, [0, PARAMS.eventRatioCap]);
  }

  // The sum of the day factors over `days` days from `from`: "normal days" of demand in that span.
  function normalDays(from, days) {
    let total = 0;
    for (let i = 0; i < days; i += 1) total += factor(addDays(from, i));
    return total;
  }

  return { closures, short, material, effects, factor, normalDays };
}

// The season phase on the demo date, from config.season.
export function seasonPhase(data, demoDate) {
  const season = isObject(data.config) && isObject(data.config.season) ? data.config.season : {};
  const { rampStart, peakStart, tailStart, seasonEnd } = season;
  if (isValidISO(tailStart) && demoDate >= tailStart && (!isValidISO(seasonEnd) || demoDate <= seasonEnd)) return 'tail';
  if (isValidISO(peakStart) && demoDate >= peakStart && (!isValidISO(tailStart) || demoDate < tailStart)) return 'peak';
  if (isValidISO(rampStart) && demoDate >= rampStart && (!isValidISO(peakStart) || demoDate < peakStart)) return 'ramp';
  return 'off';
}

// --------------------------------------------------------------------------
// One product at one outlet
// --------------------------------------------------------------------------

function supplyGaps(data, sku) {
  const list = isObject(data.calendar) && Array.isArray(data.calendar.supplyHistory) ? data.calendar.supplyHistory : [];
  return list.filter((gap) => isObject(gap) && gap.sku === sku && isValidISO(gap.start) && isValidISO(gap.end));
}

function peerCurve(data, outlet, packGroup) {
  const table = isObject(data.clusterBenchmarks) ? data.clusterBenchmarks : {};
  const cluster = typeof outlet.cluster === 'string' && isObject(table[outlet.cluster]) ? table[outlet.cluster] : null;
  return {
    curve: cluster && isObject(cluster[packGroup]) ? cluster[packGroup] : null,
    cv: isObject(table.cv) && isObject(table.cv[outlet.cluster]) ? finite(table.cv[outlet.cluster][packGroup], null) : null,
    level: isObject(table.level) && isObject(table.level[outlet.cluster]) ? table.level[outlet.cluster] : null,
  };
}

// The peer curve's average index over `days` days from `from`, read at the same weeks last year.
function curveMean(curve, from, days) {
  if (!curve) return null;
  const seen = [];
  for (let i = 0; i < days; i += 1) {
    const index = finite(curve[isoWeek(addDays(from, i - 364))], null);
    if (index !== null && index >= 0) seen.push(index);
  }
  return seen.length ? mean(seen) : null;
}

/**
 * numbersFor(args) → the quantities for one product, before the cart is looked at.
 * args: { product, outlet, data, demoDate, win, hist, cal, phase, checked }
 *   checked = the stock the rep counted for this product (a number), or null
 */
export function numbersFor({ product, outlet, data, demoDate, win, hist, cal, phase, checked }) {
  const sku = product.sku;
  const packGroup = product.serve === 'takehome' ? 'takehome' : 'single';
  const gaps = supplyGaps(data, sku);
  const peer = peerCurve(data, outlet, packGroup);
  const yesterday = addDays(demoDate, -1);

  // ---- run-rate: the last 4 clean weeks. A supply-out week and the catch-up week after it are left out.
  const buckets = [];
  for (let b = 1; b <= PARAMS.rateWeeks; b += 1) {
    const from = addDays(demoDate, -7 * b);
    const to = addDays(from, 6);
    buckets.push({ from, to, out: gaps.some((gap) => overlaps(from, to, gap.start, gap.end)) });
  }
  const olderOut = gaps.some((gap) => overlaps(addDays(demoDate, -7 * (PARAMS.rateWeeks + 1)), addDays(demoDate, -7 * PARAMS.rateWeeks - 1), gap.start, gap.end));
  const ignored = [];
  let cleanWeeks = 0;
  let cleanCases = 0;
  buckets.forEach((bucket, i) => {
    const catchUp = i + 1 < buckets.length ? buckets[i + 1].out : olderOut;
    const known = hist.firstDate !== null && bucket.to >= hist.firstDate;
    if (!known) return;
    if (bucket.out || catchUp) { ignored.push({ from: bucket.from, to: bucket.to, why: bucket.out ? 'supply' : 'catch-up' }); return; }
    cleanWeeks += 1;
    cleanCases += booked(hist.history, sku, bucket.from, bucket.to).cases;
  });
  const ownRate = cleanWeeks > 0 ? cleanCases / cleanWeeks : 0;
  const curveNow = curveMean(peer.curve, demoDate, 7);
  const clusterRate = peer.level && finite(peer.level[sku], null) !== null && curveNow !== null ? finite(peer.level[sku], 0) * curveNow : null;
  const shrunk = cleanWeeks < PARAMS.rateWeeks && clusterRate !== null;
  const rate = shrunk ? (cleanWeeks * ownRate + PARAMS.shrinkWeight * clusterRate) / (cleanWeeks + PARAMS.shrinkWeight) : ownRate;

  // ---- step-up: the next W days against the last 4 weeks, from the peer curve; averaged with the
  // outlet's own last year only when that window is clean.
  const forward = curveMean(peer.curve, demoDate, win.days);
  const back = curveMean(peer.curve, addDays(demoDate, -7 * PARAMS.rateWeeks), 7 * PARAMS.rateWeeks);
  const peerK = forward !== null && back !== null && back > 0 ? forward / back : null;

  const lyStart = addDays(demoDate, -364);
  const lyBackStart = addDays(lyStart, -7 * PARAMS.rateWeeks);
  const lyDays = Math.max(win.days, PARAMS.ownStepUpDays);
  const lyEnd = addDays(lyStart, lyDays - 1);
  const lyGap = gaps.find((gap) => overlaps(lyBackStart, lyEnd, gap.start, gap.end)) || null;
  const lyClosure = cal.closures.find((closure) => overlaps(lyBackStart, lyEnd, closure.start, closure.end)) || null;
  const lyEvent = cal.material.find((item) => overlaps(lyBackStart, lyEnd, item.event.start, item.event.end)) || null;
  const lyClean = !lyGap && !lyClosure && !lyEvent;
  // One product's orders are too few for a steady ratio, so the outlet's own step-up is read over its
  // whole pack group, from the products whose window had no supply-out.
  let lyBackCases = 0;
  let lyBackOrders = 0;
  let lyForwardCases = 0;
  let lyForwardOrders = 0;
  for (const other of Array.isArray(data.products) ? data.products : []) {
    if (!isObject(other) || typeof other.sku !== 'string' || (other.serve === 'takehome' ? 'takehome' : 'single') !== packGroup) continue;
    if (supplyGaps(data, other.sku).some((gap) => overlaps(lyBackStart, lyEnd, gap.start, gap.end))) continue;
    const before = booked(hist.history, other.sku, lyBackStart, addDays(lyStart, -1));
    const after = booked(hist.history, other.sku, lyStart, lyEnd);
    lyBackCases += before.cases;
    lyBackOrders = Math.max(lyBackOrders, before.orders);
    lyForwardCases += after.cases;
    lyForwardOrders = Math.max(lyForwardOrders, after.orders);
  }
  const ownK = lyBackOrders >= 2 && lyForwardOrders >= 1 && lyBackCases >= PARAMS.ownStepUpMinCases
    ? (lyForwardCases / lyDays) / (lyBackCases / (7 * PARAMS.rateWeeks)) : null;
  let stepUp = 1;
  let stepUpFrom = 'none';
  if (lyClean && ownK !== null && peerK !== null) { stepUp = (clip(ownK, PARAMS.kClip) + peerK) / 2; stepUpFrom = 'own+peer'; }
  else if (peerK !== null) { stepUp = peerK; stepUpFrom = 'peer'; }
  else if (lyClean && ownK !== null) { stepUp = ownK; stepUpFrom = 'own'; }
  stepUp = clip(stepUp, PARAMS.kClip);

  // ---- variability, for the buffer
  const recent = [];
  for (const order of hist.history) {
    if (order.date < addDays(demoDate, -7 * PARAMS.candidateWeeks)) continue;
    let cases = 0;
    for (const line of order.lines) if (isObject(line) && line.sku === sku) cases += Math.max(0, finite(line.cases, 0));
    if (cases > 0) recent.push(cases);
  }
  let cv = peer.cv !== null ? peer.cv : PARAMS.cvClip[0];
  if (recent.length >= PARAMS.cvMinOrders) {
    const avg = mean(recent);
    const variance = mean(recent.map((cases) => (cases - avg) * (cases - avg)));
    cv = avg > 0 ? Math.sqrt(variance) / avg : cv;
  }
  cv = clip(cv, PARAMS.cvClip);

  // ---- expected demand over the window and over one more week (the ceiling)
  const weekly = rate * stepUp;                                  // cases a week from today on
  const normalDays = cal.normalDays(demoDate, win.days);
  const mu = weekly * normalDays / 7;
  const muCeiling = weekly * cal.normalDays(demoDate, win.days + PARAMS.ceilingExtraDays) / 7;
  const inSeason = phase === 'ramp' || phase === 'peak';
  const buffer = inSeason && packGroup === 'single' && normalDays > 0
    ? PARAMS.zSingleInSeason * cv * weekly * Math.sqrt(normalDays / 7) : 0;

  // ---- stock: counted by the rep, or estimated from the last delivery; plus what is in transit
  let received = 0;
  let deliveredOn = null;
  for (let i = hist.history.length - 1; i >= 0 && deliveredOn === null; i -= 1) {
    for (const line of hist.history[i].lines) {
      if (isObject(line) && line.sku === sku && finite(line.deliveredCases, 0) > 0) {
        received += finite(line.deliveredCases, 0) + Math.max(0, finite(line.freeCases, 0));
        deliveredOn = addDays(hist.history[i].date, win.lead);
      }
    }
  }
  const soldSince = deliveredOn !== null ? rate * Math.max(0, diffDays(deliveredOn, demoDate)) / 7 : 0;
  const estimate = Math.max(0, received - soldSince);
  const count = typeof checked === 'number' || (typeof checked === 'string' && checked.trim() !== '') ? finite(checked, null) : null;
  const counted = count !== null && count >= 0;
  const onHand = counted ? count : estimate;
  const unsure = counted ? 0 : Math.max(PARAMS.stockUncertaintyMin, PARAMS.stockUncertainty * estimate);
  const inTransit = hist.transit[sku] || 0;
  const stock = onHand + inTransit;

  // ---- the three numbers
  let recommended = Math.max(0, roundHalfUp(mu + buffer - stock));
  let low = Math.min(recommended, Math.max(0, roundHalfUp(mu - stock - unsure)));
  let high = Math.max(recommended + 1, roundHalfUp(muCeiling + unsure - stock));

  // ---- caps: the same cap on all three; when a cap binds, the ceiling is the cap
  const flags = [];
  const item = (isObject(data.distributorStock) && Array.isArray(data.distributorStock.items) ? data.distributorStock.items : [])
    .find((entry) => isObject(entry) && entry.sku === sku) || null;
  const supply = item && typeof item.status === 'string' ? item.status : 'ok';
  const unavailable = supply === 'out';
  let cap = null;
  if (win.capped) {   // one order covers at most 14 days
    cap = Math.max(recommended, roundHalfUp(mu + buffer + unsure - stock));
    flags.push('visit_gap');
  }
  let glassCap = null;
  if (product.returnable === true && isObject(outlet.glass) && finite(outlet.glass.emptiesOnHand, null) !== null) {
    // Crates already booked today take their empties with them.
    glassCap = Math.max(0, roundHalfUp(finite(outlet.glass.emptiesOnHand, 0) - inTransit));
    if (glassCap < high) flags.push('glass_cap');
    cap = cap === null ? glassCap : Math.min(cap, glassCap);
  }
  if (unavailable) { cap = 0; flags.push('supply_out'); }
  if (cap !== null && high > cap) {
    high = cap;
    recommended = Math.min(recommended, cap);
    low = Math.min(low, cap);
  }
  if (supply === 'low') flags.push('supply_low');
  if (supply === 'rationed') flags.push('supply_rationed');
  if (inTransit > 0) flags.push('in_transit');
  if (counted) flags.push('stock_checked');
  if (shrunk || stepUpFrom === 'peer') flags.push('peer');   // the number leans on similar shops, not on this shop alone
  if (cal.closures.some((closure) => overlaps(demoDate, addDays(demoDate, win.days + PARAMS.ceilingExtraDays - 1), closure.start, closure.end))) flags.push('closure');
  if (cal.effects.some((effect) => overlaps(demoDate, addDays(demoDate, win.days - 1), effect.event.start, effect.event.end))) flags.push('event');
  if (ignored.length) flags.push('ignored_weeks');

  return {
    sku, packGroup, rate, ownRate, cleanWeeks, ignored, shrunk, clusterRate,
    stepUp, stepUpFrom, peerK, ownK, lyClean, lyGap, lyEvent, lyClosure,
    lyThisWeek: booked(hist.history, sku, lyStart, addDays(lyStart, 6)).cases,
    cv, weekly, mu, muCeiling, buffer,
    estimate, counted, onHand, unsure, inTransit, stock,
    recommended, low, high, cap, glassCap,
    supply, supplyNote: item && typeof item.note === 'string' ? item.note : '', unavailable, flags,
    lastBooked: booked(hist.history, sku, addDays(demoDate, -7 * PARAMS.candidateWeeks), yesterday).cases,
  };
}

// The day stock runs out when `cases` are on hand from today, at this product's daily demand.
// null when it lasts beyond `limit` days.
export function runOutDate(numbers, cal, demoDate, cases, limit = 120) {
  if (!(numbers.weekly > 0)) return null;
  let need = 0;
  for (let i = 0; i < limit; i += 1) {
    need += numbers.weekly * cal.factor(addDays(demoDate, i)) / 7;
    if (need > cases + 1e-9) return addDays(demoDate, i);
  }
  return null;
}

// First match wins: unavailable, missing, none needed, short, over, right.
export function statusOf(numbers, cartCases) {
  if (numbers.unavailable) return 'unavailable';
  if (cartCases === 0) return numbers.recommended > 0 ? 'missing' : 'none_needed';
  if (cartCases < numbers.low) return 'short';
  if (cartCases > numbers.high) return 'over';
  return 'right';
}

#!/usr/bin/env node
// GT App demo: synthetic data generator, v0.5 (seasonal-multiplier model plus deterministic overlays).
//
//   node prototype/tools/generate-data.mjs        (runs from any cwd)
//
// Reads  tools/personas.config.json  (every number and all master data)
// Writes data/*.json                 (nine files; generated, never hand-edited)
//
// Deterministic: seeded PRNG (mulberry32), one independent stream per persona,
// no clock reads and no built-in random source. Two runs give byte-identical files.
//
// Sections: 1 helpers · 2 calendar · 3 visit schedule · 4 order model (v0)
//           5 scheme + delivery · 6 overlays (v0.5) · 7 build · 8 cluster benchmarks
//           9 writers · 10 validation · 11 main
// The order model is the v0 one. v0.5 adds overlays that run after it (a guaranteed
// order on a date, no order while the outlet is shut, catch-up after a supply cut)
// and the peer-curve table. There is no stock simulation, no hidden truth file and
// no backtest.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOLS_DIR = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(TOOLS_DIR, '..', 'data');
const CFG = JSON.parse(readFileSync(join(TOOLS_DIR, 'personas.config.json'), 'utf8'));

// ───────────────────────────── 1. helpers ─────────────────────────────

const MS_PER_DAY = 86400000;
const DAYS_PER_WEEK = 7;
const MONTHS = 12;
const SUNDAY = 0;
const THURSDAY_OFFSET = 3; // Monday + 3: the day that defines the ISO week

/** "YYYY-MM-DD" -> day number (days since 1970-01-01, UTC). */
function dayNum(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return ymdToDayNum(y, m, d);
}
function ymdToDayNum(y, m, d) {
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}
function ymd(n) {
  const dt = new Date(n * MS_PER_DAY);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}
const pad2 = (v) => String(v).padStart(2, '0');
function iso(n) {
  const { y, m, d } = ymd(n);
  return `${y}-${pad2(m)}-${pad2(d)}`;
}
/** 0 = Sunday ... 6 = Saturday. */
function weekday(n) {
  return new Date(n * MS_PER_DAY).getUTCDay();
}
/** Monday of ISO week 1 of an ISO week-year (4 January is always in week 1). */
function isoWeekOneMonday(isoYear) {
  const jan4 = ymdToDayNum(isoYear, 1, 4);
  return jan4 - ((weekday(jan4) + 6) % DAYS_PER_WEEK);
}
/** Day number -> "YYYY-Www" (ISO week, ISO week-year). Same rule as js/dates.js isoWeek(). */
function isoWeekKey(n) {
  const thursday = n - ((weekday(n) + 6) % DAYS_PER_WEEK) + THURSDAY_OFFSET;
  const isoYear = ymd(thursday).y;
  const week = Math.floor((thursday - isoWeekOneMonday(isoYear)) / DAYS_PER_WEEK) + 1;
  return `${isoYear}-W${pad2(week)}`;
}
function isoWeekMonday(key) {
  const [y, w] = key.split('-W').map(Number);
  return isoWeekOneMonday(y) + (w - 1) * DAYS_PER_WEEK;
}

/**
 * Twelve monthly values (Jan..Dec) placed on the mid-month day and linearly
 * interpolated by day, wrapping across year ends.
 */
function interpMonthly(values, n) {
  const mid = CFG.model.midMonthDay;
  const { y, m } = ymd(n);
  const anchor = (yy, mm) => {
    // mm may be 0 (December of the previous year) or 13 (January of the next).
    const year = mm < 1 ? yy - 1 : mm > MONTHS ? yy + 1 : yy;
    const month = ((mm - 1 + MONTHS) % MONTHS) + 1;
    return { day: ymdToDayNum(year, month, mid), value: values[month - 1] };
  };
  const here = anchor(y, m);
  const a = n >= here.day ? here : anchor(y, m - 1);
  const b = n >= here.day ? anchor(y, m + 1) : here;
  const t = (n - a.day) / (b.day - a.day);
  return a.value + (b.value - a.value) * t;
}

/** FNV-1a 32-bit string hash. */
function hashString(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
/** mulberry32: returns a function giving uniform numbers in [0, 1). */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Independent stream per persona: tuning one persona never changes another. */
function personaStream(personaKey) {
  return mulberry32((CFG.model.seed ^ hashString(personaKey)) >>> 0);
}
/** Standard normal (Box-Muller); always consumes two uniforms. */
function randNormal(rng) {
  const u1 = 1 - rng(); // (0, 1]
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
/** Lognormal multiplier with mean 1 and the given coefficient of variation. */
function randLognormalMean1(rng, cv) {
  const sigma2 = Math.log(1 + cv * cv);
  return Math.exp(-sigma2 / 2 + Math.sqrt(sigma2) * randNormal(rng));
}

const sum = (xs) => xs.reduce((s, x) => s + x, 0);
const mean = (xs) => (xs.length ? sum(xs) / xs.length : NaN);

const PRODUCTS = CFG.products;
const PRODUCT_BY_SKU = new Map(PRODUCTS.map((p) => [p.sku, p]));
const SKU_ORDER = new Map(PRODUCTS.map((p, i) => [p.sku, i]));
const DEMO = dayNum(CFG.config.demoDate);
const HIST_START = dayNum(CFG.history.start);
const HIST_END = dayNum(CFG.history.end);

// ───────────────────────────── 2. calendar ─────────────────────────────

function buildWeeklyMaxTemp() {
  const t = CFG.calendar.temperature;
  const out = {};
  const last = isoWeekMonday(t.lastWeek);
  for (let monday = isoWeekMonday(t.firstWeek); monday <= last; monday += DAYS_PER_WEEK) {
    const key = isoWeekKey(monday);
    const thursday = monday + THURSDAY_OFFSET;
    out[key] = key in t.overrides ? t.overrides[key] : Math.round(interpMonthly(t.climatologyMonthlyMaxC, thursday));
  }
  return out;
}

function buildCalendar() {
  return {
    events: CFG.calendar.events,
    supplyHistory: CFG.calendar.supplyHistory,
    weeklyMaxTempC: buildWeeklyMaxTemp(),
  };
}

function eventAppliesTo(event, outlet) {
  const a = event.appliesTo;
  if (a === 'all') return true;
  if (Array.isArray(a)) return a.includes(outlet.id);
  if (a && Array.isArray(a.channels)) return a.channels.includes(outlet.channel);
  return false;
}

/** Supply status of a SKU on a day: "out" | "rationed" | null. */
function supplyStatusOn(sku, n) {
  for (const s of CFG.calendar.supplyHistory) {
    if (s.sku === sku && n >= dayNum(s.start) && n <= dayNum(s.end)) return s.status;
  }
  return null;
}

// ─────────────────────────── 3. visit schedule ───────────────────────────

/**
 * Visits fall every cadenceDays, anchored on the demo date. A nominal date on a
 * Sunday moves to Monday; later dates are not shifted. Returns day numbers in
 * [from, to], ascending.
 */
function visitDays(cadenceDays, from, to) {
  const out = [];
  const firstK = Math.floor((from - DEMO) / cadenceDays) - 1;
  const lastK = Math.ceil((to - DEMO) / cadenceDays) + 1;
  for (let k = firstK; k <= lastK; k++) {
    const nominal = DEMO + k * cadenceDays;
    const actual = weekday(nominal) === SUNDAY ? nominal + 1 : nominal;
    if (actual >= from && actual <= to) out.push(actual);
  }
  return out;
}

function historyVisitDays(persona) {
  const from = Math.max(HIST_START, dayNum(persona.outlet.registeredOn) + 1);
  return visitDays(persona.model.cadenceDays, from, HIST_END);
}

function routePlanDates(persona) {
  return visitDays(persona.model.cadenceDays, dayNum(CFG.routePlan.from), dayNum(CFG.routePlan.to)).map(iso);
}

// ─────────────────────────── 4. order model (v0) ───────────────────────────
// expected = baseWeekly x mix x (coverDays / 7) x season x yearFactor x eventFactor x boostFactor
// The contract is orderModel(persona, visit, coverDays, rng) -> { sku: cases }.

/**
 * One seasonal curve read on a day: an explicit monthly array, or
 * 1 + (summerPeak - 1) x summer + (festivePeak - 1) x festive with the given shapes.
 * Used by the order model (model.shapes) and by the peer curves (clusterCurves.shapes).
 */
function seasonValue(spec, shapes, refDay) {
  const m = CFG.model;
  if (Array.isArray(spec.monthly)) return Math.max(m.seasonFloor, interpMonthly(spec.monthly, refDay));
  const summerPeak = spec.summerPeak ?? m.defaultPeak;
  const festivePeak = spec.festivePeak ?? m.defaultPeak;
  const value =
    1 +
    (summerPeak - 1) * interpMonthly(shapes.summer, refDay) +
    (festivePeak - 1) * interpMonthly(shapes.festive, refDay);
  return Math.max(m.seasonFloor, value);
}

function seasonFactor(persona, serve, refDay) {
  return seasonValue((persona.model.season || {})[serve] || {}, CFG.model.shapes, refDay);
}

function yearFactor(visit) {
  const { y, m } = ymd(visit);
  const trend = y === CFG.model.trendYear ? CFG.model.trendTY : 1;
  return trend * (CFG.model.yearMonthFactor[`${y}-${pad2(m)}`] ?? 1);
}

/** Product of 1 + (effect - 1) x share of the cover interval the event overlaps. */
function eventFactor(persona, sku, visit, coverDays) {
  const effects = persona.model.eventEffects;
  if (!effects) return 1;
  const coverFrom = visit + 1;
  const coverTo = visit + coverDays;
  let factor = 1;
  for (const ev of CFG.calendar.events) {
    const raw = effects[ev.type];
    if (raw === undefined || !eventAppliesTo(ev, persona.outlet)) continue;
    const effect = typeof raw === 'number' ? { factor: raw } : raw;
    if (effect.skus && !effect.skus.includes(sku)) continue;
    const overlap = Math.min(coverTo, dayNum(ev.end)) - Math.max(coverFrom, dayNum(ev.start)) + 1;
    if (overlap <= 0) continue;
    factor *= 1 + (effect.factor - 1) * (overlap / coverDays);
  }
  return factor;
}

function boostFactor(persona, product, visit) {
  let factor = 1;
  for (const b of persona.model.boosts || []) {
    if (visit < dayNum(b.from) || visit > dayNum(b.to)) continue;
    if (b.serve && b.serve !== product.serve) continue;
    if (b.skus && !b.skus.includes(product.sku)) continue;
    factor *= b.factor;
  }
  return factor;
}

/**
 * Trim one case at a time until the order fits: largest take-home line first, then the largest line left.
 * Equal lines: the SKU with the smaller mix share gives way first, so the outlet's main SKU is never cut below a minor one.
 */
function applyValueCap(cases, maxOrderValue, mix) {
  const value = () => Object.entries(cases).reduce((s, [sku, c]) => s + c * PRODUCT_BY_SKU.get(sku).ptrCase, 0);
  const largest = (serve) =>
    Object.keys(cases)
      .filter((sku) => cases[sku] > 0 && (!serve || PRODUCT_BY_SKU.get(sku).serve === serve))
      .sort((a, b) => cases[b] - cases[a] || mix[a] - mix[b] || SKU_ORDER.get(a) - SKU_ORDER.get(b))[0];
  while (value() > maxOrderValue) {
    const sku = largest('takehome') ?? largest(null);
    if (sku === undefined) break;
    cases[sku] -= 1;
  }
}

function orderModel(persona, visit, coverDays, rng) {
  const pm = persona.model;
  const refDay = visit - pm.orderLagDays; // positive lag: orders trail the season
  const yf = yearFactor(visit);
  const cases = {};
  for (const [sku, share] of Object.entries(pm.mix)) {
    const product = PRODUCT_BY_SKU.get(sku);
    const expected =
      pm.baseWeekly *
      share *
      (coverDays / DAYS_PER_WEEK) *
      seasonFactor(persona, product.serve, refDay) *
      yf *
      eventFactor(persona, sku, visit, coverDays) *
      boostFactor(persona, product, visit);
    // The stream always advances by the same amount per SKU, whatever "expected" is.
    const x = expected * randLognormalMean1(rng, pm.cv);
    const roundUp = rng() < x - Math.floor(x);
    cases[sku] = Math.floor(x) + (roundUp ? 1 : 0);
  }
  if (pm.maxOrderValue !== undefined) applyValueCap(cases, pm.maxOrderValue, pm.mix);
  return cases;
}

// ─────────────────────────── 5. scheme + delivery ───────────────────────────

const FREE_CASE_SCHEMES = [...CFG.historicalSchemes, ...CFG.schemes].filter((s) => s.type === 'buy_x_get_y');

/** Buy-X-get-Y free cases for one order; monthUsed tracks triggers per calendar month. */
function freeCasesFor(outlet, visit, cases, monthUsed) {
  const free = {};
  for (const scheme of FREE_CASE_SCHEMES) {
    if (visit < dayNum(scheme.validFrom) || visit > dayNum(scheme.validTo)) continue;
    if (!scheme.eligibleSegments.includes(outlet.segment)) continue;
    const present = scheme.skus.filter((sku) => (cases[sku] || 0) > 0);
    if (!present.length) continue;
    const pooled = present.reduce((s, sku) => s + cases[sku], 0);
    const monthKey = `${scheme.id}|${iso(visit).slice(0, 7)}`;
    const used = monthUsed.get(monthKey) || 0;
    const room = scheme.capPerMonth === null ? Infinity : scheme.capPerMonth - used;
    const triggers = Math.max(0, Math.min(Math.floor(pooled / scheme.buyCases), room));
    if (!triggers) continue;
    monthUsed.set(monthKey, used + triggers);
    // Lowest-PTR qualifying SKU in the order; ties go to the larger line.
    const target = present.sort(
      (a, b) =>
        PRODUCT_BY_SKU.get(a).ptrCase - PRODUCT_BY_SKU.get(b).ptrCase ||
        cases[b] - cases[a] ||
        SKU_ORDER.get(a) - SKU_ORDER.get(b),
    )[0];
    free[target] = (free[target] || 0) + triggers * scheme.freeCases;
  }
  return free;
}

function deliveredCasesFor(outlet, sku, cases, visit) {
  const status = supplyStatusOn(sku, visit + CFG.config.distributor.deliveryLeadDays);
  if (status === 'out') return 0;
  if (status === 'rationed') return Math.min(cases, outlet.glass ? outlet.glass.cratesHeld : 0);
  return cases;
}

// ─────────────────────────── 6. overlays (v0.5) ───────────────────────────
// Deterministic edits to an order, applied AFTER the order model has run. The persona's
// main random stream advances exactly as in v0 (two draws per visit, then a fixed number
// per SKU on a visit that drew an order), so an overlay never shifts the other orders.

/** persona.model.fixedOrders -> Map(day number -> entry). Each date must be a visit day. */
function fixedOrdersByDay(persona, visits) {
  const byDay = new Map();
  for (const entry of persona.model.fixedOrders || []) {
    const day = dayNum(entry.date);
    if (!visits.includes(day)) throw new Error(`${persona.outlet.id}: fixedOrders date ${entry.date} is not a visit day`);
    byDay.set(day, entry);
  }
  return byDay;
}

/** Noise for a guaranteed order on a visit that drew none. A side stream: the main one is not touched. */
function fixedOrderStream(personaKey, visit) {
  return mulberry32((CFG.model.seed ^ hashString(`${personaKey}|fixed|${iso(visit)}`)) >>> 0);
}

/**
 * Guaranteed order. Explicit lines replace the order. Otherwise the cases of the matching
 * lines (all, or one serve type, or listed SKUs) are multiplied by factor and rounded to
 * whole cases, and never go below the usual order.
 */
function applyFixedOrder(cases, entry) {
  if (entry.lines) {
    for (const sku of Object.keys(cases)) delete cases[sku];
    Object.assign(cases, entry.lines);
    return;
  }
  for (const sku of Object.keys(cases)) {
    if (entry.serve && entry.serve !== PRODUCT_BY_SKU.get(sku).serve) continue;
    if (entry.skus && !entry.skus.includes(sku)) continue;
    cases[sku] = Math.max(cases[sku], Math.round(cases[sku] * entry.factor));
  }
}

/** True when the outlet is shut on the visit day (an event of a type in model.noOrderDuring covers it). */
function closedOn(persona, visit) {
  const types = persona.model.noOrderDuring || [];
  return CFG.calendar.events.some(
    (ev) => types.includes(ev.type) && eventAppliesTo(ev, persona.outlet) && visit >= dayNum(ev.start) && visit <= dayNum(ev.end),
  );
}

/** Cases that were ordered and not delivered (supply-out or rationing) come back on the next order. */
function addCatchUp(cases, pending) {
  for (const [sku, undelivered] of pending) cases[sku] = (cases[sku] || 0) + undelivered;
  pending.clear();
}

// ───────────────────────────── 7. build ─────────────────────────────

function missedProb(persona, visit) {
  for (const w of persona.model.missedVisits || []) {
    if (visit >= dayNum(w.from) && visit <= dayNum(w.to)) return w.prob;
  }
  return 0;
}

/** Walks one persona's history visits. Returns its orders and the visits that took place. */
function buildPersonaHistory(persona) {
  const { outlet, model: pm } = persona;
  const rng = personaStream(outlet.personaKey);
  const visits = historyVisitDays(persona);
  const fixedByDay = fixedOrdersByDay(persona, visits);
  const monthUsed = new Map();
  const pending = new Map(); // sku -> undelivered cases waiting for the next order
  const orders = [];
  const visitsMade = [];
  let lastOrderDay = null;

  for (const visit of visits) {
    // Two draws per visit, always, so the stream stays aligned.
    const uMissed = rng();
    const uOrder = rng();
    const fixed = fixedByDay.get(visit);
    const missed = uMissed < missedProb(persona, visit);
    if (missed && !fixed) continue; // rep did not come
    visitsMade.push(visit);
    const drewOrder = !missed && uOrder < pm.orderProb;
    if (!drewOrder && !fixed) continue; // visit without an order

    const gap = lastOrderDay === null ? pm.cadenceDays : visit - lastOrderDay;
    const coverDays = Math.min(Math.max(gap, pm.cadenceDays), CFG.model.maxCoverMultiple * pm.cadenceDays);
    // The main stream feeds the order model on exactly the visits that drew an order.
    const cases = orderModel(persona, visit, coverDays, drewOrder ? rng : fixedOrderStream(outlet.personaKey, visit));

    // Overlays.
    if (closedOn(persona, visit)) {
      if (fixed) throw new Error(`${outlet.id}: fixedOrders date ${fixed.date} is a day the outlet is shut`);
      continue; // outlet shut: nothing is booked
    }
    if (fixed) applyFixedOrder(cases, fixed);
    addCatchUp(cases, pending);
    if (pm.maxOrderValue !== undefined) applyValueCap(cases, pm.maxOrderValue, pm.mix);

    const free = freeCasesFor(outlet, visit, cases, monthUsed);
    const lines = Object.keys(cases)
      .filter((sku) => cases[sku] > 0)
      .sort((a, b) => SKU_ORDER.get(a) - SKU_ORDER.get(b))
      .map((sku) => ({
        sku,
        cases: cases[sku],
        freeCases: free[sku] || 0,
        deliveredCases: deliveredCasesFor(outlet, sku, cases[sku], visit),
      }));
    if (!lines.length) {
      if (fixed) throw new Error(`${outlet.id}: fixedOrders date ${fixed.date} produced an empty order`);
      continue; // nothing ordered: no record
    }
    for (const line of lines) {
      const carry = Math.round((line.cases - line.deliveredCases) * CFG.model.catchUpShare);
      if (carry > 0) pending.set(line.sku, carry);
    }
    orders.push({ id: `H-${outlet.id}-${iso(visit).replaceAll('-', '')}`, outletId: outlet.id, date: iso(visit), lines });
    lastOrderDay = visit;
  }
  return { orders, visitsMade };
}

/** Notes sit on real visits: each date snaps to the latest visit made on or before it. */
function snapNotes(persona, visitsMade) {
  return persona.notes.map((note) => {
    const target = dayNum(note.date);
    const onOrBefore = visitsMade.filter((v) => v <= target);
    if (!onOrBefore.length) throw new Error(`${persona.outlet.id}: no visit on or before note date ${note.date}`);
    return { date: iso(onOrBefore[onOrBefore.length - 1]), text: note.text };
  });
}

function buildDistributorStock() {
  const ds = CFG.distributorStock;
  const exception = new Map(ds.exceptions.map((e) => [e.sku, e]));
  return {
    asOf: ds.asOf,
    items: PRODUCTS.map((p) => ({
      sku: p.sku,
      status: exception.get(p.sku)?.status ?? ds.defaultStatus,
      note: exception.get(p.sku)?.note ?? ds.defaultNote,
    })),
  };
}

function buildAll() {
  const outlets = [];
  const orders = [];
  const routePlan = {};
  for (const persona of CFG.personas) {
    const { orders: personaOrders, visitsMade } = buildPersonaHistory(persona);
    orders.push(...personaOrders);
    outlets.push({ ...persona.outlet, notes: snapNotes(persona, visitsMade) });
    routePlan[persona.outlet.id] = routePlanDates(persona);
  }
  orders.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.outletId < b.outletId ? -1 : a.outletId > b.outletId ? 1 : 0));
  return {
    'config.json': CFG.config,
    'outlets.json': outlets,
    'products.json': PRODUCTS,
    'orders_history.json': orders,
    'route_plan.json': routePlan,
    'schemes.json': CFG.schemes,
    'distributor_stock.json': buildDistributorStock(),
    'calendar.json': buildCalendar(),
    'cluster_benchmarks.json': buildClusterBenchmarks(),
  };
}

// ─────────────────────── 8. cluster benchmarks (assumption table) ───────────────────────
// Peer seasonal curves by cluster and pack group, built from config.clusterCurves alone.
// They are an assumption, not a measurement: nothing here reads the synthetic orders.
// Closures and short events are left out on purpose; the calendar carries those.

/** Every ISO week of a year: [{ key, thursday }]. */
function isoWeeksOfYear(year) {
  const weeks = [];
  for (let monday = isoWeekOneMonday(year); isoWeekKey(monday).startsWith(`${year}-W`); monday += DAYS_PER_WEEK) {
    weeks.push({ key: isoWeekKey(monday), thursday: monday + THURSDAY_OFFSET });
  }
  return weeks;
}

function buildClusterBenchmarks() {
  const cc = CFG.clusterCurves;
  const weeks = isoWeeksOfYear(cc.year);
  const baseFrom = dayNum(cc.baseline.from);
  const baseTo = dayNum(cc.baseline.to);
  const out = { note: cc.note, year: cc.year };
  for (const [cluster, spec] of Object.entries(cc.clusters)) {
    out[cluster] = {};
    for (const group of cc.packGroups) {
      // The season formula of the order model, read on the Thursday of each week.
      const raw = weeks.map((w) => seasonValue(spec[group], cc.shapes, w.thursday));
      const base = mean(raw.filter((_, i) => weeks[i].thursday >= baseFrom && weeks[i].thursday <= baseTo));
      out[cluster][group] = Object.fromEntries(weeks.map((w, i) => [w.key, Number((raw[i] / base).toFixed(cc.indexDecimals))]));
    }
  }
  out.cv = Object.fromEntries(Object.entries(cc.clusters).map(([cluster, spec]) => [cluster, spec.cv]));
  out.level = Object.fromEntries(Object.entries(cc.clusters).map(([cluster, spec]) => [cluster, spec.level]));
  return out;
}

// ───────────────────────────── 9. writers ─────────────────────────────

const pretty = (value) => JSON.stringify(value, null, 2) + '\n';
/** One order per line, compact. */
const compactRows = (rows) => (rows.length ? '[\n' + rows.map((r) => JSON.stringify(r)).join(',\n') + '\n]\n' : '[]\n');

function writeAll(files) {
  mkdirSync(DATA_DIR, { recursive: true });
  const sizes = {};
  for (const [name, value] of Object.entries(files)) {
    const text = name === 'orders_history.json' ? compactRows(value) : pretty(value);
    writeFileSync(join(DATA_DIR, name), text, 'utf8');
    sizes[name] = Buffer.byteLength(text, 'utf8');
  }
  return sizes;
}

// ───────────────────────────── 10. validation ─────────────────────────────

const OUTLET_KEYS = ['id', 'name', 'area', 'address', 'channel', 'shopType', 'cluster', 'segment', 'visitsPerMonth', 'locationContext', 'cooler', 'credit', 'payment', 'glass', 'owner', 'registeredOn', 'predecessorId', 'personaKey', 'notes'];
const PRODUCT_KEYS = ['sku', 'name', 'flavour', 'category', 'packMl', 'packType', 'unitsPerCase', 'mrpUnit', 'ptrCase', 'marginPct', 'shelfLifeDays', 'serve', 'returnable', 'focus'];
const SCHEME_KEYS = ['id', 'name', 'skus', 'type', 'buyCases', 'freeCases', 'pctOff', 'minCases', 'pooled', 'eligibleSegments', 'validFrom', 'validTo', 'capPerMonth', 'settlementNote'];
const EVENT_KEYS = ['id', 'series', 'name', 'type', 'start', 'end', 'appliesTo'];
const ORDER_KEYS = ['id', 'outletId', 'date', 'lines'];
const LINE_KEYS = ['sku', 'cases', 'freeCases', 'deliveredCases'];

const sameKeys = (obj, keys) => Object.keys(obj).length === keys.length && keys.every((k) => k in obj);
const orderCases = (o) => o.lines.reduce((s, l) => s + l.cases, 0);
const orderValue = (o) => o.lines.reduce((s, l) => s + l.cases * PRODUCT_BY_SKU.get(l.sku).ptrCase, 0);
const serveCases = (o, serve) => sum(o.lines.filter((l) => PRODUCT_BY_SKU.get(l.sku).serve === serve).map((l) => l.cases));
const rupees = (v) => '₹' + Math.round(v).toLocaleString('en-IN');
const fixed2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : 'n/a');
const inBand = (x, band) => Number.isFinite(x) && (band.min === undefined || x >= band.min) && (band.max === undefined || x <= band.max);
const bandText = (band) => (band.max === undefined ? `at least ${band.min}` : band.min === undefined ? `at most ${band.max}` : `${band.min} to ${band.max}`);

function weeklyAverage(orders, window) {
  const from = dayNum(window.from);
  const to = dayNum(window.to);
  const total = orders.filter((o) => dayNum(o.date) >= from && dayNum(o.date) <= to).reduce((s, o) => s + orderCases(o), 0);
  return total / ((to - from + 1) / DAYS_PER_WEEK);
}

/** The ISO weeks in which an outlet ordered, ascending: [{ week, cases, single }]. */
function orderingWeeks(orders) {
  const byWeek = new Map();
  for (const o of orders) {
    const week = isoWeekKey(dayNum(o.date));
    const entry = byWeek.get(week) || { week, cases: 0, single: 0 };
    entry.cases += orderCases(o);
    entry.single += serveCases(o, 'single');
    byWeek.set(week, entry);
  }
  return [...byWeek.values()].sort((a, b) => (a.week < b.week ? -1 : 1));
}

/** Average index of a peer curve over the weeks whose Thursday falls in a date window. */
function curveAverage(curve, window) {
  const from = dayNum(window.from);
  const to = dayNum(window.to);
  return mean(Object.keys(curve).filter((key) => {
    const thursday = isoWeekMonday(key) + THURSDAY_OFFSET;
    return thursday >= from && thursday <= to;
  }).map((key) => curve[key]));
}

function collectKeys(value, into = new Set()) {
  if (Array.isArray(value)) value.forEach((v) => collectKeys(v, into));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      into.add(k);
      collectKeys(v, into);
    }
  }
  return into;
}

function personaStats(files) {
  const v = CFG.validation;
  return files['outlets.json'].map((outlet) => {
    const orders = files['orders_history.json'].filter((o) => o.outletId === outlet.id);
    const base = weeklyAverage(orders, v.lyBaseline);
    const may = weeklyAverage(orders, v.lyMay);
    const last = orders[orders.length - 1];
    return {
      outlet,
      orders,
      base,
      mayIndex: base > 0 ? may / base : null,
      recent: weeklyAverage(orders, v.tyRecent),
      last,
      nextVisit: files['route_plan.json'][outlet.id].find((d) => d > CFG.config.demoDate) ?? null,
    };
  });
}

function runChecks(files, stats, sizes) {
  const v = CFG.validation;
  const results = [];
  const check = (name, problems, group = 'hard') => results.push({ name, group, problems: problems.slice(0, 5), ok: problems.length === 0 });
  const orders = files['orders_history.json'];
  const outletById = new Map(files['outlets.json'].map((o) => [o.id, o]));
  const ordersOf = (id) => stats.find((s) => s.outlet.id === id).orders;
  const eventById = (id) => CFG.calendar.events.find((e) => e.id === id);
  const demo = CFG.config.demoDate;

  check('route plan: every outlet is on the demo date', stats.filter((s) => !files['route_plan.json'][s.outlet.id].includes(demo)).map((s) => s.outlet.id));
  check('route plan: next visit after the demo date', stats.filter((s) => s.nextVisit !== v.nextVisitAfterDemo[s.outlet.id]).map((s) => `${s.outlet.id} got ${s.nextVisit}, want ${v.nextVisitAfterDemo[s.outlet.id]}`));
  check('route plan: dates ascending, inside the window, outlet order as outlets.json', [
    ...(Object.keys(files['route_plan.json']).join() === files['outlets.json'].map((o) => o.id).join() ? [] : ['outlet order differs']),
    ...Object.entries(files['route_plan.json']).filter(([, ds]) => ds.some((d, i) => d < CFG.routePlan.from || d > CFG.routePlan.to || (i > 0 && d <= ds[i - 1]))).map(([id]) => id),
  ]);
  check('orders: date within history and after registeredOn', orders.filter((o) => o.date < CFG.history.start || o.date > CFG.history.end || !(o.date > outletById.get(o.outletId).registeredOn)).map((o) => o.id));
  check('orders: every sku exists', orders.flatMap((o) => o.lines.filter((l) => !PRODUCT_BY_SKU.has(l.sku)).map((l) => `${o.id} ${l.sku}`)));
  check('orders: cases are integers >= 1', orders.flatMap((o) => o.lines.filter((l) => !Number.isInteger(l.cases) || l.cases < 1).map((l) => `${o.id} ${l.sku}`)));
  check('orders: 0 <= deliveredCases <= cases', orders.flatMap((o) => o.lines.filter((l) => !Number.isInteger(l.deliveredCases) || l.deliveredCases < 0 || l.deliveredCases > l.cases).map((l) => `${o.id} ${l.sku}`)));
  check('orders: freeCases are integers >= 0', orders.flatMap((o) => o.lines.filter((l) => !Number.isInteger(l.freeCases) || l.freeCases < 0).map((l) => `${o.id} ${l.sku}`)));
  check('orders: ids unique and of the form H-<outletId>-<YYYYMMDD>', [
    ...(new Set(orders.map((o) => o.id)).size === orders.length ? [] : ['duplicate ids']),
    ...orders.filter((o) => o.id !== `H-${o.outletId}-${o.date.replaceAll('-', '')}`).map((o) => o.id),
  ]);
  check('orders: none on a Sunday', orders.filter((o) => weekday(dayNum(o.date)) === SUNDAY).map((o) => o.id));
  check('orders: sorted by date then outletId, at least one line each', orders.filter((o, i) => !o.lines.length || (i > 0 && (orders[i - 1].date > o.date || (orders[i - 1].date === o.date && orders[i - 1].outletId >= o.outletId)))).map((o) => o.id));
  check('orders: only contract fields', orders.filter((o) => !sameKeys(o, ORDER_KEYS) || o.lines.some((l) => !sameKeys(l, LINE_KEYS))).map((o) => o.id));

  const totalCases = orders.reduce((s, o) => s + orderCases(o), 0);
  const avgPtr = totalCases ? orders.reduce((s, o) => s + orderValue(o), 0) / totalCases : 0;
  check(`average PTR value per case between ${v.avgPtrPerCase.min} and ${v.avgPtrPerCase.max} (got ${avgPtr.toFixed(1)})`, avgPtr >= v.avgPtrPerCase.min && avgPtr <= v.avgPtrPerCase.max ? [] : ['outside the band']);

  for (const [id, max] of Object.entries(v.mayIndexMax)) {
    const s = stats.find((x) => x.outlet.id === id);
    check(`${id} May-2025 index <= ${max} (got ${s.mayIndex === null ? 'n/a' : s.mayIndex.toFixed(2)})`, s.mayIndex !== null && s.mayIndex <= max ? [] : ['too high']);
  }
  for (const [id, range] of Object.entries(v.orderCountRange)) {
    const n = stats.find((x) => x.outlet.id === id).orders.length;
    check(`${id} has between ${range.min} and ${range.max} orders (got ${n})`, n >= range.min && n <= range.max ? [] : ['outside the range']);
  }

  check('outlets: exactly the contract fields', files['outlets.json'].filter((o) => !sameKeys(o, OUTLET_KEYS)).map((o) => o.id));
  check('products and schemes: exactly the contract fields', [
    ...files['products.json'].filter((p) => !sameKeys(p, PRODUCT_KEYS)).map((p) => p.sku),
    ...files['schemes.json'].filter((s) => !sameKeys(s, SCHEME_KEYS)).map((s) => s.id),
  ]);
  const parameterKeys = new Set(CFG.personas.flatMap((p) => Object.keys(p.model)));
  check('no generator-parameter keys in outlets.json or any other data file', Object.entries(files).flatMap(([name, value]) => {
    const allowed = v.allowedParameterNamedKeys[name] || [];
    return [...collectKeys(value)].filter((k) => parameterKeys.has(k) && !allowed.includes(k)).map((k) => `${name}: ${k}`);
  }));
  check('notes: two per outlet, each on a visit date inside the history', files['outlets.json'].flatMap((o) => {
    const persona = CFG.personas.find((p) => p.outlet.id === o.id);
    const visits = new Set(historyVisitDays(persona).map(iso));
    return o.notes.length === persona.notes.length ? o.notes.filter((n) => !visits.has(n.date)).map((n) => `${o.id} ${n.date}`) : [`${o.id} note count`];
  }));
  check('persona mixes: known SKUs, shares sum to 1', CFG.personas.filter((p) => Object.keys(p.model.mix).some((sku) => !PRODUCT_BY_SKU.has(sku)) || Math.abs(Object.values(p.model.mix).reduce((s, x) => s + x, 0) - 1) > v.mixSumTolerance).map((p) => p.outlet.id));
  check(`orders_history.json under ${v.ordersFileMaxKB} KB (got ${(sizes['orders_history.json'] / 1024).toFixed(1)} KB)`, sizes['orders_history.json'] / 1024 < v.ordersFileMaxKB ? [] : ['too large']);
  const linesPerOrder = orders.length ? sum(orders.map((o) => o.lines.length)) / orders.length : 0;
  check(
    `lines per order between ${v.linesPerOrder.min} and ${v.linesPerOrder.max} on average (got ${linesPerOrder.toFixed(2)}; by outlet ${stats.map((s) => `${s.outlet.id} ${(sum(s.orders.map((o) => o.lines.length)) / Math.max(1, s.orders.length)).toFixed(1)}`).join(', ')})`,
    inBand(linesPerOrder, v.linesPerOrder) ? [] : ['outside the band'],
  );
  const guide = files['config.json'].demoGuide;
  check(
    `config.json demoGuide: one entry per outlet in route order, each at most ${v.demoGuideMaxChars} characters (got ${Array.isArray(guide) ? `${guide.length} entries, longest ${Math.max(0, ...guide.map((g) => String(g.try).length))}` : 'none'})`,
    Array.isArray(guide)
      ? [
          ...(guide.map((g) => g.outletId).join() === files['outlets.json'].map((o) => o.id).join() ? [] : ['outlet order']),
          ...guide.filter((g) => !sameKeys(g, ['outletId', 'try']) || typeof g.try !== 'string' || !g.try.trim() || g.try.length > v.demoGuideMaxChars).map((g) => `${g.outletId} text`),
        ]
      : ['missing'],
  );

  // ── v0.5: new fields ──
  const benchmarks = files['cluster_benchmarks.json'];
  const vb = v.clusterBenchmarks;
  const outletList = files['outlets.json'];
  check(
    `outlets: payment and cluster on every outlet (got ${outletList.filter((o) => o.payment === 'cash').map((o) => o.id).join(', ') || 'none'} cash, ${outletList.filter((o) => o.payment === 'credit').length} credit; clusters ${vb.clusters.map((c) => `${c} ${outletList.filter((o) => o.cluster === c).length}`).join(', ')})`,
    outletList.flatMap((o) => [
      ...(v.paymentValues.includes(o.payment) && (o.payment === 'cash') === v.cashOutlets.includes(o.id) ? [] : [`${o.id} payment ${o.payment}`]),
      ...(o.payment === 'cash' && o.credit.outstanding !== 0 ? [`${o.id} is a cash buyer with an outstanding amount`] : []),
      ...(o.cluster === v.expectedCluster[o.id] && vb.clusters.includes(o.cluster) ? [] : [`${o.id} cluster ${o.cluster}`]),
    ]),
    'signature',
  );
  const events = files['calendar.json'].events;
  check(
    `calendar: every event has a series (got ${events.length} events in ${new Set(events.map((e) => e.series)).size} series)`,
    [
      ...events.filter((e) => !sameKeys(e, EVENT_KEYS) || !v.eventSeries.includes(e.series)).map((e) => e.id),
      ...v.eventSeries.filter((s) => !events.some((e) => e.series === s)).map((s) => `unused series ${s}`),
    ],
    'signature',
  );

  // ── v0.5: persona signatures ──
  for (const spec of v.bigOrders) {
    const list = ordersOf(spec.outletId);
    const at = list.findIndex((o) => o.date === spec.date);
    const previous = at >= spec.previousOrders ? list.slice(at - spec.previousOrders, at) : [];
    const cases = at >= 0 ? orderCases(list[at]) : NaN;
    const usual = mean(previous.map(orderCases));
    check(
      `${spec.outletId} order of ${spec.date} is at least ${spec.minRatio}x the average of its previous ${spec.previousOrders} orders (got ${fixed2(cases / usual)}x: ${cases} cases vs ${fixed2(usual)})`,
      cases / usual >= spec.minRatio ? [] : ['missing or too small'],
      'signature',
    );
  }
  for (const spec of v.eventWeekRatio) {
    const ev = eventById(spec.eventId);
    const first = isoWeekKey(dayNum(ev.start));
    const last = isoWeekKey(dayNum(ev.end));
    const weekCount = (isoWeekMonday(last) - isoWeekMonday(first)) / DAYS_PER_WEEK + 1;
    const weeks = orderingWeeks(ordersOf(spec.outletId));
    const inside = weeks.filter((w) => w.week >= first && w.week <= last);
    const neighbours = [
      ...weeks.filter((w) => w.week < first).slice(-spec.neighboursEachSide),
      ...weeks.filter((w) => w.week > last).slice(0, spec.neighboursEachSide),
    ];
    const ratio = mean(inside.map((w) => w.cases)) / mean(neighbours.map((w) => w.cases));
    const singleRatio = mean(inside.map((w) => w.single)) / mean(neighbours.map((w) => w.single));
    // The same ratio against only the ordering weeks at most nearWeeks weeks away on each side
    // (a reader that does not look past a long gap, such as a closure, sees this one).
    const weeksApart = (a, b) => Math.abs(isoWeekMonday(a) - isoWeekMonday(b)) / DAYS_PER_WEEK;
    const near = neighbours.filter((w) => weeksApart(w.week, w.week < first ? first : last) <= spec.nearWeeks);
    const nearRatio = mean(inside.map((w) => w.cases)) / mean(near.map((w) => w.cases));
    check(
      `${spec.outletId} orders in the ISO week(s) of ${ev.name} ${ev.start.slice(0, 4)} (${first === last ? first : `${first}, ${last}`}) are ${bandText(spec)}x the neighbouring ordering weeks (got ${fixed2(ratio)}x: ${inside.map((w) => w.cases).join(' and ')} cases vs ${neighbours.map((w) => w.cases).join(', ')}; ${fixed2(nearRatio)}x against only the neighbours within ${spec.nearWeeks} weeks: ${near.map((w) => w.cases).join(', ')}; single-serve ${fixed2(singleRatio)}x)`,
      [
        ...(inside.length === weekCount ? [] : ['no order in an event week']),
        ...(neighbours.length === 2 * spec.neighboursEachSide ? [] : ['too few neighbouring weeks']),
        ...(inBand(ratio, spec) ? [] : ['outside the band']),
        ...(near.length >= spec.neighboursEachSide && inBand(nearRatio, spec) ? [] : ['outside the band against the near neighbours']),
      ],
      'signature',
    );
  }
  for (const spec of v.noOrdersDuring) {
    const ev = eventById(spec.eventId);
    const inside = ordersOf(spec.outletId).filter((o) => o.date >= ev.start && o.date <= ev.end);
    check(`${spec.outletId} has no order dated inside ${ev.start}..${ev.end}, ${ev.name} (got ${inside.length})`, inside.map((o) => o.id), 'signature');
  }
  for (const spec of v.schemeTriggersMax) {
    const scheme = CFG.schemes.find((s) => s.id === spec.schemeId);
    const pooled = ordersOf(spec.outletId).filter((o) => o.date.startsWith(spec.month)).map((o) => sum(o.lines.filter((l) => scheme.skus.includes(l.sku)).map((l) => l.cases)));
    const qualifying = pooled.filter((p) => p >= scheme.buyCases).length;
    const triggers = sum(pooled.map((p) => Math.floor(p / scheme.buyCases)));
    check(
      `${spec.outletId} has at most ${spec.max} order(s) in ${spec.month} with ${scheme.buyCases} or more pooled ${scheme.id} cases (got ${qualifying}; triggers ${triggers}; pooled cases per order ${pooled.join(', ')})`,
      qualifying <= spec.max && triggers <= spec.max ? [] : ['too many'],
      'signature',
    );
  }
  for (const spec of v.skuShare) {
    const from = iso(DEMO - spec.weeks * DAYS_PER_WEEK);
    const recent = ordersOf(spec.outletId).filter((o) => o.date >= from);
    const total = sum(recent.map(orderCases));
    const skuCases = sum(recent.flatMap((o) => o.lines.filter((l) => l.sku === spec.sku).map((l) => l.cases)));
    check(
      `${spec.outletId} ${spec.sku} is ${spec.min * 100} to ${spec.max * 100}% of its cases over the last ${spec.weeks} weeks (got ${(100 * skuCases / total).toFixed(1)}%: ${skuCases} of ${total} cases in ${recent.length} orders)`,
      inBand(skuCases / total, spec) ? [] : ['outside the band'],
      'signature',
    );
  }
  for (const spec of v.lateRamp) {
    const perWeek = (window) => sum(ordersOf(spec.outletId).filter((o) => o.date >= window.from && o.date <= window.to).map((o) => serveCases(o, spec.serve))) / ((dayNum(window.to) - dayNum(window.from) + 1) / DAYS_PER_WEEK);
    const ratio = perWeek(spec.early) / perWeek(spec.peak);
    check(
      `${spec.outletId} ${spec.serve} cases per week in ${spec.early.from}..${spec.early.to} are at most ${spec.maxRatio}x those of ${spec.peak.from}..${spec.peak.to}, a late ramp (got ${fixed2(ratio)}x: ${perWeek(spec.early).toFixed(1)} vs ${perWeek(spec.peak).toFixed(1)} per week)`,
      ratio <= spec.maxRatio ? [] : ['ramp is not late'],
      'signature',
    );
  }
  // The outlet's own last-year step-up as a reader of the data sees it: cases a day of one serve type in
  // the forward window against the back window, leaving out products with a supply gap in either.
  for (const spec of v.ownStepUp) {
    const gapped = new Set(CFG.calendar.supplyHistory.filter((g) => g.start <= spec.forward.to && g.end >= spec.back.from).map((g) => g.sku));
    const perDay = (window) => sum(ordersOf(spec.outletId).filter((o) => o.date >= window.from && o.date <= window.to)
      .flatMap((o) => o.lines.filter((l) => PRODUCT_BY_SKU.get(l.sku).serve === spec.serve && !gapped.has(l.sku)).map((l) => l.cases))) / (dayNum(window.to) - dayNum(window.from) + 1);
    const ratio = perDay(spec.forward) / perDay(spec.back);
    check(
      `${spec.outletId} own last-year step-up, ${spec.serve}: ${spec.forward.from}..${spec.forward.to} against ${spec.back.from}..${spec.back.to} is ${bandText(spec)}x (got ${fixed2(ratio)}x: ${(perDay(spec.forward) * DAYS_PER_WEEK).toFixed(1)} vs ${(perDay(spec.back) * DAYS_PER_WEEK).toFixed(1)} cases a week, products with a supply gap left out)`,
      inBand(ratio, spec) ? [] : ['outside the band'],
      'signature',
    );
  }
  for (const spec of v.packSwing) {
    const list = ordersOf(spec.outletId);
    const high = list.filter((o) => o.date >= spec.high.from && o.date <= spec.high.to);
    const at = high.length ? list.indexOf(high[0]) : -1;
    const previous = at >= spec.previousOrders ? list.slice(at - spec.previousOrders, at) : [];
    const ratio = mean(high.map((o) => serveCases(o, spec.serve))) / mean(previous.map((o) => serveCases(o, spec.serve)));
    const gapCases = sum(list.filter((o) => o.date >= spec.gap.from && o.date <= spec.gap.to).map((o) => serveCases(o, spec.serve)));
    check(
      `${spec.outletId} ${spec.serve} order(s) of ${spec.high.from}..${spec.high.to} are at least ${spec.minRatio}x the previous ${spec.previousOrders}, then at most ${spec.maxGapCases} case(s) in ${spec.gap.from}..${spec.gap.to} (got ${fixed2(ratio)}x: ${high.map((o) => serveCases(o, spec.serve)).join(', ') || 'none'} vs ${previous.map((o) => serveCases(o, spec.serve)).join(', ')}; then ${gapCases})`,
      ratio >= spec.minRatio && gapCases <= spec.maxGapCases ? [] : ['signature not visible'],
      'signature',
    );
  }

  // Every line cut by a supply-out or rationing comes back on the outlet's next order.
  const cut = stats.flatMap((s) => s.orders.flatMap((o, i) => o.lines.filter((l) => l.deliveredCases < l.cases).map((l) => ({ order: o, line: l, next: s.orders[i + 1] }))));
  const caughtUp = (c) => !c.next || (c.next.lines.find((l) => l.sku === c.line.sku)?.cases ?? 0) >= Math.round((c.line.cases - c.line.deliveredCases) * CFG.model.catchUpShare);
  check(
    `catch-up: every line cut by a supply-out or rationing is re-ordered on the outlet's next order (got ${cut.filter(caughtUp).length} of ${cut.length} cut lines)`,
    cut.length ? cut.filter((c) => !caughtUp(c)).map((c) => `${c.order.id} ${c.line.sku}`) : ['no cut line in the history'],
    'signature',
  );

  // ── v0.5: the peer-curve table ──
  const weekKeys = isoWeeksOfYear(benchmarks.year).map((w) => w.key);
  check(
    `cluster_benchmarks: ${vb.clusters.length} clusters x ${vb.packGroups.length} pack groups x ${vb.weeks} weeks, with cv and level (got ${vb.clusters.filter((c) => benchmarks[c]).length} clusters, ${weekKeys.length} weeks of ${benchmarks.year}; cv ${Math.min(...vb.clusters.flatMap((c) => Object.values(benchmarks.cv[c] || {})))} to ${Math.max(...vb.clusters.flatMap((c) => Object.values(benchmarks.cv[c] || {})))}; ${sum(vb.clusters.map((c) => Object.keys(benchmarks.level[c] || {}).length))} level entries)`,
    [
      ...(typeof benchmarks.note === 'string' && vb.noteMustInclude.every((text) => benchmarks.note.includes(text)) ? [] : ['note']),
      ...(Object.keys(benchmarks).join() === ['note', 'year', ...vb.clusters, 'cv', 'level'].join() ? [] : ['top-level keys']),
      ...(weekKeys.length === vb.weeks ? [] : ['week count']),
      ...vb.clusters.flatMap((c) => [
        ...vb.packGroups.flatMap((g) => {
          const curve = (benchmarks[c] || {})[g] || {};
          const cv = ((benchmarks.cv || {})[c] || {})[g];
          return [
            ...(Object.keys(curve).join() === weekKeys.join() && Object.values(curve).every((x) => Number.isFinite(x) && x >= 0) ? [] : [`${c}.${g} curve`]),
            ...(inBand(cv, vb.cv) && cv <= benchmarks.cv[vb.cv.highest][g] ? [] : [`${c}.${g} cv`]),
          ];
        }),
        ...(Object.keys((benchmarks[c] || {})).join() === vb.packGroups.join() ? [] : [`${c} pack groups`]),
        ...(Object.keys((benchmarks.level || {})[c] || {}).length && Object.entries(benchmarks.level[c]).every(([sku, n]) => PRODUCT_BY_SKU.has(sku) && inBand(n, vb.level)) ? [] : [`${c} level`]),
      ]),
    ],
    'signature',
  );
  const mayOf = (c, g) => curveAverage(benchmarks[c][g], v.lyMay);
  check(
    `cluster curves: May index, single-serve, inside its band (got ${vb.clusters.map((c) => `${c} ${fixed2(mayOf(c, 'single'))}`).join(', ')})`,
    vb.clusters.filter((c) => !inBand(mayOf(c, 'single'), vb.mayIndexSingle[c])).map((c) => `${c} wants ${bandText(vb.mayIndexSingle[c])}`),
    'signature',
  );
  const upliftShare = (c) => (mayOf(c, 'takehome') - 1) / (mayOf(c, 'single') - 1);
  check(
    `cluster curves: take-home May uplift is ${bandText(vb.takehomeUpliftShare)} of the single-serve uplift (got ${vb.takehomeUpliftShare.clusters.map((c) => `${c} ${fixed2(upliftShare(c))}`).join(', ')})`,
    vb.takehomeUpliftShare.clusters.filter((c) => !inBand(upliftShare(c), vb.takehomeUpliftShare)),
    'signature',
  );
  for (const [c, band] of Object.entries(vb.weeklyIndexBand)) {
    const values = vb.packGroups.flatMap((g) => Object.values(benchmarks[c][g]));
    check(
      `cluster curves: ${c} stays between ${band.min} and ${band.max} in every week, so no exam dip and no closure (got ${Math.min(...values)} to ${Math.max(...values)})`,
      values.every((x) => inBand(x, band)) ? [] : ['outside the band'],
      'signature',
    );
  }
  return results;
}

function printTable(rows) {
  const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => String(r[i]).length)));
  const line = (r) => r.map((c, i) => (i < 2 ? String(c).padEnd(widths[i]) : String(c).padStart(widths[i]))).join('  ');
  console.log(line(rows[0]));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  rows.slice(1).forEach((r) => console.log(line(r)));
}

function printSummary(files, stats, sizes, results) {
  const orders = files['orders_history.json'];
  console.log(`GT App demo data, v0.5 generator. Seed ${CFG.model.seed}. History ${CFG.history.start} to ${CFG.history.end}. Demo date ${CFG.config.demoDate}.`);
  console.log('');
  printTable([
    ['outlet', 'persona', 'orders', 'LY Jan-Feb /wk', 'LY May index', 'TY last 4 wk /wk', 'last order', 'cases', 'value', 'next visit'],
    ...stats.map((s) => [
      s.outlet.id,
      s.outlet.personaKey,
      s.orders.length,
      s.base.toFixed(1),
      s.mayIndex === null ? 'n/a' : s.mayIndex.toFixed(2),
      s.recent.toFixed(1),
      s.last ? s.last.date : 'none',
      s.last ? orderCases(s.last) : 0,
      s.last ? rupees(orderValue(s.last)) : rupees(0),
      s.nextVisit ?? 'none',
    ]),
  ]);
  console.log('');
  console.log(`Totals: ${orders.length} orders, ${orders.reduce((s, o) => s + o.lines.length, 0)} lines.`);
  console.log('Files: ' + Object.entries(sizes).map(([name, bytes]) => `${name} ${(bytes / 1024).toFixed(1)} KB`).join(' · '));
  for (const [group, title] of [['hard', 'Hard checks:'], ['signature', 'Signature checks (also hard: any failure exits 1):']]) {
    console.log('');
    console.log(title);
    for (const r of results.filter((x) => x.group === group)) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : ' -> ' + r.problems.join('; ')}`);
  }
  // What the app's engine reads first: every outlet's orders of the last few weeks, line by line.
  const recentFrom = iso(DEMO - CFG.validation.recentWeeks * DAYS_PER_WEEK);
  console.log('');
  console.log(`Orders in the last ${CFG.validation.recentWeeks} weeks (${recentFrom} to ${CFG.history.end}):`);
  for (const s of stats) {
    const recent = s.orders.filter((o) => o.date >= recentFrom);
    console.log(`  ${s.outlet.id} ${s.outlet.personaKey}: ${recent.length} order(s), ${sum(recent.map(orderCases))} cases, ${(sum(recent.map(orderCases)) / CFG.validation.recentWeeks).toFixed(1)} a week`);
    for (const o of recent) console.log(`    ${o.date}  ${String(orderCases(o)).padStart(2)} cases  ${rupees(orderValue(o)).padStart(7)}  ${o.lines.map((l) => `${l.sku} ${l.cases}`).join(', ')}`);
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log('');
  console.log(failed ? `${failed} hard check(s) FAILED.` : `All ${results.length} hard checks passed.`);
  return failed;
}

// ───────────────────────────── 11. main ─────────────────────────────

const files = buildAll();
const sizes = writeAll(files);
const stats = personaStats(files);
const failed = printSummary(files, stats, sizes, runChecks(files, stats, sizes));
process.exit(failed ? 1 : 0);

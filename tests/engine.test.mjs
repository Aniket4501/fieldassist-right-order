// Engine tests. Run: node --test tests/engine.test.mjs (from prototype/) or node --test prototype/tests/engine.test.mjs
// (from the project root). A bare directory argument (node --test tests/) works only up to Node 20.
// Hand-made fixtures first, then a sweep over the real data files.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { buildData, DATA_FILES } from '../js/data.js';
import { addDays, isoWeek } from '../js/dates.js';
import { evaluateSchemes, cartLines, productIndex } from '../js/engine/schemes.js';
import { priceCart } from '../js/engine/pricing.js';
import { recommend } from '../js/engine/recommendationEngine.js';
import { PARAMS } from '../js/engine/params.js';
import { roundHalfUp, windowFor, historyFor, calendarFor, seasonPhase, numbersFor } from '../js/engine/cover.js';

// ---------------------------------------------------------------- fixtures

const DATE = '2026-04-28';

const PRODUCTS = [
  { sku: 'A', name: 'Product A', category: 'sparkling', unitsPerCase: 24, ptrCase: 500, serve: 'single' },
  { sku: 'B', name: 'Product B', category: 'sparkling', unitsPerCase: 24, ptrCase: 300, serve: 'single' },
  { sku: 'C', name: 'Product C', category: 'sparkling', unitsPerCase: 24, ptrCase: 400, serve: 'single' },
  { sku: 'J', name: 'Product J', category: 'juice', unitsPerCase: 12, ptrCase: 437, serve: 'single' },
  { sku: 'K', name: 'Product K', category: 'juice', unitsPerCase: 12, ptrCase: 122, serve: 'takehome' },
];

const POOLED = {
  id: 'T-1', name: 'Buy 10 get 1', skus: ['A', 'B', 'C'], type: 'buy_x_get_y', buyCases: 10, freeCases: 1,
  pctOff: null, minCases: null, pooled: true, eligibleSegments: ['Gold', 'Silver'],
  validFrom: '2026-03-01', validTo: '2026-05-31', capPerMonth: 4,
};
const PCT = {
  id: 'T-2', name: '8% off juice', skus: ['J', 'K'], type: 'pct_off_min_qty', buyCases: null, freeCases: null,
  pctOff: 8, minCases: 5, pooled: true, eligibleSegments: ['Gold', 'Silver', 'Bronze'],
  validFrom: '2026-04-01', validTo: '2026-06-30', capPerMonth: null,
};
const EXPIRED = { ...POOLED, id: 'T-0', validFrom: '2025-03-01', validTo: '2025-05-31' };
const SCHEMES = [EXPIRED, POOLED, PCT];

const GOLD = { id: 'F-1', name: 'Fixture Gold', segment: 'Gold', visitsPerMonth: 4 };
const BRONZE = { id: 'F-2', name: 'Fixture Bronze', segment: 'Bronze', visitsPerMonth: 2 };

function schemeFor(results, id) {
  return results.find((r) => r.schemeId === id);
}

// A small data view: F-1 booked 16 cases of A over the last 4 weeks, and B only 6 weeks ago.
function fixtureData() {
  const order = (daysAgo, lines) => ({ id: 'H-' + daysAgo, outletId: 'F-1', date: addDays(DATE, -daysAgo), lines });
  return buildData({
    config: { schemaVersion: 1, demoDate: DATE, rep: { name: 'Fixture Rep' } },
    outlets: [GOLD, BRONZE],
    products: PRODUCTS,
    orders: [
      order(42, [{ sku: 'B', cases: 5, freeCases: 0, deliveredCases: 5 }]),
      order(28, [{ sku: 'A', cases: 4, freeCases: 0, deliveredCases: 4 }]),
      order(21, [{ sku: 'A', cases: 4, freeCases: 0, deliveredCases: 4 }]),
      order(14, [{ sku: 'A', cases: 4, freeCases: 0, deliveredCases: 4 }]),
      order(7, [{ sku: 'A', cases: 4, freeCases: 0, deliveredCases: 4 }]),
      order(70, [{ sku: 'C', cases: 9, freeCases: 0, deliveredCases: 9 }]),
    ],
    routePlan: { 'F-1': [DATE, addDays(DATE, 7)], 'F-2': [] },
    schemes: SCHEMES, distributorStock: {}, calendar: {}, clusterBenchmarks: {},
  });
}

// ---------------------------------------------------------------- schemes

test('empty cart: schemes report zeros and do not throw', () => {
  for (const cart of [undefined, null, {}, { outletId: 'F-1', lines: {} }, { lines: { A: 0, B: -3, C: 'x' } }]) {
    const results = evaluateSchemes(cart, GOLD, SCHEMES, PRODUCTS, DATE, []);
    assert.deepEqual(results.map((r) => r.schemeId), ['T-1', 'T-2']);   // the expired scheme is left out
    const pooled = schemeFor(results, 'T-1');
    assert.equal(pooled.qualifyingCases, 0);
    assert.equal(pooled.triggers, 0);
    assert.equal(pooled.freeCases, 0);
    assert.equal(pooled.casesToNextTrigger, 10);
    assert.equal(pooled.freeSku, null);
    assert.equal(schemeFor(results, 'T-2').casesToNextTrigger, 5);
    assert.equal(schemeFor(results, 'T-2').discountValue, 0);
  }
});

test('bad inputs give empty results, not errors', () => {
  assert.deepEqual(evaluateSchemes({ A: 3 }, GOLD, SCHEMES, PRODUCTS, 'not a date', []), []);
  assert.deepEqual(evaluateSchemes({ A: 3 }, GOLD, null, null, DATE), []);
  const noOutlet = evaluateSchemes({ A: 12 }, null, SCHEMES, PRODUCTS, DATE);
  assert.equal(noOutlet[0].eligible, false);
  assert.equal(typeof noOutlet[0].reasonIfNot, 'string');
  assert.equal(noOutlet[0].freeCases, 0);
});

test('ineligible tier: reason built from the data, no benefit', () => {
  const pooled = schemeFor(evaluateSchemes({ A: 12, B: 8 }, BRONZE, SCHEMES, PRODUCTS, DATE, []), 'T-1');
  assert.equal(pooled.eligible, false);
  assert.match(pooled.reasonIfNot, /Gold and Silver/);
  assert.match(pooled.reasonIfNot, /Bronze/);
  assert.equal(pooled.qualifyingCases, 20);
  assert.equal(pooled.threshold, 10);
  assert.equal(pooled.triggers, 0);
  assert.equal(pooled.freeCases, 0);
  assert.equal(pooled.discountValue, 0);
  assert.equal(pooled.casesToNextTrigger, null);
  assert.equal(pooled.freeSku, null);

  const eligible = schemeFor(evaluateSchemes({ A: 12, B: 8 }, GOLD, SCHEMES, PRODUCTS, DATE, []), 'T-1');
  assert.equal(eligible.eligible, true);
  assert.equal(eligible.reasonIfNot, null);
  assert.equal(eligible.triggers, 2);
});

test('pooled scheme at 9 cases, then at 10', () => {
  const nine = schemeFor(evaluateSchemes({ outletId: 'F-1', lines: { A: 5, B: 2, C: 2 } }, GOLD, SCHEMES, PRODUCTS, DATE, []), 'T-1');
  assert.equal(nine.qualifyingCases, 9);
  assert.equal(nine.threshold, 10);
  assert.equal(nine.triggers, 0);
  assert.equal(nine.freeCases, 0);
  assert.equal(nine.casesToNextTrigger, 1);
  assert.equal(nine.freeSku, null);

  const ten = schemeFor(evaluateSchemes({ outletId: 'F-1', lines: { A: 6, B: 2, C: 2 } }, GOLD, SCHEMES, PRODUCTS, DATE, []), 'T-1');
  assert.equal(ten.qualifyingCases, 10);
  assert.equal(ten.triggers, 1);
  assert.equal(ten.freeCases, 1);
  assert.equal(ten.casesToNextTrigger, 10);      // exactly on a multiple: a full step to the next one
  assert.equal(ten.freeSku, 'B');                // the lowest-priced scheme sku in the cart
  assert.equal(ten.capReached, false);
  assert.equal(ten.discountPct, null);

  // The cheapest sku is not in the cart: the free case goes on the cheapest one that is.
  const noB = schemeFor(evaluateSchemes({ A: 6, C: 4 }, GOLD, SCHEMES, PRODUCTS, DATE, []), 'T-1');
  assert.equal(noB.freeSku, 'C');
});

test('not pooled: each sku must reach the step on its own', () => {
  const scheme = { ...POOLED, pooled: false };
  const split = evaluateSchemes({ A: 9, B: 6 }, GOLD, [scheme], PRODUCTS, DATE, [])[0];
  assert.equal(split.qualifyingCases, 15);
  assert.equal(split.triggers, 0);
  assert.equal(split.casesToNextTrigger, 1);
  const hit = evaluateSchemes({ A: 21, B: 6 }, GOLD, [scheme], PRODUCTS, DATE, [])[0];
  assert.equal(hit.triggers, 2);
  assert.equal(hit.freeCases, 2);
  assert.equal(hit.casesToNextTrigger, 4);
});

test('monthly cap reached through month-to-date orders', () => {
  const earlier = (date, cases) => ({ id: 'H-' + date, outletId: 'F-1', date, lines: [{ sku: 'A', cases, freeCases: 0, deliveredCases: cases }] });

  // 3 of 4 triggers used: a 25-case cart earns only the one that is left.
  const oneLeft = schemeFor(evaluateSchemes({ A: 25 }, GOLD, SCHEMES, PRODUCTS, DATE,
    [earlier('2026-04-07', 20), earlier('2026-04-14', 10)]), 'T-1');
  assert.equal(oneLeft.triggersUsedThisMonth, 3);
  assert.equal(oneLeft.triggers, 1);
  assert.equal(oneLeft.freeCases, 1);
  assert.equal(oneLeft.capReached, true);
  assert.equal(oneLeft.casesToNextTrigger, null);
  assert.equal(oneLeft.freeSku, 'A');

  // All 4 used: nothing more this month.
  const none = schemeFor(evaluateSchemes({ A: 10 }, GOLD, SCHEMES, PRODUCTS, DATE,
    [earlier('2026-04-07', 30), earlier('2026-04-21', 25)]), 'T-1');
  assert.equal(none.triggersUsedThisMonth, 4);
  assert.equal(none.triggers, 0);
  assert.equal(none.freeCases, 0);
  assert.equal(none.capReached, true);
  assert.equal(none.casesToNextTrigger, null);
  assert.equal(none.freeSku, null);

  // Orders from another month or another outlet do not count.
  const other = schemeFor(evaluateSchemes({ A: 10 }, GOLD, SCHEMES, PRODUCTS, DATE,
    [earlier('2026-03-24', 40), { ...earlier('2026-04-07', 40), outletId: 'F-2' }]), 'T-1');
  assert.equal(other.triggersUsedThisMonth, 0);
  assert.equal(other.triggers, 1);
  assert.equal(other.capReached, false);
});

test('percentage scheme at 4 cases, then at 5, with the exact discount', () => {
  const four = schemeFor(evaluateSchemes({ J: 4 }, GOLD, SCHEMES, PRODUCTS, DATE, []), 'T-2');
  assert.equal(four.threshold, 5);
  assert.equal(four.triggers, 0);
  assert.equal(four.casesToNextTrigger, 1);
  assert.equal(four.discountPct, 8);
  assert.equal(four.discountValue, 0);

  const five = schemeFor(evaluateSchemes({ J: 5 }, GOLD, SCHEMES, PRODUCTS, DATE, []), 'T-2');
  assert.equal(five.triggers, 1);
  assert.equal(five.casesToNextTrigger, 0);
  assert.equal(five.discountValue, 175);         // 8% of 5 × 437 = 174.8
  assert.equal(five.freeCases, 0);
  assert.equal(five.freeSku, null);
  assert.equal(five.capPerMonth, null);
  assert.equal(five.capReached, false);

  // Pooled across the two skus: 3 + 2 reaches 5, and both lines are discounted.
  const pooled = schemeFor(evaluateSchemes({ J: 3, K: 2 }, GOLD, SCHEMES, PRODUCTS, DATE, []), 'T-2');
  assert.equal(pooled.discountValue, 124);       // 8% of 1,311 + 244 = 124.4

  // Not pooled, 5% off: only the sku that reaches 5 is discounted; half a rupee rounds up.
  const single = evaluateSchemes({ J: 3, K: 5 }, GOLD, [{ ...PCT, pooled: false, pctOff: 5 }], PRODUCTS, DATE, [])[0];
  assert.equal(single.triggers, 1);
  assert.equal(single.discountValue, 31);        // 5% of 5 × 122 = 30.5
});

// ---------------------------------------------------------------- pricing

test('priceCart: empty cart and missing scheme results', () => {
  assert.deepEqual(priceCart(null, PRODUCTS), { lines: [], cases: 0, freeCases: 0, grossValue: 0, discount: 0, netValue: 0 });
  const plain = priceCart({ B: 2, A: 1, ZZ: 3 }, PRODUCTS);
  assert.deepEqual(plain.lines.map((line) => line.sku), ['A', 'B', 'ZZ']);    // product-master order, unknown sku last
  assert.deepEqual(plain.lines[2], { sku: 'ZZ', cases: 3, ptrCase: 0, value: 0, freeCases: 0, discount: 0, netValue: 0 });
  assert.equal(plain.cases, 6);
  assert.equal(plain.grossValue, 1100);
  assert.equal(plain.discount, 0);
  assert.equal(plain.freeCases, 0);
  assert.equal(plain.netValue, 1100);
  assert.deepEqual(priceCart({ B: 2, A: 1 }, productIndex(PRODUCTS)).lines.map((line) => line.sku), ['B', 'A']);
});

test('priceCart: totals with a free case and a split discount', () => {
  const cart = { outletId: 'F-1', lines: { A: 6, B: 4, J: 3, K: 2 } };
  const results = evaluateSchemes(cart, GOLD, SCHEMES, PRODUCTS, DATE, []);
  const priced = priceCart(cart, PRODUCTS, results);
  const line = (sku) => priced.lines.find((l) => l.sku === sku);

  assert.equal(priced.cases, 15);
  assert.equal(priced.grossValue, 6 * 500 + 4 * 300 + 3 * 437 + 2 * 122);
  assert.equal(priced.freeCases, 1);
  assert.equal(line('B').freeCases, 1);
  assert.equal(line('A').freeCases, 0);

  assert.equal(priced.discount, 124);
  assert.equal(line('J').discount + line('K').discount, schemeFor(results, 'T-2').discountValue);
  assert.equal(line('K').discount, 19);          // 124 × 244 ÷ 1,555 = 19.46
  assert.equal(line('J').discount, 105);         // 124 × 1,311 ÷ 1,555 = 104.54
  assert.equal(line('J').netValue, 3 * 437 - 105);
  assert.equal(line('A').discount, 0);
  assert.equal(priced.netValue, priced.grossValue - 124);
});

test('priceCart: the rounding remainder goes on the largest discounted line', () => {
  // Two equal lines share a discount of 5: 2.5 each rounds up to 3 + 3, so one rupee comes back off.
  const products = [{ sku: 'X', ptrCase: 100 }, { sku: 'Y', ptrCase: 100 }, { sku: 'Z', ptrCase: 100 }];
  const priced = priceCart({ X: 1, Y: 1, Z: 1 }, products,
    [{ skus: ['X', 'Y'], pooled: true, threshold: 2, freeCases: 0, freeSku: null, discountValue: 5 }]);
  assert.deepEqual(priced.lines.map((line) => line.discount), [2, 3, 0]);
  assert.equal(priced.discount, 5);
  assert.equal(priced.netValue, 295);
});

// ---------------------------------------------------------------- found in review

test('review: a cart object without lines is an empty cart', () => {
  for (const cart of [{ outletId: 7 }, { outletId: '109', lines: null }, { outletId: 5, lines: [] }]) {
    assert.deepEqual(Object.keys(cartLines(cart)), []);
    assert.equal(priceCart(cart, PRODUCTS).cases, 0);
  }
});

test('review: a huge quantity is ignored and totals stay finite', () => {
  assert.deepEqual(Object.keys(cartLines({ A: 1e300, B: Infinity, C: '1e400', J: 1000000 })), ['J']);
  const cart = { A: 1e300, J: 1e300, K: 5 };
  const results = evaluateSchemes(cart, GOLD, SCHEMES, PRODUCTS, DATE, []);
  const priced = priceCart(cart, PRODUCTS, results);
  for (const key of ['cases', 'freeCases', 'grossValue', 'discount', 'netValue']) assert.ok(Number.isFinite(priced[key]), key);
  assert.equal(priced.cases, 5);
  assert.equal(priced.netValue, priced.grossValue - priced.discount);
});

test('review: a sku listed twice in a scheme counts once', () => {
  const twice = evaluateSchemes({ A: 6 }, GOLD, [{ ...POOLED, skus: ['A', 'A', 'B'] }], PRODUCTS, DATE, [])[0];
  assert.deepEqual(twice.skus, ['A', 'B']);
  assert.equal(twice.qualifyingCases, 6);
  assert.equal(twice.triggers, 0);
});

test('review: a percentage above 100 never discounts more than the line value', () => {
  const over = evaluateSchemes({ J: 5 }, GOLD, [{ ...PCT, pctOff: 150 }], PRODUCTS, DATE, [])[0];
  assert.equal(over.discountValue, 5 * 437);
  const priced = priceCart({ J: 5 }, PRODUCTS, [over]);
  assert.equal(priced.netValue, 0);
});

test('review: no line discount goes below zero when many shares round up', () => {
  // Ten equal lines share a discount of 5: each share is 0.5 and rounds up to 1, so 5 must come back off.
  const products = [];
  const cart = {};
  for (let i = 0; i < 10; i += 1) {
    products.push({ sku: 'S' + i, ptrCase: 10 });
    cart['S' + i] = 1;
  }
  const scheme = { ...PCT, skus: products.map((p) => p.sku), pctOff: 5, minCases: 1 };
  const results = evaluateSchemes(cart, GOLD, [scheme], products, DATE, []);
  assert.equal(results[0].discountValue, 5);
  const priced = priceCart(cart, products, results);
  for (const line of priced.lines) assert.ok(line.discount >= 0 && line.discount <= line.value, line.sku + ' ' + line.discount);
  assert.equal(priced.discount, 5);
  assert.equal(priced.netValue, 95);
});

test('review: scheme validity on the first and last day, cap at each count, exact multiples', () => {
  const ids = (date) => evaluateSchemes({ A: 1 }, GOLD, [POOLED, PCT], PRODUCTS, date, []).map((r) => r.schemeId);
  assert.deepEqual(ids('2026-02-28'), []);
  assert.deepEqual(ids('2026-03-01'), ['T-1']);
  assert.deepEqual(ids('2026-04-01'), ['T-1', 'T-2']);
  assert.deepEqual(ids('2026-05-31'), ['T-1', 'T-2']);
  assert.deepEqual(ids('2026-06-01'), ['T-2']);
  assert.deepEqual(ids('2026-06-30'), ['T-2']);
  assert.deepEqual(ids('2026-07-01'), []);

  for (const [cases, triggers, gap] of [[10, 1, 10], [20, 2, 10], [39, 3, 1], [40, 4, null], [50, 4, null]]) {
    const r = evaluateSchemes({ A: cases }, GOLD, [POOLED], PRODUCTS, DATE, [])[0];
    assert.deepEqual([r.triggers, r.freeCases, r.casesToNextTrigger, r.capReached], [triggers, triggers, gap, gap === null], cases + ' cases');
  }
  for (const [booked, used] of [[0, 0], [10, 1], [35, 3], [40, 4], [90, 4]]) {
    const earlier = [{ id: 'H', outletId: 'F-1', date: '2026-04-07', lines: [{ sku: 'A', cases: booked }] }];
    const r = evaluateSchemes({ A: 25 }, GOLD, [POOLED], PRODUCTS, DATE, earlier)[0];
    assert.equal(r.triggersUsedThisMonth, used);
    assert.equal(r.triggers, Math.min(2, 4 - used));
    assert.equal(r.capReached, used + r.triggers >= 4);
  }
});

test('review: free-case ties, and inputs are never changed', () => {
  const tied = PRODUCTS.map((p) => (p.sku === 'C' ? { ...p, ptrCase: 300 } : p));   // B and C at the same price
  const free = (lines, skus = POOLED.skus) => evaluateSchemes(lines, GOLD, [{ ...POOLED, skus }], tied, DATE, [])[0].freeSku;
  assert.equal(free({ A: 5, B: 2, C: 3 }), 'C');             // same price: the larger quantity
  assert.equal(free({ A: 4, B: 3, C: 3 }), 'B');             // full tie: scheme sku order
  assert.equal(free({ A: 4, B: 3, C: 3 }, ['C', 'A', 'B']), 'C');

  const deepFreeze = (value) => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const key of Object.keys(value)) deepFreeze(value[key]);
    }
    return value;
  };
  const cart = deepFreeze({ outletId: 'F-1', lines: { A: 12, B: 3, J: 4, K: 2 } });
  const earlier = deepFreeze([{ id: 'H', outletId: 'F-1', date: '2026-04-07', lines: [{ sku: 'A', cases: 10 }] }]);
  const results = deepFreeze(evaluateSchemes(cart, deepFreeze({ ...GOLD }), deepFreeze(SCHEMES.map((s) => ({ ...s }))), deepFreeze(PRODUCTS.map((p) => ({ ...p }))), DATE, earlier));
  assert.doesNotThrow(() => priceCart(cart, deepFreeze(PRODUCTS.map((p) => ({ ...p }))), results));
  assert.doesNotThrow(() => recommend({ outlet: GOLD, cart, visit: null, data: fixtureData(), demoDate: DATE }));
});

// ---------------------------------------------------------------- Right Order (v1-cover): hand-made fixtures

// One outlet (X-1) that books 4 cases of S every week, 11 weeks back. Everything else is switched on per test.
const RO_PRODUCTS = [
  { sku: 'S', name: 'Product S', category: 'sparkling', flavour: 'cola', packMl: 250, unitsPerCase: 24, ptrCase: 500, serve: 'single' },
  { sku: 'U', name: 'Product U', category: 'sparkling', flavour: 'cola', packMl: 300, unitsPerCase: 24, ptrCase: 520, serve: 'single' },
  { sku: 'V', name: 'Product V', category: 'sparkling', flavour: 'orange', packMl: 250, unitsPerCase: 24, ptrCase: 480, serve: 'single' },
  { sku: 'G', name: 'Product G', category: 'sparkling', flavour: 'cola', packMl: 200, unitsPerCase: 24, ptrCase: 300, serve: 'single', returnable: true },
  { sku: 'T', name: 'Product T', category: 'sparkling', flavour: 'cola', packMl: 750, unitsPerCase: 12, ptrCase: 600, serve: 'takehome' },
  { sku: 'N', name: 'Product N', category: 'energy', flavour: 'energy', packMl: 300, unitsPerCase: 24, ptrCase: 900, serve: 'single' },
];
const SEASON = { rampStart: '2026-03-01', peakStart: '2026-04-13', tailStart: '2026-05-18', seasonEnd: '2026-06-10' };
const X1 = { id: 'X-1', name: 'Fixture shop', segment: 'Gold', visitsPerMonth: 4, cluster: 'kc' };

const hOrder = (date, lines, outletId = 'X-1') => ({
  id: 'H-' + outletId + '-' + date, outletId, date,
  lines: Object.keys(lines).map((sku) => ({ sku, cases: lines[sku], freeCases: 0, deliveredCases: lines[sku] })),
});
// `skuCases` every week, from 7 days ago back to 7 × weeks days ago.
const weekly = (skuCases, weeks = 11) => Array.from({ length: weeks }, (_, i) => hOrder(addDays(DATE, -7 * (i + 1)), skuCases));

// A peer curve: an index for every ISO week of 2025 and 2026, from the week's Monday.
function curve(indexOf) {
  const out = {};
  for (let monday = '2024-12-30'; monday < '2027-01-04'; monday = addDays(monday, 7)) out[isoWeek(monday)] = indexOf(monday);
  return out;
}

function world(opts = {}) {
  const outlet = { ...X1, ...(opts.outlet || {}) };
  const data = buildData({
    config: { schemaVersion: 1, demoDate: DATE, distributor: { deliveryLeadDays: 1 }, season: opts.season || SEASON },
    outlets: [outlet, { id: 'X-2', name: 'Empty shop', segment: 'Gold', visitsPerMonth: 4 }],
    products: opts.products || RO_PRODUCTS,
    orders: opts.orders || weekly({ S: 4 }),
    routePlan: { 'X-1': opts.route === undefined ? [DATE, addDays(DATE, 7)] : opts.route },
    schemes: opts.schemes || [],
    distributorStock: opts.stock || {},
    calendar: opts.calendar || {},
    clusterBenchmarks: opts.benchmarks || {},
  }, opts.submitted || []);
  return { outlet, data };
}

function run(opts = {}, cart = {}, stockOnHand = null) {
  const { outlet, data } = world(opts);
  const visit = stockOnHand ? { outletId: outlet.id, stockOnHand } : null;
  return recommend({ outlet, cart: { outletId: outlet.id, lines: cart }, visit, data, demoDate: DATE });
}

// The raw quantities for one product, before rounding and before the cart.
function numbers(opts = {}, sku = 'S', checked = null) {
  const { outlet, data } = world(opts);
  const win = windowFor(outlet, data, DATE);
  const hist = historyFor(outlet, data, DATE);
  const cal = calendarFor(outlet, data, DATE, hist.weekly);
  const product = data.products.find((p) => p.sku === sku);
  return numbersFor({ product, outlet, data, demoDate: DATE, win, hist, cal, phase: seasonPhase(data, DATE), checked });
}

const lineOf = (r, sku) => r.lines.find((line) => line.sku === sku);
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-6, `${label || 'value'}: ${actual} is not ${expected}`);
const RATE = 4;
const BUFFER = 0.84 * 0.25 * RATE * Math.sqrt(8 / 7);   // single-serve in peak, steady orders (variability at its floor)

test('version and shape: the result carries every field of the contract', () => {
  const r = run();
  assert.equal(r.engineVersion, 'v1-cover');
  assert.equal(r.engineVersion, PARAMS.engineVersion);
  for (const key of ['state', 'headline', 'horizon', 'window', 'outletBadge', 'lines', 'nudges', 'quickSets', 'pitch', 'credit', 'scheme', 'explain']) {
    assert.ok(key in r, 'missing ' + key);
  }
  const line = lineOf(r, 'S');
  for (const key of ['sku', 'isKey', 'recommendedCases', 'rangeLow', 'rangeHigh', 'cartCases', 'status', 'hint', 'reasonShort', 'confidence',
    'confidenceText', 'lastsTill', 'flags', 'substitute', 'stock', 'weeklyRate', 'why']) {
    assert.ok(key in line, 'line is missing ' + key);
  }
  assert.deepEqual(Object.keys(line.stock).sort(), ['cases', 'counted', 'estimate', 'inTransit']);
  assert.equal(line.why.facts.length, 6);
  assert.ok(line.why.talkingPoints.length <= 3);
  assert.ok(line.why.steps.length === 3 || line.why.steps.length === 4);
  assert.deepEqual(Object.keys(r.credit).sort(), ['available', 'bookedToday', 'cartValue', 'fits', 'known', 'priority', 'text', 'unlockByCollecting']);
  assert.deepEqual(Object.keys(r.quickSets).sort(), ['minimum', 'suggested']);
  assert.equal(r.scheme, null);                         // no scheme in this fixture
});

test('window: a planned visit, no plan, and the 14-day cap with its flag', () => {
  // Next visit in 7 days, delivery the day after: 8 days.
  const planned = run();
  assert.deepEqual(planned.horizon, { nextVisit: addDays(DATE, 7), days: 7 });
  assert.deepEqual(planned.window, { days: 8, horizonDays: 8, capped: false, nextDelivery: addDays(DATE, 8), coversTill: addDays(DATE, 8), flag: null });
  assert.ok(!lineOf(planned, 'S').flags.includes('visit_gap'));

  // No plan: 4 visits a month is a visit every 8 days (30 / 4 = 7.5, half up), delivery on day 9.
  const none = run({ route: [] });
  assert.deepEqual(none.horizon, { nextVisit: null, days: 8 });
  assert.equal(none.window.days, 9);
  assert.equal(none.window.nextDelivery, addDays(DATE, 9));
  // A plan with only today or past dates is no plan.
  assert.equal(run({ route: [addDays(DATE, -7), DATE] }).horizon.nextVisit, null);
  // No plan and no cadence: a week.
  assert.equal(run({ route: [], outlet: { visitsPerMonth: null } }).window.days, 8);

  // Next visit in 28 days: 29 days to the delivery, the order covers 14.
  const far = run({ route: [addDays(DATE, 28)] });
  assert.equal(far.window.horizonDays, 29);
  assert.equal(far.window.days, 14);
  assert.equal(far.window.capped, true);
  assert.equal(far.window.coversTill, addDays(DATE, 14));
  assert.equal(far.window.nextDelivery, addDays(DATE, 29));
  assert.match(far.window.flag, /^Visit gap 29 days — covers 2 weeks/);
  assert.ok(lineOf(far, 'S').flags.includes('visit_gap'));
  assert.ok(far.nudges.some((n) => n.type === 'event' && n.text === far.window.flag));
  // Exactly 14 days is not capped.
  const edge = run({ route: [addDays(DATE, 13)] });
  assert.equal(edge.window.days, 14);
  assert.equal(edge.window.capped, false);
  assert.equal(edge.window.flag, null);
  // The limit is on the visit gap: a visit in 14 days (delivery on day 15) is covered in full, 15 is capped.
  const fortnight = run({ route: [addDays(DATE, 14)] });
  assert.deepEqual([fortnight.window.horizonDays, fortnight.window.days, fortnight.window.capped, fortnight.window.flag], [15, 15, false, null]);
  assert.ok(!lineOf(fortnight, 'S').flags.includes('visit_gap'));
  const beyond = run({ route: [addDays(DATE, 15)] });
  assert.deepEqual([beyond.window.horizonDays, beyond.window.days, beyond.window.capped], [16, 14, true]);
  // The cap is a ceiling too: with counted stock nothing above the 14-day number is "right".
  const capped = run({ route: [addDays(DATE, 28)] }, {}, { S: 1 });
  assert.equal(lineOf(capped, 'S').rangeHigh, lineOf(capped, 'S').recommendedCases);
});

test('candidates: booked in the last 12 weeks; key products are the top 4 by expected demand', () => {
  const at = (daysAgo) => run({ orders: [hOrder(addDays(DATE, -daysAgo), { S: 3 })] });
  assert.deepEqual(at(84).lines.map((line) => line.sku), ['S']);
  assert.equal(at(85).lines.length, 0);
  assert.equal(at(85).state, 'insufficient_data');
  assert.equal(at(85).outletBadge, 'checkdata');

  // Five products with different rates: the four biggest are key, lines stay in product-master order.
  const r = run({ orders: weekly({ S: 5, U: 1, V: 3, T: 4, N: 2 }) });
  assert.deepEqual(r.lines.map((line) => line.sku), ['S', 'U', 'V', 'T', 'N']);
  assert.deepEqual(r.lines.filter((line) => line.isKey).map((line) => line.sku), ['S', 'V', 'T', 'N']);
  // A product in the cart that the outlet never booked gets no line.
  assert.equal(lineOf(run({}, { N: 2 }), 'N'), undefined);
  // A focus product never booked here is a candidate only when similar shops give it a rate, which they do
  // only while the outlet has fewer than 4 weeks of its own: (2 × 0 + 6 × 1) / 8 = 0.75 a week.
  // A glass product is none at an outlet that holds no glass and never booked it.
  const peers = { kc: { single: curve(() => 1) }, level: { kc: { G: 2, N: 1 } } };
  const focus = RO_PRODUCTS.map((p) => (p.sku === 'G' || p.sku === 'N' ? { ...p, focus: true } : p));
  const young = run({ benchmarks: peers, products: focus, orders: weekly({ S: 4 }, 2) });
  assert.deepEqual(young.lines.map((line) => line.sku), ['S', 'N']);
  near(numbers({ benchmarks: peers, products: focus, orders: weekly({ S: 4 }, 2) }, 'N').rate, 0.75, 'focus product from similar shops');
  assert.ok(lineOf(young, 'N').flags.includes('peer'));
  assert.deepEqual(run({ benchmarks: peers, products: focus }).lines.map((line) => line.sku), ['S']);
  assert.deepEqual(run({ benchmarks: peers, orders: weekly({ S: 4 }, 2) }).lines.map((line) => line.sku), ['S']);   // not a focus product
});

test('run-rate: the last 4 weeks; a supply-out week and its catch-up week are left out', () => {
  near(numbers().rate, 4, 'steady rate');
  const orders = [
    ...weekly({ S: 4 }, 11).filter((o) => o.date < addDays(DATE, -28)),
    hOrder(addDays(DATE, -28), { S: 4 }),
    // no order in the week 21 to 15 days ago: the distributor was out
    hOrder(addDays(DATE, -14), { S: 10 }),   // catch-up
    hOrder(addDays(DATE, -7), { S: 4 }),
  ];
  const gap = { supplyHistory: [{ sku: 'S', start: addDays(DATE, -20), end: addDays(DATE, -16) }] };
  near(numbers({ orders }).rate, 4.5, 'with nothing known about supply');
  const clean = numbers({ orders, calendar: gap });
  near(clean.rate, 4, 'supply-out and catch-up weeks left out');
  assert.equal(clean.cleanWeeks, 2);
  assert.deepEqual(clean.ignored.map((week) => week.why), ['catch-up', 'supply']);
  assert.ok(clean.flags.includes('ignored_weeks'));
  assert.equal(clean.shrunk, false);                      // no similar shops to lean on
  // Another product's supply gap changes nothing here.
  near(numbers({ orders, calendar: { supplyHistory: [{ ...gap.supplyHistory[0], sku: 'U' }] } }).rate, 4.5, 'other product');

  // With fewer than 4 clean weeks and a cluster level of 2 a week: (2 × 4 + 6 × 2) / (2 + 6) = 2.5.
  const peers = { kc: { single: curve(() => 1) }, level: { kc: { S: 2 } } };
  const shrunk = numbers({ orders, calendar: gap, benchmarks: peers });
  near(shrunk.rate, 2.5, 'shrunk toward the cluster');
  assert.equal(shrunk.shrunk, true);
  assert.ok(shrunk.flags.includes('peer'));
  // Four clean weeks: no shrink.
  near(numbers({ benchmarks: peers }).rate, 4, 'four clean weeks');
  assert.equal(numbers({ benchmarks: peers }).shrunk, false);
  // A gap in the week before the 4 weeks makes the oldest of them a catch-up week.
  const older = numbers({ calendar: { supplyHistory: [{ sku: 'S', start: addDays(DATE, -33), end: addDays(DATE, -31) }] } });
  assert.equal(older.cleanWeeks, 3);
  // An outlet whose first order is 2 weeks old has 2 known weeks, not 4 with two zeros.
  const young = numbers({ orders: weekly({ S: 4 }, 2) });
  assert.equal(young.cleanWeeks, 2);
  near(young.rate, 4, 'young outlet');
});

// Last year's weeks from Mon 28 Apr 2025 on are the "coming days"; the 4 weeks before hold 27 earlier days and that Monday.
const stepCurve = (index) => curve((monday) => (monday >= '2025-04-28' && monday < '2025-06-30' ? index : 1));
const peersWith = (index) => ({ kc: { single: stepCurve(index), takehome: curve(() => 1) }, cv: { kc: { single: 0.4, takehome: 0.3 } } });
// Own last year: 8 cases in the 4 weeks before (2 a week), 8 cases in the 2 weeks after (4 a week): ×2.
const LAST_YEAR = [hOrder('2025-04-08', { S: 4 }), hOrder('2025-04-22', { S: 4 }), hOrder('2025-04-30', { S: 4 }), hOrder('2025-05-07', { S: 4 })];

test('step-up: from the peer curve, averaged with a clean own last year, and clipped', () => {
  const peerK = 1.5 / ((27 + 1.5) / 28);
  // Peer only: the outlet has no last year.
  const peer = numbers({ benchmarks: peersWith(1.5) });
  near(peer.stepUp, peerK, 'peer step-up');
  assert.equal(peer.stepUpFrom, 'peer');
  assert.ok(peer.flags.includes('peer'));
  near(peer.mu, RATE * peerK * 8 / 7, 'expected demand');

  // A clean own last year: the average of the two.
  const orders = [...LAST_YEAR, ...weekly({ S: 4 })];
  const both = numbers({ orders, benchmarks: peersWith(1.5) });
  near(both.ownK, 2, 'own step-up');
  assert.equal(both.lyClean, true);
  near(both.stepUp, (2 + peerK) / 2, 'average of own and peer');
  assert.equal(both.stepUpFrom, 'own+peer');
  assert.ok(!both.flags.includes('peer'));

  // A supply-out in last year's window: own is not used.
  const dirty = numbers({ orders, benchmarks: peersWith(1.5), calendar: { supplyHistory: [{ sku: 'S', start: '2025-04-10', end: '2025-04-12' }] } });
  assert.equal(dirty.lyClean, false);
  near(dirty.stepUp, peerK, 'peer only when last year is not clean');
  assert.equal(dirty.stepUpFrom, 'peer');
  // A closure in last year's window does the same.
  const closed = numbers({ orders, benchmarks: peersWith(1.5), calendar: { events: [{ id: 'c', name: 'Shut', type: 'closure', start: '2025-05-01', end: '2025-05-03', appliesTo: 'all' }] } });
  near(closed.stepUp, peerK, 'peer only after a closure last year');

  // No peer curve: a clean own last year alone; and nothing at all gives ×1 with no "similar shops" flag.
  const own = numbers({ orders });
  near(own.stepUp, 2, 'own only');
  assert.equal(own.stepUpFrom, 'own');
  const flat = numbers();
  assert.equal(flat.stepUp, 1);
  assert.equal(flat.stepUpFrom, 'none');
  assert.ok(!flat.flags.includes('peer'));

  // Clipped to 0.3 … 2.0.
  assert.equal(numbers({ benchmarks: peersWith(5) }).stepUp, 2);
  assert.equal(numbers({ benchmarks: peersWith(0.1) }).stepUp, 0.3);
  assert.deepEqual(PARAMS.kClip, [0.3, 2.0]);
  // An outlet outside every cluster gets no peer step-up.
  assert.equal(numbers({ benchmarks: peersWith(1.5), outlet: { cluster: 'elsewhere' } }).stepUpFrom, 'none');
});

const closure = (startOffset) => ({ events: [{ id: 'CL', name: 'Summer closure', type: 'closure', start: addDays(DATE, startOffset), end: addDays(DATE, startOffset + 30), appliesTo: 'all' }] });

test('closure: zero-demand days inside the window, and one that only clips the ceiling', () => {
  const open = numbers();
  near(open.mu, RATE * 8 / 7, 'no closure');
  near(open.muCeiling, RATE * 15 / 7, 'ceiling: one more week');

  // Closed from day 4: only 4 selling days in the 8-day window, and no more in the week after.
  const inside = numbers({ calendar: closure(4) });
  near(inside.mu, RATE * 4 / 7, 'four selling days');
  near(inside.muCeiling, RATE * 4 / 7, 'nothing sells after');
  assert.ok(inside.flags.includes('closure'));
  const r = run({ calendar: closure(4) });
  assert.ok(lineOf(r, 'S').recommendedCases < lineOf(run(), 'S').recommendedCases);
  assert.equal(r.outletBadge, 'golight');
  assert.match(r.headline, /^Summer closure from 2 May · order for 8 days$/);
  assert.match(lineOf(r, 'S').reasonShort, /^Summer closure from 2 May$/);
  assert.ok(r.nudges.some((n) => n.type === 'event' && /Summer closure from Sat 2 May/.test(n.text)));
  assert.match(lineOf(run({ calendar: closure(4) }, { S: 20 }), 'S').hint, /^Over · still in stock when closed 2 May$/);

  // Closed from day 10: the window is untouched, the ceiling loses 5 of its 7 extra days.
  const after = numbers({ calendar: closure(10) });
  near(after.mu, open.mu, 'window untouched');
  near(after.muCeiling, RATE * 10 / 7, 'ceiling clipped');
  assert.ok(after.high < open.high);
  assert.equal(after.recommended, open.recommended);
  assert.ok(after.flags.includes('closure'));
  assert.equal(run({ calendar: closure(10) }).outletBadge, 'golight');

  // Closed from day 15 (window + 7): nothing changes.
  const late = numbers({ calendar: closure(15) });
  near(late.muCeiling, open.muCeiling, 'beyond the ceiling');
  assert.ok(!late.flags.includes('closure'));
  assert.equal(run({ calendar: closure(15) }).outletBadge, 'stockup');
  // A closure for another channel does not apply.
  const other = { events: [{ ...closure(4).events[0], appliesTo: { channels: ['Somewhere else'] } }] };
  near(numbers({ calendar: other }).mu, open.mu, 'other channel');
});

// A 3-day event inside the window with a one-day twin last year (Thu 1 May 2025, the week of Mon 28 Apr 2025).
const eventCalendar = {
  events: [
    { id: 'E-25', name: 'Long weekend', type: 'holiday', series: 'lw', start: '2025-05-01', end: '2025-05-01', appliesTo: 'all' },
    { id: 'E-26', name: 'Long weekend', type: 'long_weekend', series: 'lw', start: addDays(DATE, 3), end: addDays(DATE, 5), appliesTo: 'all' },
  ],
};
// Last year: 4 cases of the take-home product in each of the two weeks before and after, and `cases` in the event week.
const lastYearAround = (cases) => [
  hOrder('2025-04-15', { T: 4 }), hOrder('2025-04-22', { T: 4 }), hOrder('2025-04-30', { T: cases }), hOrder('2025-05-06', { T: 4 }), hOrder('2025-05-13', { T: 4 }),
];

test('event: counts only when last year’s week differed by 30% or more, up or down', () => {
  const withEvent = (cases) => ({ orders: [...lastYearAround(cases), ...weekly({ S: 4 })], calendar: eventCalendar });
  // ×1.5 last year: the 3 event days count as 4.5 days.
  const up = numbers(withEvent(6));
  near(up.mu, RATE * (5 + 3 * 1.5) / 7, 'event above the line');
  assert.ok(up.flags.includes('event'));
  const r = run(withEvent(6));
  assert.match(lineOf(r, 'S').reasonShort, /^Long weekend: ×1\.5 last year$/);
  assert.match(r.pitch, /Long weekend/);
  assert.ok(lineOf(r, 'S').recommendedCases > lineOf(run(), 'S').recommendedCases);
  // ×1.25: inside the line, ignored.
  const flat = numbers(withEvent(5));
  near(flat.mu, RATE * 8 / 7, 'event inside the line');
  assert.ok(!flat.flags.includes('event'));
  // ×0.75: inside the line on the low side.
  near(numbers(withEvent(3)).mu, RATE * 8 / 7, 'event inside the line, below');
  // ×0.5: counts, and lowers the number.
  const down = numbers(withEvent(2));
  near(down.mu, RATE * (5 + 3 * 0.5) / 7, 'event below the line');
  assert.ok(down.flags.includes('event'));
  // ×3 is capped at ×2.
  near(numbers(withEvent(12)).mu, RATE * (5 + 3 * 2) / 7, 'event ratio capped');
  assert.equal(PARAMS.eventRatioCap, 2);

  // No twin last year, or no series on the event: nothing.
  const noTwin = { events: [eventCalendar.events[1]] };
  near(numbers({ orders: withEvent(6).orders, calendar: noTwin }).mu, RATE * 8 / 7, 'no twin');
  const noSeries = { events: eventCalendar.events.map(({ series, ...rest }) => rest) };
  near(numbers({ orders: withEvent(6).orders, calendar: noSeries }).mu, RATE * 8 / 7, 'no series');
  // The outlet did not order in last year's event week: nothing to read.
  near(numbers({ calendar: eventCalendar }).mu, RATE * 8 / 7, 'no own last year');
  // An event after the window changes nothing inside it.
  const later = { events: [eventCalendar.events[0], { ...eventCalendar.events[1], start: addDays(DATE, 9), end: addDays(DATE, 11) }] };
  near(numbers({ orders: withEvent(6).orders, calendar: later }).mu, RATE * 8 / 7, 'event after the window');
});

test('buffer: single-serve in ramp and peak only; none for take-home or in the tail', () => {
  const both = { orders: weekly({ S: 4, T: 4 }) };
  near(numbers(both, 'S').buffer, BUFFER, 'single-serve in peak');
  assert.equal(numbers(both, 'T').buffer, 0);
  assert.equal(numbers(both, 'S').packGroup, 'single');
  assert.equal(numbers(both, 'T').packGroup, 'takehome');
  // Same sales, same stock: the take-home product is recommended no more than the small pack.
  const r = run(both);
  assert.ok(lineOf(r, 'T').recommendedCases <= lineOf(r, 'S').recommendedCases);
  assert.ok(lineOf(r, 'S').why.steps.some((step) => step.label === 'Hot-day extra'));
  assert.ok(!lineOf(r, 'T').why.steps.some((step) => step.label === 'Hot-day extra'));

  const ramp = { ...SEASON, peakStart: '2026-05-04' };
  near(numbers({ season: ramp }).buffer, BUFFER, 'ramp');
  const tail = { ...SEASON, tailStart: '2026-04-20' };
  assert.equal(numbers({ season: tail }).buffer, 0);
  assert.equal(numbers({ season: { ...SEASON, seasonEnd: '2026-04-20', tailStart: '2026-04-01' } }).buffer, 0);   // season over
  assert.equal(numbers({ season: {} }).buffer, 0);
  // The tail is a "go light" talk.
  const late = run({ season: tail });
  assert.equal(late.outletBadge, 'golight');
  assert.match(late.headline, /^Season is ending/);

  // Lumpy orders widen the buffer, up to the clip; the cluster's figure is used when the product has few orders.
  const lumpy = numbers({ orders: [1, 9, 1, 9, 1, 9, 1, 9].map((cases, i) => hOrder(addDays(DATE, -7 * (i + 1)), { S: cases })) });
  near(lumpy.cv, 0.8, 'variability clipped at 0.8');
  const sparse = numbers({ orders: weekly({ S: 4 }, 3), benchmarks: { kc: { single: curve(() => 1) }, cv: { kc: { single: 0.5 } } } });
  near(sparse.cv, 0.5, 'cluster variability when sparse');
});

test('stock: counted is exact (no uncertainty, narrower range, higher confidence); estimated is not', () => {
  // Estimate: 4 delivered 6 days ago, about 3.4 sold since.
  const est = numbers();
  near(est.estimate, 4 - RATE * 6 / 7, 'estimate');
  near(est.unsure, 0.5, 'uncertainty floor');
  assert.equal(est.counted, false);
  near(numbers({ orders: [...weekly({ S: 4 }).slice(1), hOrder(addDays(DATE, -2), { S: 12 })] }).unsure, 0.35 * (12 - 6 * 1 / 7), '35% of a larger estimate');   // 24 cases in 4 weeks, delivered yesterday
  // Sold more than delivered: the estimate stops at 0.
  assert.equal(numbers({ orders: weekly({ S: 4 }).slice(1).concat(hOrder(addDays(DATE, -27), { S: 30 })) }).estimate >= 0, true);

  const counted = numbers({}, 'S', 1);
  assert.equal(counted.counted, true);
  assert.equal(counted.unsure, 0);
  assert.equal(counted.onHand, 1);
  assert.equal(counted.recommended, roundHalfUp(RATE * 8 / 7 + BUFFER - 1));
  assert.equal(counted.low, roundHalfUp(RATE * 8 / 7 - 1));
  assert.equal(counted.high, roundHalfUp(RATE * 15 / 7 - 1));
  assert.ok(counted.high - counted.low < est.high - est.low, 'range narrows');
  assert.equal(numbers({}, 'S', 0).counted, true);        // a count of zero is a count
  for (const junk of [null, undefined, '', '  ', true, false, NaN, -1, {}, []]) assert.equal(numbers({}, 'S', junk).counted, false, String(junk));

  const before = lineOf(run(), 'S');
  const after = lineOf(run({}, {}, { S: 1 }), 'S');
  assert.equal(before.confidence, 'medium');               // history and horizon pass, stock is an estimate
  assert.equal(after.confidence, 'high');
  assert.match(after.confidenceText, /^High · \d+–\d+$/);
  assert.deepEqual(after.stock, { cases: 1, counted: true, inTransit: 0, estimate: before.stock.estimate });
  assert.ok(after.flags.includes('stock_checked'));
  assert.match(after.why.facts[2].value, /counted/);
  assert.match(before.why.facts[2].value, /estimate/);
  // More counted stock never raises the number.
  let last = Infinity;
  for (let cases = 0; cases <= 12; cases += 1) {
    const line = lineOf(run({}, {}, { S: cases }), 'S');
    assert.ok(line.recommendedCases <= last, 'stock ' + cases);
    assert.ok(line.rangeLow <= line.recommendedCases && line.recommendedCases <= line.rangeHigh);
    last = line.recommendedCases;
  }
  assert.equal(last, 0);
  // A count for another outlet's visit is not used.
  const { outlet, data } = world();
  const wrong = recommend({ outlet, cart: null, visit: { outletId: 'X-2', stockOnHand: { S: 9 } }, data, demoDate: DATE });
  assert.equal(lineOf(wrong, 'S').stock.counted, false);

  // Confidence: three checks. Thin history, or a long gap, each takes one step off.
  assert.equal(lineOf(run({ orders: weekly({ S: 4 }, 5) }), 'S').confidence, 'low');
  assert.equal(lineOf(run({ orders: weekly({ S: 4 }, 5) }, {}, { S: 1 }), 'S').confidence, 'medium');
  assert.equal(lineOf(run({ route: [addDays(DATE, 28)] }), 'S').confidence, 'low');
  assert.equal(lineOf(run({ route: [addDays(DATE, 28)] }, {}, { S: 1 }), 'S').confidence, 'medium');
});

test('in transit: an order submitted today counts as stock, and the outlet reads covered', () => {
  const before = run();
  assert.equal(before.state, 'active');
  assert.equal(before.outletBadge, 'stockup');
  const need = lineOf(before, 'S').recommendedCases;
  assert.ok(need > 0);

  const submitted = [{ id: 'D-1', outletId: 'X-1', date: DATE, lines: [{ sku: 'S', cases: need }] }];
  const after = run({ submitted });
  const line = lineOf(after, 'S');
  assert.equal(line.recommendedCases, 0);
  assert.equal(line.status, 'none_needed');
  assert.equal(line.stock.inTransit, need);
  assert.ok(line.flags.includes('in_transit'));
  assert.match(line.hint, /^On the way · covered till /);
  assert.equal(line.reasonShort, 'Order on the way covers this');
  assert.equal(after.state, 'quiet');
  assert.equal(after.outletBadge, 'covered');
  assert.match(after.headline, /^Covered till /);
  assert.deepEqual(after.quickSets, { suggested: {}, minimum: {} });
  // The demo order is stock, never sales history: the weekly rate is unchanged.
  assert.equal(line.weeklyRate, lineOf(before, 'S').weeklyRate);
  // A free case on the submitted order is stock too.
  const free = run({ submitted: [{ id: 'D-2', outletId: 'X-1', date: DATE, lines: [{ sku: 'S', cases: 1, freeCases: 1 }] }] });
  assert.equal(lineOf(free, 'S').stock.inTransit, 2);
});

test('glass: never more crates than the empties on hand', () => {
  const opts = { orders: weekly({ G: 6 }), outlet: { glass: { emptiesOnHand: 2, depositPerCrate: 200 } } };
  const r = run(opts);
  const line = lineOf(r, 'G');
  assert.equal(line.recommendedCases, 2);
  assert.equal(line.rangeHigh, 2);                          // when a cap binds, the ceiling is the cap
  assert.ok(line.rangeLow <= 2);
  assert.ok(line.flags.includes('glass_cap'));
  assert.equal(line.reasonShort, 'Only 2 crates against empties');
  assert.ok(line.why.talkingPoints.some((point) => /against empties/.test(point)));
  assert.deepEqual(r.quickSets.suggested, { G: 2 });

  const over = run(opts, { G: 5 });
  assert.equal(lineOf(over, 'G').status, 'over');
  assert.equal(lineOf(over, 'G').hint, 'Over · only 2 crates against empties');
  assert.ok(over.nudges.some((n) => n.type === 'supply' && n.sku === 'G' && n.text === 'Only 2 crates against empties — deposit for more'));
  assert.equal(lineOf(run(opts, { G: 2 }), 'G').status, 'right');

  // Plenty of empties: no cap, no flag. No empties: nothing.
  const roomy = lineOf(run({ ...opts, outlet: { glass: { emptiesOnHand: 40 } } }), 'G');
  assert.ok(roomy.recommendedCases > 2);
  assert.ok(!roomy.flags.includes('glass_cap'));
  const none = lineOf(run({ ...opts, outlet: { glass: { emptiesOnHand: 0 } } }), 'G');
  assert.deepEqual([none.rangeLow, none.recommendedCases, none.rangeHigh], [0, 0, 0]);
  // Crates booked today have used their empties: after a submit of 2 there is nothing left to give.
  const sent = lineOf(run({ ...opts, submitted: [{ id: 'D-1', outletId: 'X-1', date: DATE, lines: [{ sku: 'G', cases: 2 }] }] }), 'G');
  assert.deepEqual([sent.rangeLow, sent.recommendedCases, sent.rangeHigh, sent.status], [0, 0, 0, 'none_needed']);
  // The cap is for returnable packs only.
  assert.ok(lineOf(run({ orders: weekly({ S: 6 }), outlet: opts.outlet }), 'S').recommendedCases > 2);
});

test('unavailable: the distributor is out, so 0 and a substitute', () => {
  const stock = { asOf: addDays(DATE, -1), items: [{ sku: 'S', status: 'out', note: 'Out' }] };
  for (const cart of [{}, { S: 3 }, { S: 99 }]) {
    const r = run({ stock }, cart);
    const line = lineOf(r, 'S');
    assert.equal(line.status, 'unavailable');
    assert.deepEqual([line.rangeLow, line.recommendedCases, line.rangeHigh], [0, 0, 0]);
    assert.ok(line.flags.includes('supply_out'));
    // Same category, serve and flavour, nearest pack size, and deliverable: U (300 ml), not V (another flavour) or G (glass).
    assert.deepEqual(line.substitute, { sku: 'U', name: 'Product U' });
    assert.equal(line.hint, 'Unavailable · try Product U');
    assert.equal(line.reasonShort, 'Out at the distributor as of Mon 27 Apr');
    assert.ok(r.nudges.some((n) => n.type === 'supply' && n.sku === 'S' && /unavailable \(as of Mon 27 Apr\) · try Product U/.test(n.text)));
    assert.deepEqual(r.quickSets.suggested, {});
  }
  // The substitute is never one that is out too.
  const both = { asOf: addDays(DATE, -1), items: [{ sku: 'S', status: 'out' }, { sku: 'U', status: 'out' }] };
  assert.deepEqual(lineOf(run({ stock: both }), 'S').substitute, { sku: 'V', name: 'Product V' });
  // Nothing of the kind left: said plainly.
  const alone = lineOf(run({ stock, products: RO_PRODUCTS.filter((p) => p.sku === 'S' || p.sku === 'T') }), 'S');
  assert.equal(alone.substitute, null);
  assert.equal(alone.hint, 'Unavailable at the distributor');
  // Low and rationed are flags, not a stop.
  const low = run({ stock: { items: [{ sku: 'S', status: 'low', note: 'Low: about 40 cases left' }] } }, { S: 2 });
  assert.ok(lineOf(low, 'S').flags.includes('supply_low'));
  assert.ok(lineOf(low, 'S').recommendedCases > 0);
  assert.ok(low.nudges.some((n) => n.type === 'supply' && /about 40 cases left/.test(n.text)));
  assert.ok(lineOf(run({ stock: { items: [{ sku: 'S', status: 'rationed' }] } }), 'S').flags.includes('supply_rationed'));
});

test('status: the six of them, first match wins, with their words', () => {
  const base = lineOf(run(), 'S');
  const { rangeLow: low, recommendedCases: rec, rangeHigh: high } = base;
  assert.ok(low >= 2 && low <= rec && rec < high, `fixture range ${low}–${rec}–${high}`);
  const at = (cases, opts = {}, stockOnHand = null) => lineOf(run(opts, { S: cases }, stockOnHand), 'S');
  const till = 'Wed 6 May';                                 // the delivery after the next visit

  assert.equal(base.status, 'missing');                     // cart 0 and something is needed: missing, not short
  assert.equal(base.hint, `Add ${rec} · lasts till ${till}`);
  assert.equal(at(low - 1).status, 'short');
  assert.match(at(low - 1).hint, /^Short · runs out ~(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d+ May$/);
  assert.equal(at(1).status, 'short');
  assert.equal(at(low).status, 'right');
  assert.equal(at(rec).status, 'right');
  assert.equal(at(rec).hint, `Lasts till ${till}`);
  assert.equal(at(high).status, 'right');
  assert.equal(at(high + 1).status, 'over');
  assert.match(at(high + 1).hint, /^Over · ~\d weeks of stock$/);
  assert.equal(at(999).status, 'over');
  assert.equal(at(999).hint, 'Over · 8+ weeks of stock');
  assert.equal(at(999).lastsTill, null);                    // beyond what is worth a date
  // Below the recommendation but not below the low number: right, and said with its condition.
  const est = run({ orders: weekly({ S: 9 }) });
  const wide = lineOf(est, 'S');
  assert.ok(wide.rangeLow < wide.recommendedCases);
  assert.equal(lineOf(run({ orders: weekly({ S: 9 }) }, { S: wide.rangeLow }), 'S').hint, `Lasts till ${till} if sales are normal`);

  // Plenty of stock: none needed at 0; a case on top is still inside the range; far more is over.
  const full = lineOf(run({}, {}, { S: 20 }), 'S');
  assert.equal(full.status, 'none_needed');
  assert.equal(full.recommendedCases, 0);
  assert.equal(full.hint, `Covered till ${till}`);
  assert.equal(at(1, {}, { S: 20 }).status, 'right');
  assert.equal(at(5, {}, { S: 20 }).status, 'over');
  // No sales in the last 4 weeks (booked 6 weeks ago): none needed, with its own words.
  const idle = lineOf(run({ orders: [...weekly({ S: 4 }), hOrder(addDays(DATE, -42), { V: 1 })] }), 'V');
  assert.equal(idle.status, 'none_needed');
  assert.equal(idle.hint, 'No sales in the last 4 weeks');
  assert.equal(idle.reasonShort, 'No orders in the last 4 weeks');
  assert.equal(idle.lastsTill, null);

  // Unavailable beats every other status.
  const stock = { items: [{ sku: 'S', status: 'out' }] };
  for (const cases of [0, 1, rec, 999]) assert.equal(at(cases, { stock }).status, 'unavailable');

  // lastsTill moves with the cart: later with more cases, and on or after the delivery when the line is right.
  assert.ok(at(1).lastsTill < at(rec).lastsTill);
  assert.ok(at(rec).lastsTill >= addDays(DATE, 7));
  // State follows the key lines: right everywhere is quiet, anything else speaks.
  assert.equal(run({}, { S: rec }).state, 'quiet');
  assert.equal(run({}, { S: rec }).headline, `Covered till ${till}`);
  assert.equal(run({}, { S: 1 }).state, 'active');
  const tooMuch = run({}, { S: high + 1 });
  assert.equal(tooMuch.state, 'active');
  assert.match(tooMuch.headline, /^Over on 1 key item/);
});

const poolScheme = (buyCases, more = {}) => [{
  id: 'P-1', name: 'Buy some get 1', skus: ['S', 'U'], type: 'buy_x_get_y', buyCases, freeCases: 1, pctOff: null, minCases: null,
  pooled: true, eligibleSegments: ['Gold', 'Silver'], validFrom: '2026-03-01', validTo: '2026-05-31', capPerMonth: 4, ...more,
}];

test('scheme: a nudge one below the trigger, an honest note when it would sit, silence otherwise', () => {
  const high = lineOf(run(), 'S').rangeHigh;
  assert.ok(high >= 6 && high < 12, 'fixture ceiling ' + high);

  // Empty cart: the bar only.
  const empty = run({ schemes: poolScheme(6) }).scheme;
  assert.equal(empty.text, '0/6 → 1 free');
  assert.equal(empty.nudge, null);
  assert.equal(empty.honestNote, null);
  assert.equal(empty.eligible, true);
  assert.deepEqual([empty.pooledCases, empty.threshold, empty.toNext, empty.freeCases, empty.capReached, empty.limitReached], [0, 6, 6, 0, false, false]);
  // Three below: still only the bar.
  assert.equal(run({ schemes: poolScheme(6) }, { S: 3 }).scheme.nudge, null);
  assert.equal(run({ schemes: poolScheme(6) }, { S: 3 }).scheme.honestNote, null);

  // One below, and one more stays inside the ceiling: a one-tap nudge with the free case's worth.
  const near1 = run({ schemes: poolScheme(6) }, { S: 5 });
  assert.equal(near1.scheme.text, '5/6 → 1 free');
  assert.deepEqual(near1.scheme.nudge, { text: '+1 Product S → 1 free (₹500)', action: { sku: 'S', addCases: 1, setCases: 6 } });
  assert.equal(near1.scheme.honestNote, null);
  assert.deepEqual(near1.nudges.filter((n) => n.type === 'scheme'), [{ type: 'scheme', sku: 'S', text: '+1 Product S → 1 free (₹500)', action: { sku: 'S', setCases: 6 } }]);
  // Taking it: the free case is there and the nudge is gone.
  const taken = run({ schemes: poolScheme(6) }, { S: 6 });
  assert.equal(taken.scheme.text, '1 free ✓ · next at 12');
  assert.equal(taken.scheme.freeCases, 1);
  assert.equal(taken.scheme.nudge, null);
  assert.equal(taken.scheme.honestNote, null);

  // Two below a trigger that is beyond the ceiling: said honestly, with no button.
  const beyond = run({ schemes: poolScheme(high + 3) }, { S: high + 1 });
  assert.equal(beyond.scheme.toNext, 2);
  assert.equal(beyond.scheme.nudge, null);
  assert.match(beyond.scheme.honestNote, /^2 more cases get a free one, but leaves (~\d weeks|8\+ weeks|more than 1 week) of stock — not suggested$/);
  assert.ok(!beyond.nudges.some((n) => n.type === 'scheme'));
  const one = run({ schemes: poolScheme(high + 2) }, { S: high + 1 });
  assert.match(one.scheme.honestNote, /^1 more case gets a free one, but leaves /);

  // Not eligible: the reason, and nothing to tap.
  const bronze = run({ schemes: poolScheme(6), outlet: { segment: 'Bronze' } }, { S: 5 });
  assert.equal(bronze.scheme.eligible, false);
  assert.equal(bronze.scheme.text, 'Only for Gold and Silver outlets. This outlet is Bronze');
  assert.equal(bronze.scheme.nudge, null);
  assert.equal(bronze.scheme.honestNote, null);
  assert.ok(!bronze.nudges.some((n) => n.type === 'scheme'));

  // The month's cap is used (the order a week ago earned the one trigger): no nudge, and the words say so.
  const used = run({ schemes: poolScheme(4, { capPerMonth: 1 }) }, { S: 3 });
  assert.equal(used.scheme.capReached, true);
  assert.equal(used.scheme.limitReached, true);
  assert.equal(used.scheme.text, 'Monthly scheme limit reached');
  assert.equal(used.scheme.nudge, null);
  assert.equal(used.scheme.honestNote, null);
  // An order submitted in the demo counts toward the cap too.
  const today = run({ schemes: poolScheme(6, { capPerMonth: 1 }), submitted: [{ id: 'D-1', outletId: 'X-1', date: DATE, lines: [{ sku: 'S', cases: 6, freeCases: 1 }] }] }, { S: 5 });
  assert.equal(today.scheme.text, 'Monthly scheme limit reached');
});

test('credit: fits, does not fit, the order to protect, and what to collect', () => {
  const outlet = { credit: { limit: 5000, outstanding: 3000, overdue: 1500, overdueSinceDays: 20 } };
  // T was delivered in bulk a week ago and sells slowly: it runs out long after S.
  const orders = [...weekly({ S: 4 }), hOrder(addDays(DATE, -8), { T: 8 })];

  const fits = run({ outlet, orders }, { S: 2 }).credit;
  assert.deepEqual(fits, { known: true, available: 2000, bookedToday: 0, cartValue: 1000, fits: true, priority: ['S'], unlockByCollecting: 0, text: null });
  assert.equal(run({ outlet, orders }, { S: 4 }).credit.fits, true);          // exactly the room

  // T first in the cart, S runs out first: S leads. N has no history here: last.
  const tight = run({ outlet, orders }, { N: 1, T: 1, S: 6 }).credit;
  assert.equal(tight.cartValue, 900 + 600 + 3000);
  assert.equal(tight.fits, false);
  assert.deepEqual(tight.priority, ['S', 'T', 'N']);
  assert.equal(tight.unlockByCollecting, 1500);                                 // the whole overdue, less than the gap
  assert.equal(tight.text, 'Fits ₹2,000 — first: Product S (runs out first). Collect ₹1,500 to add the rest');
  const just = run({ outlet, orders }, { S: 5 }).credit;
  assert.equal(just.unlockByCollecting, 500);                                   // only the gap
  assert.match(just.text, /Collect ₹500 to add the rest$/);

  // No overdue: nothing to collect.
  const clean = run({ outlet: { credit: { limit: 5000, outstanding: 3000, overdue: 0 } }, orders }, { S: 6 }).credit;
  assert.equal(clean.fits, false);
  assert.equal(clean.unlockByCollecting, 0);
  assert.equal(clean.text, 'Fits ₹2,000 — first: Product S (runs out first)');
  // No credit record: not known, no banner.
  const unknown = run({ orders }, { S: 6 }).credit;
  assert.deepEqual([unknown.known, unknown.available, unknown.fits, unknown.text], [false, null, null, null]);
  // What was booked today uses the room.
  const booked = run({ outlet, orders, submitted: [{ id: 'D-1', outletId: 'X-1', date: DATE, value: 1500, lines: [{ sku: 'S', cases: 3 }] }] }, { S: 2 }).credit;
  assert.deepEqual([booked.bookedToday, booked.available, booked.fits], [1500, 500, false]);
});

test('badge: stock-up talk, covered, go light, check data', () => {
  assert.equal(run().outletBadge, 'stockup');
  assert.equal(run().state, 'active');
  assert.match(run().headline, /^Add ~\d+ cases · lasts till Wed 6 May$/);
  assert.equal(run({}, {}, { S: 20 }).outletBadge, 'covered');
  assert.equal(run({}, {}, { S: 20 }).state, 'quiet');
  // A small top-up (less than a week of sales) is not a stock-up talk, but the card still speaks.
  const topUp = run({}, {}, { S: 4 });
  assert.ok(lineOf(topUp, 'S').recommendedCases > 0 && lineOf(topUp, 'S').recommendedCases < RATE);
  assert.equal(topUp.outletBadge, 'covered');
  assert.equal(topUp.state, 'active');
  assert.match(topUp.headline, /^Top up ~/);
  assert.equal(run({ calendar: closure(4) }).outletBadge, 'golight');
  // Go light stays while the order is only in the cart, and gives way to covered once it is booked.
  const light = run({ calendar: closure(4) });
  const need = lineOf(light, 'S').recommendedCases;
  assert.equal(run({ calendar: closure(4) }, { S: need }).outletBadge, 'golight');
  const booked = [{ id: 'D-9', outletId: 'X-1', date: DATE, value: 1, lines: [{ sku: 'S', cases: need, freeCases: 0 }] }];
  assert.equal(run({ calendar: closure(4), submitted: booked }).outletBadge, 'covered');

  // No history at all: check data, calmly.
  const { data } = world();
  const empty = recommend({ outlet: data.outletsById['X-2'], cart: { lines: { S: 3 } }, visit: null, data, demoDate: DATE });
  assert.equal(empty.state, 'insufficient_data');
  assert.equal(empty.outletBadge, 'checkdata');
  assert.deepEqual(empty.lines, []);
  assert.deepEqual(empty.nudges, []);
  assert.deepEqual(empty.quickSets, { suggested: {}, minimum: {} });
  assert.equal(empty.pitch, '');
  assert.equal(empty.scheme, null);
  assert.equal(empty.window.days, 9);                                            // fallback horizon from the cadence
  assert.deepEqual(empty.horizon, { nextVisit: null, days: 8 });

  // No outlet: nothing to say, and nothing thrown for any odd input.
  const none = recommend({ outlet: null, cart: { lines: { S: 1 } }, data, demoDate: DATE });
  assert.equal(none.state, 'not_applicable');
  assert.equal(none.outletBadge, null);
  assert.equal(none.headline, null);
  assert.equal(none.horizon, null);
  assert.deepEqual(none.lines, []);
  for (const ctx of [undefined, null, {}, 7, 'x', [], { outlet: X1 }, { outlet: X1, data: {}, demoDate: DATE }, { outlet: X1, data, demoDate: 'soon' },
    { outlet: { id: 'X-404' }, data, demoDate: DATE }, { outlet: X1, data: { ...data, products: [null, { name: 'No sku' }, 5] }, demoDate: DATE },
    { outlet: X1, data: { ...data, calendar: null, distributorStock: 'x', config: null, clusterBenchmarks: [] }, demoDate: DATE },
    { outlet: X1, data, demoDate: DATE, cart: 'x', visit: 9 }, { outlet: X1, data, demoDate: DATE, visit: { stockOnHand: { S: 'many' } } }]) {
    let r;
    assert.doesNotThrow(() => { r = recommend(ctx); });
    assert.ok(Array.isArray(r.lines) && Array.isArray(r.nudges) && typeof r.pitch === 'string');
  }
});

// ---------------------------------------------------------------- added after the Stage 2 to 4 reviews

test('fix: the free cases follow the scheme’s freeCases field', () => {
  const two = evaluateSchemes({ A: 20 }, GOLD, [{ ...POOLED, freeCases: 2 }], PRODUCTS, DATE, [])[0];
  assert.equal(two.triggers, 2);
  assert.equal(two.freeCases, 4);
});

test('fix: only orders inside the scheme’s validity and up to the date use the monthly cap', () => {
  const late = { ...POOLED, validFrom: '2026-04-15', capPerMonth: 1 };
  const order = (date) => ({ id: 'H-' + date, outletId: 'F-1', date, lines: [{ sku: 'A', cases: 10, freeCases: 0 }] });
  // Same month, before the scheme started: it used no trigger.
  const before = evaluateSchemes({ A: 10 }, GOLD, [late], PRODUCTS, DATE, [order('2026-04-07')])[0];
  assert.equal(before.triggersUsedThisMonth, 0);
  assert.equal(before.freeCases, 1);
  // Same month, after the date being priced: it has not happened yet.
  const after = evaluateSchemes({ A: 10 }, GOLD, [late], PRODUCTS, DATE, [order('2026-04-29')])[0];
  assert.equal(after.triggersUsedThisMonth, 0);
  assert.equal(after.freeCases, 1);
  // On the date itself (an order booked earlier today) it counts.
  const today = evaluateSchemes({ A: 10 }, GOLD, [late], PRODUCTS, DATE, [order(DATE)])[0];
  assert.equal(today.triggersUsedThisMonth, 1);
  assert.equal(today.freeCases, 0);
  assert.equal(today.capReached, true);
});

test('fix: a not-pooled percentage scheme reports the gap and discounts only the lines that reach it', () => {
  const scheme = { ...PCT, pooled: false };
  const short = evaluateSchemes({ J: 3 }, GOLD, [scheme], PRODUCTS, DATE, [])[0];
  assert.equal(short.casesToNextTrigger, 2);
  assert.equal(short.discountValue, 0);

  const cart = { J: 3, K: 5 };
  const results = evaluateSchemes(cart, GOLD, [scheme], PRODUCTS, DATE, []);
  assert.equal(results[0].discountValue, 49);            // 8% of 5 × 122 = 48.8
  const priced = priceCart(cart, PRODUCTS, results);
  assert.equal(priced.lines.find((line) => line.sku === 'J').discount, 0);
  assert.equal(priced.lines.find((line) => line.sku === 'K').discount, 49);
  assert.equal(priced.discount, 49);
});

test('fix: a product with no price never takes the free case from a priced one', () => {
  for (const ptrCase of [null, '', true, undefined, 'abc']) {
    const products = PRODUCTS.map((p) => (p.sku === 'B' ? { ...p, ptrCase } : p));
    const result = evaluateSchemes({ A: 5, B: 5 }, GOLD, [POOLED], products, DATE, [])[0];
    assert.equal(result.freeCases, 1);
    assert.equal(result.freeSku, 'A', 'ptrCase ' + String(ptrCase));
  }
  // With nothing priced in the cart the unpriced product is all there is.
  const products = PRODUCTS.map((p) => (p.sku === 'B' ? { ...p, ptrCase: null } : p));
  assert.equal(evaluateSchemes({ B: 10 }, GOLD, [POOLED], products, DATE, [])[0].freeSku, 'B');
});

test('fix: the reason for an ineligible tier reads as two short sentences', () => {
  const reason = (segments) => evaluateSchemes({}, BRONZE, [{ ...POOLED, eligibleSegments: segments }], PRODUCTS, DATE, [])[0].reasonIfNot;
  assert.equal(reason(['Gold']), 'Only for Gold outlets. This outlet is Bronze');
  assert.equal(reason(['Gold', 'Silver']), 'Only for Gold and Silver outlets. This outlet is Bronze');
  assert.equal(reason(['Diamond', 'Gold', 'Silver']), 'Only for Diamond, Gold and Silver outlets. This outlet is Bronze');
  // The data view words it the same way.
  const data = fixtureData();
  for (const active of data.schemesActiveOn(DATE, BRONZE)) {
    const fromEngine = schemeFor(evaluateSchemes({}, BRONZE, SCHEMES, PRODUCTS, DATE, []), active.id);
    assert.equal(active.reasonIfNot, fromEngine.reasonIfNot);
  }
});

test('fix: the last order is the latest one up to the demo date', () => {
  const order = (date, cases) => ({ id: 'H-' + date, outletId: 'F-1', date, lines: [{ sku: 'A', cases, freeCases: 0, deliveredCases: cases }] });
  const build = (orders) => buildData({
    config: { schemaVersion: 1, demoDate: DATE }, outlets: [GOLD], products: PRODUCTS, orders,
    routePlan: {}, schemes: [], distributorStock: {}, calendar: {}, clusterBenchmarks: {},
  });
  const mixed = build([order(addDays(DATE, -7), 4), order(addDays(DATE, 3), 9)]);
  assert.equal(mixed.lastOrder('F-1').date, addDays(DATE, -7));
  assert.equal(mixed.lastOrder('F-1').cases, 4);
  assert.equal(build([order(addDays(DATE, 3), 9)]).lastOrder('F-1'), null);
  assert.equal(build([order(DATE, 2)]).lastOrder('F-1').cases, 2);
});

test('an order dated after the demo date is in no view of the history', () => {
  const order = (date, cases) => ({ id: 'H-' + date, outletId: 'F-1', date, lines: [{ sku: 'A', cases, freeCases: 0, deliveredCases: cases }] });
  const data = buildData({
    config: { schemaVersion: 1, demoDate: DATE }, outlets: [GOLD], products: PRODUCTS,
    orders: [order(addDays(DATE, -7), 4), order(DATE, 2), order(addDays(DATE, 1), 9), order(addDays(DATE, 30), 5)],
    routePlan: {}, schemes: [], distributorStock: {}, calendar: {}, clusterBenchmarks: {},
  });
  assert.deepEqual(data.ordersFor('F-1').map((o) => o.date), [addDays(DATE, -7), DATE]);
  const summary = data.orderSummary('F-1');
  assert.equal(summary.weeks[summary.weeks.length - 1].cases, 2);        // this week: the demo-date order only
  assert.equal(summary.totalCases, 4);                                   // completed weeks
  assert.equal(Object.values(data.weeklyCases('F-1')).reduce((a, b) => a + b, 0), 6);
  assert.equal(data.casesBetween('F-1', addDays(DATE, -30), addDays(DATE, 60)), 6);
});

test('available credit: limit less outstanding less what was booked today, never below 0', () => {
  const outlet = (id, credit) => ({ ...GOLD, id, credit });
  const raw = {
    config: { schemaVersion: 1, demoDate: DATE }, products: PRODUCTS, orders: [],
    outlets: [outlet('F-1', { limit: 4000, outstanding: 1600, overdue: 1600, overdueSinceDays: 75 }), outlet('F-2', { limit: 3000, outstanding: 0 }),
      outlet('F-3', { limit: null, outstanding: 0 }), outlet('F-4', undefined), outlet('F-5', { limit: 1000, outstanding: 5000 })],
    routePlan: {}, schemes: [], distributorStock: {}, calendar: {}, clusterBenchmarks: {},
  };
  const booked = (outletId, date, value) => ({ id: 'D-' + outletId + value, outletId, date, lines: [{ sku: 'A', cases: 1, freeCases: 0 }], value });
  const fresh = buildData(raw);
  assert.deepEqual(fresh.availableCredit('F-1'), { known: true, bookedToday: 0, available: 2400 });
  assert.deepEqual(fresh.availableCredit('F-3'), { known: false, bookedToday: 0, available: null });
  assert.deepEqual(fresh.availableCredit('F-4'), { known: false, bookedToday: 0, available: null });
  assert.deepEqual(fresh.availableCredit('F-5'), { known: true, bookedToday: 0, available: 0 });
  assert.deepEqual(fresh.availableCredit('nobody'), { known: false, bookedToday: 0, available: null });

  const later = buildData(raw, [booked('F-1', DATE, 952), booked('F-1', DATE, 500), booked('F-2', DATE, 1530), booked('F-2', DATE, 1530),
    booked('F-1', addDays(DATE, -1), 9999), booked('F-1', DATE, null), booked('F-1', DATE, 'abc')]);
  assert.deepEqual(later.availableCredit('F-1'), { known: true, bookedToday: 1452, available: 948 });   // other days and bad values do not count
  assert.deepEqual(later.availableCredit('F-2'), { known: true, bookedToday: 3060, available: 0 });
  assert.equal(later.availableCredit('F-5').available, 0);
});

// ---------------------------------------------------------------- sweep over the real data

function readRealRaw() {
  const raw = {};
  for (const key of Object.keys(DATA_FILES)) {
    raw[key] = JSON.parse(readFileSync(fileURLToPath(new URL('../data/' + DATA_FILES[key], import.meta.url)), 'utf8'));
  }
  return raw;
}

function readRealData() {
  return buildData(readRealRaw());
}

const STATUSES = ['missing', 'short', 'right', 'over', 'none_needed', 'unavailable'];
const STATES = ['active', 'quiet', 'insufficient_data', 'not_applicable'];
const BADGES = ['stockup', 'covered', 'golight', 'checkdata', null];
const FLAGS = ['supply_out', 'supply_low', 'supply_rationed', 'glass_cap', 'visit_gap', 'closure', 'event', 'in_transit', 'stock_checked', 'peer', 'ignored_weeks'];
// Words that must never reach the screen (04 §Q.6).
const BANNED = /\b(forecast|P80|CV|algorithm|AI|prediction|predicted|target)\b/;

// Every string the screens may show from one result.
function textsOf(r) {
  const out = [r.headline, r.pitch, r.window && r.window.flag, r.credit && r.credit.text];
  if (r.scheme) out.push(r.scheme.text, r.scheme.honestNote, r.scheme.nudge && r.scheme.nudge.text);
  for (const nudge of r.nudges) out.push(nudge.text);
  for (const line of r.lines) {
    out.push(line.hint, line.reasonShort, line.confidenceText, ...line.why.talkingPoints);
    for (const item of [...line.why.facts, ...line.why.steps]) out.push(item.label, item.value);
  }
  return out.filter((text) => text !== null && text !== undefined && text !== false);
}

// The checks that hold for every result, whatever the cart.
function checkResult(r, outlet, cart, data, label) {
  assert.equal(r.engineVersion, 'v1-cover', label);
  assert.ok(STATES.includes(r.state), label + ' state ' + r.state);
  assert.ok(BADGES.includes(r.outletBadge), label + ' badge ' + r.outletBadge);
  assert.ok(typeof r.headline === 'string' && r.headline.length > 0 && r.headline.length <= 60, label + ' headline: ' + r.headline);
  assert.ok(typeof r.pitch === 'string' && r.pitch.length <= 150, label + ' pitch: ' + r.pitch);
  assert.ok(r.horizon.days >= 1 && r.window.days >= 1 && r.window.days <= 15 && r.window.days <= r.window.horizonDays, label + ' window');
  assert.equal(r.window.capped, r.window.horizonDays > 15, label);   // 14 days of visit gap plus 1 day of delivery lead
  assert.equal(r.window.flag !== null, r.window.capped, label);
  const empties = outlet.glass && typeof outlet.glass === 'object' && Number.isFinite(Number(outlet.glass.emptiesOnHand)) ? Number(outlet.glass.emptiesOnHand) : null;
  const order = data.products.map((product) => product.sku);
  assert.deepEqual(r.lines.map((line) => line.sku), order.filter((sku) => r.lines.some((line) => line.sku === sku)), label + ' line order');
  assert.ok(r.lines.filter((line) => line.isKey).length <= 4, label + ' key lines');
  for (const line of r.lines) {
    const at = label + ' ' + line.sku;
    const product = data.productsBySku[line.sku];
    assert.ok(product, at + ' unknown sku');
    assert.ok(STATUSES.includes(line.status), at + ' status ' + line.status);
    for (const n of [line.recommendedCases, line.rangeLow, line.rangeHigh]) assert.ok(Number.isInteger(n) && n >= 0, at + ' whole numbers');
    assert.ok(line.rangeLow <= line.recommendedCases && line.recommendedCases <= line.rangeHigh, `${at} ${line.rangeLow} ≤ ${line.recommendedCases} ≤ ${line.rangeHigh}`);
    assert.equal(line.cartCases, cartLines(cart)[line.sku] || 0, at);
    assert.ok(typeof line.hint === 'string' && line.hint.length > 0 && line.hint.length <= 48, at + ' hint: ' + line.hint);
    assert.ok(typeof line.reasonShort === 'string' && line.reasonShort.length > 0 && line.reasonShort.length <= 50, at + ' reason: ' + line.reasonShort);
    assert.ok(['high', 'medium', 'low'].includes(line.confidence), at);
    assert.ok(line.confidenceText.toLowerCase().startsWith(line.confidence + ' · '), at + ' ' + line.confidenceText);
    assert.ok(line.flags.every((flag) => FLAGS.includes(flag)), at + ' flags ' + line.flags);
    assert.ok(line.lastsTill === null || /^\d{4}-\d{2}-\d{2}$/.test(line.lastsTill), at + ' lastsTill');
    assert.equal(line.why.facts.length, 6, at);
    assert.ok(line.why.talkingPoints.length <= 3 && line.why.steps.length >= 3 && line.why.steps.length <= 4, at + ' why');
    // Status against the three numbers, first match wins.
    const expected = line.flags.includes('supply_out') ? 'unavailable'
      : line.cartCases === 0 ? (line.recommendedCases > 0 ? 'missing' : 'none_needed')
        : line.cartCases < line.rangeLow ? 'short' : line.cartCases > line.rangeHigh ? 'over' : 'right';
    assert.equal(line.status, expected, at + ' status');
    // Caps: an unavailable product is never recommended; glass never beyond the empties.
    if (line.status === 'unavailable') assert.deepEqual([line.rangeLow, line.recommendedCases, line.rangeHigh], [0, 0, 0], at + ' unavailable');
    assert.equal(line.substitute !== null && line.status !== 'unavailable', false, at + ' substitute only when unavailable');
    if (product.returnable === true && empties !== null) assert.ok(line.rangeHigh <= empties, `${at} glass ${line.rangeHigh} > ${empties}`);
  }
  for (const sku of Object.keys(r.quickSets.suggested)) assert.equal(r.quickSets.suggested[sku], r.lines.find((line) => line.sku === sku).recommendedCases, label);
  for (const sku of Object.keys(r.quickSets.minimum)) assert.equal(r.quickSets.minimum[sku], r.lines.find((line) => line.sku === sku).rangeLow, label);
  const key = r.lines.filter((line) => line.isKey);
  assert.equal(r.state === 'quiet', key.every((line) => ['right', 'none_needed', 'unavailable'].includes(line.status)), label + ' quiet');
  if (r.scheme) {
    assert.ok(r.scheme.nudge === null || r.scheme.honestNote === null, label + ' nudge or note, never both');
    if (!r.scheme.eligible || r.scheme.capReached) assert.deepEqual([r.scheme.nudge, r.scheme.honestNote], [null, null], label + ' silent scheme');
    if (r.scheme.nudge) assert.ok(r.scheme.nudge.text.length <= 60, label + ' scheme nudge');
  }
  assert.equal(r.credit.text !== null, r.credit.fits === false, label + ' credit text');
  for (const text of textsOf(r)) {
    assert.equal(typeof text, 'string', label + ' text');
    assert.ok(!BANNED.test(text), label + ' banned word in: ' + text);
    assert.ok(!/undefined|NaN|null|Infinity|\[object/.test(text), label + ' broken text: ' + text);
  }
}

test('real data: every outlet, three carts', () => {
  const data = readRealData();
  const demoDate = data.demoDate;
  assert.ok(data.outlets.length > 0);
  assert.ok(data.products.length > 0);

  for (const outlet of data.outlets) {
    // An empty cart, one case of every product, and well over the suggestion plus an unknown sku.
    const oneEach = {};
    for (const product of data.products) oneEach[product.sku] = 1;
    const suggested = { 'NOT-A-SKU': 4 };
    for (const line of recommend({ outlet, cart: null, visit: null, data, demoDate }).lines) {
      suggested[line.sku] = line.recommendedCases * 3 + 2;
    }

    for (const lines of [{}, oneEach, suggested]) {
      const cart = { outletId: outlet.id, lines };
      const ctx = { outlet, cart, visit: { outletId: outlet.id, startedAt: demoDate, stockOnHand: {} }, data, demoDate };
      const r = recommend(ctx);
      assert.deepEqual(recommend(ctx), r, outlet.id + ': same input, same result');
      checkResult(r, outlet, cart, data, outlet.id);
      assert.equal(r.explain.steps.length, r.lines.filter((line) => line.isKey).length);
      assert.equal(r.explain.inputs.outletId, outlet.id);

      // Schemes and pricing hold together on the same cart.
      const month = demoDate.slice(0, 7);
      const monthOrders = data.ordersFor(outlet.id).filter((order) => order.date.slice(0, 7) === month);
      const results = evaluateSchemes(cart, outlet, data.schemes, data.products, demoDate, monthOrders);
      assert.deepEqual(evaluateSchemes(cart, outlet, data.schemes, data.products, demoDate, monthOrders), results);
      assert.deepEqual(results.map((s) => s.schemeId), data.schemesActiveOn(demoDate, outlet).map((s) => s.id));
      const priced = priceCart(cart, data.products, results);
      assert.equal(r.credit.cartValue, priced.netValue, outlet.id + ' credit uses the priced cart');
      let free = 0;
      let discount = 0;
      for (const s of results) {
        assert.equal(s.eligible, data.schemesActiveOn(demoDate, outlet).find((a) => a.id === s.schemeId).eligible);
        assert.ok(s.triggers >= 0 && s.freeCases >= 0 && s.discountValue >= 0);
        assert.ok(s.capPerMonth === null || s.triggersUsedThisMonth + s.triggers <= s.capPerMonth);
        assert.equal(s.freeSku !== null, s.freeCases > 0);
        free += s.freeCases;
        discount += s.discountValue;
      }
      assert.equal(priced.freeCases, free);
      assert.equal(priced.discount, discount);
      assert.equal(priced.netValue, priced.grossValue - discount);
      assert.equal(priced.lines.length, Object.keys(cartLines(cart)).length);
      assert.equal(priced.cases, priced.lines.reduce((sum, line) => sum + line.cases, 0));
    }
  }
});

// A small seeded generator (mulberry32): the same carts on every run, no Math.random.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('property: every outlet × 300 seeded random carts', () => {
  const data = readRealData();
  const demoDate = data.demoDate;
  const skus = data.products.map((product) => product.sku);
  let calls = 0;
  let spent = 0n;
  const timed = (ctx) => {
    const from = process.hrtime.bigint();
    const r = recommend(ctx);
    spent += process.hrtime.bigint() - from;
    calls += 1;
    return r;
  };

  data.outlets.forEach((outlet, index) => {
    const next = seeded(20260428 + index * 7919);
    const int = (max) => Math.floor(next() * (max + 1));
    for (let i = 0; i < 300; i += 1) {
      // A cart: each product with a chance that changes from cart to cart; mostly small numbers, sometimes huge.
      const fill = next();
      const lines = {};
      for (const sku of skus) {
        if (next() > fill) continue;
        const kind = next();
        lines[sku] = kind < 0.03 ? 999 : kind < 0.15 ? int(40) : int(8);
      }
      if (next() < 0.1) lines['NOT-A-SKU'] = int(5);
      // Sometimes the rep has counted the stock of a few products.
      const stockOnHand = {};
      if (next() < 0.5) for (const sku of skus) if (next() < 0.3) stockOnHand[sku] = next() < 0.1 ? null : int(6);
      const cart = { outletId: outlet.id, lines };
      const visit = { outletId: outlet.id, startedAt: demoDate, stockOnHand };
      const ctx = { outlet, cart, visit, data, demoDate };
      const label = `${outlet.id} cart ${i}`;

      let r;
      assert.doesNotThrow(() => { r = timed(ctx); }, label);
      checkResult(r, outlet, cart, data, label);
      assert.equal(JSON.stringify(timed(ctx)), JSON.stringify(r), label + ': same input, same JSON');

      // The cart changes the status and the words, never the three numbers or the quick sets.
      const bare = timed({ outlet, cart: { outletId: outlet.id, lines: {} }, visit, data, demoDate });
      assert.deepEqual(r.quickSets, bare.quickSets, label + ': quick sets do not depend on the cart');
      assert.deepEqual(r.lines.map((l) => [l.sku, l.rangeLow, l.recommendedCases, l.rangeHigh, l.isKey]),
        bare.lines.map((l) => [l.sku, l.rangeLow, l.recommendedCases, l.rangeHigh, l.isKey]), label + ': numbers do not depend on the cart');

      // One more counted case of one product never raises its recommendation, its low or its high.
      if (r.lines.length && i % 3 === 0) {
        const line = r.lines[int(r.lines.length - 1)];
        const base = int(6);
        const less = timed({ ...ctx, visit: { ...visit, stockOnHand: { ...stockOnHand, [line.sku]: base } } }).lines.find((l) => l.sku === line.sku);
        const more = timed({ ...ctx, visit: { ...visit, stockOnHand: { ...stockOnHand, [line.sku]: base + 1 + int(3) } } }).lines.find((l) => l.sku === line.sku);
        assert.ok(more.recommendedCases <= less.recommendedCases, `${label} ${line.sku}: ${more.recommendedCases} > ${less.recommendedCases} with more stock`);
        assert.ok(more.rangeLow <= less.rangeLow && more.rangeHigh <= less.rangeHigh, `${label} ${line.sku}: range rises with stock`);
        assert.equal(less.stock.counted, true);
      }
    }

    // The same, swept: counted stock 0 to 15 on every candidate.
    const lines = recommend({ outlet, cart: null, visit: null, data, demoDate }).lines;
    for (const line of lines) {
      let last = Infinity;
      for (let cases = 0; cases <= 15; cases += 1) {
        const now = recommend({ outlet, cart: null, visit: { outletId: outlet.id, stockOnHand: { [line.sku]: cases } }, data, demoDate }).lines.find((l) => l.sku === line.sku);
        assert.ok(now.recommendedCases <= last, `${outlet.id} ${line.sku} at ${cases}`);
        last = now.recommendedCases;
      }
    }
    // Submitting the suggestion leaves nothing to add on the lines it covered.
    const suggestion = recommend({ outlet, cart: null, visit: null, data, demoDate }).quickSets.suggested;
    if (Object.keys(suggestion).length) {
      const raw = readRealRaw();
      const after = buildData(raw, [{ id: 'D-1', outletId: outlet.id, date: demoDate, lines: suggestion }]);
      const again = recommend({ outlet: after.outletsById[outlet.id], cart: null, visit: null, data: after, demoDate });
      for (const sku of Object.keys(suggestion)) assert.equal(again.lines.find((l) => l.sku === sku).recommendedCases, 0, outlet.id + ' ' + sku + ' after submit');
      assert.equal(again.outletBadge, 'covered', outlet.id + ' after submit');
      assert.equal(again.state, 'quiet', outlet.id + ' after submit');
    }
  });

  const average = Number(spent) / 1e6 / calls;
  assert.ok(calls >= data.outlets.length * 300 * 3);
  assert.ok(average < 16, `one call takes ${average.toFixed(2)} ms on average`);
});

test('few orders: a line that leans on similar shops says so; an outlet with a long history does not', () => {
  const peers = { kc: { single: curve(() => 1) }, level: { kc: { S: 4 } } };
  const few = lineOf(run({ benchmarks: peers, orders: weekly({ S: 4 }, 5) }), 'S');
  assert.ok(few.flags.includes('peer'));
  assert.equal(few.reasonShort, 'Few orders here · leans on similar shops');
  assert.ok(few.why.talkingPoints.includes('Few orders here, so this leans on shops like this one.'));
  const old = lineOf(run({ benchmarks: peers }), 'S');
  assert.notEqual(old.reasonShort, few.reasonShort);
  assert.ok(!old.why.talkingPoints.some((point) => /Few orders/.test(point)));
  // Plain words in the sheet: the right plural, and no trade shorthand.
  const single = lineOf(run({ orders: weekly({ S: 1 }) }), 'S');
  assert.equal(single.why.facts.find((fact) => fact.label === 'Last 4 weeks').value, '1 case a week');
  assert.equal(single.why.steps[0].value, 'About 1 case a week over the last 4 weeks.');
  for (const text of [...single.why.facts, ...single.why.steps].map((item) => item.value)) assert.ok(!/supply-out|×/.test(text), text);
});

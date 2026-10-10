// Store tests: the reasons picked for order lines. Run: node --test tests/store.test.mjs (from prototype/).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createStore, reduce, initialState, PREFIX } from '../js/store.js';

const DATE = '2026-04-28';

function fakeStorage() {
  const map = new Map();
  return {
    get length() { return map.size; },
    key(index) { return Array.from(map.keys())[index] ?? null; },
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); },
    json(key) { return map.has(key) ? JSON.parse(map.get(key)) : null; },
    keys() { return Array.from(map.keys()); },
  };
}

function open(storage) {
  return createStore({ storage, demoDate: DATE, schemaVersion: 1 });
}

test('a fresh visit has no reasons', () => {
  assert.deepEqual(initialState().visit.reasons, {});
  const store = open(fakeStorage());
  store.dispatch({ type: 'outlet/select', outletId: 'O1' });
  assert.deepEqual(store.getState().visit.reasons, {});
});

test('visit/setReason sets, replaces and clears one reason per sku', () => {
  const store = open(fakeStorage());
  store.dispatch({ type: 'outlet/select', outletId: 'O1' });
  store.dispatch({ type: 'visit/setReason', sku: 'A', reason: 'retailer_asked' });
  store.dispatch({ type: 'visit/setReason', sku: 'B', reason: 'cash_tight' });
  assert.deepEqual(store.getState().visit.reasons, { A: 'retailer_asked', B: 'cash_tight' });
  store.dispatch({ type: 'visit/setReason', sku: 'A', reason: 'event' });
  assert.equal(store.getState().visit.reasons.A, 'event');
  store.dispatch({ type: 'visit/setReason', sku: 'A', reason: null });
  assert.deepEqual(store.getState().visit.reasons, { B: 'cash_tight' });
});

test('visit/setReason keeps the same state object when nothing changes, and ignores odd input', () => {
  const store = open(fakeStorage());
  store.dispatch({ type: 'visit/setReason', sku: 'A', reason: 'event' });   // no outlet yet
  assert.deepEqual(store.getState().visit.reasons, {});
  store.dispatch({ type: 'outlet/select', outletId: 'O1' });
  store.dispatch({ type: 'visit/setReason', sku: 'A', reason: 'event' });
  const before = store.getState();
  store.dispatch({ type: 'visit/setReason', sku: 'A', reason: 'event' });
  store.dispatch({ type: 'visit/setReason', sku: 'Z', reason: null });
  store.dispatch({ type: 'visit/setReason', reason: 'event' });
  assert.equal(store.getState(), before);
  store.dispatch({ type: 'visit/setReason', sku: 'A', reason: 42 });        // not a string: clears
  assert.deepEqual(store.getState().visit.reasons, {});
});

test('a reason does not touch the cart or the stock check', () => {
  const store = open(fakeStorage());
  store.dispatch({ type: 'outlet/select', outletId: 'O1' });
  store.dispatch({ type: 'cart/setQty', sku: 'A', cases: 3 });
  store.dispatch({ type: 'visit/setStock', sku: 'A', cases: 2 });
  const { cart, visit } = store.getState();
  store.dispatch({ type: 'visit/setReason', sku: 'A', reason: 'event' });
  assert.equal(store.getState().cart, cart);
  assert.notEqual(store.getState().visit, visit);
  assert.deepEqual(store.getState().visit.stockOnHand, { A: 2 });
});

test('reasons are saved with the visit and come back on outlet/select, also in a new store', () => {
  const storage = fakeStorage();
  const store = open(storage);
  store.dispatch({ type: 'outlet/select', outletId: 'O1' });
  store.dispatch({ type: 'visit/setStock', sku: 'A', cases: 4 });
  store.dispatch({ type: 'visit/setReason', sku: 'A', reason: 'event' });
  assert.deepEqual(storage.json(PREFIX + 'visit:O1').reasons, { A: 'event' });

  store.dispatch({ type: 'outlet/select', outletId: 'O2' });
  assert.deepEqual(store.getState().visit.reasons, {});
  store.dispatch({ type: 'outlet/select', outletId: 'O1' });
  assert.deepEqual(store.getState().visit.reasons, { A: 'event' });

  const second = open(storage);
  second.dispatch({ type: 'outlet/select', outletId: 'O1' });
  assert.deepEqual(second.getState().visit.reasons, { A: 'event' });
  assert.deepEqual(second.getState().visit.stockOnHand, { A: 4 });
});

test('a saved visit with broken reasons is restored clean', () => {
  const storage = fakeStorage();
  open(storage).dispatch({ type: 'session/login', repName: 'R' });   // writes meta
  storage.setItem(PREFIX + 'visit:O1', JSON.stringify({ outletId: 'O1', startedAt: DATE, stockOnHand: {}, reasons: { A: 'event', B: 7, C: '', D: null } }));
  storage.setItem(PREFIX + 'visit:O2', JSON.stringify({ outletId: 'O2', startedAt: DATE, stockOnHand: {}, reasons: 'nope' }));
  const store = open(storage);
  store.dispatch({ type: 'outlet/select', outletId: 'O1' });
  assert.deepEqual(store.getState().visit.reasons, { A: 'event' });
  store.dispatch({ type: 'outlet/select', outletId: 'O2' });
  assert.deepEqual(store.getState().visit.reasons, {});
});

test('order/submit clears the reasons of that outlet, keeps its stock check and the extra order fields', () => {
  const storage = fakeStorage();
  const store = open(storage);
  store.dispatch({ type: 'outlet/select', outletId: 'O1' });
  store.dispatch({ type: 'cart/setQty', sku: 'A', cases: 9 });
  store.dispatch({ type: 'visit/setStock', sku: 'A', cases: 1 });
  store.dispatch({ type: 'visit/setReason', sku: 'A', reason: 'retailer_asked' });
  const visit = store.getState().visit;
  store.dispatch({
    type: 'order/submit',
    order: { outletId: 'O1', lines: [{ sku: 'A', cases: 9, freeCases: 0 }], value: 100, reasons: { ...visit.reasons }, stockOnHand: { ...visit.stockOnHand } },
  });
  const state = store.getState();
  assert.deepEqual(state.visit.reasons, {});
  assert.deepEqual(state.visit.stockOnHand, { A: 1 });
  assert.deepEqual(state.cart.lines, {});
  assert.deepEqual(state.submittedOrders[0].reasons, { A: 'retailer_asked' });
  assert.deepEqual(state.submittedOrders[0].stockOnHand, { A: 1 });
  assert.deepEqual(storage.json(PREFIX + 'visit:O1').reasons, {});
  assert.deepEqual(storage.json(PREFIX + 'visit:O1').stockOnHand, { A: 1 });
  assert.deepEqual(storage.json(PREFIX + 'submittedOrders')[0].reasons, { A: 'retailer_asked' });
});

test('order/submit for an outlet that is not open clears its saved reasons only', () => {
  const storage = fakeStorage();
  const store = open(storage);
  store.dispatch({ type: 'outlet/select', outletId: 'O1' });
  store.dispatch({ type: 'visit/setStock', sku: 'A', cases: 2 });
  store.dispatch({ type: 'visit/setReason', sku: 'A', reason: 'event' });
  store.dispatch({ type: 'outlet/select', outletId: 'O2' });
  store.dispatch({ type: 'visit/setReason', sku: 'B', reason: 'other' });
  store.dispatch({ type: 'order/submit', order: { outletId: 'O1', lines: [{ sku: 'A', cases: 1 }] } });
  assert.deepEqual(store.getState().visit.reasons, { B: 'other' });
  assert.deepEqual(storage.json(PREFIX + 'visit:O1').reasons, {});
  assert.deepEqual(storage.json(PREFIX + 'visit:O1').stockOnHand, { A: 2 });
});

test('a rejected (empty) order keeps the reasons', () => {
  const store = open(fakeStorage());
  store.dispatch({ type: 'outlet/select', outletId: 'O1' });
  store.dispatch({ type: 'visit/setReason', sku: 'A', reason: 'event' });
  store.dispatch({ type: 'order/submit', order: { outletId: 'O1', lines: [] } });
  assert.deepEqual(store.getState().visit.reasons, { A: 'event' });
  assert.equal(store.getState().submittedOrders.length, 0);
});

test('demo/reset clears reasons and every saved key', () => {
  const storage = fakeStorage();
  const store = open(storage);
  store.dispatch({ type: 'outlet/select', outletId: 'O1' });
  store.dispatch({ type: 'visit/setReason', sku: 'A', reason: 'event' });
  store.dispatch({ type: 'demo/reset' });
  assert.deepEqual(store.getState().visit.reasons, {});
  assert.equal(storage.keys().filter((key) => key.startsWith(PREFIX)).length, 0);
});

test('the reducer is pure for visit/setReason', () => {
  const start = reduce(initialState(), { type: 'outlet/select', outletId: 'O1' }, { demoDate: DATE });
  const frozen = JSON.stringify(start);
  const next = reduce(start, { type: 'visit/setReason', sku: 'A', reason: ' event ' }, { demoDate: DATE });
  assert.equal(JSON.stringify(start), frozen);
  assert.deepEqual(next.visit.reasons, { A: 'event' });
});

// App state: one state object, a pure reducer, synchronous subscribers and persistence
// under the 'gtdemo:' prefix. No DOM access; storage is injected or resolved lazily, and
// every storage call is guarded, so the app keeps working in memory when storage fails.

export const PREFIX = 'gtdemo:';

const KEY_META = PREFIX + 'meta';
const KEY_SESSION = PREFIX + 'session';
const KEY_ORDERS = PREFIX + 'submittedOrders';
const KEY_CART = PREFIX + 'cart:';
const KEY_VISIT = PREFIX + 'visit:';

const MAX_CASES = 999;

// ---------------------------------------------------------------- state and reducer

export function initialState() {
  return {
    session: { loggedIn: false, repName: null },
    currentOutletId: null,
    cart: { outletId: null, lines: {} },
    // FEATURE-SLOT: in-visit inputs live in the visit: the stock check in visit.stockOnHand,
    // the reason picked for an order line in visit.reasons ({ [sku]: reasonCode }).
    visit: { outletId: null, startedAt: null, stockOnHand: {}, reasons: {} },
    submittedOrders: [],
  };
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isId(value) {
  return (typeof value === 'string' && value !== '') || (typeof value === 'number' && Number.isFinite(value));
}

function warn(message) {
  if (typeof console !== 'undefined' && console.warn) console.warn('[store] ' + message);
}

// Whole number 0–999, or null when the input is not a number.
function clampCases(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(MAX_CASES, Math.round(n)));
}

// { [sku]: cases } or [{ sku, cases }] → a clean { [sku]: cases } with no zero lines.
function cleanLines(lines) {
  const out = {};
  if (Array.isArray(lines)) {
    for (const line of lines) {
      if (!isObject(line) || !isId(line.sku)) continue;
      const cases = clampCases(line.cases);
      if (cases) out[line.sku] = cases;
    }
  } else if (isObject(lines)) {
    for (const sku of Object.keys(lines)) {
      const cases = clampCases(lines[sku]);
      if (cases) out[sku] = cases;
    }
  }
  return out;
}

function cleanStock(stockOnHand) {
  const out = {};
  if (!isObject(stockOnHand)) return out;
  for (const sku of Object.keys(stockOnHand)) {
    const value = stockOnHand[sku];
    const n = Number(value);
    out[sku] = value === null || value === '' || !Number.isFinite(n) ? null : Math.max(0, n);
  }
  return out;
}

const MAX_REASON = 40;

// A reason code: a short non-empty string, or null (which clears it).
function cleanReason(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text === '' || text.length > MAX_REASON ? null : text;
}

// { [sku]: reasonCode } with only the valid entries.
function cleanReasons(reasons) {
  const out = {};
  if (!isObject(reasons)) return out;
  for (const sku of Object.keys(reasons)) {
    const reason = cleanReason(reasons[sku]);
    if (reason !== null) out[sku] = reason;
  }
  return out;
}

function withLine(lines, sku, cases) {
  const next = { ...lines };
  if (cases > 0) next[sku] = cases;
  else delete next[sku];
  return next;
}

function freshCart(outletId) {
  return { outletId, lines: {} };
}

function freshVisit(outletId, demoDate) {
  return { outletId, startedAt: demoDate === undefined ? null : demoDate, stockOnHand: {}, reasons: {} };
}

function compactDate(iso) {
  return typeof iso === 'string' ? iso.split('-').join('') : '';
}

// Pure. ctx = { demoDate }. The store also passes ctx.saved = { cart, visit } on
// 'outlet/select' (what it has stored for that outlet), which keeps storage out of here.
export function reduce(state, action, ctx) {
  const context = isObject(ctx) ? ctx : {};
  const demoDate = context.demoDate === undefined ? null : context.demoDate;
  if (!isObject(state)) state = initialState();
  if (!isObject(action) || typeof action.type !== 'string') return state;

  const needsOutlet = action.type.startsWith('cart/') || action.type.startsWith('visit/');
  if (needsOutlet && !isId(state.currentOutletId)) {
    warn(action.type + ' ignored: no outlet is selected');
    return state;
  }

  switch (action.type) {
    case 'session/login': {
      const repName = action.repName === undefined || action.repName === null ? null : String(action.repName);
      return { ...state, session: { loggedIn: true, repName } };
    }

    case 'session/logout':
      return { ...state, session: { loggedIn: false, repName: null } };

    case 'outlet/select': {
      const outletId = isId(action.outletId) ? action.outletId : null;
      if (outletId === null) {
        return { ...state, currentOutletId: null, cart: freshCart(null), visit: freshVisit(null, null) };
      }
      const saved = isObject(context.saved) ? context.saved : {};
      let cart;
      if (state.cart.outletId === outletId) cart = state.cart;
      else if (isObject(saved.cart)) cart = { outletId, lines: cleanLines(saved.cart.lines) };
      else cart = freshCart(outletId);
      let visit;
      if (state.visit.outletId === outletId) visit = state.visit;
      else if (isObject(saved.visit)) {
        visit = {
          outletId,
          startedAt: typeof saved.visit.startedAt === 'string' ? saved.visit.startedAt : demoDate,
          stockOnHand: cleanStock(saved.visit.stockOnHand),
          reasons: cleanReasons(saved.visit.reasons),
        };
      } else visit = freshVisit(outletId, demoDate);
      if (state.currentOutletId === outletId && cart === state.cart && visit === state.visit) return state;
      return { ...state, currentOutletId: outletId, cart, visit };
    }

    case 'cart/setQty': {
      const cases = clampCases(action.cases);
      if (!isId(action.sku) || cases === null) {
        warn('cart/setQty ignored: needs a sku and a number of cases');
        return state;
      }
      return { ...state, cart: { ...state.cart, lines: withLine(state.cart.lines, action.sku, cases) } };
    }

    case 'cart/add': {
      const delta = Number(action.delta);
      if (!isId(action.sku) || !Number.isFinite(delta)) {
        warn('cart/add ignored: needs a sku and a numeric delta');
        return state;
      }
      const current = clampCases(state.cart.lines[action.sku]) || 0;
      const cases = clampCases(current + delta);
      return { ...state, cart: { ...state.cart, lines: withLine(state.cart.lines, action.sku, cases) } };
    }

    case 'cart/remove': {
      if (!Object.prototype.hasOwnProperty.call(state.cart.lines, action.sku)) return state;
      return { ...state, cart: { ...state.cart, lines: withLine(state.cart.lines, action.sku, 0) } };
    }

    case 'cart/clear':
      return { ...state, cart: { ...state.cart, lines: {} } };

    case 'cart/replace':
      return { ...state, cart: { ...state.cart, lines: cleanLines(action.lines) } };

    case 'visit/setStock': {
      if (!isId(action.sku)) {
        warn('visit/setStock ignored: needs a sku');
        return state;
      }
      const n = Number(action.cases);
      const cases = action.cases === null || action.cases === undefined || action.cases === '' || !Number.isFinite(n)
        ? null
        : Math.max(0, n);
      return { ...state, visit: { ...state.visit, stockOnHand: { ...state.visit.stockOnHand, [action.sku]: cases } } };
    }

    // reason: a short string, or null to clear the reason of that line.
    case 'visit/setReason': {
      if (!isId(action.sku)) {
        warn('visit/setReason ignored: needs a sku');
        return state;
      }
      const current = isObject(state.visit.reasons) ? state.visit.reasons : {};
      const reason = cleanReason(action.reason);
      const has = Object.prototype.hasOwnProperty.call(current, action.sku);
      if (reason === null ? !has : current[action.sku] === reason) return state;
      const reasons = { ...current };
      if (reason === null) delete reasons[action.sku];
      else reasons[action.sku] = reason;
      return { ...state, visit: { ...state.visit, reasons } };
    }

    case 'order/submit': {
      const input = isObject(action.order) ? action.order : {};
      const outletId = isId(input.outletId) ? input.outletId : state.currentOutletId;
      if (!isId(outletId)) {
        warn('order/submit ignored: the order has no outletId and no outlet is selected');
        return state;
      }
      const date = typeof input.date === 'string' && input.date !== '' ? input.date : demoDate;
      const sequence = state.submittedOrders.filter((order) => order.outletId === outletId).length + 1;
      let lines = input.lines;
      if (lines === undefined || lines === null) {
        const source = state.cart.outletId === outletId ? state.cart.lines : {};
        lines = Object.keys(source).map((sku) => ({ sku, cases: source[sku], freeCases: 0 }));
      }
      // An order with no booked cases is not an order: it must not mark the outlet visited.
      if (!Object.keys(cleanLines(lines)).length) {
        warn('order/submit ignored: the order has no line with cases above 0');
        return state;
      }
      const order = {
        ...input,
        id: isId(input.id) ? input.id : 'D-' + outletId + '-' + compactDate(date) + '-' + sequence,
        outletId,
        date,
        lines,
        value: input.value === undefined ? null : input.value,
        recommendationSnapshot: input.recommendationSnapshot === undefined ? null : input.recommendationSnapshot,
      };
      const next = { ...state, submittedOrders: state.submittedOrders.concat([order]) };
      if (state.cart.outletId === outletId) next.cart = { ...state.cart, lines: {} };
      // The reasons belonged to this order. The stock the rep counted stays for the visit.
      if (state.visit.outletId === outletId && isObject(state.visit.reasons) && Object.keys(state.visit.reasons).length) {
        next.visit = { ...state.visit, reasons: {} };
      }
      return next;
    }

    case 'demo/reset':
      return initialState();

    default:
      return state;
  }
}

// ---------------------------------------------------------------- storage

function memoryStorage() {
  const map = new Map();
  return {
    get length() { return map.size; },
    key(index) { return Array.from(map.keys())[index] ?? null; },
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); },
  };
}

// The browser's localStorage, or null when it is missing or access to it throws.
function defaultStorage() {
  try {
    const candidate = typeof globalThis !== 'undefined' ? globalThis.localStorage : undefined;
    if (candidate && typeof candidate.getItem === 'function' && typeof candidate.setItem === 'function') return candidate;
  } catch (error) {
    // access denied (private mode, sandboxed frame): fall through to memory
  }
  return null;
}

function demoKeysOf(storage) {
  const keys = [];
  try {
    if (typeof storage.key === 'function' && typeof storage.length === 'number') {
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (typeof key === 'string') keys.push(key);
      }
    } else {
      keys.push(...Object.keys(storage));
    }
  } catch (error) {
    // unreadable storage: nothing to list
  }
  return keys.filter((key) => key.startsWith(PREFIX));
}

// Removes every key starting with 'gtdemo:'. Other keys are left alone. Never throws.
export function clearDemoStorage(storage) {
  const target = storage || defaultStorage();
  if (!target) return;
  for (const key of demoKeysOf(target)) {
    try {
      target.removeItem(key);
    } catch (error) {
      // swallowed: the app keeps working in memory
    }
  }
}

// Guarded JSON access. Real storage is the source of truth, so two stores over one storage
// (two tabs) see each other's carts. A key is kept in memory only while storage refuses it
// (throws or drops the write), which degrades to in-memory behaviour.
function safeStorage(storage) {
  const real = storage || defaultStorage() || memoryStorage();
  const mirror = new Map();
  return {
    read(key) {
      if (mirror.has(key)) return mirror.get(key);
      try {
        const text = real.getItem(key);
        if (text === null || text === undefined) return null;
        return JSON.parse(text);
      } catch (error) {
        return null; // unreadable or corrupt JSON is ignored
      }
    },
    write(key, value) {
      try {
        const text = JSON.stringify(value);
        real.setItem(key, text);
        if (real.getItem(key) === text) {
          mirror.delete(key);
          return;
        }
      } catch (error) {
        // quota or access error: fall through to the mirror
      }
      mirror.set(key, value);
    },
    remove(key) {
      try {
        real.removeItem(key);
        mirror.delete(key);
      } catch (error) {
        mirror.set(key, null); // hides whatever storage still holds
      }
    },
    clear() {
      mirror.clear();
      clearDemoStorage(real);
    },
    hasDemoKeys() {
      return demoKeysOf(real).length > 0;
    },
  };
}

// ---------------------------------------------------------------- store

export function createStore({ storage, demoDate, schemaVersion } = {}) {
  const store = safeStorage(storage);
  const ctx = { demoDate: demoDate === undefined ? null : demoDate };
  const meta = { schemaVersion: schemaVersion === undefined ? null : schemaVersion, demoDate: ctx.demoDate };

  let state = initialState();
  let listeners = [];
  let notifying = false;
  const queue = [];
  let metaWritten = false;

  function ensureMeta() {
    if (metaWritten) return;
    store.write(KEY_META, meta);
    metaWritten = true;
  }

  // A mismatch (or leftovers without meta) means the data changed: drop every saved key.
  // Meta itself is written lazily, on the first persist, so a fresh or just-reset demo
  // holds no 'gtdemo:' key at all until the user does something.
  function hydrate() {
    const saved = store.read(KEY_META);
    const matches = isObject(saved) && saved.schemaVersion === meta.schemaVersion && saved.demoDate === meta.demoDate;
    if (!matches && store.hasDemoKeys()) store.clear();
    if (!matches) return;

    const session = store.read(KEY_SESSION);
    if (isObject(session) && session.loggedIn === true) {
      state = { ...state, session: { loggedIn: true, repName: typeof session.repName === 'string' ? session.repName : null } };
    }
    const orders = store.read(KEY_ORDERS);
    if (Array.isArray(orders)) {
      state = { ...state, submittedOrders: orders.filter((order) => isObject(order) && isId(order.outletId)) };
    }
  }

  function persist(previous, next, action) {
    if (action.type === 'demo/reset') {
      store.clear();
      metaWritten = false; // nothing is left under the prefix until the next write
      return;
    }
    if (next === previous) return;
    ensureMeta();
    if (next.session !== previous.session) store.write(KEY_SESSION, next.session);
    if (next.submittedOrders !== previous.submittedOrders) {
      store.write(KEY_ORDERS, next.submittedOrders);
      // The submitted outlet's cart is emptied in storage too, even if it is not the open one.
      const added = next.submittedOrders[next.submittedOrders.length - 1];
      if (action.type === 'order/submit' && added && added.outletId !== next.cart.outletId) {
        store.remove(KEY_CART + added.outletId);
        // Its saved reasons go with the order; the saved stock check stays.
        const savedVisit = store.read(KEY_VISIT + added.outletId);
        if (isObject(savedVisit) && isObject(savedVisit.reasons) && Object.keys(savedVisit.reasons).length) {
          store.write(KEY_VISIT + added.outletId, { ...savedVisit, reasons: {} });
        }
      }
    }
    if (next.cart !== previous.cart && isId(next.cart.outletId)) store.write(KEY_CART + next.cart.outletId, next.cart);
    if (next.visit !== previous.visit && isId(next.visit.outletId)) store.write(KEY_VISIT + next.visit.outletId, next.visit);
  }

  function apply(action) {
    const previous = state;
    let context = ctx;
    if (action.type === 'outlet/select' && isId(action.outletId)) {
      context = {
        ...ctx,
        saved: { cart: store.read(KEY_CART + action.outletId), visit: store.read(KEY_VISIT + action.outletId) },
      };
    }
    state = reduce(previous, action, context);
    persist(previous, state, action);

    const snapshot = state;
    for (const listener of listeners.slice()) {
      if (!listeners.includes(listener)) continue; // unsubscribed during this notification
      try {
        listener(snapshot, action);
      } catch (error) {
        if (typeof console !== 'undefined' && console.error) console.error('[store] subscriber failed', error);
      }
    }
  }

  // A dispatch made from inside a subscriber is queued and applied as soon as the current
  // notification finishes (still before the outer dispatch returns), so every subscriber
  // sees every action once and in order.
  function dispatch(action) {
    if (!isObject(action) || typeof action.type !== 'string') {
      warn('dispatch ignored: an action needs a string type');
      return action;
    }
    queue.push(action);
    if (notifying) return action;
    notifying = true;
    try {
      while (queue.length) apply(queue.shift());
    } finally {
      notifying = false;
      queue.length = 0;
    }
    return action;
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return () => {};
    const listener = (nextState, action) => fn(nextState, action);
    listeners = listeners.concat([listener]);
    return () => {
      listeners = listeners.filter((entry) => entry !== listener);
    };
  }

  hydrate();
  return { getState: () => state, dispatch, subscribe };
}

// ---------------------------------------------------------------- app singleton

let appStore = null;

// Creates and hydrates the app singleton.
export function initStore({ demoDate, schemaVersion, storage } = {}) {
  appStore = createStore({ storage, demoDate, schemaVersion });
  return appStore;
}

// Throws if initStore() has not run.
export function getStore() {
  if (!appStore) throw new Error('Store is not ready: call initStore() before getStore()');
  return appStore;
}

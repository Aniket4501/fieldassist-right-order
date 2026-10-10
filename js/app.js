// Boot (load data → init store → router), hash router, demo bar mount, reset side-effect.

import { loadAll, setSubmittedOrders } from './data.js';
import { initStore, getStore } from './store.js';
import { formatDate } from './dates.js';
import { h, demoBar, demoTag, listRow, icon, openSheet, emptyState, button, confirmResetDemo } from './components/ui.js';
import * as login from './screens/login.js';
import * as home from './screens/home.js';
import * as outlets from './screens/outlets.js';
import * as outlet from './screens/outlet.js';
import * as order from './screens/order.js';
import * as review from './screens/review.js';

const LOCAL_SERVER_COMMAND = 'cd prototype && python3 -m http.server 8000';
const HOME = '#/home';
const LOGIN = '#/login';
const SETTLE_MS = 500;   // how long a new screen ignores taps, as the confirm sheet does

// One entry per route. `screen` is the screen module that renders it.
const ROUTES = {
  login: { title: 'Sign in', public: true, screen: login },
  home: { title: 'Today', keepScroll: true, screen: home },
  outlets: { title: 'All outlets', keepScroll: true, screen: outlets },
  outlet: { title: 'Outlet details', hasId: true, screen: outlet },
  order: { title: 'Order booking', hasId: true, screen: order },
  review: { title: 'Order review', hasId: true, screen: review },
};

const screenEl = document.getElementById('screen');
const demoBarRoot = document.getElementById('demo-bar-root');

let cleanup = null;
let resetting = false;
let firstRender = true;
let settling = false;      // true for SETTLE_MS after the screen changes
let settleTimer = null;
let shown = null;          // { hash, from, def } of the screen on the page
const scrollTops = {};     // hash → scroll position when the user left it (routes with keepScroll)

// The router sets the scroll position itself, also on browser Back.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

// A new screen ignores taps for a moment, so the second tap of a double tap cannot press whatever
// has just appeared under the finger (Review, then Submit; Submit, then a route row).
screenEl.addEventListener('click', (event) => {
  if (!settling) return;
  event.preventDefault();
  event.stopPropagation();
}, true);

function settle() {
  settling = true;
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => { settling = false; }, SETTLE_MS);
}

// --------------------------------------------------------------------------
// Router
// --------------------------------------------------------------------------

function parseHash(hash) {
  const parts = String(hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
  let id = null;
  if (parts.length > 1) {
    try { id = decodeURIComponent(parts[1]); } catch { id = parts[1]; }
  }
  return { name: parts[0] || '', id };
}

function redirect(hash) {
  if (location.hash === hash) return false;
  location.replace(hash);   // fires hashchange, which calls route() again
  return true;
}

function runCleanup() {
  if (typeof cleanup === 'function') {
    try { cleanup(); } catch (err) { console.error(err); }
  }
  cleanup = null;
}

function route() {
  if (resetting) return;

  const { name, id } = parseHash(location.hash);
  const def = Object.prototype.hasOwnProperty.call(ROUTES, name) ? ROUTES[name] : null;
  const loggedIn = Boolean(getStore().getState().session.loggedIn);

  if (!loggedIn && !(def && def.public)) { if (redirect(LOGIN)) return; }
  else if (loggedIn && (!def || def.public || (def.hasId && !id))) { if (redirect(HOME)) return; }

  const active = !loggedIn ? ROUTES.login : (def && !def.public && !(def.hasId && !id) ? def : ROUTES.home);

  // `from` is the hash of the screen the user was on before this one (null on a first load).
  // A repaint of the same hash keeps the `from` it had.
  const hash = location.hash;
  const from = shown && shown.hash === hash ? shown.from : (shown ? shown.hash : null);
  if (shown && shown.def.keepScroll && shown.hash !== hash) scrollTops[shown.hash] = window.scrollY;

  runCleanup();
  demoBarRoot.hidden = active.public === true;
  screenEl.replaceChildren();

  const params = { id, from };
  const result = active.screen.render(screenEl, params);
  cleanup = typeof result === 'function' ? result : null;
  if (shown && shown.hash !== hash) settle();   // not on first paint, not on a repaint of the same screen
  shown = { hash, from, def: active };

  // Coming back to the route or the outlet list returns to where the user left it; everything else starts at the top.
  window.scrollTo(0, active.keepScroll && scrollTops[hash] ? scrollTops[hash] : 0);

  // Move keyboard and screen-reader focus to the new screen (not on first paint).
  if (!firstRender) screenEl.focus({ preventScroll: true });
  firstRender = false;
}

// --------------------------------------------------------------------------
// Reset demo
// --------------------------------------------------------------------------

async function requestReset() {
  if (await confirmResetDemo()) getStore().dispatch({ type: 'demo/reset' });
}

// --------------------------------------------------------------------------
// Demo guide (FEATURE-SLOT: demo-menu): what to try at which outlet, from config.demoGuide
// --------------------------------------------------------------------------

function demoGuideEntries(data) {
  const guide = data.config && data.config.demoGuide;
  if (!Array.isArray(guide)) return [];
  return guide
    .filter((entry) => entry && entry.outletId && data.outletsById[entry.outletId])
    .map((entry) => ({ outlet: data.outletsById[entry.outletId], text: typeof entry.try === 'string' ? entry.try : '' }));
}

function openDemoGuide(data) {
  const entries = demoGuideEntries(data);
  // A row for the outlet already on screen changes no route, so the tap itself closes the sheet.
  const onPick = (event) => { if (event.target.closest('a')) sheet.close(); };
  const sheet = openSheet({
    title: 'Demo guide',
    content: [
      h('p', { class: 'ro-guide__intro' }, demoTag('Demo only'), h('span', { text: 'What to try at each outlet.' })),
      h('ul', { class: 'ro-guide', role: 'list', onClick: onPick }, entries.map(({ outlet, text }) => h('li', null, listRow({
        href: `#/outlet/${encodeURIComponent(outlet.id)}`,
        title: outlet.name || outlet.id,
        subtitle: text,
        trailing: icon('chevron-right'),
      })))),
    ],
  });
}

// --------------------------------------------------------------------------
// Boot
// --------------------------------------------------------------------------

function renderLoadError(err) {
  const message = err && err.message ? err.message : 'A data file could not be read.';
  demoBarRoot.hidden = true;
  screenEl.replaceChildren(
    h('div', { class: 'screen' },
      emptyState({
        icon: 'warn',
        level: 1,
        title: 'Demo data did not load',
        text: message,
        action: [
          // Same wording as the static loading state in index.html.
          h('p', { class: 'empty__text', style: { alignSelf: 'center' }, text: 'If you opened this file directly, it needs a local server. Run:' }),
          h('pre', { class: 'code', text: LOCAL_SERVER_COMMAND }),
          button('Try again', { icon: 'reset', block: true, onClick: () => location.reload() }),
        ],
      })),
  );
}

async function boot() {
  // The static markup in index.html is the loading state.
  let data;
  try {
    data = await loadAll();
  } catch (err) {
    console.error(err);
    renderLoadError(err);
    return;
  }

  // Without a valid demo date nothing can be shown truthfully (no date, no route).
  if (!data.demoDate) {
    const err = new Error('data/config.json has no valid demoDate (expected YYYY-MM-DD)');
    console.error(err);
    renderLoadError(err);
    return;
  }

  const store = initStore({ demoDate: data.demoDate, schemaVersion: data.config.schemaVersion });
  setSubmittedOrders(store.getState().submittedOrders);

  // Registered first, so the data view is up to date before any screen re-renders.
  store.subscribe((state, action) => {
    const type = action && action.type;
    if (type === 'order/submit') {
      setSubmittedOrders(state.submittedOrders);
    } else if (type === 'demo/reset') {
      // Reset side-effect: back to the login screen with a clean page.
      resetting = true;
      location.hash = LOGIN;
      location.reload();
    } else if (type === 'session/logout') {
      route();
    }
  });

  demoBarRoot.replaceChildren(demoBar({
    dateLabel: formatDate(data.demoDate, 'long'),
    onReset: requestReset,
    menuItems: demoGuideEntries(data).length
      ? [{ label: 'Demo guide', icon: 'info', onSelect: () => openDemoGuide(data) }]
      : [],
  }));

  window.addEventListener('hashchange', route);
  route();
}

boot();

// Landing: greeting, today's route, All outlets, Reset demo.

import { getData } from '../data.js';
import { getStore } from '../store.js';
import { formatDate } from '../dates.js';
import { plural } from '../format.js';
import { h, icon, card, chip, button, listRow, emptyState, confirmResetDemo } from '../components/ui.js';
import { recommend } from '../engine/recommendationEngine.js';

// The word and icon for each outlet badge the engine returns. Always an icon plus a word.
const BADGES = {
  stockup: { label: 'Stock-up talk', tone: 'chill', icon: 'arrow-up' },
  covered: { label: 'Covered', tone: 'ok', icon: 'check' },
  golight: { label: 'Go light', tone: 'warn', icon: 'arrow-down' },
  checkdata: { label: 'Check data', tone: 'neutral', icon: 'info' },
};

// The badge for one outlet as it stands before the visit: no cart, no stock check.
function badgeFor(data, outlet) {
  try {
    const result = recommend({ outlet, cart: null, visit: null, data, demoDate: data.demoDate });
    const key = result && result.outletBadge;
    return key && Object.prototype.hasOwnProperty.call(BADGES, key) ? key : null;
  } catch (err) {
    console.error(err);
    return null;
  }
}

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || '';
}

function routeRow(data, outlet, index, badgeKey) {
  const visited = data.visitedToday(outlet.id);

  // FEATURE-SLOT: route-row-badge — the per-outlet status badge goes into this container.
  const spec = badgeKey ? BADGES[badgeKey] : null;
  const badge = h('span', { class: 'slot ro-badge', dataset: { slot: 'route-row-badge', outletId: outlet.id, badge: badgeKey || '' } },
    spec && chip(spec.label, { tone: spec.tone, icon: spec.icon }));

  return h('li', null, listRow({
    href: `#/outlet/${encodeURIComponent(outlet.id)}`,
    leading: h('span', { class: ['stop num', visited && 'stop--done'], text: String(index + 1) }),
    title: outlet.name || outlet.id,
    // The channel reads as text beside the area, so the row has one line of chips: the badge, and Visited.
    subtitle: [outlet.area, outlet.channel].filter(Boolean).join(' · '),
    meta: [badge, visited && chip('Visited', { tone: 'ok', icon: 'check' })],
    trailing: icon('chevron-right'),
  }));
}

async function onReset() {
  if (await confirmResetDemo()) getStore().dispatch({ type: 'demo/reset' });
}

function view() {
  const data = getData();
  const state = getStore().getState();
  const rep = data.config.rep || {};
  const name = firstName(state.session.repName || rep.name);
  const route = data.todaysRoute();
  const visitedCount = route.filter((outlet) => data.visitedToday(outlet.id)).length;
  const roleLine = [rep.role, rep.beatName].filter(Boolean).join(' · ');
  const badges = route.map((outlet) => badgeFor(data, outlet));
  const talks = badges.filter((key) => key === 'stockup').length;
  const talksLine = talks === 0 ? 'No stock-up talks left today'
    : talks === 1 ? '1 outlet needs a stock-up talk today'
      : `${talks} outlets need a stock-up talk today`;

  return h('div', { class: 'screen home' },
    h('div', { class: 'home__hello' },
      h('h1', { class: 'home__greeting', text: name ? `Hello, ${name}` : 'Hello' }),
      roleLine && h('p', { class: 'home__role', text: roleLine })),

    card({ class: 'home__today' },
      h('div', null,
        h('p', { class: 'home__date' }, icon('calendar', { size: 16 }), h('span', { class: 'num', text: formatDate(data.demoDate, 'full') })),
        h('p', { class: 'home__summary num', text: `${plural(route.length, 'outlet', 'outlets')} · ${visitedCount} visited` })),
      button('All outlets', { variant: 'secondary', href: '#/outlets', icon: 'store', iconEnd: 'chevron-right', block: true })),

    // FEATURE-SLOT: landing — empty until the feature fills it; takes no space while empty.
    // Fill it here, inside view(): the view is rebuilt when the session or the submitted orders change.
    h('div', { class: 'slot', id: 'slot-landing', dataset: { slot: 'landing' } },
      route.length > 0 && h('p', { class: ['ro-landing', talks === 0 && 'ro-landing--none'] },
        icon(talks === 0 ? 'check' : 'arrow-up', { size: 20 }),
        h('span', { class: 'num', text: talksLine }))),

    h('section', { class: 'section', attrs: { 'aria-labelledby': 'route-title' } },
      h('h2', { class: 'section__title', id: 'route-title', text: 'Today’s route' }),
      route.length
        ? card({ class: 'row-list' },
          h('ol', { role: 'list' }, route.map((outlet, index) => routeRow(data, outlet, index, badges[index]))))
        : card(null, emptyState({
          icon: 'route',
          title: 'No outlets on today’s route',
          text: 'Open All outlets to visit any outlet.',
        }))),

    h('div', { class: 'home__reset' },
      button('Reset demo', { variant: 'ghost', icon: 'reset', onClick: onReset }),
      h('p', { class: 'home__reset-note', text: 'Clears orders made in this demo.' })),
  );
}

export function render(container) {
  const paint = () => container.replaceChildren(view());
  paint();

  // Only the session and the submitted orders change what this screen shows.
  let shown = getStore().getState();
  const unsubscribe = getStore().subscribe((state, action) => {
    if (action && action.type === 'demo/reset') return;   // the page is about to reload
    const changed = state.session !== shown.session || state.submittedOrders !== shown.submittedOrders;
    shown = state;
    if (changed) paint();
  });
  return () => unsubscribe();
}

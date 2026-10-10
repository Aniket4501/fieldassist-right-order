// Outlet list: search by name, area or ID, filter by channel and segment, open an outlet.

import { getData } from '../data.js';
import { plural } from '../format.js';
import { h, icon, card, chip, button, listRow, appHeader, emptyState, textField, filterChips } from '../components/ui.js';
import { coldChain } from './outlet.js';

const SEGMENT_ORDER = ['Diamond', 'Gold', 'Silver', 'Bronze', 'Iron'];   // tier order, best first

// What the user typed and chose. Kept here (not in storage), so it survives a visit to an outlet
// and is cleared by Reset demo, which reloads the page. null = "All".
const filters = { query: '', channel: null, segment: null };

function distinct(values) {
  return Array.from(new Set(values.filter((value) => value !== null && value !== undefined && value !== '')));
}

function segmentRank(segment) {
  const at = SEGMENT_ORDER.indexOf(segment);
  return at === -1 ? SEGMENT_ORDER.length : at;
}

function withAll(values) {
  return [{ value: null, label: 'All' }, ...values.map((value) => ({ value, label: String(value) }))];
}

function matches(outlet) {
  if (filters.channel !== null && outlet.channel !== filters.channel) return false;
  if (filters.segment !== null && outlet.segment !== filters.segment) return false;
  const query = filters.query.trim().toLowerCase();
  if (!query) return true;
  return [outlet.name, outlet.area, outlet.id].some((text) => String(text || '').toLowerCase().includes(query));
}

function outletRow(outlet) {
  const cold = coldChain(outlet.cooler);
  return h('li', null, listRow({
    href: `#/outlet/${encodeURIComponent(outlet.id)}`,
    title: outlet.name || outlet.id,
    subtitle: [outlet.area, outlet.id].filter(Boolean).join(' · '),
    meta: [
      outlet.channel && chip(outlet.channel),
      outlet.segment && chip(outlet.segment, { tone: 'primary' }),
      chip(cold.label, { tone: cold.tone, icon: cold.icon }),
    ],
    trailing: icon('chevron-right'),
  }));
}

export function render(container) {
  const data = getData();
  const all = data.outlets;

  // A choice that is no longer in the data would hide every outlet with no chip to undo it.
  const channels = distinct(all.map((outlet) => outlet.channel));
  const segments = distinct(all.map((outlet) => outlet.segment)).sort((a, b) => segmentRank(a) - segmentRank(b));
  if (!channels.includes(filters.channel)) filters.channel = null;
  if (!segments.includes(filters.segment)) filters.segment = null;

  const search = textField({ label: 'Search outlets', name: 'outlet-search', value: filters.query, placeholder: 'Name, area or ID', icon: 'search', inputmode: 'search' });
  search.input.setAttribute('enterkeyhint', 'search');
  const channelChips = filterChips({ label: 'Channel', options: withAll(channels), value: filters.channel, onChange: (value) => { filters.channel = value; paint(); } });
  const segmentChips = filterChips({ label: 'Segment', options: withAll(segments), value: filters.segment, onChange: (value) => { filters.segment = value; paint(); } });
  const count = h('p', { class: 'outlets__count num', role: 'status' });
  const list = h('div');

  function clear() {
    filters.query = '';
    filters.channel = null;
    filters.segment = null;
    search.input.value = '';
    channelChips.setValue(null);
    segmentChips.setValue(null);
    paint();
    search.input.focus();
  }

  // Only the count and the rows are rebuilt, so the search field keeps focus while typing.
  function paint() {
    const found = all.filter(matches);
    count.textContent = found.length === all.length
      ? plural(all.length, 'outlet', 'outlets')
      : `${found.length} of ${plural(all.length, 'outlet', 'outlets')}`;

    if (found.length) {
      list.replaceChildren(card({ class: 'row-list' }, h('ul', { role: 'list' }, found.map(outletRow))));
    } else if (!all.length) {
      list.replaceChildren(card(null, emptyState({ icon: 'store', title: 'No outlets', text: 'The data has no outlets.' })));
    } else {
      list.replaceChildren(card(null, emptyState({
        icon: 'search',
        title: 'No outlet matches',
        text: 'Try another name, area or ID.',
        action: button('Clear search and filters', { variant: 'secondary', icon: 'close', block: true, onClick: clear }),
      })));
    }
  }

  search.input.addEventListener('input', () => { filters.query = search.input.value; paint(); });
  paint();

  container.append(
    appHeader({ title: 'All outlets', backHref: '#/home', backLabel: 'Back to today’s route' }),
    h('div', { class: 'screen outlets' },
      search,
      h('div', { class: 'outlets__filters' },
        h('p', { class: 'outlets__filter-label', text: 'Channel', attrs: { 'aria-hidden': 'true' } }),
        channelChips,
        h('p', { class: 'outlets__filter-label', text: 'Segment', attrs: { 'aria-hidden': 'true' } }),
        segmentChips),
      h('section', { class: 'outlets__results', attrs: { 'aria-label': 'Outlets' } }, count, list)),
  );
}

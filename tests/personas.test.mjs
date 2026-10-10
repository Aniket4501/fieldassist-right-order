// Persona acceptance: the rows of the owner's demo test matrix (strategy/04, section L) that the engine
// alone decides, checked on the real data files. Nothing here is a fixed number: every expectation is
// worked out from the data and from the engine's own result. Run: node --test tests/personas.test.mjs
// The rows that need a screen (cards, hints on screen, Submit, Reset) are checked in a browser instead.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { buildData, DATA_FILES } from '../js/data.js';
import { recommend } from '../js/engine/recommendationEngine.js';

const raw = {};
for (const key of Object.keys(DATA_FILES)) {
  raw[key] = JSON.parse(readFileSync(fileURLToPath(new URL('../data/' + DATA_FILES[key], import.meta.url)), 'utf8'));
}
const base = buildData(raw);
const D = base.demoDate;
const byKey = (key) => base.outlets.find((o) => o.personaKey === key);
const P = { 1: byKey('late-waker'), 2: byKey('planner-flagship'), 3: byKey('burned-cautious'), 4: byKey('highway-dhaba'), 5: byKey('campus-canteen'), 6: byKey('new-owner'), 7: byKey('credit-stretched'), 8: byKey('wedding-glass'), 9: byKey('heat-impulse') };
const rec = (outlet, lines = {}, stock = null, data = base) => recommend({ outlet, cart: { outletId: outlet.id, lines }, visit: stock ? { outletId: outlet.id, stockOnHand: stock } : null, data, demoDate: D });
const line = (r, sku) => r.lines.find((l) => l.sku === sku);
const name = (sku) => (base.productsBySku[sku] || {}).name || sku;
const row = (n, ok, text) => test(`matrix row ${n}`, () => assert.ok(ok, text));
const pool = base.schemes.find((s) => s.type === 'buy_x_get_y');
const lastOrder = (outlet) => { const o = base.ordersFor(outlet.id); const last = o[o.length - 1]; const lines = {}; for (const l of last.lines) lines[l.sku] = l.cases; return { date: last.date, lines }; };

// 1
{ const r = rec(P[1]); const key = r.lines.filter((l) => l.isKey);
  row(1, r.state === 'active' && r.outletBadge === 'stockup' && r.window.days === 8 && key.length >= 3 && key.every((l) => l.status === 'missing' || l.status === 'unavailable' || l.status === 'none_needed') && key.filter((l) => l.status === 'missing').length >= 3,
    `P1 empty: state ${r.state}, badge ${r.outletBadge}, W ${r.window.days}, key ${key.map((l) => name(l.sku) + ' ' + l.status + ' +' + l.recommendedCases).join('; ')} | "${r.headline}"`); }
// 2 (engine part): suggested cart makes every key line right
{ const s = rec(P[1]).quickSets.suggested; const r = rec(P[1], s);
  row(2, r.lines.filter((l) => l.isKey && l.status !== 'unavailable').every((l) => l.status === 'right' || l.status === 'none_needed'), `P1 suggested ${JSON.stringify(s)} -> key statuses ${r.lines.filter((l) => l.isKey).map((l) => l.status).join(',')} | scheme "${r.scheme && r.scheme.text}"`); }
// 3
{ const m = rec(P[1]).quickSets.minimum; const r = rec(P[1], m); const lines = r.lines.filter((l) => m[l.sku]);
  row(3, Object.keys(m).length >= 2 && lines.every((l) => l.status === 'right') && lines.some((l) => /if sales are normal/.test(l.hint)), `P1 minimum ${JSON.stringify(m)} -> ${lines.map((l) => l.status + ' "' + l.hint + '"').join('; ')}`); }
// 4
{ const top = rec(P[1]).lines.filter((l) => l.isKey && l.rangeLow >= 2)[0];
  const r = top ? rec(P[1], { [top.sku]: top.rangeLow - 1 }) : null; const l = r && line(r, top.sku);
  row(4, !!l && l.status === 'short' && /^Short · runs out ~/.test(l.hint), top ? `P1 ${name(top.sku)} at ${top.rangeLow - 1} (low ${top.rangeLow}) -> ${l.status} "${l.hint}"` : 'P1 has no key line with low >= 2'); }
// 5, 6
{ const skus = pool.skus.filter((sku) => line(rec(P[1]), sku)); const a = skus[0]; const b = skus[1] || skus[0];
  const nine = a === b ? { [a]: pool.buyCases - 1 } : { [a]: pool.buyCases - 4, [b]: 3 };
  const r9 = rec(P[1], nine);
  row(5, !!r9.scheme && r9.scheme.toNext === 1 && !!r9.scheme.nudge && /→ 1 free \(₹/.test(r9.scheme.nudge.text), `P1 pooled ${JSON.stringify(nine)} -> scheme "${r9.scheme && r9.scheme.text}" nudge "${r9.scheme && r9.scheme.nudge && r9.scheme.nudge.text}" note "${r9.scheme && r9.scheme.honestNote}" | pooled highs ${skus.map((s) => line(r9, s).rangeHigh).join('+')}`);
  const ten = { ...nine, [a]: nine[a] + 1 }; const r10 = rec(P[1], ten);
  row(6, !!r10.scheme && r10.scheme.freeCases === 1 && !r10.scheme.nudge && /1 free ✓/.test(r10.scheme.text) && /next at 20/.test(r10.scheme.text), `P1 pooled 10 -> scheme "${r10.scheme && r10.scheme.text}" nudge ${r10.scheme && r10.scheme.nudge ? 'present' : 'gone'}`); }
// 7
{ const focus = rec(P[1]).lines.filter((l) => l.isKey && l.status !== 'unavailable').sort((a, b) => b.recommendedCases - a.recommendedCases)[0];
  const r = rec(P[1], { [focus.sku]: 30 }); const l = line(r, focus.sku);
  row(7, l.status === 'over' && /^Over · (~\d+|8\+) weeks of stock/.test(l.hint), `P1 ${name(focus.sku)} = 30 -> ${l.status} "${l.hint}"`); }
// 8
{ const focus = rec(P[1]).lines.filter((l) => l.isKey && l.status !== 'unavailable').sort((a, b) => b.recommendedCases - a.recommendedCases)[0];
  const before = line(rec(P[1]), focus.sku); const after = line(rec(P[1], {}, { [focus.sku]: 5 }), focus.sku);
  const rank = { low: 0, medium: 1, high: 2 };
  row(8, after.recommendedCases < before.recommendedCases && rank[after.confidence] > rank[before.confidence] && (after.rangeHigh - after.rangeLow) <= (before.rangeHigh - before.rangeLow) && after.stock.counted,
    `P1 count ${name(focus.sku)} = 5: rec ${before.recommendedCases} -> ${after.recommendedCases}, range ${before.rangeLow}–${before.rangeHigh} -> ${after.rangeLow}–${after.rangeHigh}, confidence ${before.confidence} -> ${after.confidence}`); }
// 9
{ const s = rec(P[1]).quickSets.suggested;
  const order = { id: 'D-1', outletId: P[1].id, date: D, value: 1, lines: Object.keys(s).map((sku) => ({ sku, cases: s[sku], freeCases: 0 })) };
  const data = buildData(raw, [order]); const r = rec(P[1], {}, null, data); const total = r.lines.reduce((sum, l) => sum + l.recommendedCases, 0);
  row(9, r.outletBadge === 'covered' && r.state === 'quiet' && total <= 1, `P1 after submitting the suggestion: badge ${r.outletBadge}, state ${r.state}, total rec ${total} | "${r.headline}"`); }
// 10
{ const last = lastOrder(P[5]); const r0 = rec(P[5]); const r = rec(P[5], last.lines); const over = r.lines.filter((l) => l.status === 'over');
  const takehome = r.lines.filter((l) => (base.productsBySku[l.sku] || {}).serve === 'takehome');
  row(10, r.outletBadge === 'golight' && over.length >= 2 && takehome.every((l) => l.recommendedCases === 0) && /closure/i.test(r0.headline),
    `P5 cart = its order of ${last.date} ${JSON.stringify(last.lines)} -> over on ${over.length} lines (${over.map((l) => name(l.sku) + ' "' + l.hint + '"').join('; ')}); badge ${r.outletBadge}; "${r0.headline}"; take-home recs ${takehome.map((l) => l.recommendedCases).join(',') || 'none listed'}`); }
// 11
{ const last = lastOrder(P[4]); const r = rec(P[4], last.lines); const short = r.lines.filter((l) => l.status === 'short');
  const named = r.lines.some((l) => /last year/.test(l.reasonShort) && l.flags.includes('event'));
  row(11, short.length >= 1 && named && r.window.days === 11, `P4 cart = its order of ${last.date} ${JSON.stringify(last.lines)} -> short on ${short.length} (${short.map((l) => name(l.sku) + ' "' + l.hint + '" low ' + l.rangeLow).join('; ')}); W ${r.window.days}; event reason ${named ? 'named: ' + r.lines.find((l) => l.flags.includes('event')).reasonShort : 'NOT named'}`); }
// 12
{ const r = rec(P[6]); const key = r.lines.filter((l) => l.isKey); const r1 = rec(P[1]);
  const width = (rr) => { const l = rr.lines.filter((x) => x.isKey && x.status !== 'unavailable').sort((a, b) => b.recommendedCases - a.recommendedCases)[0]; return (l.rangeHigh - l.rangeLow) / Math.max(1, l.recommendedCases); };
  row(12, key.length > 0 && key.every((l) => l.confidence === 'low') && key.some((l) => l.flags.includes('peer')) && /top up next visit/.test(r.pitch),
    `P6 empty: confidence ${key.map((l) => l.confidence).join(',')}; relative range width ${width(r).toFixed(2)} vs P1 ${width(r1).toFixed(2)}; peer flag ${key.some((l) => l.flags.includes('peer'))}; pitch "${r.pitch}"`); }
// 13, 14
{ const glass = base.products.find((p) => p.returnable === true); const r = rec(P[8], { [glass.sku]: 10 }); const l = line(r, glass.sku); const empties = P[8].glass.emptiesOnHand;
  row(13, !!l && l.status === 'over' && l.rangeHigh <= empties && new RegExp(`only ${empties} crates against empties`).test(l.hint) && r.nudges.some((n) => /deposit for more/.test(n.text)),
    l ? `P8 ${name(glass.sku)} = 10: ${l.status} "${l.hint}", rec ${l.recommendedCases}, high ${l.rangeHigh}, empties ${empties}; rec with empty cart ${line(rec(P[8]), glass.sku).recommendedCases}` : 'P8 has no line for the glass product');
  const out = base.distributorStock.items.find((i) => i.status === 'out'); const r2 = rec(P[8], { [out.sku]: 2 }); const l2 = line(r2, out.sku);
  row(14, !!l2 && l2.status === 'unavailable' && /^Unavailable · try /.test(l2.hint) && r2.nudges.some((n) => n.type === 'supply' && /unavailable \(as of /.test(n.text)), l2 ? `P8 ${name(out.sku)} = 2: ${l2.status} "${l2.hint}" | ${r2.nudges.filter((n) => n.type === 'supply').map((n) => n.text).join(' | ')}` : `P8 has no line for ${out.sku} (not bought in the last 12 weeks)`); }
// 15
{ const s = rec(P[7]).quickSets.suggested; const big = { ...s }; const first = Object.keys(big)[0] || rec(P[7]).lines[0].sku; big[first] = (big[first] || 0) + 8;
  const r = rec(P[7], big); const room = base.availableCredit(P[7].id);
  row(15, r.credit.fits === false && new RegExp('^Fits ₹' + String(room.available).replace(/\B(?=(\d{3})+(?!\d))/g, ',')).test(r.credit.text) && /runs out first/.test(r.credit.text) && /Collect ₹/.test(r.credit.text) && r.scheme && !r.scheme.eligible && !r.scheme.nudge,
    `P7 cart ${JSON.stringify(big)} value ${r.credit.cartValue} vs available ${room.available}: fits ${r.credit.fits}; "${r.credit.text}"; scheme "${r.scheme && r.scheme.text}"; suggested value ${rec(P[7], s).credit.cartValue}`); }
// 16
{ const skus = pool.skus.filter((sku) => line(rec(P[3]), sku)); const eight = skus.length > 1 ? { [skus[0]]: 4, [skus[1]]: 4 } : { [skus[0]]: 8 };
  const r = rec(P[3], eight);
  row(16, !!r.scheme && r.scheme.toNext === 2 && !r.scheme.nudge && /not suggested/.test(r.scheme.honestNote || ''), `P3 pooled ${JSON.stringify(eight)} -> scheme "${r.scheme && r.scheme.text}" note "${r.scheme && r.scheme.honestNote}" nudge ${r.scheme && r.scheme.nudge ? r.scheme.nudge.text : 'none'} | pooled highs ${skus.map((s) => line(r, s).rangeHigh).join('+')}`); }
// 17
{ const r = rec(P[9]);
  row(17, r.window.horizonDays === 29 && r.window.days === 14 && r.window.capped && /Visit gap 29 days — covers 2 weeks/.test(r.window.flag || ''), `P9 empty: H ${r.window.horizonDays}, W ${r.window.days}, flag "${r.window.flag}" | "${r.headline}"`); }
// 18
{ const never = base.products.filter((p) => base.casesBetween(P[6].id, '2000-01-01', D, p.sku) === 0); const sku = (never.find((p) => p.category === 'energy') || never[0] || {}).sku;
  const r = sku ? rec(P[6], { [sku]: 2 }) : null;
  row(18, !!sku && !line(r, sku), sku ? `P6 ${name(sku)} (never bought) in the cart -> ${line(r, sku) ? 'HAS a line: ' + line(r, sku).status : 'no line (neutral hint)'}` : 'P6 has bought every product'); }
// 19
{ const l0 = rec(P[1]).lines.filter((l) => l.status !== 'unavailable')[0]; const r = rec(P[1], { [l0.sku]: 999 }); const l = line(r, l0.sku);
  row(19, l.status === 'over' && /8\+ weeks/.test(l.hint) && r.headline.length <= 60 && l.hint.length <= 48, `P1 ${name(l0.sku)} = 999 -> ${l.status} "${l.hint}"; credit value ${r.credit.cartValue}`); }
// 22
{ const eligible = base.outlets.find((o) => pool.eligibleSegments.includes(o.segment) && pool.skus.some((sku) => line(rec(o), sku)));
  const sku = pool.skus.find((s) => line(rec(eligible), s));
  const order = { id: 'D-2', outletId: eligible.id, date: D, value: 1, lines: [{ sku, cases: pool.buyCases * pool.capPerMonth, freeCases: pool.capPerMonth }] };
  const data = buildData(raw, [order]); const r = rec(eligible, { [sku]: pool.buyCases - 1 }, null, data);
  row(22, !!r.scheme && r.scheme.limitReached && r.scheme.text === 'Monthly scheme limit reached' && !r.scheme.nudge && !r.scheme.honestNote, `${eligible.id} after ${pool.capPerMonth} triggers this month, pooled ${pool.buyCases - 1}: scheme "${r.scheme && r.scheme.text}" nudge ${r.scheme && r.scheme.nudge ? 'present' : 'none'}`); }
// 23 (engine part): mark a product out at the distributor -> unavailable with a substitute everywhere it is a line
{ const target = base.products.find((p) => p.focus === true && p.returnable !== true); const copy = JSON.parse(JSON.stringify(raw));
  copy.distributorStock.items.find((i) => i.sku === target.sku).status = 'out'; const data = buildData(copy);
  const seen = data.outlets.map((o) => line(rec(o, {}, null, data), target.sku)).filter(Boolean);
  row(23, seen.length >= 5 && seen.every((l) => l.status === 'unavailable' && l.recommendedCases === 0 && l.substitute), `${name(target.sku)} set to out: ${seen.length} outlets list it, all unavailable ${seen.every((l) => l.status === 'unavailable')}, substitute "${seen[0] && seen[0].substitute && seen[0].substitute.name}"`); }
// 26 (engine part)
{ const copy = JSON.parse(JSON.stringify(raw)); delete copy.routePlan[P[1].id]; const data = buildData(copy); const r = rec(P[1], {}, null, data);
  const none = recommend({ outlet: null, cart: null, visit: null, data: base, demoDate: D }); const junk = recommend({ outlet: { id: 'NOPE' }, cart: null, visit: null, data: base, demoDate: D });
  row(26, r.window.days >= 1 && r.horizon.nextVisit === null && none.state === 'not_applicable' && junk.state === 'insufficient_data' && junk.outletBadge === 'checkdata', `P1 with no route plan: H ${r.window.horizonDays} (fallback), "${r.headline}"; no outlet -> ${none.state}; unknown outlet -> ${junk.state}, badge ${junk.outletBadge}`); }
// The landing badges with empty carts: one of each kind is on the route.
test('badges on the route with empty carts', () => {
  const badges = base.outlets.map((o) => rec(o).outletBadge);
  for (const badge of badges) assert.ok(['stockup', 'covered', 'golight', 'checkdata'].includes(badge), String(badge));
  assert.equal(rec(P[1]).outletBadge, 'stockup');
  assert.equal(rec(P[5]).outletBadge, 'golight');
  assert.ok(badges.includes('covered'));
});

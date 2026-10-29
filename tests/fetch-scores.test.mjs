import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as cheerio from 'cheerio';
import { BREX, CEREZO, JAPAN } from '../data.js';
import { applyFixture } from '../schedule.js';
import { parseFixtures } from '../scripts/parse-fixtures.mjs';

// Evaluate declarations only: no Admin SDK imports or production main() call.
const source = readFileSync(new URL('../scripts/fetch-scores.mjs', import.meta.url), 'utf8');
function harness(fetch = () => { throw new Error('Network disabled'); }) {
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : ['2026-10-10T00:00:00Z'])); }
  }
  const context = vm.createContext({ cheerio, BREX, CEREZO, JAPAN, applyFixture, parseFixtures, Date: FixedDate, fetch });
  vm.runInContext(source.slice(source.indexOf('const TARGETS'), source.indexOf('async function main')), context);
  return { context, run: code => vm.runInContext(code, context) };
}
function basket({ date = '10/9', home = '茨城', away = '宇都宮', a = 79, b = 90, status = '試合終了', result = 'win' } = {}) {
  return `<table><tr><td class="ba-table__date">${date} (金)</td><td class="ba-table__data--results"><span class="ba-icon ba-icon--${result}"></span></td><td class="ba-table__data--team">${home}</td><td><span class="ba-table__scoreDetail"><span>${a}</span> &nbsp;-&nbsp; ${b}</span><p class="ba-table__status">${status}</p></td><td class="ba-table__data--team">${away}</td></tr></table>`;
}
const plain = value => JSON.parse(JSON.stringify(value));
function parse(html, key = 'brex') {
  const h = harness(); h.context.html = html; h.context.key = key;
  return plain(h.run(`(()=>{const t=TARGETS.find(t=>t.key===key);return parseBasket(html,t,buildDateMap(t.dates))})()`));
}
test('basket targets fetch actual widget HTML, not iframe containers', async () => {
  const calls = [];
  const h = harness(async url => { calls.push(url); return { ok: true, text: async () => basket() }; });
  assert.equal((await h.run('fetchTarget(TARGETS[0])')).length, 1);
  await h.run('fetchTarget(TARGETS[2])');
  assert.deepEqual(calls, [
    'https://sports.yahoo.co.jp/basket/widget/ds/pc/teams/703/monthly/schedule_202609.html',
    'https://sports.yahoo.co.jp/basket/widget/ds/pc/teams/703/monthly/schedule_202610.html',
    'https://sports.yahoo.co.jp/basket/widget/ds/pc/men/teams/366/schedule.html',
  ]);
});
test('away basketball win maps date and score to display key', () => {
  assert.deepEqual(parse(basket()), [{ key: 'brex_2026-10-09', result: 'win', myScore: 90, opScore: 79 }]);
});
test('home basketball loss preserves score orientation', () => {
  assert.deepEqual(parse(basket({ date: '9/27', home: '宇都宮', away: '横浜BC', a: 71, b: 74, result: 'lose' })), [{ key: 'brex_2026-09-27', result: 'lose', myScore: 71, opScore: 74 }]);
});
test('Japan basketball uses its own key and date set', () => {
  assert.deepEqual(parse(basket({ date: '9/20', home: '日本', away: '相手', a: 57, b: 67, result: 'lose' }), 'japan_basket'), [{ key: 'japan_basket_2026-09-20', result: 'lose', myScore: 57, opScore: 67 }]);
});
test('unfinished, future, unknown-date and missing-score games are excluded', () => {
  for (const props of [{ status: '第3Q' }, { date: '10/11' }, { date: '10/8' }, { a: '-', b: '-' }]) assert.deepEqual(parse(basket(props)), []);
});
test('HTTP error is not mistaken for empty successful results', async () => {
  const h = harness(async () => ({ ok: false, status: 503 }));
  await assert.rejects(h.run('fetchTarget(TARGETS[0])'), /HTTP 503/);
});
test('soccer parsing and fetch URL remain unchanged', async () => {
  const html = `<table><tr><td class="sc-tableGame__data--date">8/8</td><td class="sc-tableGame__data--victory">○</td><td class="sc-tableGame__data--team">C大阪</td><td class="sc-tableGame__data--team">相手</td><td class="sc-tableGame__scoreDetail">2 - 1</td><td class="sc-tableGame__status">試合終了</td></tr></table>`;
  const h = harness(async url => { assert.equal(url, 'https://soccer.yahoo.co.jp/jleague/category/j1/teams/133/schedule'); return { ok: true, text: async () => html }; });
  assert.deepEqual(plain(await h.run('fetchTarget(TARGETS[1])')), [{ key: 'cerezo_2026-08-08', result: 'win', myScore: 2, opScore: 1 }]);
});
test('application score lookup resolves basketball output', () => {
  const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const context = vm.createContext({ scores: { brex_2026_ignored: null, 'brex_2026-10-09': parse(basket())[0] } });
  vm.runInContext(source.slice(source.indexOf('function scoreTeamKey('), source.indexOf('function scoreCls(')), context);
  assert.equal(vm.runInContext("scoreText(getScore({team:'brex',d:'2026-10-09'}))", context), '○90-79');
});
test('save uses scores document and merge, with Admin replaced by a stub', async () => {
  const h = harness(); const writes = [];
  Object.assign(h.context, { process: { env: { FIREBASE_SERVICE_ACCOUNT: '{}' } }, initializeApp() {}, cert: v => v, getFirestore: () => ({ doc(path) { assert.equal(path, 'calendar/scores'); return { set: async (data, options) => writes.push(plain({ data, options })) }; } }), console: { log() {}, error() { throw new Error('Unexpected fetch failure'); } } });
  vm.runInContext(source.slice(source.indexOf('async function main'), source.lastIndexOf('main().catch')), h.context);
  vm.runInContext("fetchTarget=async target=>target.key==='brex'?[{key:'brex_2026-10-09',result:'win',myScore:90,opScore:79}]:[]", h.context);
  await h.run('main()');
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].options, { merge: true });
  assert.equal(writes[0].data.results['brex_2026-10-09'].myScore, 90);
});

function guardedMain(expected, { event = 'workflow_dispatch', fail = false } = {}) {
  const h = harness(); const writes = [];
  Object.assign(h.context, {
    process: { env: { FIREBASE_SERVICE_ACCOUNT: '{}', EXPECTED_COUNTS: expected, GITHUB_EVENT_NAME: event } },
    initializeApp() {}, cert: v => v,
    getFirestore: () => ({ doc(path) { assert.equal(path, 'calendar/scores'); return { set: async (data, options) => writes.push(plain({ data, options })) }; } }),
    console: { log() {}, error() {} },
  });
  vm.runInContext(source.slice(source.indexOf('async function main'), source.lastIndexOf('main().catch')), h.context);
  h.context.fail = fail;
  vm.runInContext("fetchTarget=async target=>{if(fail&&target.key==='cerezo')throw Error('HTTP 503');return target.key==='brex'?[{key:'brex_2026-10-09',result:'win',myScore:90,opScore:79}]:[]}", h.context);
  return { writes, run: () => h.run('main()') };
}
const expected = { brex: 1, cerezo: 0, japan_basket: 0, japan_soccer: 0 };
test('matching counts allow exactly one merged save', async () => {
  const h = guardedMain(JSON.stringify(expected)); await h.run();
  assert.equal(h.writes.length, 1); assert.deepEqual(h.writes[0].options, { merge: true });
});
test('count mismatch prevents every write', async () => {
  const h = guardedMain(JSON.stringify({ ...expected, brex: 3 }));
  await assert.rejects(h.run(), /保存中止/); assert.equal(h.writes.length, 0);
});
test('fetch failure cannot pass even when expected count is zero', async () => {
  const h = guardedMain(JSON.stringify(expected), { fail: true });
  await assert.rejects(h.run(), /保存中止/); assert.equal(h.writes.length, 0);
});
test('missing or malformed manual expectations prevent every write', async () => {
  for (const value of [undefined, '', '{', 'null', '[]', '{}', JSON.stringify({ ...expected, extra: 0 }), JSON.stringify({ ...expected, brex: -1 }), JSON.stringify({ ...expected, brex: '1' }), JSON.stringify({ ...expected, brex: 1.5 })]) {
    const h = guardedMain(value); await assert.rejects(h.run()); assert.equal(h.writes.length, 0);
  }
});
test('scheduled execution without expectations retains merged saving', async () => {
  const h = guardedMain(undefined, { event: 'schedule' }); await h.run();
  assert.equal(h.writes.length, 1); assert.deepEqual(h.writes[0].options, { merge: true });
});


test('monthly fetching combines September and October without duplicates or future months', async () => {
  const calls = [];
  const h = harness(async url => {
    calls.push(url);
    return { ok: true, text: async () => basket({ date: '9/26' }) + basket({ date: '10/9' }) + basket({ date: '10/11' }) };
  });
  const rows = plain(await h.run('fetchTarget(TARGETS[0])'));
  assert.deepEqual(rows.map(r => r.key), ['brex_2026-09-26', 'brex_2026-10-09']);
  assert.equal(calls.length, 2);
});
test('months come from registered past dates, including another year', async () => {
  const calls = [];
  const h = harness(async url => { calls.push(url); return { ok: true, text: async () => '<table></table>' }; });
  await h.run("fetchTarget({...TARGETS[0], dates:['2025-12-01','2026-01-02','2026-01-03','2027-01-01']})");
  assert.deepEqual(calls.map(u => u.split('/').pop()), ['schedule_202512.html', 'schedule_202601.html']);
});
test('failed historical month is reported rather than silently returning partial results', async () => {
  const h = harness(async url => ({ ok: !url.includes('202609'), status: 404, text: async () => basket() }));
  await assert.rejects(h.run('fetchTarget(TARGETS[0])'), /HTTP 404/);
});

test('future fixture metadata is saved even when there are no completed games', async () => {
  const h = harness(); const writes = [];
  Object.assign(h.context, { process: { env: { FIREBASE_SERVICE_ACCOUNT: '{}' } }, initializeApp() {}, cert: v => v, getFirestore: () => ({ doc() { return { set: async (data, options) => writes.push(plain({ data, options })) }; } }), console: { log() {}, error() {} } });
  vm.runInContext(source.slice(source.indexOf('async function main'), source.lastIndexOf('main().catch')), h.context);
  vm.runInContext("fetchTarget=async (target, fixtures)=>{if(target.key==='cerezo')fixtures.cerezo_17={d:'2026-11-11',op:'浦和',h:false};return []}", h.context);
  await h.run('main()');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].data.fixtures.cerezo_17.op, '浦和');
  assert.deepEqual(writes[0].data.results, {});
  assert.deepEqual(writes[0].options, { merge: true });
});

test('rescheduled cup score is fetched at its confirmed date together with its fixture', async () => {
  const html = `<table><tr><td class="sc-tableGame__data--date">10/7（水）<br>18:30</td><td class="sc-tableGame__data--category">天皇杯3回戦</td><td class="sc-tableGame__data--victory">○</td><td class="sc-tableGame__data--team">C大阪</td><td><a class="sc-tableGame__score" href="https://soccer.yahoo.co.jp/jleague/game/2026100712"><span class="sc-tableGame__scoreDetail">2 - 0</span><span class="sc-tableGame__status">試合終了</span></a></td><td class="sc-tableGame__data--team">鹿児島</td></tr></table>`;
  const h=harness(async()=>({ok:true,text:async()=>html}));
  const rows=plain(await h.run('fetchTarget(TARGETS[1])'));
  assert.deepEqual(rows,[{key:'cerezo_2026-10-07',result:'win',myScore:2,opScore:0}]);
});

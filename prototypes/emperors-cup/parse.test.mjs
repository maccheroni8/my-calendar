import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseEmperorsCup } from './parse.mjs';
const html = readFileSync(new URL('./reference-fragment.html', import.meta.url), 'utf8');
const config = { season: '2025-26', year: 2026, month: 1, source: 'https://zennihon2025-26.japanbasketball.jp/schedule/fin-round/sexcategory1/' };
test('実際の前回大会HTMLから3試合と合計スコアを抽出する', () => {
  const games = parseEmperorsCup(html, config);
  assert.deepEqual(games.map(g => [g.d, g.score.myScore, g.score.opScore]), [['2026-01-07',82,64],['2026-01-08',71,66],['2026-01-10',53,71]]);
  assert.ok(games.every(g => g.h === null));
});
test('日付変更でも試合IDを維持する', () => {
  assert.equal(parseEmperorsCup(html.replace('id="202617"', 'id="202619"'), config)[0].id, parseEmperorsCup(html, config)[0].id);
});
test('試合途中のスコアは登録候補に含めない', () => {
  assert.ok(parseEmperorsCup(html.replaceAll('試合終了', '第4Q'), config).every(g => !g.score));
});
test('別年度・皇后杯・空ページ・重複ID・不正なスコアを拒否する', () => {
  assert.throws(() => parseEmperorsCup(html, {...config, season:'2026-27',year:2027}));
  assert.throws(() => parseEmperorsCup(html, {...config,source:config.source.replace('sexcategory1','sexcategory2')}));
  assert.throws(() => parseEmperorsCup('<html></html>', config));
  assert.throws(() => parseEmperorsCup(html + html, config));
  assert.throws(() => parseEmperorsCup(html.replace('<b>82</b>', '<b>-</b>'), config));
});

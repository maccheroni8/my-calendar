import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCurrentCup } from './parse-current.mjs';
const reference = JSON.parse(readFileSync(new URL('./current-reference.json', import.meta.url)));
const source = 'https://zennihon.japanbasketball.jp/2026-27/schedule/final/';
// 実ページから抜粋したデータを、同じJSONストリーム形式に包む。
function page(data, split = false) {
  const stream = 'e:' + JSON.stringify({props:{data}}) + '\n';
  const chunks = split ? [stream.slice(0, 50),stream.slice(50)] : [stream];
  return '<meta name="description" content="第102回（2026-27）">' + chunks.map(s => `<script>self.__next_f.push(${JSON.stringify([1,s])})</script>`).join('');
}
const copy = () => structuredClone(reference);
test('新形式の実データを抽出し、相手未確定の予定を明示する', () => {
  const {games} = parseCurrentCup(page(reference,true),{source});
  assert.equal(games.length,1);
  assert.equal(games[0].d,'2027-01-06');
  assert.equal(games[0].op,'M3 の勝者');
  assert.equal(games[0].venue,'国立代々木競技場第二体育館 14:00');
  assert.equal(games[0].opponentPending,true);
  assert.equal(games[0].h,null);
  assert.equal(games[0].score,undefined);
});
test('正式ID・日程・相手変更でもmatchCodeが同じなら識別子を維持する（想定データ）', () => {
  const x=copy(), g=x.games[0];g.id='gp-99999';g.planned=false;g.away.name='テスト相手';g.date='2027-01-07';g.startAt='2027-01-07T15:00:00+09:00';
  assert.equal(parseCurrentCup(page(x),{source}).games[0].id,parseCurrentCup(page(reference),{source}).games[0].id);
});
test('終了状態と整合する最終スコアだけ取得する（想定データ）', () => {
  const x=copy(),g=x.games[0];g.home.score=80;g.away.score=70;g.away.name='テスト相手';
  assert.equal(parseCurrentCup(page(x),{source}).games[0].score,undefined);
  g.status='final';g.winner='home';
  assert.deepEqual(parseCurrentCup(page(x),{source}).games[0].score,{myScore:80,opScore:70,result:'win'});
  g.winner='away';assert.throws(()=>parseCurrentCup(page(x),{source}));
});
test('皇后杯と他チームを除外し、正常な0件を扱う', () => {
  const x=copy();x.games[0].sex='female';assert.equal(parseCurrentCup(page(x),{source}).games.length,0);
  x.games[0].sex='male';x.games[0].home.name='別チーム';assert.equal(parseCurrentCup(page(x),{source}).games.length,0);
});
test('年度・構造不一致、重複、無効日付を拒否する', () => {
  assert.throws(()=>parseCurrentCup(page(reference),{source,season:'2025-26'}));
  assert.throws(()=>parseCurrentCup('<html/>',{source}));
  const x=copy();x.games.push(x.games[0]);assert.throws(()=>parseCurrentCup(page(x),{source}));
  x.games.pop();x.games[0].date='2027-02-30';assert.throws(()=>parseCurrentCup(page(x),{source}));
});

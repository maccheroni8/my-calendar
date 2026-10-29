import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { CEREZO, JAPAN, BREX } from '../data.js';
import { applyFixture } from '../schedule.js';
import { parseFixtures } from '../scripts/parse-fixtures.mjs';
const target = { key: 'cerezo', teamName: 'C大阪' };
function row({ date='2026100712', category='天皇杯3回戦', home='C大阪', away='鹿児島', logo='jleague31042' }={}) {
  return `<table><tr><td class="sc-tableGame__data--date">10/7<br>18:30</td><td class="sc-tableGame__data--category">${category}</td><td class="sc-tableGame__data--team">${home}</td><td><a class="sc-tableGame__score" href="https://soccer.yahoo.co.jp/jleague/game/${date}">-</a></td><td class="sc-tableGame__data--team"><span class="sc-teamLogo sc-teamLogo--${logo}"></span>${away}</td><td class="sc-tableGame__data--venue">ハナサカ</td></tr></table>`;
}
test('rescheduled cup matches by round while retaining original index and storage date', () => {
  const fixtures = parseFixtures(row(), target);
  assert.equal(fixtures.cerezo_46.d, '2026-10-07');
  assert.equal(fixtures.cerezo_46.op, '鹿児島');
  assert.equal(fixtures.cerezo_46.venue, 'ハナサカ 18:30');
  assert.match(fixtures.cerezo_46.logo, /31042\.png$/);
  assert.equal(CEREZO[46].d, '2026-09-23');
});
test('future rounds and each leg resolve separately without final scores', () => {
  const fixtures=parseFixtures(row({date:'2026111102', category:'Jリーグ杯ノックアウトラウンド準々決勝第1戦', home:'浦和',away:'C大阪'}), target);
  assert.equal(fixtures.cerezo_17.op,'浦和');assert.equal(fixtures.cerezo_17.h,false);
  assert.equal(fixtures.cerezo_18,undefined);
});
test('ambiguous rows, another year, unknown round, absent own team and TBD are ignored', () => {
  for(const html of [row()+row(),row({date:'2025100712'}),row({category:'天皇杯1回戦'}),row({home:'別チーム'}),row({away:'未定'}),row({date:'no-year'})]) assert.deepEqual(parseFixtures(html,target),{});
});
test('Japan uses original combined-array index and country flag', () => {
  const fixtures=parseFixtures(row({date:'2026100501',category:'キリンカップ',home:'日本',away:'ニュージーランド',logo:'nationalNZL'}),{key:'japan_soccer',teamName:'日本'});
  assert.match(fixtures.japan_soccer_15.logo,/nzl\.svg$/);
});
test('initial confirmations survive missing updates; URL validation prevents injected logos', () => {
  assert.equal(applyFixture(CEREZO[46],'cerezo',46).d,'2026-10-07');
  assert.equal(applyFixture(CEREZO[46],'cerezo',46,{cerezo_46:{}}).op,'鹿児島');
  const ev=applyFixture(CEREZO[46],'cerezo',46,{cerezo_46:{op:'相手',d:'2026-10-07',h:true,logo:'javascript:alert(1)'}});
  assert.equal(ev.logo,undefined);
});
test('display date changes preserve filtering, marks, and memo keys in both popup entry points', () => {
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const ctx=vm.createContext({CEREZO,JAPAN,BREX,applyFixture,fixtures:{},J1:[],J2:[],J3:[],ABBR:{},mf:['go'],showBrex:false,showCerezo:true,showJapanBasket:false,showJapanSoccer:false,showCustom:false,marks:{'cerezo_2026-09-23_46':['go']},memos:{'cerezo_2026-09-23_46':'既存メモ'}});
  vm.runInContext(html.slice(html.indexOf('function mk('),html.indexOf('// ── 日本の祝日')),ctx);
  vm.runInContext(html.slice(html.indexOf('function passMF('),html.indexOf('// ── フィルタ')),ctx);
  assert.equal(vm.runInContext('allEvs()[0].d',ctx),'2026-10-07');
  assert.equal(vm.runInContext('allEvs()[0].storageDate',ctx),'2026-09-23');
  assert.equal(vm.runInContext("getMemo('cerezo',allEvs()[0].storageDate,46)",ctx),'既存メモ');
  assert.match(html,/ev\.isCustom,ev\.sport,ev\.storageDate\);/);
  assert.match(html,/venueStr,ev\.isCustom,ev\.sport,ev\.storageDate\)\)/);
  assert.match(html,/popupTarget=\{team,date:storageDate,idx,isCustom\}/);
});

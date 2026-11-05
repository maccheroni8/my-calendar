import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { BREX, CEREZO, JAPAN } from '../data.js';
import { applyFixture } from '../schedule.js';
import { cupVisible, soccerCupStates } from '../cup-state.js';
import { parseSoccerCupResults } from '../scripts/parse-cup-results.mjs';
import { parseBasketCup } from '../scripts/parse-basket-cup.mjs';
const data = JSON.parse(readFileSync(new URL('./basket-cup-reference.json',import.meta.url)));
function page(data) {return '<meta name="description" content="第102回（2026-27）"><script>self.__next_f.push('+JSON.stringify([1,'e:'+JSON.stringify({props:{data}})+'\n'])+')</script>';}
const parsed = value => parseBasketCup(page(value),BREX,'2027-01-31');
const copy = () => structuredClone(data);
function finish(g, ownSide, win) {
  g.planned=false;g.home.name=ownSide===0?'宇都宮':'相手';g.away.name=ownSide===1?'宇都宮':'相手';
  g.status='final';g.home.score=win === (ownSide===0)?80:70;g.away.score=win === (ownSide===0)?70:80;g.winner=g.home.score>g.away.score?'home':'away';
}
test('official bracket supplies four January dates without shifting existing entries',()=>{
  assert.equal(BREX.length,68);assert.equal(BREX[63].d,'2027-05-02');
  const x=parsed(data);assert.deepEqual(Object.values(x).map(e=>e.d),['2027-01-06','2027-01-08','2027-01-09','2027-01-11']);
  assert.ok(Object.values(x).every(e=>!e.hidden && !e.score));assert.equal(x.brex_65.conditional,true);
});
test('initial loss keeps played match but hides every later round',()=>{
  const x=copy();finish(x.games[0],0,false);const fixtures=parsed(x);
  assert.equal(fixtures.brex_64.hidden,false);assert.equal(fixtures.brex_64.score.result,'lose');
  for(const i of [65,66,67])assert.equal(cupVisible(applyFixture(BREX[i],'brex',i,fixtures),'brex'),false);
});
test('win followed by semifinal loss hides only final; away scores stay oriented',()=>{
  const x=copy();finish(x.games[0],0,true);finish(x.games[1],0,true);finish(x.games[2],1,false);const result=parsed(x);
  assert.equal(result.brex_66.score.myScore,70);assert.equal(result.brex_66.hidden,false);assert.equal(result.brex_67.hidden,true);
});
test('winner placeholder cannot count as a completed Brex game',()=>{
  const x=copy();x.games[1].status='final';x.games[1].home.score=80;x.games[1].away.score=70;x.games[1].winner='home';
  assert.throws(()=>parsed(x));
});
test('duplicate, missing path, foreign year, future result and wrong initial team fail closed',()=>{
  const x=copy();x.games.push(x.games[0]);assert.throws(()=>parsed(x));x.games.pop();x.games.pop();assert.throws(()=>parsed(x));
  const y=copy();y.games[0].date='2026-01-06';assert.throws(()=>parsed(y));
  const z=copy();finish(z.games[0],0,false);assert.throws(()=>parseBasketCup(page(z),BREX,'2026-11-05'));
  const w=copy();w.games[0].home.name='別チーム';assert.throws(()=>parsed(w));
});
const leg = (n,my,op,extra={}) => ({cup:'levain',rank:17,leg:n,d:n===1?'2026-11-11':'2026-11-15',h:n===2,op:'浦和',myScore:my,opScore:op, ...extra});
test('first-leg loss does not eliminate; aggregate comeback qualifies',()=>{
  assert.deepEqual(soccerCupStates([leg(1,0,1)]),{});
  assert.equal(soccerCupStates([leg(1,0,1),leg(2,3,0)]).cerezo_levain.eliminated,false);
  assert.equal(soccerCupStates([leg(1,0,3),leg(2,2,0)]).cerezo_levain.eliminated,true);
});
test('tied two-leg tie requires explicit PK outcome; duplicate or different opponents are ignored',()=>{
  assert.deepEqual(soccerCupStates([leg(1,0,1),leg(2,1,0)]),{});
  assert.equal(soccerCupStates([leg(1,0,1),leg(2,1,0,{pkWinner:'opponent'})]).cerezo_levain.eliminated,true);
  assert.deepEqual(soccerCupStates([leg(1,0,1),leg(2,1,0),leg(2,1,0)]),{});
  assert.deepEqual(soccerCupStates([leg(1,0,1),leg(2,1,0,{op:'別チーム'})]),{});
});
function soccer({category='天皇杯ラウンド16',d='2026120902',score='2 - 0',mark='●',home='鹿島',away='C大阪',status='試合終了',pk=''}={}) {
  return `<table><tr><td class="sc-tableGame__data--category">${category}</td><td class="sc-tableGame__data--victory">${mark}</td><td class="sc-tableGame__data--team">${home}</td><td class="sc-tableGame__data--team">${away}</td><td><a class="sc-tableGame__score" href="https://soccer.yahoo.co.jp/jleague/game/${d}"><p class="sc-tableGame__scoreDetail">${score}</p>${pk}<p class="sc-tableGame__status">${status}</p></a></td></tr></table>`;
}
test('soccer parsing hides only later rounds of the eliminated cup, retaining league and other cup',()=>{
  const states=parseSoccerCupResults(soccer(),'2026-12-10');assert.deepEqual(states,{cerezo_emperor:{eliminated:true,afterRound:16}});
  assert.equal(cupVisible(CEREZO[47],'cerezo',states),true);
  for(const i of [48,49,50])assert.equal(cupVisible(CEREZO[i],'cerezo',states),false);
  assert.equal(cupVisible(CEREZO[17],'cerezo',states),true);assert.equal(cupVisible(CEREZO[0],'cerezo',states),true);
});
test('single-match PK loss eliminates; unfinished/future/foreign-season scores do not',()=>{
  assert.equal(parseSoccerCupResults(soccer({score:'1 - 1'}),'2026-12-10').cerezo_emperor.eliminated,true);
  for(const props of [{status:'後半'},{d:'2025120902'},{score:'-'},{home:'別チーム',away:'別の相手'}])assert.deepEqual(parseSoccerCupResults(soccer(props),'2026-12-10'),{});
  assert.deepEqual(parseSoccerCupResults(soccer(),'2026-11-05'),{});
});
test('soccer two-leg parser respects home orientation and explicit penalties',()=>{
  const a=soccer({category:'Jリーグ杯準々決勝第1戦',d:'2026111102',home:'浦和',score:'2 - 0'});
  const b=soccer({category:'Jリーグ杯準々決勝第2戦',d:'2026111502',home:'C大阪',away:'浦和',score:'2 - 0',pk:'PK 3 - 4'});
  assert.equal(parseSoccerCupResults(a+b,'2026-11-16').cerezo_levain.eliminated,true);
  assert.deepEqual(parseSoccerCupResults(a,'2026-11-16'),{});
});
test('date change preserves mark/memo storage key and filters in actual allEvs',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');const fixtures=parsed(data);fixtures.brex_64.d='2027-01-07';
  const ctx=vm.createContext({BREX,CEREZO,JAPAN,applyFixture,cupVisible,fixtures,cupStates:{},J1:[],J2:[],J3:[],ABBR:{},mf:['go'],showBrex:true,showCerezo:false,showJapanBasket:false,showJapanSoccer:false,showCustom:false,marks:{'brex_2027-01-06_64':['go']},memos:{'brex_2027-01-06_64':'keep'}});
  vm.runInContext(html.slice(html.indexOf('function mk('),html.indexOf('// ── 日本の祝日')),ctx);
  vm.runInContext(html.slice(html.indexOf('function passMF('),html.indexOf('// ── フィルタ')),ctx);
  assert.equal(vm.runInContext('allEvs()[0].d',ctx),'2027-01-07');assert.equal(vm.runInContext('allEvs()[0].storageDate',ctx),'2027-01-06');
  assert.equal(vm.runInContext("getMemo('brex',allEvs()[0].storageDate,64)",ctx),'keep');
  fixtures.brex_64.hidden=true;assert.equal(vm.runInContext('allEvs().length',ctx),0);
  assert.equal(vm.runInContext("memos['brex_2027-01-06_64']",ctx),'keep');
});

test('officially confirmed final status also triggers elimination',()=>{
  const x=copy();finish(x.games[0],0,false);x.games[0].status='confirmed';
  const result=parsed(x);assert.equal(result.brex_64.score.result,'lose');assert.equal(result.brex_65.hidden,true);
});

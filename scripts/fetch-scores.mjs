// Yahoo!スポーツナビのチームスケジュールページから終了試合のスコアを取得し、
// Firestore (calendar/scores) に書き込む。GitHub Actionsから毎日実行される想定。
//
// Yahoo側の表には月日(M/D)しか無く年が明示されないため、自前の data.js
// (index.html と共有) にある試合日程の「今日以前の日付」とだけ月日で突き合わせる。
// こうすることで、来シーズンの未来の試合と過去の別大会が同じ月日になった場合の
// 誤マッチを避けている(未来の日付は today でふるい落とされる)。
import * as cheerio from 'cheerio';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { BREX, CEREZO, JAPAN } from '../data.js';

const TARGETS = [
  {
    key: 'brex',
    url: 'https://sports.yahoo.co.jp/basket/bleague/b1/teams/703/schedule',
    sport: 'basket',
    teamName: '宇都宮',
    dates: BREX.map(e => e.d),
  },
  {
    key: 'cerezo',
    url: 'https://soccer.yahoo.co.jp/jleague/category/j1/teams/133/schedule',
    sport: 'soccer',
    teamName: 'C大阪',
    dates: CEREZO.map(e => e.d),
  },
  {
    key: 'japan_basket',
    url: 'https://sports.yahoo.co.jp/basket/japan/men/teams/366/schedule',
    sport: 'basket',
    teamName: '日本',
    dates: JAPAN.filter(e => e.sport === 'basket').map(e => e.d),
  },
  {
    key: 'japan_soccer',
    url: 'https://soccer.yahoo.co.jp/japan/category/men/teams/142/schedule',
    sport: 'soccer',
    teamName: '日本',
    dates: JAPAN.filter(e => e.sport === 'soccer').map(e => e.d),
  },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function buildDateMap(dates) {
  const today = todayIso();
  const map = new Map();
  for (const iso of dates) {
    if (iso > today) continue; // 未来の試合は対象外(誤マッチ防止)
    const monthDay = iso.slice(5); // MM-DD
    map.set(monthDay, iso);
  }
  return map;
}

function monthDayFromText(dateText) {
  const m = dateText.match(/(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  return `${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

function parseScorePair(text) {
  const nums = text.match(/-?\d+/g);
  if (!nums || nums.length < 2) return null;
  return [parseInt(nums[0], 10), parseInt(nums[1], 10)];
}

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function parseBasket(html, target, dateMap) {
  const $ = cheerio.load(html);
  const results = [];
  $('.ba-table__data--results').each((_, el) => {
    const row = $(el).closest('tr');
    const status = row.find('.ba-table__status').text().trim();
    if (status !== '試合終了') return;

    const monthDay = monthDayFromText(row.find('.ba-table__date').text().trim());
    const iso = monthDay && dateMap.get(monthDay);
    if (!iso) return;

    const icon = $(el).find('.ba-icon');
    const result = icon.hasClass('ba-icon--win') ? 'win' : icon.hasClass('ba-icon--lose') ? 'lose' : 'draw';

    const teamCells = row.find('.ba-table__data--team');
    const homeName = $(teamCells.get(0)).text().trim();

    const nums = parseScorePair(row.find('.ba-table__scoreDetail').text());
    if (!nums) return;
    const [homeScore, awayScore] = nums;
    const isHome = homeName.includes(target.teamName);
    const myScore = isHome ? homeScore : awayScore;
    const opScore = isHome ? awayScore : homeScore;

    results.push({ key: `${target.key}_${iso}`, result, myScore, opScore });
  });
  return results;
}

function parseSoccer(html, target, dateMap) {
  const $ = cheerio.load(html);
  const results = [];
  $('.sc-tableGame__data--victory').each((_, el) => {
    const mark = $(el).text().trim();
    if (!mark) return;

    const row = $(el).closest('tr');
    const status = row.find('.sc-tableGame__status').text().trim();
    if (status !== '試合終了') return;

    const monthDay = monthDayFromText(row.find('.sc-tableGame__data--date').text().trim());
    const iso = monthDay && dateMap.get(monthDay);
    if (!iso) return;

    const result = mark === '○' ? 'win' : mark === '●' ? 'lose' : 'draw';

    const teamCells = row.find('.sc-tableGame__data--team');
    const homeName = $(teamCells.get(0)).text().trim();

    const nums = parseScorePair(row.find('.sc-tableGame__scoreDetail').text());
    if (!nums) return;
    const [homeScore, awayScore] = nums;
    const isHome = homeName.includes(target.teamName);
    const myScore = isHome ? homeScore : awayScore;
    const opScore = isHome ? awayScore : homeScore;

    results.push({ key: `${target.key}_${iso}`, result, myScore, opScore });
  });
  return results;
}

async function fetchTarget(target) {
  const dateMap = buildDateMap(target.dates);
  if (dateMap.size === 0) return [];
  const html = await fetchHtml(target.url);
  return target.sport === 'basket' ? parseBasket(html, target, dateMap) : parseSoccer(html, target, dateMap);
}

async function main() {
  const svcJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!svcJson) throw new Error('FIREBASE_SERVICE_ACCOUNT環境変数が設定されていません');
  initializeApp({ credential: cert(JSON.parse(svcJson)) });
  const db = getFirestore();

  const all = [];
  for (const target of TARGETS) {
    try {
      const rows = await fetchTarget(target);
      console.log(`[${target.key}] ${rows.length}件の終了試合を検出`);
      all.push(...rows);
    } catch (e) {
      console.error(`[${target.key}] 取得失敗:`, e.message);
    }
  }

  if (all.length === 0) {
    console.log('書き込み対象なし');
    return;
  }

  const results = {};
  for (const r of all) {
    results[r.key] = { result: r.result, myScore: r.myScore, opScore: r.opScore, updatedAt: new Date().toISOString() };
  }

  await db.doc('calendar/scores').set({ results }, { merge: true });
  console.log(`Firestoreに${all.length}件書き込みました`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

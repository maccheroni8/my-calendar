import * as cheerio from 'cheerio';

export const BASKET_CUP_SOURCE = 'https://zennihon.japanbasketball.jp/2026-27/schedule/final/';
const PATH = ['M11', 'M18', 'M21', 'M23'];
const OWN = new Set(['宇都宮', '宇都宮ブレックス']);

export function readCurrentCupData(html, { source, season = '2026-27' }) {
  const url = new URL(source);
  const stage = url.pathname.match(/^\/(\d{4}-\d{2})\/schedule\/(r2|final)\/$/);
  if (url.protocol !== 'https:' || url.hostname !== 'zennihon.japanbasketball.jp' ||
      !stage || stage[1] !== season || url.search || url.hash) throw new Error('取得元・大会年度が一致しません');
  const $ = cheerio.load(html);
  if (!$('meta[name="description"]').attr('content')?.includes(`（${season}）`)) throw new Error('本文の大会年度を確認できません');
  let stream = '';
  $('script:not([src])').each((_, el) => {
    const match = $(el).text().trim().match(/^self\.__next_f\.push\((\[[\s\S]*\])\)$/);
    if (!match) return;
    const chunk = JSON.parse(match[1]);
    if (chunk[0] === 1 && typeof chunk[1] === 'string') stream += chunk[1];
  });
  const datasets = [];
  const walk = value => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value.games) && value.slug === season && value.stageId === stage[2]) datasets.push(value);
    for (const child of Object.values(value)) walk(child);
  };
  for (const line of stream.split('\n')) {
    if (!/^[\da-f]+:[\[{]/.test(line)) continue;
    let record;
    try { record = JSON.parse(line.slice(line.indexOf(':') + 1)); } catch { continue; }
    walk(record);
  }
  if (datasets.length !== 1 || !datasets[0].games.length) throw new Error('日程データを一意に取得できません');
  return datasets[0];
}

export function parseBasketCup(html, events, today = new Date().toISOString().slice(0, 10)) {
  const data = readCurrentCupData(html, { source: BASKET_CUP_SOURCE });
  const fixtures = {};
  let previous = null, previousWon = false, eliminated = false;
  for (const [pathIndex, code] of PATH.entries()) {
    const candidates = data.games.filter(g => g.sex === 'male' && (g.matchCode === code || g.nodeId === code));
    if (candidates.length !== 1) throw new Error(`天皇杯 ${code} のカードを一意に確認できません`);
    const row = candidates[0], sides = [row.home, row.away];
    const ownSides = sides.map(s => OWN.has(s?.name));
    const inherited = sides.map(s => previous && new RegExp(`^${previous}\\s*の勝者$`).test(s?.name));
    if (ownSides.filter(Boolean).length > 1 || inherited.filter(Boolean).length > 1) throw new Error('天皇杯の対戦カードが不正です');
    const ownSide = ownSides.indexOf(true), inheritedSide = inherited.indexOf(true);
    const own = ownSide >= 0 ? ownSide : inheritedSide;
    if (own < 0) {
      // 敗退後に枠が相手名へ置き換わった場合のみ、後続試合を非表示にできる。
      if (!eliminated) throw new Error('ブレックスの勝ち上がり経路を確認できません');
    } else if (pathIndex === 0 && ownSide < 0) throw new Error('初戦の出場チームを確認できません');
    const d = row.date, round = data.rounds.find(r => r.id === row.roundId)?.label;
    if (!/^2027-01-\d{2}$/.test(d) || !Number.isFinite(Date.parse(d)) || new Date(d).toISOString().slice(0,10) !== d ||
        row.stageId !== 'final' || !round || typeof row.venue?.name !== 'string' ||
        !/^(gp-\d+|plan-final-male-M\d+)$/.test(row.id || '')) throw new Error('天皇杯の日程情報が不正です');
    let time = '';
    if (!row.timeTbd) {
      const match = row.startAt?.match(/^(2027-01-\d{2})T((?:[01]\d|2[0-3]):[0-5]\d):00\+09:00$/);
      if (!match || match[1] !== d) throw new Error('天皇杯の開始時刻が不正です');
      time = match[2];
    }
    const registrations = events.map((e, idx) => ({e, idx})).filter(({e}) => e.cupId === `emperors_2026-27_${code}`);
    if (registrations.length !== 1) throw new Error('天皇杯の登録枠を確認できません');
    const conditional = ownSide < 0 && !previousWon;
    const opponent = own >= 0 ? sides[1-own]?.name : '未定';
    if (typeof opponent !== 'string' || !opponent.trim()) throw new Error('天皇杯の相手が不正です');
    let score = null;
    if (row.status === 'final' || row.status === 'confirmed') {
      if (d > today || sides.some(s => !Number.isSafeInteger(s?.score) || s.score < 0) || sides[0].score === sides[1].score ||
          row.winner !== (sides[0].score > sides[1].score ? 'home' : 'away')) throw new Error('天皇杯の終了結果が不正です');
      if (!eliminated) {
        if (ownSide < 0) throw new Error('終了試合の出場チームを確認できません');
        score = {myScore:sides[ownSide].score, opScore:sides[1-ownSide].score, result:row.winner === (ownSide === 0 ? 'home' : 'away') ? 'win' : 'lose'};
      }
    } else if (row.status !== 'scheduled' && row.status !== 'live') throw new Error('未対応の天皇杯の試合状態です');
    const hidden = eliminated;
    fixtures[`brex_${registrations[0].idx}`] = {d, op:opponent, h:null,
      venue:[row.venue.name,time].filter(Boolean).join(' '),
      cup:`天皇杯 ${round}${conditional || row.planned === true ? '（仮）' : ''}`,
      hidden, score, conditional, source:BASKET_CUP_SOURCE};
    previousWon = !hidden && score?.result === 'win';
    if (score?.result === 'lose') eliminated = true;
    previous = code;
  }
  return fixtures;
}

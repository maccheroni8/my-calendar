import * as cheerio from 'cheerio';

// ページに埋め込まれたJSONのみを読み、取得先のJavaScriptは実行しない。
export function parseCurrentCup(html, { source, season = '2026-27' }) {
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
  const data = datasets[0], ids = new Set(), games = [];
  const isBrex = side => ['宇都宮', '宇都宮ブレックス'].includes(side?.name);
  for (const row of data.games) {
    if (row.sex !== 'male' || (!isBrex(row.home) && !isBrex(row.away))) continue;
    if (row.stageId !== data.stageId || isBrex(row.home) === isBrex(row.away) || typeof row.id !== 'string' ||
        !/^(?:gp-\d+|plan-final-male-M\d+)$/.test(row.id)) throw new Error('試合識別情報が不正です');
    const d = row.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(Date.parse(d)) ||
        new Date(d).toISOString().slice(0,10) !== d || d < `${season.slice(0,4)}-04-01` ||
        d > `${Number(season.slice(0,4))+1}-03-31`) throw new Error('開催日が不正です');
    const ownHome = isBrex(row.home), own = ownHome ? row.home : row.away, opponent = ownHome ? row.away : row.home;
    if (typeof opponent?.name !== 'string' || !opponent.name.trim()) throw new Error('対戦相手が不正です');
    const round = data.rounds.find(r => r.id === row.roundId)?.label;
    if (!round || typeof row.venue?.name !== 'string') throw new Error('ラウンド・会場が不正です');
    let time = '';
    if (!row.timeTbd) {
      const match = typeof row.startAt === 'string' && row.startAt.match(/^(\d{4}-\d{2}-\d{2})T((?:[01]\d|2[0-3]):[0-5]\d):00\+09:00$/);
      if (!match || match[1] !== d) throw new Error('開始時刻が不正です');
      time = match[2];
    }
    // 予定カード→正式試合へのID対応は未検証。出典IDも保持する。
    const identity = data.stageId === 'final' && /^M\d+$/.test(row.matchCode || '') ? row.matchCode : row.id;
    const id = `emperors_${season}_${data.stageId}_${identity}`;
    if (ids.has(id)) throw new Error('試合IDが重複しています');
    ids.add(id);
    const game = { id, sourceId: row.id, team: 'brex', d, op: opponent.name, h: null,
      venue: [row.venue.name, time].filter(Boolean).join(' '), cup: `天皇杯 ${round}`,
      provisional: row.planned === true, opponentPending: /勝者|敗者|未定|TBD/.test(opponent.name),
      source: /^gp-\d+$/.test(row.id) ? `${url.origin}/${season}/games/${row.id}/` : source };
    if (row.status === 'final') {
      if (![own.score, opponent.score].every(n => Number.isSafeInteger(n) && n >= 0) || own.score === opponent.score ||
          row.winner !== (row.home.score > row.away.score ? 'home' : 'away')) throw new Error('終了スコアが不正です');
      game.score = { myScore: own.score, opScore: opponent.score, result: own.score > opponent.score ? 'win' : 'lose' };
    } else if (row.status !== 'scheduled') throw new Error('未対応の試合状態です');
    games.push(game);
  }
  return { prototype: true, season, source, scannedGames: data.games.length, games };
}

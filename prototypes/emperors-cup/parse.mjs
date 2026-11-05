import * as cheerio from 'cheerio';

// JBA前回大会のHTML用。年月は呼び出し元が明示し、曖昧な日付を推測しない。
export function parseEmperorsCup(html, { season, year, month, source, team = '宇都宮ブレックス' }) {
  const url = new URL(source);
  if (!/^\d{4}-\d{2}$/.test(season) || url.hostname !== `zennihon${season}.japanbasketball.jp` ||
      url.protocol !== 'https:' || url.pathname !== '/schedule/fin-round/sexcategory1/' ||
      year !== Number(season.slice(0, 4)) + 1 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('大会・年度・取得元が一致しません');
  }
  const $ = cheerio.load(html), games = new Map();
  $('section.daily').each((_, section) => {
    const day = $(section), id = day.attr('id');
    const dates = Array.from({ length: 31 }, (_, i) => i + 1).filter(d =>
      `${year}${month}${d}` === id && new Date(Date.UTC(year, month - 1, d)).getUTCMonth() === month - 1);
    if (dates.length !== 1) throw new Error('開催日を確定できません');
    const d = `${year}-${String(month).padStart(2, '0')}-${String(dates[0]).padStart(2, '0')}`;
    day.find('table.all').each((_, el) => {
      const table = $(el), names = table.find('.td4 strong').map((_, n) => $(n).text().trim()).get();
      if (!names.includes(team)) return;
      if (names.length !== 2 || names.filter(n => n === team).length !== 1) throw new Error('対戦カードが不正です');
      const op = names.find(n => n !== team);
      if (!op || /未定|勝者|敗者|TBD/.test(op)) return;
      const link = table.next('ul').find('a[href*="schedulekey-"]').first().attr('href') || '';
      const gameId = link.match(/^\/boxscore\/schedulekey-(\d+)\/period-\d+\/$/)?.[1];
      if (!gameId) throw new Error('固定の試合IDを取得できません');
      const key = `emperors_${season}_fr_${gameId}`;
      if (games.has(key)) throw new Error('試合IDが重複しています');
      const time = table.find('.td3').text().match(/\b(?:[01]\d|2[0-3]):[0-5]\d\b/)?.[0] || '';
      const venueCell = table.find('.td2').clone(); venueCell.find('br').replaceWith(' ');
      const venue = venueCell.text().replace(/\s*M\d+\s*$/, '').trim();
      const game = { id: key, team: 'brex', d, op, h: null, venue: [venue, time].filter(Boolean).join(' '), cup: '天皇杯', source: new URL(link, source).href };
      if (table.find('.status').text().trim() === '試合終了') {
        const scores = table.find('.td4 b').map((_, b) => $(b).text().trim()).get();
        if (scores.length !== 2 || scores.some(s => !/^\d+$/.test(s)) || scores[0] === scores[1]) throw new Error('終了スコアが不正です');
        const own = names.indexOf(team), myScore = Number(scores[own]), opScore = Number(scores[1 - own]);
        game.score = { myScore, opScore, result: myScore > opScore ? 'win' : 'lose' };
      }
      games.set(key, game);
    });
  });
  if (!games.size) throw new Error('対象試合が0件です。取得元・構造・未発表を確認してください');
  return [...games.values()];
}

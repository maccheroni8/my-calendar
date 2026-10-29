import * as cheerio from 'cheerio';
import { CEREZO, JAPAN } from '../data.js';

const compact = text => text.replace(/\s+/g, '');
export function cupRound(text) {
  const s = compact(text).replace(/（仮）/g, '');
  const cup = /天皇杯/.test(s) ? '天皇杯' : /ルヴァン|Jリーグ杯/.test(s) ? 'ルヴァン' : null;
  const round = s.match(/準々決勝|準決勝|決勝|ラウンド16|\d+回戦/)?.[0];
  if (!cup || !round) return null;
  return cup + round + (s.match(/第[12]戦/)?.[0] || '');
}

export function parseFixtures(html, target) {
  if (!['cerezo', 'japan_soccer'].includes(target.key)) return {};
  const events = target.key === 'cerezo' ? CEREZO : JAPAN;
  const $ = cheerio.load(html), candidates = new Map();
  $('.sc-tableGame__data--date').each((_, cell) => {
    const row = $(cell).closest('tr');
    // Game URLs include the full year; never infer it from month/day alone.
    const href = row.find('a.sc-tableGame__score').attr('href') || '';
    const date = href.match(/\/game\/(\d{4})(\d{2})(\d{2})\d+(?:[/?#]|$)/);
    if (!date) return;
    const d = `${date[1]}-${date[2]}-${date[3]}`;
    const teams = row.find('.sc-tableGame__data--team');
    if (teams.length !== 2) return;
    const names = teams.map((_, el) => compact($(el).text())).get();
    const home = names[0] === target.teamName, away = names[1] === target.teamName;
    if (home === away) return;
    const op = names[home ? 1 : 0];
    if (!op || /未定|勝者|敗者|TBD|^-$/i.test(op)) return;
    const category = row.find('.sc-tableGame__data--category').text();
    const round = cupRound(category);
    const matches = events.map((e, idx) => ({ e, idx })).filter(({ e }) => {
      if (target.key === 'japan_soccer') return e.sport === 'soccer' && e.d === d;
      return !!e.cup && round && cupRound(e.cup) === round && e.d.slice(0, 4) === date[1];
    });
    if (matches.length !== 1) return;
    const { e, idx } = matches[0];
    const logoClass = teams.eq(home ? 1 : 0).find('.sc-teamLogo').attr('class') || '';
    const club = logoClass.match(/sc-teamLogo--jleague(\d+)\b/);
    const country = logoClass.match(/sc-teamLogo--national([A-Z]{3})\b/);
    const logo = club ? `https://s.yimg.jp/images/sports/soccer/jleague/logo/team/120/${club[1]}.png`
      : country ? `https://s.yimg.jp/images/sports/all_device/common/images/flag/all/${country[1].toLowerCase()}.svg` : '';
    const dateCell = $(cell).clone();
    dateCell.find('br').replaceWith(' ');
    const time = dateCell.text().match(/\b\d{1,2}:\d{2}\b/)?.[0] || '';
    const venue = row.find('.sc-tableGame__data--venue').text().trim();
    const fixture = { d, op, h: home, ...(venue ? { venue: [venue, time].filter(Boolean).join(' ') } : {}), logo, ...(e.cup ? { cup: e.cup.replace(/（仮）/g, '') } : {}) };
    const key = `${target.key}_${idx}`;
    if (!candidates.has(key)) candidates.set(key, []);
    candidates.get(key).push(fixture);
  });
  return Object.fromEntries([...candidates].filter(([, values]) => values.length === 1).map(([key, values]) => [key, values[0]]));
}

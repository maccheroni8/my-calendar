import * as cheerio from 'cheerio';
import { CEREZO } from '../data.js';
import { cupStage, soccerCupStates } from '../cup-state.js';

export function parseSoccerCupResults(html, today = new Date().toISOString().slice(0,10)) {
  const $ = cheerio.load(html), records = [];
  $('.sc-tableGame__data--category').each((_, cell) => {
    const row = $(cell).closest('tr'), stage = cupStage($(cell).text());
    if (!stage || row.find('.sc-tableGame__status').text().trim() !== '試合終了') return;
    const href = row.find('a.sc-tableGame__score').attr('href') || '';
    const date = href.match(/^https:\/\/soccer\.yahoo\.co\.jp\/jleague\/game\/(\d{4})(\d{2})(\d{2})\d+(?:[/?#]|$)/);
    if (!date) return;
    const d = `${date[1]}-${date[2]}-${date[3]}`;
    if (d > today || !Number.isFinite(Date.parse(d)) || new Date(d).toISOString().slice(0,10) !== d) return;
    const registered = CEREZO.filter(e => {
      const s = cupStage(e.cup);
      return s && s.cup === stage.cup && s.rank === stage.rank && s.leg === stage.leg && e.d.slice(0,4) === date[1];
    });
    if (registered.length !== 1) return;
    const names = row.find('.sc-tableGame__data--team').map((_, el) => $(el).text().replace(/\s+/g,'')).get();
    if (names.length !== 2 || names.filter(n => n === 'C大阪').length !== 1) return;
    const own = names.indexOf('C大阪'), op = names[1-own];
    if (!op || /未定|勝者|敗者/.test(op)) return;
    const scoreText = row.find('.sc-tableGame__scoreDetail').text().trim();
    const pair = scoreText.match(/^(\d+)\s*[-－]\s*(\d+)(?=\s|$|\()/);
    if (!pair) return;
    const scores = [Number(pair[1]),Number(pair[2])];
    if (!scores.every(Number.isSafeInteger)) return;
    // A single-game draw with an explicit win/loss mark is a penalty result.
    // For two legs require explicit PK scores; a second-leg win alone is not qualification.
    const mark = row.find('.sc-tableGame__data--victory').text().trim();
    const pk = row.find('.sc-tableGame__score').text().match(/PK\s*[:：]?\s*(\d+)\s*[-－]\s*(\d+)/i);
    let pkWinner = null;
    if (pk && Number(pk[1]) !== Number(pk[2])) pkWinner = (Number(pk[1]) > Number(pk[2])) === (own === 0) ? 'own' : 'opponent';
    if (!stage.leg && scores[0] === scores[1] && ['○','●'].includes(mark)) pkWinner = mark === '○' ? 'own' : 'opponent';
    records.push({...stage,d,op,h:own===0,myScore:scores[own],opScore:scores[1-own],pkWinner});
  });
  return soccerCupStates(records);
}

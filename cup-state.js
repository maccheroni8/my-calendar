export function cupStage(text = '') {
  const s = text.replace(/\s+/g, '');
  const cup = s.includes('天皇杯') ? 'emperor' : /ルヴァン|Jリーグ杯/.test(s) ? 'levain' : null;
  const round = s.match(/準々決勝|準決勝|決勝|ラウンド16|\d+回戦/)?.[0];
  const rank = ({'ラウンド16':16,'準々決勝':17,'準決勝':18,'決勝':19})[round] || Number(round?.match(/\d+/)?.[0]);
  if (!cup || !Number.isFinite(rank)) return null;
  return { cup, rank, leg:Number(s.match(/第([12])戦/)?.[1]) || 0 };
}

export function cupVisible(event, team, states = {}) {
  if (event.hidden === true) return false;
  if (team !== 'cerezo' || !event.cup) return true;
  const stage = cupStage(event.cup), state = stage && states[`cerezo_${stage.cup}`];
  return !(state?.eliminated === true && Number.isInteger(state.afterRound) && state.afterRound >= 1 && stage.rank > state.afterRound);
}

// records contain only verified completed cup matches; missing/ambiguous evidence never hides fixtures.
export function soccerCupStates(records) {
  const states = {};
  for (const cup of ['emperor','levain']) {
    const rows = records.filter(r => r.cup === cup);
    if (!rows.length) continue;
    const rank = Math.max(...rows.map(r => r.rank)), latest = rows.filter(r => r.rank === rank);
    let eliminated;
    const twoLegs = cup === 'levain' && [17,18].includes(rank);
    if (twoLegs) {
      const first = latest.filter(r => r.leg === 1), second = latest.filter(r => r.leg === 2);
      if (first.length !== 1 || second.length !== 1 || first[0].op !== second[0].op || first[0].d >= second[0].d || first[0].h === second[0].h) continue;
      const [a,b] = [first[0],second[0]];
      const wins = [a,b].filter(r => r.myScore > r.opScore).length;
      const losses = [a,b].filter(r => r.myScore < r.opScore).length;
      const diff = a.myScore + b.myScore - a.opScore - b.opScore;
      if (wins !== losses) eliminated = wins < losses;
      else if (diff !== 0) eliminated = diff < 0;
      else if (b.pkWinner) eliminated = b.pkWinner === 'opponent';
    } else if (latest.length === 1 && latest[0].leg === 0) {
      const row = latest[0];
      if (row.myScore !== row.opScore) eliminated = row.myScore < row.opScore;
      else if (row.pkWinner) eliminated = row.pkWinner === 'opponent';
    }
    if (typeof eliminated === 'boolean') states[`cerezo_${cup}`] = {eliminated,afterRound:rank};
  }
  return states;
}

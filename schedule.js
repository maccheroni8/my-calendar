import { INITIAL_FIXTURES } from './schedule-data.js';

export function applyFixture(event, team, idx, fixtures = {}) {
  const key = `${team === 'japan' ? 'japan_' + event.sport : team}_${idx}`;
  const initial = INITIAL_FIXTURES[key];
  const update = Object.hasOwn(fixtures, key) ? fixtures[key] : null;
  const valid = value => value && typeof value.op === 'string' && value.op.length > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(value.d) && typeof value.h === 'boolean';
  const resolved = valid(update) ? update : initial;
  if (!valid(resolved)) return { ...event };
  const result = { ...event, d: resolved.d, op: resolved.op, h: resolved.h };
  for (const name of ['venue', 'cup']) if (typeof resolved[name] === 'string') result[name] = resolved[name];
  if (typeof resolved.logo === 'string' && /^https:\/\/s\.yimg\.jp\/images\/sports\/[a-zA-Z0-9/_.-]+\.(png|svg)$/.test(resolved.logo)) result.logo = resolved.logo;
  return result;
}

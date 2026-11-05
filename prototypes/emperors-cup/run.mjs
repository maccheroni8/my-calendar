import { readFile, writeFile } from 'node:fs/promises';
import { parseEmperorsCup } from './parse.mjs';

const [input, season, year, month, source, output] = process.argv.slice(2);
if (!output) throw new Error('使用法: node prototypes/emperors-cup/run.mjs 入力HTML 大会年度 年 月 取得元URL 出力JSON');
const games = parseEmperorsCup(await readFile(input, 'utf8'), { season, year: Number(year), month: Number(month), source });
await writeFile(output, JSON.stringify({ prototype: true, season, source, games }, null, 2) + '\n');
console.log(`ローカル出力: ${games.length}試合 → ${output}`);

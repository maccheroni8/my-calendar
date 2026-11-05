import { readFile, writeFile } from 'node:fs/promises';
import { parseCurrentCup } from './parse-current.mjs';
const [input, source, output] = process.argv.slice(2);
if (!output) throw new Error('使用法: node prototypes/emperors-cup/run-current.mjs 入力HTML 公式日程URL 出力JSON');
const result = parseCurrentCup(await readFile(input, 'utf8'), { source });
await writeFile(output, JSON.stringify(result, null, 2) + '\n');
console.log(`全${result.scannedGames}試合を走査、ブレックス${result.games.length}試合をローカル出力`);

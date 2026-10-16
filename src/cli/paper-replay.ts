import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseOhlcCsv, runPaperReplay } from '../strategy/paper-replay.js';

function readOption(name: string, required = false): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) {
    if (required) throw new Error(`missing required option ${name}`);
    return undefined;
  }
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`option ${name} requires a value`);
  return value;
}

try {
  if (process.argv.includes('--help')) {
    console.log('Usage: npm run paper:replay -- --h4 <file.csv> --m5 <file.csv> --symbol <symbol> [--balance <amount>] [--risk <percent>] [--news-clear]');
  } else {
    const h4Path = resolve(readOption('--h4', true)!);
    const m5Path = resolve(readOption('--m5', true)!);
    const symbol = readOption('--symbol', true)!;
    const balanceText = readOption('--balance');
    const riskText = readOption('--risk');
    const balance = balanceText === undefined ? 10_000 : Number(balanceText);
    const riskPercent = riskText === undefined ? 0.25 : Number(riskText);
    if (!Number.isFinite(balance) || !Number.isFinite(riskPercent)) throw new Error('balance and risk must be numeric');

    const report = runPaperReplay({
      symbol,
      h4Candles: parseOhlcCsv(readFileSync(h4Path, 'utf8')),
      m5Candles: parseOhlcCsv(readFileSync(m5Path, 'utf8')),
      initialBalance: balance,
      riskPercent,
      newsClear: process.argv.includes('--news-clear'),
    });
    console.log(JSON.stringify(report, null, 2));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

import type { Candle, Direction } from '../config/types.js';
import { calculateFibonacciLevels } from './fibonacci.js';
import { calculateIchimoku, detectSupplyDemand, evaluateRsiConfirmation } from './confirmations.js';

export interface TimestampedCandle extends Candle {
  timestamp: number;
  high: number;
  low: number;
}

export interface PaperReplayTrade {
  symbol: string;
  side: 'long' | 'short';
  entryTime: number;
  exitTime: number;
  entry: number;
  exit: number;
  stopLoss: number;
  takeProfit: number;
  quantity: number;
  pnl: number;
  exitReason: 'stop-loss' | 'take-profit' | 'end-of-data';
}

export interface PaperReplayInput {
  symbol: string;
  h4Candles: TimestampedCandle[];
  m5Candles: TimestampedCandle[];
  initialBalance?: number;
  riskPercent?: number;
  dayMaxTrades?: number;
  maxDrawdownPercent?: number;
  newsClear?: boolean;
}

export interface PaperReplayReport {
  symbol: string;
  mode: 'paper-replay';
  newsGateOpen: boolean;
  initialBalance: number;
  finalBalance: number;
  netPnl: number;
  scannedCandles: number;
  blockedSignals: number;
  trades: PaperReplayTrade[];
  notes: string[];
}

export function parseOhlcCsv(csv: string): TimestampedCandle[] {
  const rows = csv.trim().split(/\r?\n/).filter(Boolean);
  if (rows.length < 2) throw new Error('candle CSV must contain a header and at least one row');

  const headers = rows[0].split(',').map((header) => header.trim().toLowerCase());
  if (new Set(headers).size !== headers.length) throw new Error('candle CSV contains duplicate columns');
  for (const required of ['timestamp', 'high', 'low', 'close']) {
    if (!headers.includes(required)) throw new Error(`candle CSV is missing required column: ${required}`);
  }

  const candles = rows.slice(1).map((row, index) => {
    const values = row.split(',').map((value) => value.trim());
    if (values.length !== headers.length) throw new Error(`invalid candle CSV row ${index + 2}`);
    const record = Object.fromEntries(headers.map((header, column) => [header, values[column]]));
    const timestamp = parseTimestamp(record.timestamp);
    const high = Number(record.high);
    const low = Number(record.low);
    const close = Number(record.close);
    if (![timestamp, high, low, close].every(Number.isFinite) || high < low || close < low || close > high) {
      throw new Error(`invalid candle values on CSV row ${index + 2}`);
    }
    return { timestamp, high, low, close };
  });

  for (let index = 1; index < candles.length; index += 1) {
    if (candles[index].timestamp <= candles[index - 1].timestamp) {
      throw new Error('candle timestamps must be strictly increasing');
    }
  }
  return candles;
}

export function runPaperReplay(input: PaperReplayInput): PaperReplayReport {
  validateReplayInput(input);
  const initialBalance = input.initialBalance ?? 10_000;
  const riskPercent = input.riskPercent ?? 0.25;
  const dayMaxTrades = input.dayMaxTrades ?? 4;
  const maxDrawdownPercent = input.maxDrawdownPercent ?? 2;
  const newsClear = input.newsClear ?? false;
  let balance = initialBalance;
  let peakBalance = initialBalance;
  let blockedSignals = 0;
  const trades: PaperReplayTrade[] = [];
  const dailyTradeCounts = new Map<string, number>();
  let cursor = 52;
  const maxH4AgeMs = 4 * 60 * 60 * 1000;

  while (cursor < input.m5Candles.length) {
    const candle = input.m5Candles[cursor];
    const h4End = lastCandleAtOrBefore(input.h4Candles, candle.timestamp);
    if (h4End < 51 || cursor < 52 || candle.timestamp - input.h4Candles[h4End].timestamp > maxH4AgeMs) {
      cursor += 1;
      continue;
    }

    const h4 = input.h4Candles.slice(Math.max(0, h4End - 51), h4End + 1);
    const m5 = input.m5Candles.slice(Math.max(0, cursor - 51), cursor + 1);
    const h4Direction = getTrend(h4);
    const m5Direction = getTrend(m5);
    const direction = h4Direction !== 'neutral' && h4Direction === m5Direction ? h4Direction : 'neutral';
    const h4Signal = direction === 'neutral' ? false : hasBreakoutRetracement(h4, direction);
    const m5Signal = direction === 'neutral' ? false : hasBreakoutRetracement(m5, direction);

    if (direction !== 'neutral' && h4Signal && m5Signal) {
      const side = direction === 'bullish' ? 'long' : 'short';
      const h4Demand = detectSupplyDemand(h4, direction);
      const m5Demand = detectSupplyDemand(m5, direction);
      const h4Ichimoku = calculateIchimoku(h4);
      const m5Ichimoku = calculateIchimoku(m5);
      const rsi = calculateRsi(m5, 14);
      const dateKey = new Date(candle.timestamp).toISOString().slice(0, 10);
      const dayTrades = dailyTradeCounts.get(dateKey) ?? 0;
      const drawdownPercent = peakBalance <= 0 ? 0 : ((peakBalance - balance) / peakBalance) * 100;
      const entry = candle.close;
      const stopLoss = side === 'long'
        ? Math.min(...m5.slice(-14).map((bar) => bar.low))
        : Math.max(...m5.slice(-14).map((bar) => bar.high));
      const distance = Math.abs(entry - stopLoss);
      const qualifies = h4Demand.valid
        && h4Demand.inZone
        && m5Demand.valid
        && m5Demand.inZone
        && h4Ichimoku.valid
        && h4Ichimoku.direction === direction
        && m5Ichimoku.valid
        && m5Ichimoku.direction === direction
        && evaluateRsiConfirmation(rsi, direction).allowed
        && newsClear
        && dayTrades < dayMaxTrades
        && drawdownPercent < maxDrawdownPercent
        && distance > 0;

      if (qualifies) {
        const takeProfit = side === 'long' ? entry + distance * 2 : entry - distance * 2;
        const quantity = balance * (riskPercent / 100) / distance;
        const result = simulateExit(input.m5Candles, cursor + 1, side, stopLoss, takeProfit);
        const pnl = (side === 'long' ? result.exit - entry : entry - result.exit) * quantity;
        trades.push({
          symbol: input.symbol,
          side,
          entryTime: candle.timestamp,
          exitTime: result.timestamp,
          entry,
          exit: result.exit,
          stopLoss,
          takeProfit,
          quantity,
          pnl,
          exitReason: result.reason,
        });
        balance += pnl;
        peakBalance = Math.max(peakBalance, balance);
        dailyTradeCounts.set(dateKey, dayTrades + 1);
        cursor = result.nextCursor;
      } else {
        blockedSignals += 1;
        cursor += 1;
      }
    } else {
      cursor += 1;
    }
  }

  return {
    symbol: input.symbol,
    mode: 'paper-replay',
    newsGateOpen: newsClear,
    initialBalance,
    finalBalance: balance,
    netPnl: balance - initialBalance,
    scannedCandles: Math.max(0, input.m5Candles.length - 52),
    blockedSignals,
    trades,
    notes: [
      'Historical candle replay only; no live prices or broker orders are used.',
      'Candle timestamps must be UTC candle-close timestamps.',
      'Position size assumes price movement and P/L are in the same quote-currency units.',
      newsClear ? 'News clearance was explicitly asserted; no historical news feed was checked.' : 'Trades are blocked unless --news-clear is explicitly supplied.',
      'No spread, commissions, slippage, or price gaps are modeled; exits use exact stop/target levels.',
      'A candle touching both stop-loss and take-profit is conservatively recorded as a stop-loss.',
    ],
  };
}

function validateReplayInput(input: PaperReplayInput): void {
  if (!input.symbol.trim()) throw new Error('symbol is required');
  if (!Array.isArray(input.h4Candles) || !Array.isArray(input.m5Candles)) throw new Error('H4 and M5 candle arrays are required');
  if (input.h4Candles.length < 52 || input.m5Candles.length < 53) throw new Error('replay requires at least 52 H4 and 53 M5 candles');
  if (!Number.isFinite(input.initialBalance ?? 10_000) || (input.initialBalance ?? 10_000) <= 0) throw new Error('initial balance must be positive');
  if (!Number.isFinite(input.riskPercent ?? 0.25) || (input.riskPercent ?? 0.25) <= 0 || (input.riskPercent ?? 0.25) > 0.25) throw new Error('risk percent must be greater than 0 and no more than 0.25');
  if (!Number.isInteger(input.dayMaxTrades ?? 4) || (input.dayMaxTrades ?? 4) <= 0) throw new Error('day max trades must be a positive integer');
  if (!Number.isFinite(input.maxDrawdownPercent ?? 2) || (input.maxDrawdownPercent ?? 2) <= 0) throw new Error('max drawdown percent must be positive');
  assertSortedCandles(input.h4Candles, 'H4');
  assertSortedCandles(input.m5Candles, 'M5');
}

function assertSortedCandles(candles: TimestampedCandle[], name: string): void {
  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index];
    if (![candle.timestamp, candle.high, candle.low, candle.close].every(Number.isFinite)
      || !Number.isSafeInteger(candle.timestamp) || candle.timestamp < 0 || Number.isNaN(new Date(candle.timestamp).getTime())
      || candle.high < candle.low || candle.close < candle.low || candle.close > candle.high) {
      throw new Error(`${name} candles contain invalid OHLC values`);
    }
    if (index > 0 && candle.timestamp <= candles[index - 1].timestamp) {
      throw new Error(`${name} candle timestamps must be strictly increasing`);
    }
  }
}

function parseTimestamp(value: string): number {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && value !== '') return numeric;
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    throw new Error('ISO-8601 candle timestamps must include a UTC offset');
  }
  const parsed = Date.parse(value);
  if (!Number.isSafeInteger(parsed)) throw new Error('candle timestamp must be epoch milliseconds or an ISO-8601 date');
  return parsed;
}

function lastCandleAtOrBefore(candles: TimestampedCandle[], timestamp: number): number {
  let low = 0;
  let high = candles.length - 1;
  let result = -1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (candles[middle].timestamp <= timestamp) {
      result = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return result;
}

function getTrend(candles: TimestampedCandle[]): Direction {
  const closes = candles.slice(-20).map((candle) => candle.close);
  const first = closes[0];
  const last = closes.at(-1);
  if (first === undefined || last === undefined || first === last) return 'neutral';
  return last > first ? 'bullish' : 'bearish';
}

function hasBreakoutRetracement(candles: TimestampedCandle[], direction: Exclude<Direction, 'neutral'>): boolean {
  const firstCandidate = Math.max(20, candles.length - 8);
  for (let breakoutIndex = candles.length - 1; breakoutIndex >= firstCandidate; breakoutIndex -= 1) {
    const prior = candles.slice(breakoutIndex - 20, breakoutIndex);
    const breakout = candles[breakoutIndex];
    const priorLevel = direction === 'bullish'
      ? Math.max(...prior.map((candle) => candle.high))
      : Math.min(...prior.map((candle) => candle.low));
    const confirmed = direction === 'bullish' ? breakout.close > priorLevel : breakout.close < priorLevel;
    if (!confirmed) continue;

    const impulse = candles.slice(breakoutIndex);
    const start = direction === 'bullish'
      ? Math.min(...prior.map((candle) => candle.low))
      : Math.max(...prior.map((candle) => candle.high));
    const end = direction === 'bullish'
      ? Math.max(...impulse.map((candle) => candle.high))
      : Math.min(...impulse.map((candle) => candle.low));
    const levels = calculateFibonacciLevels(start, end);
    const lower = Math.min(levels[50], levels[61_8]);
    const upper = Math.max(levels[50], levels[61_8]);
    const currentPrice = candles.at(-1)!.close;
    if (currentPrice >= lower && currentPrice <= upper) return true;
  }
  return false;
}

function calculateRsi(candles: TimestampedCandle[], period: number): number {
  if (candles.length <= period) return Number.NaN;
  let gains = 0;
  let losses = 0;
  const start = candles.length - period;
  for (let index = start; index < candles.length; index += 1) {
    const change = candles[index].close - candles[index - 1].close;
    if (change > 0) gains += change;
    else losses -= change;
  }
  if (losses === 0) return gains === 0 ? 50 : 100;
  if (gains === 0) return 0;
  const relativeStrength = gains / losses;
  return 100 - (100 / (1 + relativeStrength));
}

function simulateExit(
  candles: TimestampedCandle[],
  startIndex: number,
  side: 'long' | 'short',
  stopLoss: number,
  takeProfit: number,
): { exit: number; timestamp: number; reason: PaperReplayTrade['exitReason']; nextCursor: number } {
  for (let index = startIndex; index < candles.length; index += 1) {
    const candle = candles[index];
    const stopHit = side === 'long' ? candle.low <= stopLoss : candle.high >= stopLoss;
    const takeProfitHit = side === 'long' ? candle.high >= takeProfit : candle.low <= takeProfit;
    if (stopHit) return { exit: stopLoss, timestamp: candle.timestamp, reason: 'stop-loss', nextCursor: index + 1 };
    if (takeProfitHit) return { exit: takeProfit, timestamp: candle.timestamp, reason: 'take-profit', nextCursor: index + 1 };
  }
  const last = candles.at(-1)!;
  return { exit: last.close, timestamp: last.timestamp, reason: 'end-of-data', nextCursor: candles.length };
}

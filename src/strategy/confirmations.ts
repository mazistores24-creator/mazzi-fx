import type { Candle, Direction } from '../config/types.js';

export interface SupplyDemandResult {
  direction: Direction;
  zoneLow: number;
  zoneHigh: number;
  inZone: boolean;
  valid: boolean;
}

export function detectSupplyDemand(candles: Candle[], direction: Exclude<Direction, 'neutral'>): SupplyDemandResult {
  if (candles.length < 3) {
    return { direction, zoneLow: 0, zoneHigh: 0, inZone: false, valid: false };
  }

  const recent = candles.slice(-5);
  const highs = recent.map((candle) => candle.high ?? candle.close);
  const lows = recent.map((candle) => candle.low ?? candle.close);
  const rangeHigh = Math.max(...highs);
  const rangeLow = Math.min(...lows);
  const range = rangeHigh - rangeLow;
  const zoneLow = direction === 'bullish' ? rangeLow : rangeHigh - range * 0.3;
  const zoneHigh = direction === 'bullish' ? rangeLow + range * 0.3 : rangeHigh;
  const currentPrice = recent[recent.length - 1].close;

  return {
    direction,
    zoneLow,
    zoneHigh,
    inZone: currentPrice >= zoneLow && currentPrice <= zoneHigh,
    valid: range > 0,
  };
}

export interface IchimokuResult {
  direction: Direction;
  conversionLine: number;
  baseLine: number;
  leadingSpanA: number;
  leadingSpanB: number;
  aboveCloud: boolean;
  belowCloud: boolean;
  valid: boolean;
}

export interface IchimokuPeriods {
  conversionPeriod?: number;
  basePeriod?: number;
  spanPeriod?: number;
}

export function calculateIchimoku(candles: Candle[], periods: IchimokuPeriods = {}): IchimokuResult {
  const conversionPeriod = periods.conversionPeriod ?? 9;
  const basePeriod = periods.basePeriod ?? 26;
  const spanPeriod = periods.spanPeriod ?? 52;
  const required = Math.max(conversionPeriod, basePeriod, spanPeriod);

  if (candles.length < required) {
    return {
      direction: 'neutral',
      conversionLine: 0,
      baseLine: 0,
      leadingSpanA: 0,
      leadingSpanB: 0,
      aboveCloud: false,
      belowCloud: false,
      valid: false,
    };
  }

  const midpoint = (period: number) => {
    const window = candles.slice(-period);
    const high = Math.max(...window.map((candle) => candle.high ?? candle.close));
    const low = Math.min(...window.map((candle) => candle.low ?? candle.close));
    return (high + low) / 2;
  };
  const conversionLine = midpoint(conversionPeriod);
  const baseLine = midpoint(basePeriod);
  const leadingSpanA = (conversionLine + baseLine) / 2;
  const leadingSpanB = midpoint(spanPeriod);
  const currentPrice = candles[candles.length - 1].close;
  const cloudHigh = Math.max(leadingSpanA, leadingSpanB);
  const cloudLow = Math.min(leadingSpanA, leadingSpanB);
  const aboveCloud = currentPrice > cloudHigh;
  const belowCloud = currentPrice < cloudLow;

  return {
    direction: aboveCloud ? 'bullish' : belowCloud ? 'bearish' : 'neutral',
    conversionLine,
    baseLine,
    leadingSpanA,
    leadingSpanB,
    aboveCloud,
    belowCloud,
    valid: true,
  };
}

export function evaluateRsiConfirmation(rsi: number, direction: Exclude<Direction, 'neutral'>): { allowed: boolean; reason: string } {
  const allowed = Number.isFinite(rsi)
    && rsi >= 0
    && rsi <= 100
    && (direction === 'bullish' ? rsi <= 10 : rsi >= 90);
  return {
    allowed,
    reason: allowed ? 'RSI extreme confirmed' : 'RSI extreme not confirmed',
  };
}

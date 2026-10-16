import type { Direction } from '../config/types.js';
import { evaluateRsiConfirmation } from './confirmations.js';

export interface QualificationInput {
  direction: Exclude<Direction, 'neutral'>;
  h4Valid: boolean;
  h4Breakout: boolean;
  h4FibZone: boolean;
  h4Retracement: boolean;
  m5Valid: boolean;
  m5Breakout: boolean;
  m5FibZone: boolean;
  m5Retracement: boolean;
  supplyDemand: boolean;
  ichimoku: boolean;
  rsi: number;
  m5Confirmation: boolean;
  riskOk: boolean;
  newsOk: boolean;
  propFirmOk: boolean;
  brokerOk: boolean;
  drawdownOk: boolean;
  tradeLimitOk: boolean;
  duplicateSetup: boolean;
  setupValid: boolean;
  marketAvailable: boolean;
}

export interface QualificationResult {
  allowed: boolean;
  reason: string;
  checks: Record<string, boolean>;
}

export function qualifyTrade(input: QualificationInput): QualificationResult {
  const checks = {
    h4: input.h4Valid,
    h4Breakout: input.h4Breakout,
    h4FibZone: input.h4FibZone,
    h4Retracement: input.h4Retracement,
    m5: input.m5Valid,
    m5Breakout: input.m5Breakout,
    m5FibZone: input.m5FibZone,
    m5Retracement: input.m5Retracement,
    supplyDemand: input.supplyDemand,
    ichimoku: input.ichimoku,
    rsi: evaluateRsiConfirmation(input.rsi, input.direction).allowed,
    m5Confirmation: input.m5Confirmation,
    risk: input.riskOk,
    news: input.newsOk,
    propFirm: input.propFirmOk,
    broker: input.brokerOk,
    drawdown: input.drawdownOk,
    tradeLimit: input.tradeLimitOk,
    duplicate: !input.duplicateSetup,
    setup: input.setupValid,
    market: input.marketAvailable,
  };

  const allowed = Object.values(checks).every(Boolean);

  return {
    allowed,
    reason: allowed ? 'trade ready' : Object.entries(checks).find(([, value]) => !value)?.[0] ?? 'blocked',
    checks,
  };
}

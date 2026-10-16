export * from './config/types.js';
export * from './config/defaults.js';
export * from './config/runtime.js';
export * from './strategy/fibonacci.js';
export * from './strategy/market-structure.js';
export * from './strategy/risk.js';
export * from './strategy/h4.js';
export * from './strategy/m5.js';
export * from './strategy/qualification.js';
export * from './strategy/risk-safety.js';
export * from './strategy/scanner.js';
export * from './strategy/execution-safety.js';
export * from './brokers/broker-adapter.js';
export * from './strategy/trade-management.js';
export * from './strategy/position-monitor.js';
export * from './strategy/trading-engine.js';
export * from './strategy/confirmations.js';
export * from './strategy/alerts.js';
export * from './strategy/monitoring.js';
export * from './strategy/backtesting.js';
export * from './strategy/backtest-ingestion.js';
export * from './strategy/deployment.js';
export * from './strategy/recovery.js';
export * from './strategy/persistence.js';
export * from './strategy/execution-integrity.js';
export * from './strategy/execution-recovery.js';
export * from './strategy/live-execution.js';
export * from './strategy/paper-trading.js';
export * from './strategy/paper-replay.js';
export * from './brokers/execution-pipeline.js';
export * from './brokers/deriv-api.js';
export * from './brokers/transport.js';
export * from './brokers/mock-deriv-transport.js';
export * from './brokers/deriv-client.js';
export * from './storage/trade-database.js';
export * from './alerts/alert-router.js';
export * from './dashboard/server.js';
export * from './ops/logger.js';
export * from './ops/runtime-health.js';

import type { TradeEvaluationInput } from './config/types.js';
import { evaluateRsiConfirmation } from './strategy/confirmations.js';

export function evaluateTrade(input: TradeEvaluationInput) {
  const checks = {
    h4Context: input.h4Trend !== 'neutral',
    h4Breakout: input.h4Breakout,
    h4Fib: input.h4FibRetest && input.h4FibZone,
    m5Breakout: input.m5Breakout,
    m5Fib: input.m5FibRetest && input.m5FibZone,
    supplyDemand: input.supplyDemand,
    ichimoku: input.ichimoku,
    rsi: input.h4Trend !== 'neutral' && evaluateRsiConfirmation(input.rsi, input.h4Trend).allowed,
    m5Confirmation: input.m5Confirmation,
    risk: input.riskOk,
    news: input.newsOk,
    propFirm: input.propFirmOk,
    broker: input.brokerOk,
    spread: input.spreadOk,
    drawdown: input.drawdownOk,
    dayTrades: input.maxDayTradesOk,
    duplicate: !input.duplicateSetup,
    setup: input.setupValid,
    market: input.marketAvailable,
  };

  const allowed = Object.values(checks).every(Boolean);

  return {
    allowed,
    reason: allowed ? 'ready' : Object.entries(checks).find(([, value]) => !value)?.[0] ?? 'blocked',
    checks,
  };
}

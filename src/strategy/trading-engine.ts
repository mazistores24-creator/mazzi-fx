import type { DerivOrderRequest } from '../brokers/deriv-api.js';
import type { DerivTransportClient } from '../brokers/deriv-client.js';
import type { PersistentStateStore } from './persistence.js';
import type { TradeDatabase } from '../storage/trade-database.js';
import { evaluateRiskSafety } from './risk-safety.js';
import { qualifyTrade } from './qualification.js';
import { createExecutionRecoveryPlan } from './execution-recovery.js';
import { evaluatePositionState, type ManagedPosition, type PositionStateResult } from './position-monitor.js';
import { savePersistentState, type PersistentState } from './persistence.js';

export interface TradingEngineConfig {
  riskPercent: number;
  riskLimitPercent: number;
  mode: 'DAY' | 'SWING' | 'POSITION';
  dayMaxTrades: number;
  dayMaxDrawdown: number;
  swingMaxDrawdown: number;
  positionMaxDrawdown: number;
  tickSize: number;
  tickValue: number;
  contractSize: number;
  propFirmOk: boolean;
  newsOk: boolean;
  brokerOk: boolean;
  paperTrading: boolean;
  maxDrawdownPercent: number;
  trailingEnabled: boolean;
  activationR: number;
  protectedR: number;
}

export interface TradingCycleInput {
  symbol: string;
  side: 'buy' | 'sell';
  entry: number;
  stopLoss: number;
  takeProfit: number;
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
  setupValid: boolean;
  marketAvailable: boolean;
  currentDrawdownPercent: number;
  dayTradeCount: number;
  duplicateSetup: boolean;
  accountEquity: number;
}

export interface TradingCycleResult {
  allowed: boolean;
  stage: 'blocked' | 'qualified' | 'executed' | 'paper';
  reason: string;
  qualification: ReturnType<typeof qualifyTrade>;
  risk: ReturnType<typeof evaluateRiskSafety>;
  orderId?: string;
  position?: ManagedPosition;
}

export interface TradingEngine {
  evaluateAndExecute: (input: TradingCycleInput) => Promise<TradingCycleResult>;
  monitorPosition: (position: ManagedPosition, currentPrice: number, accountEquity: number, peakEquity: number, spread: number) => PositionStateResult;
  restoreState: () => PersistentState | undefined;
}

export function createTradingEngine(
  broker: DerivTransportClient,
  config: TradingEngineConfig,
  dependencies: { stateStore?: PersistentStateStore; database?: TradeDatabase } = {},
): TradingEngine {
  let currentState: PersistentState | undefined;
  let paperOrderSequence = 0;

  const persist = (input: TradingCycleInput, openPositions: PersistentState['openPositions'] = []) => {
    const state = savePersistentState({
      accountEquity: input.accountEquity,
      drawdownPercent: input.currentDrawdownPercent,
      openPositions,
      setupState: { symbol: input.symbol, state: 'OPEN' },
      trailingState: { enabled: config.trailingEnabled, activationR: config.activationR, protectedR: config.protectedR },
    }).state;
    currentState = state;
    dependencies.stateStore?.save(state);
    return state;
  };

  return {
    evaluateAndExecute: async (input) => {
      const account = config.paperTrading ? undefined : await broker.getAccount();
      const brokerConnected = config.paperTrading || (account !== undefined && account.balance > 0);
      const risk = evaluateRiskSafety({
        accountEquity: input.accountEquity,
        riskPercent: config.riskPercent,
        riskLimitPercent: config.riskLimitPercent,
        entry: input.entry,
        stop: input.stopLoss,
        tickSize: config.tickSize,
        tickValue: config.tickValue,
        contractSize: config.contractSize,
        currentDrawdownPercent: input.currentDrawdownPercent,
        dayTradeCount: input.dayTradeCount,
        dayMaxTrades: config.dayMaxTrades,
        dayMaxDrawdown: config.dayMaxDrawdown,
        swingMaxDrawdown: config.swingMaxDrawdown,
        positionMaxDrawdown: config.positionMaxDrawdown,
        mode: config.mode,
        newsOk: config.newsOk,
        propFirmOk: config.propFirmOk,
        brokerOk: config.brokerOk && brokerConnected,
        duplicateSetup: input.duplicateSetup,
      });
      const qualification = qualifyTrade({
        direction: input.side === 'buy' ? 'bullish' : 'bearish',
        h4Valid: input.h4Valid,
        h4Breakout: input.h4Breakout,
        h4FibZone: input.h4FibZone,
        h4Retracement: input.h4Retracement,
        m5Valid: input.m5Valid,
        m5Breakout: input.m5Breakout,
        m5FibZone: input.m5FibZone,
        m5Retracement: input.m5Retracement,
        supplyDemand: input.supplyDemand,
        ichimoku: input.ichimoku,
        rsi: input.rsi,
        m5Confirmation: input.m5Confirmation,
        riskOk: risk.allowed,
        newsOk: config.newsOk,
        propFirmOk: config.propFirmOk,
        brokerOk: config.brokerOk && brokerConnected,
        drawdownOk: risk.checks.drawdown,
        tradeLimitOk: risk.checks.dayTradeLimit,
        duplicateSetup: input.duplicateSetup,
        setupValid: input.setupValid,
        marketAvailable: input.marketAvailable,
      });

      if (!qualification.allowed) {
        dependencies.database?.recordEvent({ type: 'trade-blocked', payload: { symbol: input.symbol, reason: qualification.reason }, timestamp: Date.now() });
        return { allowed: false, stage: 'blocked', reason: qualification.reason, qualification, risk };
      }

      const order: DerivOrderRequest = {
        symbol: input.symbol,
        side: input.side,
        volume: risk.lotSize,
        stopLoss: input.stopLoss,
        takeProfit: input.takeProfit,
      };
      if (config.paperTrading) {
        const orderId = `paper-order-${++paperOrderSequence}`;
        const position: ManagedPosition = {
          symbol: input.symbol,
          side: input.side === 'buy' ? 'long' : 'short',
          entry: input.entry,
          stopLoss: input.stopLoss,
          takeProfit: input.takeProfit,
          quantity: risk.lotSize,
        };
        persist(input, [{ symbol: position.symbol, side: position.side, entry: position.entry, stop: position.stopLoss }]);
        dependencies.database?.recordTrade({ id: orderId, symbol: position.symbol, side: position.side, entry: position.entry, quantity: position.quantity, status: 'open', timestamp: Date.now() });
        dependencies.database?.recordEvent({ type: 'paper-trade-simulated', payload: { symbol: input.symbol, orderId }, timestamp: Date.now() });
        return { allowed: true, stage: 'paper', reason: 'paper trade simulated; no broker order submitted', qualification, risk, orderId, position };
      }

      const submitted = await broker.placeOrder(order);
      const status = await broker.getOrderStatus(submitted.orderId);
      const recovery = createExecutionRecoveryPlan({
        brokerConnected,
        orderSubmitted: submitted.accepted,
        orderStatus: status.status === 'filled' ? 'filled' : status.status === 'pending' ? 'pending' : 'unknown',
        partialFill: status.status === 'partially_filled',
        protectiveOrdersVerified: Boolean(input.stopLoss && input.takeProfit),
        duplicateOrder: input.duplicateSetup,
        latencyExceeded: false,
      });

      if (!recovery.allowedToContinue || !submitted.accepted || status.status !== 'filled') {
        dependencies.database?.recordEvent({ type: 'execution-blocked', payload: { symbol: input.symbol, reason: recovery.reason }, timestamp: Date.now() });
        return { allowed: false, stage: 'blocked', reason: recovery.reason, qualification, risk, orderId: submitted.orderId };
      }

      const fillPrice = status.fillPrice ?? input.entry;
      const position: ManagedPosition = {
        symbol: input.symbol,
        side: input.side === 'buy' ? 'long' : 'short',
        entry: fillPrice,
        stopLoss: input.stopLoss,
        takeProfit: input.takeProfit,
        quantity: risk.lotSize,
      };
      persist(input, [{ symbol: position.symbol, side: position.side, entry: position.entry, stop: position.stopLoss }]);
      dependencies.database?.recordTrade({ id: submitted.orderId, symbol: position.symbol, side: position.side, entry: position.entry, quantity: position.quantity, status: 'open', timestamp: Date.now() });
      return { allowed: true, stage: 'executed', reason: 'trade executed and protected', qualification, risk, orderId: submitted.orderId, position };
    },
    monitorPosition: (position, currentPrice, accountEquity, peakEquity, spread) => evaluatePositionState({ position, currentPrice, accountEquity, peakEquity, spread, maxDrawdownPercent: config.maxDrawdownPercent, trailingEnabled: config.trailingEnabled, activationR: config.activationR, protectedR: config.protectedR }),
    restoreState: () => {
      if (currentState) return currentState;
      if (!dependencies.stateStore) return undefined;
      currentState = dependencies.stateStore.load();
      return currentState;
    },
  };
}

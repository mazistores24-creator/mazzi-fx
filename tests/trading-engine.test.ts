import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  calculateFibonacciLevels,
  isInFibZone,
  detectBreakout,
  detectMarketStructure,
  evaluateTrade,
  getRiskPerTrade,
  evaluateH4Setup,
  detectH4Breakout,
  isH4RetracementInZone,
  evaluateM5Setup,
  detectM5Breakout,
  isM5RetracementInZone,
  qualifyTrade,
  evaluateRiskSafety,
  scanMarket,
  createSetupState,
  registerSetup,
  evaluateExecutionSafety,
  createBrokerAdapter,
  getSyntheticIndexSpec,
  evaluateTrailingProfit,
  createAlert,
  createDashboardSnapshot,
  evaluateSystemHealth,
  createMonitoringSnapshot,
  runBacktest,
  validateDeploymentConfig,
  createStartupPlan,
  createShutdownPlan,
  reconcileBrokerState,
  createRecoveryPlan,
  savePersistentState,
  restorePersistentState,
  createPersistentStateStore,
  validateExecutionIntegrity,
  validateLiveExecution,
  createPaperTradeLedger,
  createExecutionPipeline,
  createDerivApiClient,
  evaluatePositionState,
  detectSupplyDemand,
  calculateIchimoku,
  evaluateRsiConfirmation,
  createExecutionRecoveryPlan,
  runWalkForwardBacktest,
} from '../src/index.js';

describe('strategy core', () => {
  it('builds Fibonacci levels and identifies 50-61.8 zone', () => {
    const levels = calculateFibonacciLevels(100, 140);
    expect(levels[0]).toBe(100);
    expect(levels[50]).toBeCloseTo(120, 1);
    expect(levels[61_8]).toBeCloseTo(124.72, 1);
    expect(isInFibZone(124, levels)).toBe(true);
  });

  it('detects bullish market structure and breakout', () => {
    const candles = [
      { close: 100 }, { close: 102 }, { close: 105 }, { close: 104 }, { close: 106 }, { close: 108 }
    ];
    const structure = detectMarketStructure(candles);
    expect(structure.direction).toBe('bullish');
    expect(structure.breakout).toBe(true);
  });

  it('applies strict risk sizing', () => {
    const risk = getRiskPerTrade({ accountEquity: 10000, riskPercent: 0.25, entry: 1.1000, stop: 1.0950, tickSize: 0.0001, tickValue: 1, contractSize: 100000 });
    expect(risk.riskAmount).toBeCloseTo(25, 5);
    expect(risk.lotSize).toBeGreaterThan(0);
  });

  it('allows a valid M5 execution after H4 context and M5 retracement', () => {
    const trade = evaluateTrade({
      h4Trend: 'bullish',
      h4Breakout: true,
      h4FibRetest: true,
      h4FibZone: true,
      m5Trend: 'bullish',
      m5Breakout: true,
      m5FibRetest: true,
      m5FibZone: true,
      supplyDemand: true,
      ichimoku: true,
      rsi: 9,
      m5Confirmation: true,
      riskOk: true,
      newsOk: true,
      propFirmOk: true,
      brokerOk: true,
      spreadOk: true,
      drawdownOk: true,
      maxDayTradesOk: true,
      duplicateSetup: false,
      setupValid: true,
      marketAvailable: true,
      accountEquity: 10000,
      riskPercent: 0.25,
      entry: 1.1000,
      stop: 1.0950,
      tickSize: 0.0001,
      tickValue: 1,
      contractSize: 100000
    });

    expect(trade.allowed).toBe(true);
    expect(trade.reason).toBe('ready');
  });

  it('blocks trades during a news blackout', () => {
    const trade = evaluateTrade({
      h4Trend: 'bullish',
      h4Breakout: true,
      h4FibRetest: true,
      h4FibZone: true,
      m5Trend: 'bullish',
      m5Breakout: true,
      m5FibRetest: true,
      m5FibZone: true,
      supplyDemand: true,
      ichimoku: true,
      rsi: 9,
      m5Confirmation: true,
      riskOk: true,
      newsOk: false,
      propFirmOk: true,
      brokerOk: true,
      spreadOk: true,
      drawdownOk: true,
      maxDayTradesOk: true,
      duplicateSetup: false,
      setupValid: true,
      marketAvailable: true,
      accountEquity: 10000,
      riskPercent: 0.25,
      entry: 1.1000,
      stop: 1.0950,
      tickSize: 0.0001,
      tickValue: 1,
      contractSize: 100000
    });

    expect(trade.allowed).toBe(false);
    expect(trade.reason).toContain('news');
  });

  it('validates a bullish H4 setup with breakout, Fibonacci, and retracement', () => {
    const setup = evaluateH4Setup({
      direction: 'bullish',
      trendValid: true,
      swingHigh: 1.2000,
      swingLow: 1.1500,
      breakoutLevel: 1.2000,
      breakoutClose: 1.2050,
      fibStart: 1.1500,
      fibEnd: 1.2000,
      price: 1.1800,
      retracementZoneMin: 50,
      retracementZoneMax: 61.8,
      structureValid: true,
    });

    expect(setup.valid).toBe(true);
    expect(setup.direction).toBe('bullish');
    expect(setup.breakout).toBe(true);
    expect(setup.retracementInZone).toBe(true);
  });

  it('rejects invalid H4 breakout and retracement flow', () => {
    const breakout = detectH4Breakout({
      direction: 'bullish',
      previousSwingHigh: 1.2000,
      close: 1.1950,
      threshold: 0.002,
    });

    const retracement = isH4RetracementInZone({
      price: 1.1300,
      fibStart: 1.1500,
      fibEnd: 1.2000,
      min: 50,
      max: 61.8,
    });

    expect(breakout).toBe(false);
    expect(retracement).toBe(false);
  });

  it('validates a bullish M5 execution sequence with breakout, Fibonacci, and retracement', () => {
    const setup = evaluateM5Setup({
      direction: 'bullish',
      trendValid: true,
      swingHigh: 1.1980,
      swingLow: 1.1700,
      breakoutLevel: 1.1980,
      breakoutClose: 1.2020,
      fibStart: 1.1700,
      fibEnd: 1.1980,
      price: 1.1860,
      retracementZoneMin: 50,
      retracementZoneMax: 61.8,
      structureValid: true,
    });

    expect(setup.valid).toBe(true);
    expect(setup.direction).toBe('bullish');
    expect(setup.breakout).toBe(true);
    expect(setup.retracementInZone).toBe(true);
  });

  it('rejects invalid M5 execution', () => {
    const breakout = detectM5Breakout({
      direction: 'bullish',
      previousSwingHigh: 1.1980,
      close: 1.1960,
      threshold: 0.002,
    });

    const retracement = isM5RetracementInZone({
      price: 1.1500,
      fibStart: 1.1700,
      fibEnd: 1.1980,
      min: 50,
      max: 61.8,
    });

    expect(breakout).toBe(false);
    expect(retracement).toBe(false);
  });

  it('qualifies a complete H4 + M5 trade setup only when all mandatory conditions pass', () => {
    const result = qualifyTrade({
      direction: 'bullish',
      h4Valid: true,
      h4Breakout: true,
      h4FibZone: true,
      h4Retracement: true,
      m5Valid: true,
      m5Breakout: true,
      m5FibZone: true,
      m5Retracement: true,
      supplyDemand: true,
      ichimoku: true,
      rsi: 9,
      m5Confirmation: true,
      riskOk: true,
      newsOk: true,
      propFirmOk: true,
      brokerOk: true,
      drawdownOk: true,
      tradeLimitOk: true,
      duplicateSetup: false,
      setupValid: true,
      marketAvailable: true,
    });

    expect(result.allowed).toBe(true);
    expect(result.reason).toContain('ready');
  });

  it('blocks qualification when any required stage is missing', () => {
    const result = qualifyTrade({
      direction: 'bullish',
      h4Valid: true,
      h4Breakout: true,
      h4FibZone: true,
      h4Retracement: true,
      m5Valid: false,
      m5Breakout: false,
      m5FibZone: false,
      m5Retracement: false,
      supplyDemand: true,
      ichimoku: true,
      rsi: 45,
      m5Confirmation: false,
      riskOk: true,
      newsOk: true,
      propFirmOk: true,
      brokerOk: true,
      drawdownOk: true,
      tradeLimitOk: true,
      duplicateSetup: false,
      setupValid: true,
      marketAvailable: true,
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('m5');
  });

  it('enforces exact risk, drawdown, and day-trade limits', () => {
    const riskState = evaluateRiskSafety({
      accountEquity: 10000,
      riskPercent: 0.25,
      riskLimitPercent: 0.25,
      entry: 1.1000,
      stop: 1.0950,
      tickSize: 0.0001,
      tickValue: 1,
      contractSize: 100000,
      currentDrawdownPercent: 1.5,
      dayTradeCount: 3,
      dayMaxTrades: 4,
      dayMaxDrawdown: 2,
      swingMaxDrawdown: 3,
      positionMaxDrawdown: 4,
      mode: 'DAY',
      newsOk: true,
      propFirmOk: true,
      brokerOk: true,
      duplicateSetup: false,
    });

    expect(riskState.allowed).toBe(true);
    expect(riskState.riskAmount).toBeCloseTo(25, 5);
  });

  it('blocks risk if drawdown or risk cap is exceeded', () => {
    const riskState = evaluateRiskSafety({
      accountEquity: 10000,
      riskPercent: 0.3,
      riskLimitPercent: 0.25,
      entry: 1.1000,
      stop: 1.0950,
      tickSize: 0.0001,
      tickValue: 1,
      contractSize: 100000,
      currentDrawdownPercent: 2.1,
      dayTradeCount: 4,
      dayMaxTrades: 4,
      dayMaxDrawdown: 2,
      swingMaxDrawdown: 3,
      positionMaxDrawdown: 4,
      mode: 'DAY',
      newsOk: true,
      propFirmOk: true,
      brokerOk: true,
      duplicateSetup: false,
    });

    expect(riskState.allowed).toBe(false);
    expect(riskState.reason).toBeDefined();
  });

  it('scans instruments and registers a valid setup state without duplicates', () => {
    const scan = scanMarket({
      instrument: 'EURUSD',
      marketType: 'forex',
      h4Ready: true,
      m5Ready: true,
      riskOk: true,
      newsOk: true,
      brokerOk: true,
      duplicateSetup: false,
    });

    expect(scan.status).toBe('ready');

    const setup = createSetupState('EURUSD', 'LONG');
    const first = registerSetup(setup, 'EURUSD', 'LONG');
    const second = registerSetup(setup, 'EURUSD', 'LONG');

    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it('requires execution safety checks and rejects invalid or expired setups', () => {
    const executionSafe = evaluateExecutionSafety({
      setupValid: true,
      marketAvailable: true,
      brokerConnected: true,
      executionReady: true,
      orderVerified: true,
      newsOk: true,
      duplicateSetup: false,
      expired: false,
      invalidated: false,
    });

    expect(executionSafe.allowed).toBe(true);

    const blocked = evaluateExecutionSafety({
      setupValid: true,
      marketAvailable: true,
      brokerConnected: false,
      executionReady: false,
      orderVerified: false,
      newsOk: true,
      duplicateSetup: true,
      expired: true,
      invalidated: true,
    });

    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBeDefined();
  });

  it('supports a broker abstraction and dynamic Deriv synthetic index metadata', () => {
    const broker = createBrokerAdapter('deriv');
    const syntheticSpec = getSyntheticIndexSpec('1HZ10V');

    expect(broker.name).toBe('deriv');
    expect(broker.supportsMarket('synthetic')).toBe(true);
    expect(syntheticSpec.symbol).toBe('1HZ10V');
    expect(syntheticSpec.isSynthetic).toBe(true);

    const invalidSpec = getSyntheticIndexSpec('UNKNOWN_SYMBOL');
    expect(invalidSpec.isSynthetic).toBe(false);
  });

  it('activates trailing profit and break-even only after a valid profit threshold', () => {
    const profitState = evaluateTrailingProfit({
      entry: 1.1000,
      currentPrice: 1.1080,
      stopLoss: 1.0950,
      activationR: 1.0,
      protectedR: 0.25,
      enabled: true,
      trailingMethod: 'structure',
    });

    expect(profitState.trailingActivated).toBe(true);
    expect(profitState.breakEvenActivated).toBe(true);
    expect(profitState.newStopLoss).toBeGreaterThan(1.0950);
  });

  it('creates operational alerts and a dashboard summary for active trading state', () => {
    const alert = createAlert({
      type: 'trade-ready',
      severity: 'info',
      message: 'EURUSD setup qualified',
      symbol: 'EURUSD',
      market: 'forex',
    });

    expect(alert.type).toBe('trade-ready');
    expect(alert.severity).toBe('info');
    expect(alert.message).toContain('qualified');

    const dashboard = createDashboardSnapshot({
      balance: 10000,
      equity: 10120,
      floatingPnL: 120,
      dailyPnL: 180,
      currentDrawdown: 1.2,
      mode: 'DAY',
      openPositions: 1,
      scannerStatus: 'ready',
      activeSetups: 2,
      h4Status: 'bullish breakout',
      m5Status: 'fib retracement',
      alerts: [alert],
    });

    expect(dashboard.balance).toBe(10000);
    expect(dashboard.equity).toBe(10120);
    expect(dashboard.alerts[0].type).toBe('trade-ready');
    expect(dashboard.summary).toContain('ready');
  });

  it('evaluates system health and monitoring snapshots for production readiness', () => {
    const health = evaluateSystemHealth({
      brokerConnected: true,
      marketDataFresh: true,
      riskEngineOnline: true,
      executionReady: true,
      diskPercentUsed: 58,
      memoryPercentUsed: 68,
      latencyMs: 120,
      tradingBlocked: false,
      accountVerified: true,
    });

    expect(health.allowed).toBe(true);
    expect(health.status).toBe('healthy');

    const monitoring = createMonitoringSnapshot({
      health,
      status: 'trading',
      alerts: [createAlert({ type: 'bot-started', severity: 'info', message: 'system online' })],
    });

    expect(monitoring.status).toBe('trading');
    expect(monitoring.health.allowed).toBe(true);
    expect(monitoring.alerts[0].type).toBe('bot-started');
  });

  it('runs a simple simulated backtest and produces a trade summary', () => {
    const report = runBacktest({
      initialBalance: 10000,
      riskPercent: 0.25,
      trades: [
        { entry: 1.1000, stop: 1.0950, takeProfit: 1.1100, side: 'long', outcome: 'win' },
        { entry: 1.1020, stop: 1.0960, takeProfit: 1.1080, side: 'long', outcome: 'loss' },
        { entry: 1.0990, stop: 1.0930, takeProfit: 1.1120, side: 'long', outcome: 'win' },
      ],
    });

    expect(report.totalTrades).toBe(3);
    expect(report.winningTrades).toBe(2);
    expect(report.losingTrades).toBe(1);
    expect(report.netProfit).toBeGreaterThan(0);
    expect(report.equityCurve.length).toBeGreaterThan(0);
  });

  it('validates deployment config and creates safe startup and shutdown plans', () => {
    const config = validateDeploymentConfig({
      env: 'production',
      brokerConnected: true,
      accountVerified: true,
      marketDataFresh: true,
      riskEngineOnline: true,
      newsEngineOnline: true,
      tradingEnabled: true,
      persistentStorage: true,
    });

    expect(config.valid).toBe(true);
    expect(config.reason).toContain('ready');

    const startup = createStartupPlan({
      configValid: true,
      stateLoaded: true,
      brokerVerified: true,
      marketVerified: true,
      riskVerified: true,
      complianceVerified: true,
    });

    expect(startup.allowed).toBe(true);
    expect(startup.steps.length).toBeGreaterThan(0);

    const shutdown = createShutdownPlan({
      stopNewTrades: true,
      preserveState: true,
      flushLogs: true,
      closeNonEssentialConnections: true,
    });

    expect(shutdown.allowed).toBe(true);
    expect(shutdown.steps).toContain('stop new trade execution');
  });

  it('reconciles broker state and creates a crash recovery plan', () => {
    const reconciliation = reconcileBrokerState({
      localOpenPositions: 1,
      brokerOpenPositions: 1,
      localOrderCount: 1,
      brokerOrderCount: 1,
      slMatches: true,
      tpMatches: true,
      tradeIdsMatch: true,
      trailingStateMatches: true,
    });

    expect(reconciliation.allowed).toBe(true);
    expect(reconciliation.mode).toBe('normal');

    const recovery = createRecoveryPlan({
      brokerConnected: true,
      positionsRecovered: true,
      ordersRecovered: true,
      riskValidated: true,
      protectionVerified: true,
    });

    expect(recovery.allowed).toBe(true);
    expect(recovery.steps).toContain('reconstruct trade-management state');
  });

  it('saves and restores persistent trading state for restart recovery', () => {
    const saved = savePersistentState({
      accountEquity: 10000,
      drawdownPercent: 1.2,
      openPositions: [{ symbol: 'EURUSD', side: 'long', entry: 1.1, stop: 1.095 }],
      setupState: { symbol: 'EURUSD', direction: 'bullish' },
      trailingState: { enabled: true, activationR: 1 },
    });

    expect(saved.saved).toBe(true);
    expect(saved.state.accountEquity).toBe(10000);

    const restored = restorePersistentState(saved.state);
    expect(restored.accountEquity).toBe(10000);
    expect(restored.openPositions[0].symbol).toBe('EURUSD');
    expect(restored.setupState).toMatchObject({ symbol: 'EURUSD' });
  });

  it('persists trading state to disk and restores it from a fresh store instance', () => {
    const directory = mkdtempSync(join(tmpdir(), 'js-trading-bot-'));
    const filePath = join(directory, 'state.json');
    const state = savePersistentState({
      accountEquity: 9800,
      drawdownPercent: 2,
      openPositions: [{ symbol: 'EURUSD', side: 'short', entry: 1.1, stop: 1.105 }],
      setupState: { symbol: 'EURUSD', direction: 'bearish' },
      trailingState: { enabled: false },
    }).state;

    try {
      createPersistentStateStore(filePath).save(state);
      const restored = createPersistentStateStore(filePath).load();

      expect(restored.accountEquity).toBe(9800);
      expect(restored.openPositions[0].side).toBe('short');
      expect(restored.setupState).toMatchObject({ direction: 'bearish' });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('validates execution integrity for duplicate protection, partial fills, and latency checks', () => {
    const safe = validateExecutionIntegrity({
      duplicateOrder: false,
      partialFill: false,
      executionLatencyMs: 180,
      maxExecutionLatencyMs: 300,
      orderIdVerified: true,
      positionVerified: true,
      stopVerified: true,
      takeProfitVerified: true,
      riskStateConsistent: true,
    });

    expect(safe.allowed).toBe(true);
    expect(safe.reason).toContain('safe');

    const blocked = validateExecutionIntegrity({
      duplicateOrder: true,
      partialFill: true,
      executionLatencyMs: 600,
      maxExecutionLatencyMs: 300,
      orderIdVerified: false,
      positionVerified: false,
      stopVerified: false,
      takeProfitVerified: false,
      riskStateConsistent: false,
    });

    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBeDefined();
  });

  it('verifies a live execution only after broker order, position, and protection checks pass', () => {
    const result = validateLiveExecution({
      orderSubmitted: true,
      orderId: 'abc-123',
      positionId: 'pos-777',
      fillPrice: 1.1010,
      quantity: 1000,
      stopLoss: 1.0950,
      takeProfit: 1.1100,
      brokerStatus: 'filled',
      protectiveOrdersVerified: true,
      riskStateConsistent: true,
      duplicateOrder: false,
      partialFill: false,
    });

    expect(result.allowed).toBe(true);
    expect(result.reason).toContain('verified');

    const blocked = validateLiveExecution({
      orderSubmitted: true,
      orderId: '',
      positionId: '',
      fillPrice: 0,
      quantity: 0,
      stopLoss: 0,
      takeProfit: 0,
      brokerStatus: 'rejected',
      protectiveOrdersVerified: false,
      riskStateConsistent: false,
      duplicateOrder: true,
      partialFill: true,
    });

    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBeDefined();
  });

  it('keeps a paper-trading ledger for simulated execution and P/L tracking', () => {
    const ledger = createPaperTradeLedger({
      initialBalance: 10000,
      mode: 'paper',
      trades: [
        { symbol: 'EURUSD', side: 'long', entry: 1.1000, size: 1000, pnl: 45.5 },
        { symbol: 'EURUSD', side: 'short', entry: 1.1030, size: 1000, pnl: -20.0 },
      ],
    });

    expect(ledger.mode).toBe('paper');
    expect(ledger.totalTrades).toBe(2);
    expect(ledger.netPnl).toBeCloseTo(25.5, 1);
    expect(ledger.equity).toBeGreaterThan(0);
  });

  it('submits and verifies a live broker order with protective levels attached', () => {
    const broker = createBrokerAdapter('deriv');
    const execution = createExecutionPipeline(broker);

    const submitted = execution.submitOrder({
      symbol: 'EURUSD',
      side: 'buy',
      volume: 1000,
      entry: 1.1000,
      stopLoss: 1.0950,
      takeProfit: 1.1100,
      type: 'market',
    });

    expect(submitted.accepted).toBe(true);
    expect(submitted.orderId).toMatch(/order/i);

    const verified = execution.verifyOrder({
      orderId: submitted.orderId,
      symbol: 'EURUSD',
      positionId: 'pos-1',
      fillPrice: 1.1000,
      quantity: 1000,
      stopLoss: 1.0950,
      takeProfit: 1.1100,
      brokerStatus: 'filled',
      protectiveOrdersVerified: true,
      riskStateConsistent: true,
      duplicateOrder: false,
    });

    expect(verified.allowed).toBe(true);
    expect(verified.reason).toContain('verified');
  });

  it('creates a Deriv session with account state and order status checks', () => {
    const api = createDerivApiClient({ appId: '1001', token: 'demo-token', environment: 'demo' });

    const session = api.connect();
    expect(session.connected).toBe(true);
    expect(session.broker).toBe('deriv');

    const account = api.getAccountState();
    expect(account.accountVerified).toBe(true);
    expect(account.status).toBe('active');

    const order = api.placeOrder({
      symbol: 'EURUSD',
      side: 'buy',
      volume: 1000,
      stopLoss: 1.0950,
      takeProfit: 1.1100,
    });

    expect(order.accepted).toBe(true);
    expect(order.orderId).toMatch(/order/i);

    const orderStatus = api.getOrderStatus(order.orderId);
    expect(orderStatus.status).toBe('submitted');
    expect(orderStatus.orderId).toBe(order.orderId);

    api.disconnect();
    expect(api.getConnectionState().connected).toBe(false);
    expect(api.getOrderStatus(order.orderId).status).toBe('unknown');

    const reconnected = api.reconnect();
    expect(reconnected.connected).toBe(true);
    expect(api.getOrderStatus(order.orderId).status).toBe('submitted');
  });

  it('monitors live position state with directional P/L, R-multiple, drawdown, and protection', () => {
    const state = evaluatePositionState({
      position: { symbol: 'EURUSD', side: 'long', entry: 1.1, stopLoss: 1.095, takeProfit: 1.11, quantity: 1000 },
      currentPrice: 1.106,
      accountEquity: 9900,
      peakEquity: 10000,
      spread: 0.0002,
      maxDrawdownPercent: 2,
      trailingEnabled: true,
      activationR: 1,
      protectedR: 1.2,
    });

    expect(state.pnl).toBeCloseTo(6, 5);
    expect(state.rMultiple).toBeCloseTo(1.2, 5);
    expect(state.drawdownPercent).toBeCloseTo(1, 5);
    expect(state.trailingActivated).toBe(true);
    expect(state.breakEvenActivated).toBe(true);
    expect(state.newStopLoss).toBeGreaterThan(1.095);
    expect(state.shouldClose).toBe(false);
  });

  it('provides supply-demand, Ichimoku, and exact RSI extreme confirmations', () => {
    const candles = [
      { close: 100, high: 101, low: 99 },
      { close: 101, high: 102, low: 100 },
      { close: 102, high: 103, low: 101 },
      { close: 101.5, high: 102.5, low: 100.5 },
      { close: 102, high: 102, low: 100.8 },
    ];
    const demand = detectSupplyDemand(candles, 'bullish');
    const ichimoku = calculateIchimoku(candles, { conversionPeriod: 2, basePeriod: 3, spanPeriod: 4 });

    expect(demand.valid).toBe(true);
    expect(demand.zoneLow).toBeLessThan(demand.zoneHigh);
    expect(ichimoku.direction).toBe('bullish');
    expect(evaluateRsiConfirmation(10, 'bullish').allowed).toBe(true);
    expect(evaluateRsiConfirmation(11, 'bullish').allowed).toBe(false);
    expect(evaluateRsiConfirmation(90, 'bullish').allowed).toBe(false);
    expect(evaluateRsiConfirmation(10, 'bearish').allowed).toBe(false);
    expect(evaluateRsiConfirmation(90, 'bearish').allowed).toBe(true);
    expect(evaluateRsiConfirmation(101, 'bearish').allowed).toBe(false);
  });

  it('creates emergency execution actions for protection failure and partial fills', () => {
    const protectionFailure = createExecutionRecoveryPlan({
      brokerConnected: true,
      orderSubmitted: true,
      orderStatus: 'filled',
      partialFill: false,
      protectiveOrdersVerified: false,
      duplicateOrder: false,
      latencyExceeded: false,
    });
    const partialFill = createExecutionRecoveryPlan({
      brokerConnected: true,
      orderSubmitted: true,
      orderStatus: 'pending',
      partialFill: true,
      protectiveOrdersVerified: true,
      duplicateOrder: false,
      latencyExceeded: true,
    });

    expect(protectionFailure.action).toBe('close-position');
    expect(protectionFailure.allowedToContinue).toBe(false);
    expect(partialFill.action).toBe('reconcile');
    expect(partialFill.steps).toContain('poll broker until fill state is final');
  });

  it('runs walk-forward backtesting with performance and drawdown metrics', () => {
    const report = runWalkForwardBacktest({
      initialBalance: 10000,
      riskPercent: 0.25,
      trainingWindow: 2,
      testingWindow: 2,
      trades: [
        { entry: 1.1, stop: 1.095, takeProfit: 1.11, side: 'long', outcome: 'win' },
        { entry: 1.1, stop: 1.105, takeProfit: 1.09, side: 'short', outcome: 'loss' },
        { entry: 1.1, stop: 1.095, takeProfit: 1.11, side: 'long', outcome: 'win' },
        { entry: 1.1, stop: 1.105, takeProfit: 1.09, side: 'short', outcome: 'loss' },
      ],
    });

    expect(report.windows).toHaveLength(1);
    expect(report.windows[0].winRate).toBe(0.5);
    expect(report.windows[0].maxDrawdown).toBeGreaterThan(0);
    expect(report.aggregate.totalTrades).toBe(2);
  });
});

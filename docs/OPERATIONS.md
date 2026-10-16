# Trading Bot Operations Guide

## Scope

The platform preserves the specified strategy:

- M5 is the only execution timeframe.
- H4 supplies the primary setup context.
- H4 and M5 require breakout, Fibonacci retracement, and the 50-61.8% entry zone.
- Supply/Demand, Ichimoku, RSI 10/90, market structure, risk, drawdown, news, broker, and compliance gates remain mandatory.
- Risk per trade is capped at 0.25% by default.
- M1 is not a qualification or confirmation requirement.

## Install and verify

```powershell
npm install
npm test
npm run build
```

The build emits production JavaScript and declarations into `dist/`.

## Configuration

Review `src/config/defaults.ts` before enabling any runtime integration. Important defaults include:

- `riskPerTrade`: `0.25`
- `rsiOversold`: `10`
- `rsiOverbought`: `90`
- `newsTradingAllowed`: `false`
- `m1ConfirmationRequired`: `false`
- `paperTrading`: `true`

Broker credentials belong in environment variables or a secret manager. Do not commit tokens, account IDs, or private keys.

## Local paper simulation

The trading engine can simulate an explicitly supplied, already-qualified setup when `TradingEngineConfig.paperTrading` is `true`. It does not call broker account, quote, order, or status methods in that mode. It records the simulated entry at the supplied setup price. `PAPER_TRADING` is not automatically passed into the engine configuration.

For an offline candle replay, provide local H4 and M5 CSV files:

```powershell
npm run paper:replay -- --h4 .\data\H4.csv --m5 .\data\M5.csv --symbol EURUSD
```

The CSV schema is `timestamp,high,low,close`; timestamps are strictly increasing UTC candle-close times, expressed as epoch milliseconds or ISO-8601 with a UTC offset. At least 52 H4 and 53 M5 candles are required. The default risk is 0.25% and cannot be configured above that limit. The news gate blocks trades unless `--news-clear` is supplied; this is an operator assertion, not a historical news check.

The replay requires H4/M5 trend alignment, a breakout in the recent eight bars against the preceding 20-bar range, and a 50-61.8% retracement. It also applies a simple rolling 14-change RSI, recent-range supply/demand, Ichimoku direction, the news gate, a four-trades-per-UTC-day limit, and a 2% closed-balance drawdown gate. The stop is the recent 14-bar low/high and the target is 2R. These are simplified deterministic checks, not a full market-structure scanner or the complete strategy pipeline.

Sizing and P/L assume quote-currency units, not broker-specific lot/contract rules. The replay omits spread, slippage, fees, prop-firm/compliance validation, and is not a broker-quality backtest. When one candle touches both stop and target, it assumes the stop was hit first; otherwise exits assume exact stop/target prices even across gaps. It uses no live feed and submits no orders.

The replay and `createTradingEngine()` are separate paths. The engine accepts precomputed qualification booleans; it does not currently provide a live scanner that generates them. The paper replay does not implement disconnect, partial-fill, or broker recovery because no broker is involved.

The dashboard is a local status page, not a replay viewer. Until a data source is connected, its health endpoint deliberately reports unavailable broker/market data and shows zero-valued placeholders rather than fabricated healthy account metrics.

Example local verification flow:

```ts
const engine = createTradingEngine(mockBrokerClient, config, { stateStore });
const result = await engine.evaluateAndExecute(setupInput);
const state = engine.monitorPosition(result.position, currentPrice, equity, peakEquity, spread);
```

A paper result is not evidence that a live order can be submitted or that a strategy is profitable. The Deriv client contract and mock transport do not replace a real authenticated Deriv transport.

## Live trading gate

Do not enable live trading until all of these are true:

- A real broker transport is connected and authenticated.
- Account state and market data are verified from the broker.
- Order, position, fill, SL, and TP identifiers are reconciled.
- Execution recovery actions are wired to real cancel and close endpoints.
- Persistent state is saved before shutdown and reconciled before resume.
- Paper trading has passed an agreed observation period.
- Risk, drawdown, news, and prop-firm limits are externally monitored.

The execution recovery plan describes required actions; real cancel and close operations are not yet wired to a broker.

## Restart and recovery

Use `createPersistentStateStore(path)` to save and load state atomically to JSON. Broker reconciliation and automatic safe resume are not wired into the dashboard or startup command. A live startup flow must not resume from local state alone.

The intended live recovery sequence is:

1. Load the last valid state.
2. Connect to the broker.
3. Retrieve account, order, position, and protection state.
4. Run local-to-broker reconciliation.
5. Reconstruct trailing and trade-management state.
6. Resume only when risk and protection checks pass.

A missing or malformed state file throws during load. Staleness checks and automatic resume blocking still need to be wired into a future live startup flow.

## Troubleshooting

- **Build fails:** run `npm install`, then `npm run build`.
- **Tests fail:** run `npm test` and inspect the first failing strategy gate.
- **No trade qualifies:** inspect H4 setup, M5 setup, Fibonacci zone, RSI, news, spread, drawdown, and duplicate checks in the evaluation result.
- **Broker disconnect:** halt new execution, reconnect, reconcile account and orders, then resume only after state matches.
- **Partial fill or delayed order:** freeze additional quantity and poll until the broker reports a final state.
- **Missing protection:** close the unprotected position and record an emergency alert.

## Security and deployment

- Keep `.env` files out of source control.
- Use least-privilege broker tokens and separate demo and production credentials.
- Run the service under a non-administrator account.
- Restrict dashboard and broker ports with a firewall.
- Rotate credentials and review execution logs regularly.
- Do not deploy with `paperTrading` disabled until live integration tests and operational sign-off are complete.
- Preserve logs and state files on a protected volume with appropriate permissions.

# Getting the Trading Bot Running

This guide takes the project from a fresh checkout to a verified local paper-trading setup. It does not enable real-money trading.

## 1. Prerequisites

Install:

- Node.js 22 or newer
- npm
- Git
- A Deriv account if you want to test the external demo connection

Open PowerShell in the project root:

```powershell
cd "C:\Users\user\Documents\JS Trading Bot"
```

Do not run project commands from the `dashboard` subfolder. The npm scripts are defined in the project root.

## 2. Install dependencies

```powershell
npm install
```

## 3. Create local configuration

Copy the example environment file:

```powershell
Copy-Item .env.example .env
```

Keep paper trading enabled:

```env
TRADING_ENV=demo
PAPER_TRADING=true
DASHBOARD_PORT=3000
DERIV_APP_ID=
DERIV_TOKEN=
```

Never commit `.env` or put a real token in source code or chat. The `.gitignore` file already excludes `.env` files while allowing `.env.example`.

## 4. Verify the codebase

Run the complete test suite:

```powershell
npm test
```

Build the TypeScript project:

```powershell
npm run build
```

Both commands must pass before continuing.

## 5. Start the dashboard

From the project root, run:

```powershell
npm run dashboard
```

Open this address in a browser:

```text
http://127.0.0.1:3000
```

The dashboard provides local status, account/equity placeholders, pipeline state, positions, alerts, and health telemetry.

Stop it with `Ctrl+C`.

If port `3000` is already in use, change the value in `.env`:

```env
DASHBOARD_PORT=3001
```

Then restart the dashboard.

## 6. Run the local mock broker flow

The project includes a deterministic mock Deriv transport. It exercises:

- Broker connection
- Authorization
- Account balance
- Market quote retrieval
- Order submission
- Order status polling
- Disconnect handling
- Qualification and risk gates
- State persistence
- Position monitoring

Run it through the integration tests:

```powershell
.\node_modules\.bin\vitest.cmd run tests/platform-integration.test.ts --reporter=verbose
```

This is the first complete local verification path. It does not contact Deriv and cannot place a real order.

The trading engine also supports local paper simulation when `TradingEngineConfig.paperTrading` is `true`. In that mode it does not call broker account, quote, order, or status endpoints; it records a simulated fill at the setup's requested entry price. Set `paperTrading: false` only when intentionally testing an authenticated broker transport. The `PAPER_TRADING` environment variable is not automatically wired into `createTradingEngine`, so pass the setting explicitly in the engine configuration.

### Replay your own H4/M5 candle data

The offline replay accepts two CSV files with `timestamp,high,low,close` columns. Timestamps must be UTC candle-close times, strictly increasing, and expressed as epoch milliseconds or ISO-8601 timestamps. Provide at least 52 H4 and 53 M5 candles. Keep the files local; the command does not upload or fetch data.

```powershell
npm run paper:replay -- --h4 .\data\H4.csv --m5 .\data\M5.csv --symbol EURUSD
```

The default starting balance is 10,000 and risk is capped at 0.25% per trade. To allow the news gate, explicitly assert that the replay period is clear of news blackouts:

```powershell
npm run paper:replay -- --h4 .\data\H4.csv --m5 .\data\M5.csv --symbol EURUSD --news-clear
```

This flag is only an operator assertion; the replay does not retrieve historical news. The report is a simplified quote-currency simulation, not broker lot sizing, a broker fill, or evidence of live performance. If both stop-loss and take-profit are touched in the same candle, the replay records the stop-loss first. Use `--help` for supported options.

## 7. Optional: configure a Deriv demo account

Only do this after the local mock tests pass.

1. Log in to Deriv.
2. Use a demo account, not a real-money account.
3. Create a Deriv application/app ID if required by the API setup.
4. Create a demo API token with the minimum permissions needed for account and trading tests.
5. Put the values in `.env`:

```env
TRADING_ENV=demo
PAPER_TRADING=true
DERIV_APP_ID=your_demo_app_id
DERIV_TOKEN=your_demo_token
```

Do not use production credentials during this stage.

The current code contains a transport abstraction and mock implementation. A real Deriv WebSocket client still needs to be connected and tested against the live Deriv API contract before demo orders can be considered verified.

## 8. Paper-trading readiness checklist

Before enabling any external demo order flow, confirm:

- `npm test` passes.
- `npm run build` passes.
- `PAPER_TRADING=true` remains enabled.
- M5 is the execution timeframe.
- M1 is not required anywhere in qualification.
- Risk is capped at `0.25%` per trade.
- News trading remains disabled.
- H4 and M5 breakout/retracement/Fibonacci gates are active.
- Supply/Demand, Ichimoku, RSI 10/90, drawdown, spread, broker, and compliance checks are active.
- Failed protection causes execution recovery to block or close exposure.
- Persistent state can be saved and restored.
- The dashboard health endpoint responds successfully.

Check the dashboard health endpoint directly:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3000/api/health | Select-Object -ExpandProperty StatusCode
```

Expected result:

```text
200
```

## 9. Persistence and recovery test

The platform supports atomic JSON state persistence. A restart recovery test should follow this sequence:

1. Save account, setup, open-position, and trailing state.
2. Stop the process cleanly.
3. Start a fresh process.
4. Restore the state file.
5. Reconnect to the broker or mock broker.
6. Reconcile positions, orders, stop-loss, take-profit, and trailing state.
7. Resume only after all safety checks pass.

A missing or malformed state file must block automatic resume until it is reviewed.

## 10. What is not live yet

The project is locally runnable, but these items require external validation or additional deployment work:

- Real Deriv WebSocket authentication and request verification
- Live Deriv market-data subscriptions
- Real order execution and broker-side SL/TP confirmation
- Production dashboard authentication
- External notification credentials and delivery testing
- VPS process supervision and backup testing

The mock broker proves the application interfaces and workflow. It does not prove that a live broker order is safe or accepted.

## 11. Live-trading gate

Do not use real-money credentials until all of the following have been completed:

- Demo authentication succeeds with the real Deriv API.
- Demo market data is received and validated.
- Demo order lifecycle is verified end to end.
- Fill, position, stop-loss, and take-profit identifiers are reconciled.
- Disconnect and reconnect behavior has been tested.
- Paper trading has passed an agreed observation period.
- Risk and drawdown limits have been independently reviewed.
- Logs, persistence, backups, and alerts are operational.
- A controlled shutdown and recovery drill succeeds.

When live testing eventually begins, start with the smallest permitted exposure and keep a human operator monitoring the process.

## 12. Common problems

### `npm run dashboard` fails

Check the current directory:

```powershell
Get-Location
```

It must be:

```text
C:\Users\user\Documents\JS Trading Bot
```

Then run `npm run dashboard` again.

### Port 3000 is busy

Set another port in `.env` using `DASHBOARD_PORT`, then restart.

### Tests cannot find dependencies

Run:

```powershell
npm install
```

### Build errors mention generated test files

Generated JavaScript and declaration files under `tests/` are ignored. Remove stale generated files only if needed, then run:

```powershell
npm run build
```

### Broker connection fails

Confirm that the app ID and token belong to the demo environment, that the token has the required permissions, and that the real transport is configured. Never work around a failed broker or protection check by disabling safety gates.

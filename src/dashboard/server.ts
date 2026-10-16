import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { createAlert, createDashboardSnapshot, type DashboardSnapshot } from '../strategy/alerts.js';
import { evaluateSystemHealth, type SystemHealthResult } from '../strategy/monitoring.js';

export interface DashboardServerOptions {
  host?: string;
  port?: number;
  dashboardDirectory?: string;
  getSnapshot?: () => DashboardSnapshot;
  getHealth?: () => SystemHealthResult;
}

export interface DashboardServer {
  server: Server;
  start: () => Promise<{ port: number }>;
  stop: () => Promise<void>;
}

const contentTypes: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

export function createDashboardServer(options: DashboardServerOptions = {}): DashboardServer {
  const dashboardDirectory = options.dashboardDirectory ?? resolve(process.cwd(), 'dashboard');
  const getSnapshot = options.getSnapshot ?? (() => createDashboardSnapshot({ balance: 0, equity: 0, floatingPnL: 0, dailyPnL: 0, currentDrawdown: 0, mode: 'DAY', openPositions: 0, scannerStatus: 'offline', activeSetups: 0, h4Status: 'no replay loaded', m5Status: 'no replay loaded', alerts: [createAlert({ type: 'data-unavailable', severity: 'warning', message: 'No broker or replay data connected; values are placeholders' })] }));
  const getHealth = options.getHealth ?? (() => evaluateSystemHealth({ brokerConnected: false, marketDataFresh: false, riskEngineOnline: true, executionReady: false, diskPercentUsed: 0, memoryPercentUsed: 0, latencyMs: 0, tradingBlocked: true, accountVerified: false }));
  const server = createServer((request, response) => handleRequest(request, response, dashboardDirectory, getSnapshot, getHealth));

  return {
    server,
    start: () => new Promise((resolveStart, reject) => {
      server.once('error', reject);
      server.listen(options.port ?? 3000, options.host ?? '127.0.0.1', () => {
        const address = server.address();
        resolveStart({ port: typeof address === 'object' && address ? address.port : options.port ?? 3000 });
      });
    }),
    stop: () => new Promise((resolveStop, reject) => server.close((error) => error ? reject(error) : resolveStop())),
  };
}

function handleRequest(request: IncomingMessage, response: ServerResponse, directory: string, getSnapshot: () => DashboardSnapshot, getHealth: () => SystemHealthResult) {
  const path = request.url?.split('?')[0] ?? '/';
  if (path === '/api/snapshot') return sendJson(response, getSnapshot());
  if (path === '/api/health') return sendJson(response, getHealth());
  const filePath = path === '/' ? join(directory, 'index.html') : join(directory, path.slice(1));
  if (!resolve(filePath).startsWith(resolve(directory))) return sendText(response, 403, 'Forbidden');
  try {
    const content = readFileSync(filePath);
    response.writeHead(200, { 'content-type': contentTypes[extname(filePath)] ?? 'application/octet-stream' });
    response.end(content);
  } catch {
    sendText(response, 404, 'Not found');
  }
}

function sendJson(response: ServerResponse, value: unknown) { response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(value)); }
function sendText(response: ServerResponse, status: number, text: string) { response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' }); response.end(text); }

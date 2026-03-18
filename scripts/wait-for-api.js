#!/usr/bin/env node
/**
 * Polls GET http://localhost:3001/api/health until 200 or timeout.
 * Used by dev:all so the SPA starts only after the API is listening,
 * avoiding ECONNREFUSED when opening the app immediately.
 *
 * Usage: node scripts/wait-for-api.js [maxSeconds]
 * Default maxSeconds: 45
 */

const port = process.env.API_PORT || '3001';
const maxSeconds = parseInt(process.argv[2] || '45', 10) || 45;
const url = `http://127.0.0.1:${port}/api/health`;
const intervalMs = 400;
const deadline = Date.now() + maxSeconds * 1000;

function check() {
  return fetch(url, { method: 'GET' })
    .then((res) => (res.ok ? true : Promise.reject(new Error(`HTTP ${res.status}`))))
    .catch(() => false);
}

async function wait() {
  while (Date.now() < deadline) {
    if (await check()) {
      console.log('[wait-for-api] API is ready on port', port);
      process.exit(0);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  console.error('[wait-for-api] Timeout waiting for API at', url);
  process.exit(1);
}

wait();

/**
 * Hook benchmark — vault-activation.cjs
 *
 * NOTE: This bench measures wall-clock time for `spawnSync('node', [HOOK], ...)`,
 * which includes Node.js process cold-start (~80-150ms) on every run.
 * Ideal internal latency is < 200ms, but with cold-start the p95 target is 500ms.
 * 200ms would be ideal; 500ms is realistic for a fresh node process per message.
 *
 * The hook itself logs internal latency (excluding process startup) in
 * ~/.claude/vault/activation.log — those numbers will be < 200ms.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOOK = path.join(__dirname, '..', 'integrations', 'vault-activation.cjs');

test('hook bench: p95 < 500ms over 10 runs', () => {
  const latencies = [];
  for (let i = 0; i < 10; i++) {
    const start = Date.now();
    spawnSync('node', [HOOK], {
      input: JSON.stringify({ prompt: 'criar carrossel instagram' }),
      timeout: 2000,
    });
    latencies.push(Date.now() - start);
  }
  latencies.sort((a, b) => a - b);
  const p95Index = Math.ceil(latencies.length * 0.95) - 1;
  const p95 = latencies[Math.max(0, p95Index)];
  console.log(`bench: latencies=[${latencies.join(',')}] p95=${p95}ms`);
  assert.ok(p95 < 500, `p95 ${p95}ms exceeds 500ms budget`);
});

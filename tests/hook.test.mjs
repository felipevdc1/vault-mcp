/**
 * Hook tests — vault-activation.cjs
 * Tests: opt-out, fail-open, happy path, latency budget
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOOK = path.join(__dirname, '..', 'integrations', 'vault-activation.cjs');

function runHook(input, env = {}) {
  const res = spawnSync('node', [HOOK], {
    input: JSON.stringify(input),
    env: { ...process.env, ...env },
    timeout: 2000,
  });
  return {
    stdout: res.stdout ? res.stdout.toString() : '',
    stderr: res.stderr ? res.stderr.toString() : '',
    code: res.status,
  };
}

test('hook: exits 0 when opt-out via env var', () => {
  const { code, stdout } = runHook(
    { prompt: 'criar carrossel instagram' },
    { VAULT_MCP_AUTO_INJECT: '0' }
  );
  assert.strictEqual(code, 0);
  assert.strictEqual(stdout.trim(), '');
});

test('hook: exits 0 when catalog missing (fail-open)', () => {
  // Point HOME to a temp dir that has no vault/catalog.json
  const tmpHome = path.join('/tmp', `vault-hook-test-${Date.now()}`);
  const { code, stdout } = runHook({ prompt: 'criar carrossel' }, { HOME: tmpHome });
  assert.strictEqual(code, 0, 'hook must exit 0 even without catalog');
  assert.strictEqual(stdout.trim(), '', 'hook must stay silent without catalog');
});

test('hook: exits 0 on empty prompt', () => {
  const { code, stdout } = runHook({ prompt: '' });
  assert.strictEqual(code, 0);
  assert.strictEqual(stdout.trim(), '');
});

test('hook: produces vault-activation block when catalog exists and query matches', () => {
  // Uses the real catalog via default HOME
  const { code, stdout } = runHook({ prompt: 'criar carrossel instagram teaser lançamento' });
  assert.strictEqual(code, 0);
  if (stdout.includes('<vault-activation>')) {
    assert.ok(stdout.includes('Task:'), 'should contain Task line');
    assert.ok(stdout.includes('Top matches'), 'should contain Top matches header');
    assert.ok(stdout.includes('</vault-activation>'), 'should close tag');
    assert.ok(stdout.includes('Invoke:'), 'should contain Invoke line');
  }
  // Soft: if no matches, stdout is empty — acceptable
});

test('hook: hard-asserts vault-activation block with synthetic fake catalog', () => {
  // Build a fake HOME with a minimal catalog guaranteed to match "uniquekeyword123"
  const home = mkdtempSync(path.join(tmpdir(), 'vault-hook-hard-'));
  mkdirSync(path.join(home, '.claude', 'vault'), { recursive: true });

  const catalog = {
    generated: new Date().toISOString(),
    assets: [
      {
        id: 'test-squad:skill:uniquekeyword123',
        name: 'uniquekeyword123',
        type: 'skill',
        squad: 'test-squad',
        tags: ['uniquekeyword123'],
        summary: { what: 'test skill for hook integration test', when: '', delivers: '' },
        path: '/tmp/fake.md',
      },
    ],
    recipes: [],
  };
  writeFileSync(path.join(home, '.claude', 'vault', 'catalog.json'), JSON.stringify(catalog));

  const { code, stdout } = runHook(
    { prompt: 'uniquekeyword123 task' },
    { HOME: home }
  );

  assert.strictEqual(code, 0, 'hook must exit 0');
  assert.ok(stdout.includes('<vault-activation>'), 'stdout must contain <vault-activation>');
  assert.ok(stdout.includes('</vault-activation>'), 'stdout must contain </vault-activation>');
  assert.ok(stdout.includes('Top matches'), 'stdout must contain Top matches header');
  assert.ok(stdout.includes('test-squad:skill:uniquekeyword123'), 'stdout must contain the matched asset id');
});

test('hook: under 800ms (500ms budget + 300ms node startup slack)', () => {
  const start = Date.now();
  runHook({ prompt: 'test latency' });
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 800, `hook took ${elapsed}ms (budget 500ms + 300ms slack)`);
});

test('hook: stderr contains [vault] visibility line with shape-only assertions', () => {
  // Use synthetic catalog so the match path is guaranteed
  const home = mkdtempSync(path.join(tmpdir(), 'vault-hook-stderr-'));
  mkdirSync(path.join(home, '.claude', 'vault'), { recursive: true });

  const catalog = {
    generated: new Date().toISOString(),
    assets: [
      {
        id: 'test-squad:skill:visiblekeyword456',
        name: 'visiblekeyword456',
        type: 'skill',
        squad: 'test-squad',
        tags: ['visiblekeyword456'],
        summary: { what: 'test skill for stderr visibility test', when: '', delivers: '' },
        path: '/tmp/fake-visible.md',
      },
    ],
    recipes: [],
  };
  writeFileSync(path.join(home, '.claude', 'vault', 'catalog.json'), JSON.stringify(catalog));

  const { code, stderr } = runHook(
    { prompt: 'visiblekeyword456 task' },
    { HOME: home }
  );

  assert.strictEqual(code, 0, 'hook must exit 0');
  assert.ok(stderr.includes('[vault]'), 'stderr must contain [vault]');
  assert.ok(
    stderr.includes(' matches ') || stderr.includes('no matches ') || stderr.includes('error:'),
    `stderr must contain a status phrase, got: ${stderr.trim()}`
  );
});

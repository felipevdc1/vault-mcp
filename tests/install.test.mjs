// install.test.mjs — Phase 3 tests for vault-mcp init/uninstall flow
// Uses a fake HOME dir in /tmp to avoid touching Felipe's real ~/.claude.json / settings.json

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.join(__dirname, '..', 'bin', 'vault-mcp.mjs');

function runCli(args, env = {}) {
  const res = spawnSync('node', [CLI_PATH, ...args], {
    env: { ...process.env, ...env },
    timeout: 60000,
  });
  return {
    stdout: res.stdout ? res.stdout.toString() : '',
    stderr: res.stderr ? res.stderr.toString() : '',
    code: res.status,
  };
}

function setupFakeHome() {
  const home = mkdtempSync(path.join(tmpdir(), 'vault-install-test-'));
  mkdirSync(path.join(home, '.claude'), { recursive: true });
  return home;
}

test('install: init writes mcpServers.vault to ~/.claude.json (not .mcp.json)', () => {
  const home = setupFakeHome();
  const { code, stderr } = runCli(['init'], { HOME: home });
  assert.strictEqual(code, 0, `init should exit 0 (stderr: ${stderr})`);
  const claudeJsonPath = path.join(home, '.claude.json');
  assert.ok(existsSync(claudeJsonPath), '~/.claude.json should be created');
  const claudeJson = JSON.parse(readFileSync(claudeJsonPath, 'utf8'));
  assert.ok(claudeJson.mcpServers, 'should have mcpServers');
  assert.ok(claudeJson.mcpServers.vault, 'should have vault entry');
  assert.strictEqual(claudeJson.mcpServers.vault.command, 'node');
  // Legacy .mcp.json should NOT be created
  assert.ok(!existsSync(path.join(home, '.claude', '.mcp.json')), 'should NOT create legacy .mcp.json');
});

test('install: init registers UserPromptSubmit hook in settings.json', () => {
  const home = setupFakeHome();
  runCli(['init'], { HOME: home });
  const settingsPath = path.join(home, '.claude', 'settings.json');
  assert.ok(existsSync(settingsPath), 'settings.json should exist');
  const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
  assert.ok(settings.hooks && settings.hooks.UserPromptSubmit, 'should have UserPromptSubmit');
  const found = settings.hooks.UserPromptSubmit.some(
    h => h.hooks && h.hooks.some(inner => inner.command && inner.command.includes('vault-activation.cjs'))
  );
  assert.ok(found, 'should find vault-activation.cjs hook in UserPromptSubmit');

  // Verify the hook file actually exists on disk at the registered path
  let hookCommand = null;
  for (const group of settings.hooks.UserPromptSubmit) {
    if (!group.hooks) continue;
    for (const inner of group.hooks) {
      if (inner.command && inner.command.includes('vault-activation.cjs')) {
        hookCommand = inner.command;
        break;
      }
    }
    if (hookCommand) break;
  }
  assert.ok(hookCommand, 'should have extracted hook command');
  // Command shape is: "node <path>" — strip the "node " prefix to get the full path
  // (can't split on space — real install paths may contain spaces)
  assert.ok(hookCommand.startsWith('node '), 'hook command should start with "node "');
  const hookFilePath = hookCommand.slice('node '.length);
  assert.ok(hookFilePath, 'hook command should have a path token');
  assert.ok(existsSync(hookFilePath), `hook file must exist on disk at: ${hookFilePath}`);
});

test('install: init migrates legacy ~/.claude/.mcp.json entry', () => {
  const home = setupFakeHome();
  // Simulate v0.2 install: vault entry in .mcp.json alongside another entry
  const legacy = path.join(home, '.claude', '.mcp.json');
  writeFileSync(legacy, JSON.stringify({ vault: { command: 'node', args: ['old'] }, other: { command: 'x' } }));
  runCli(['init'], { HOME: home });
  // Legacy file should have vault removed (other entry preserved, so file still exists)
  assert.ok(existsSync(legacy), 'legacy .mcp.json should still exist (has other entries)');
  const legacyJson = JSON.parse(readFileSync(legacy, 'utf8'));
  assert.ok(!legacyJson.vault, 'legacy should no longer have vault entry');
  assert.ok(legacyJson.other, 'legacy should preserve non-vault entries');
  // New location should have vault
  const claudeJson = JSON.parse(readFileSync(path.join(home, '.claude.json'), 'utf8'));
  assert.ok(claudeJson.mcpServers && claudeJson.mcpServers.vault, 'vault should be in ~/.claude.json');
});

test('install: init is idempotent (second run does not duplicate)', () => {
  const home = setupFakeHome();
  runCli(['init'], { HOME: home });
  runCli(['init'], { HOME: home });
  const settings = JSON.parse(readFileSync(path.join(home, '.claude', 'settings.json'), 'utf8'));
  const hookEntries = settings.hooks.UserPromptSubmit.filter(
    h => h.hooks && h.hooks.some(inner => inner.command && inner.command.includes('vault-activation.cjs'))
  );
  assert.strictEqual(hookEntries.length, 1, 'should not duplicate hook entry on second init');
});

test('install: uninstall removes vault from mcpServers and hook from settings.json', () => {
  const home = setupFakeHome();
  runCli(['init'], { HOME: home });
  const { code } = runCli(['uninstall'], { HOME: home });
  assert.strictEqual(code, 0, 'uninstall should exit 0');
  const claudeJson = JSON.parse(readFileSync(path.join(home, '.claude.json'), 'utf8'));
  assert.ok(!claudeJson.mcpServers || !claudeJson.mcpServers.vault, 'vault should be removed from mcpServers');
  const settings = JSON.parse(readFileSync(path.join(home, '.claude', 'settings.json'), 'utf8'));
  const stillHasHook = settings.hooks &&
    settings.hooks.UserPromptSubmit &&
    settings.hooks.UserPromptSubmit.some(
      h => h.hooks && h.hooks.some(inner => inner.command && inner.command.includes('vault-activation.cjs'))
    );
  assert.ok(!stillHasHook, 'vault hook should be removed from settings.json');
});

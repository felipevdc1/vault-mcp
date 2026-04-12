import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadAsset, unloadAsset } from '../src/loader.mjs';

describe('loader', () => {
  test('loadAsset creates a symlink at the expected path', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'vault-test-'));
    try {
      const vaultDir   = join(tmpDir, 'vault');
      const commandsDir = join(tmpDir, 'commands');
      mkdirSync(vaultDir,    { recursive: true });
      mkdirSync(commandsDir, { recursive: true });

      const assetFile = join(vaultDir, 'test.md');
      writeFileSync(assetFile, '# Test skill');

      const result = loadAsset(assetFile, commandsDir, 'test:agent:myskill');

      assert.equal(result.status, 'loaded');
      assert.ok(result.symlink, 'result.symlink should be set');
      assert.equal(result.target, assetFile);

      // Symlink must actually exist and be a symlink
      const stat = lstatSync(result.symlink);
      assert.ok(stat.isSymbolicLink(), 'destination should be a symlink');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('loadAsset is idempotent: second call returns already_loaded', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'vault-test-'));
    try {
      const vaultDir    = join(tmpDir, 'vault');
      const commandsDir = join(tmpDir, 'commands');
      mkdirSync(vaultDir,    { recursive: true });
      mkdirSync(commandsDir, { recursive: true });

      const assetFile = join(vaultDir, 'skill.md');
      writeFileSync(assetFile, '# Skill');

      const first  = loadAsset(assetFile, commandsDir, 'test:agent:skill');
      const second = loadAsset(assetFile, commandsDir, 'test:agent:skill');

      assert.equal(first.status,  'loaded');
      assert.equal(second.status, 'already_loaded');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('unloadAsset removes the symlink and returns unloaded', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'vault-test-'));
    try {
      const vaultDir    = join(tmpDir, 'vault');
      const commandsDir = join(tmpDir, 'commands');
      mkdirSync(vaultDir,    { recursive: true });
      mkdirSync(commandsDir, { recursive: true });

      const assetFile = join(vaultDir, 'remove.md');
      writeFileSync(assetFile, '# Remove');

      const loaded   = loadAsset(assetFile, commandsDir, 'test:agent:remove');
      assert.equal(loaded.status, 'loaded');

      const unloaded = unloadAsset(loaded.symlink);
      assert.equal(unloaded.status, 'unloaded');
      assert.equal(unloaded.removed, loaded.symlink);

      // Symlink must be gone
      assert.throws(
        () => lstatSync(loaded.symlink),
        'symlink should no longer exist after unload',
      );
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('unloadAsset on a real file returns not_symlink without deleting it', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'vault-test-'));
    try {
      const realFile = join(tmpDir, 'real.md');
      writeFileSync(realFile, '# Real file — must not be deleted');

      const result = unloadAsset(realFile);
      assert.equal(result.status, 'not_symlink');

      // Real file must still be intact
      const stat = lstatSync(realFile);
      assert.ok(stat.isFile(), 'real file should still exist after refused unload');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

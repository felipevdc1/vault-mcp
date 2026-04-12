import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  scanDirectory,
  buildAssetId,
  inferType,
  buildSummary,
} from '../src/scanner.mjs';

describe('scanner', () => {
  test('scanDirectory finds markdown files (skips README.md)', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'vault-test-'));
    try {
      const squadDir = join(tmpDir, 'test-squad');
      mkdirSync(join(squadDir, 'agents'), { recursive: true });
      mkdirSync(join(squadDir, 'tasks'),  { recursive: true });

      writeFileSync(join(squadDir, 'README.md'), '# Test Squad\n');
      writeFileSync(
        join(squadDir, 'agents', 'test.md'),
        '---\nname: Test Agent\ndescription: A test agent\n---\n\nBody here.',
      );
      writeFileSync(join(squadDir, 'tasks', 'task.md'), '# Task\n\nDo something.');

      const assets = scanDirectory(squadDir, new Set(), squadDir);

      assert.ok(assets.length >= 2, `Expected >=2 assets, got ${assets.length}`);

      const ids = assets.map(a => a.id);
      assert.ok(
        !ids.some(id => id.toLowerCase().includes('readme')),
        'README.md should not appear in assets',
      );

      const types = assets.map(a => a.type);
      assert.ok(types.includes('agent'), 'Should find an agent asset');
      assert.ok(types.includes('task'),  'Should find a task asset');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('buildAssetId produces squad:type:name format', () => {
    assert.equal(buildAssetId('my-squad', 'agent', 'brad-frost'), 'my-squad:agent:brad-frost');
    assert.equal(buildAssetId('design', 'task', 'review'),         'design:task:review');
  });

  test('inferType: agents/ → agent, tasks/ → task, other → skill', () => {
    assert.equal(inferType('/vault/test-squad/agents/brad.md', null), 'agent');
    assert.equal(inferType('/vault/test-squad/tasks/fix.md',   null), 'task');
    assert.equal(inferType('/vault/test-squad/commands/deploy.md', null), 'command');
    assert.equal(inferType('/vault/test-squad/something.md',   null), 'skill');
  });

  test('buildSummary extracts what/when/delivers from frontmatter', () => {
    const fm = {
      description: 'A great agent',
      when: 'When doing X',
      delivers: 'Structured output',
    };
    const summary = buildSummary('Some body text', fm);
    assert.equal(summary.what, 'A great agent');
    assert.equal(summary.when, 'When doing X');
    assert.equal(summary.delivers, 'Structured output');
  });
});

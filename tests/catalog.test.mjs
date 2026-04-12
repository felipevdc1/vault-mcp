import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  emptyCatalog,
  loadCatalog,
  saveCatalog,
  findAssetById,
  getCatalogStats,
} from '../src/catalog.mjs';

describe('catalog', () => {
  test('emptyCatalog returns valid structure', () => {
    const c = emptyCatalog();
    assert.equal(c.version, 1);
    assert.ok(Array.isArray(c.assets));
    assert.equal(c.assets.length, 0);
    assert.equal(c.generated, null);
  });

  test('saveCatalog + loadCatalog roundtrip', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'vault-test-'));
    try {
      const cat = emptyCatalog();
      cat.assets.push({ id: 'test:agent:foo', name: 'foo', type: 'agent', squad: 'test' });
      cat.generated = new Date().toISOString();
      saveCatalog(tmpDir, cat);

      const loaded = loadCatalog(tmpDir);
      assert.equal(loaded.assets.length, 1);
      assert.equal(loaded.assets[0].id, 'test:agent:foo');
      assert.equal(loaded.assets[0].name, 'foo');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('findAssetById returns correct asset and undefined for missing', () => {
    const cat = emptyCatalog();
    cat.assets.push({ id: 'test:agent:foo', name: 'foo' });

    const found = findAssetById(cat, 'test:agent:foo');
    assert.ok(found);
    assert.equal(found.name, 'foo');

    const notFound = findAssetById(cat, 'test:agent:bar');
    assert.equal(notFound, undefined);
  });

  test('getCatalogStats calculates totals correctly', () => {
    const cat = emptyCatalog();
    cat.assets.push({ id: 'a', type: 'agent', squad: 'design', source: '/src1' });
    cat.assets.push({ id: 'b', type: 'task',  squad: 'design', source: '/src2' });
    cat.assets.push({ id: 'c', type: 'agent', squad: 'dev',    source: '/src1' });

    const stats = getCatalogStats(cat);
    assert.equal(stats.total, 3);
    assert.equal(stats.byType.agent, 2);
    assert.equal(stats.byType.task, 1);
    assert.equal(stats.bySquad.design, 2);
    assert.equal(stats.bySquad.dev, 1);
    assert.equal(stats.bySource['/src1'], 2);
  });
});

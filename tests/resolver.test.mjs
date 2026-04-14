import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

import {
  extractKeywords,
  scoreAsset,
  resolve,
  search,
} from '../src/resolver.mjs';

// Load real catalog for v1.0 regression tests
function loadRealCatalog() {
  try {
    const catalogPath = join(homedir(), '.claude', 'vault', 'catalog.json');
    return JSON.parse(readFileSync(catalogPath, 'utf8'));
  } catch {
    return null;
  }
}

// Minimal fake catalog used across multiple tests
const fakeCatalog = {
  assets: [
    {
      id: 'design:agent:alpha',
      name: 'alpha',
      type: 'agent',
      squad: 'design',
      tags: ['design', 'component', 'agent'],
      summary: { what: 'Builds design components', when: null, delivers: null },
      path: '/fake/design/agents/alpha.md',
      installed: false,
    },
    {
      id: 'dev:task:beta',
      name: 'beta',
      type: 'task',
      squad: 'dev',
      tags: ['dev', 'review'],
      summary: { what: 'Code review task', when: null, delivers: null },
      path: '/fake/dev/tasks/beta.md',
      installed: false,
    },
  ],
};

describe('resolver', () => {
  test('extractKeywords removes pt-br and en stop words', () => {
    const kws = extractKeywords('create the component for React da melhor forma');
    // English stop words: 'the', 'for'
    assert.ok(!kws.includes('the'),  '"the" should be removed');
    assert.ok(!kws.includes('for'),  '"for" should be removed');
    // Portuguese stop words: 'da', 'de'
    assert.ok(!kws.includes('da'),   '"da" should be removed');
    // Meaningful words should remain
    assert.ok(kws.includes('create'),    '"create" should be kept');
    assert.ok(kws.includes('component'), '"component" should be kept');
    assert.ok(kws.includes('react'),     '"react" should be kept');
  });

  test('scoreAsset: keyword matching a tag returns score > 0', () => {
    const asset = fakeCatalog.assets[0]; // tags: ['design', 'component', 'agent']
    const score = scoreAsset(asset, ['component']);
    assert.ok(score > 0, `Expected score > 0, got ${score}`);
  });

  test('scoreAsset: no keyword match returns score === 0', () => {
    const asset = fakeCatalog.assets[0]; // tags: ['design', 'component', 'agent']
    const score = scoreAsset(asset, ['cooking', 'recipes', 'baking']);
    assert.equal(score, 0);
  });

  test('resolve returns matches sorted by score descending', () => {
    // 'design component agent' matches alpha on 3 tags; beta only on none
    const result = resolve(fakeCatalog, 'design component agent');

    assert.ok(Array.isArray(result.matches));
    assert.ok(typeof result.suggestion === 'string');

    if (result.matches.length >= 2) {
      assert.ok(
        result.matches[0].score >= result.matches[1].score,
        'matches should be sorted by score descending',
      );
    }

    // alpha should appear before beta (or beta shouldn't appear at all)
    const ids = result.matches.map(m => m.id);
    if (ids.includes('dev:task:beta')) {
      const alphaIdx = ids.indexOf('design:agent:alpha');
      const betaIdx  = ids.indexOf('dev:task:beta');
      assert.ok(alphaIdx < betaIdx, 'alpha should rank above beta');
    }
  });

  test('search with type filter returns only matching type', () => {
    const result = search(fakeCatalog, '', { type: 'agent' });
    assert.ok(result.results.every(r => r.type === 'agent'), 'all results should be type=agent');
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].id, 'design:agent:alpha');
  });
});

describe('v1.0 regressions (real catalog)', () => {
  test('v1.0 regression: instagram carrossel does not return develop-exploit', () => {
    const catalog = loadRealCatalog();
    if (!catalog) return; // skip if catalog unavailable
    const r = resolve(catalog, 'criar carrossel instagram teaser lançamento produto dev tool consulting pt-br');
    const ids = r.matches.map(m => m.id);
    assert.ok(!ids.some(id => id.includes('develop-exploit')), `develop-exploit in top: ${JSON.stringify(ids)}`);
    assert.ok(!ids.some(id => id.includes('discover-tools')), `discover-tools in top: ${JSON.stringify(ids)}`);
  });

  test('v1.0 regression: instagram carrossel returns design/copywriter squad match', () => {
    const catalog = loadRealCatalog();
    if (!catalog) return; // skip if catalog unavailable
    const r = resolve(catalog, 'criar carrossel instagram teaser lançamento');
    const relevant = r.matches.filter(m =>
      ['design', 'copywriter-os', 'marketing-squad', 'aryse-marketing', 'instagram'].some(s => m.squad === s),
    );
    assert.ok(relevant.length >= 1, `no design/copy squad matches: ${JSON.stringify(r.matches.map(m => m.id))}`);
  });

  test('v1.0 regression: dedup by asset id in top matches', () => {
    const catalog = loadRealCatalog();
    if (!catalog) return; // skip if catalog unavailable
    const r = resolve(catalog, 'develop');
    const ids = r.matches.map(m => m.id);
    const unique = new Set(ids);
    assert.strictEqual(ids.length, unique.size, `duplicate ids in top: ${ids.join(',')}`);
  });
});

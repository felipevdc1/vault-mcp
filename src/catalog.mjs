// vault-mcp: Catalog module
// Manages catalog.json — load, save, query, and aggregate stats

import path from 'path';
import { atomicWrite, safeReadFile } from './utils.mjs';

const CATALOG_FILE = 'catalog.json';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Returns an empty catalog structure.
 * @returns {{ version: number, generated: null, assets: [] }}
 */
export function emptyCatalog() {
  return { version: 1, generated: null, assets: [] };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * Reads and returns the catalog from vaultDir/catalog.json.
 * Returns an empty catalog if the file doesn't exist or is malformed.
 * @param {string} vaultDir  — path to ~/.claude/vault/
 * @returns {{ version: number, generated: string|null, assets: object[] }}
 */
export function loadCatalog(vaultDir) {
  const filePath = path.join(vaultDir, CATALOG_FILE);
  const raw = safeReadFile(filePath);
  if (!raw) return emptyCatalog();
  try {
    const parsed = JSON.parse(raw);
    // Basic shape validation
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.assets)) {
      return emptyCatalog();
    }
    return parsed;
  } catch {
    return emptyCatalog();
  }
}

/**
 * Saves catalog atomically to vaultDir/catalog.json.
 * @param {string} vaultDir
 * @param {object} catalog
 */
export function saveCatalog(vaultDir, catalog) {
  const filePath = path.join(vaultDir, CATALOG_FILE);
  atomicWrite(filePath, catalog);
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/**
 * Finds an asset by its ID (exact match).
 * @param {object} catalog
 * @param {string} id
 * @returns {object|undefined}
 */
export function findAssetById(catalog, id) {
  return catalog.assets.find(a => a.id === id);
}

/**
 * Returns only assets with installed: true.
 * @param {object} catalog
 * @returns {object[]}
 */
export function getInstalledAssets(catalog) {
  return catalog.assets.filter(a => a.installed === true);
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

/**
 * Returns aggregate statistics for a catalog.
 * @param {object} catalog
 * @returns {{ total: number, byType: object, bySquad: object, bySource: object }}
 */
export function getCatalogStats(catalog) {
  const stats = {
    total: catalog.assets.length,
    byType: {},
    bySquad: {},
    bySource: {},
  };

  for (const asset of catalog.assets) {
    // byType
    const type = asset.type || 'unknown';
    stats.byType[type] = (stats.byType[type] || 0) + 1;

    // bySquad
    const squad = asset.squad || 'unknown';
    stats.bySquad[squad] = (stats.bySquad[squad] || 0) + 1;

    // bySource
    const source = asset.source || 'unknown';
    stats.bySource[source] = (stats.bySource[source] || 0) + 1;
  }

  return stats;
}

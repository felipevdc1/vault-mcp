// vault-mcp: Scanner module
// Scans configured directories for skills, squads, and commands.
// Reads vault.yaml manifests when present; falls back to markdown heuristics.

import fs from 'fs';
import path from 'path';
import os from 'os';
import yaml from 'js-yaml';

import {
  expandPath,
  extractFrontmatter,
  extractHeadings,
  extractFirstParagraph,
  slugify,
  safeReadFile,
  isSymlink,
} from './utils.mjs';

import { emptyCatalog } from './catalog.mjs';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COMMANDS_DIR = path.join(os.homedir(), '.claude', 'commands');

// Directories/files that are always skipped when walking trees
const DEFAULT_IGNORE = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.DS_Store',
  '.cache',
  '__pycache__',
]);

// Sub-directory names that indicate a "type" of asset
const TYPE_DIR_MAP = {
  agents: 'agent',
  tasks: 'task',
  commands: 'command',
};

// Section headings that describe "when to use"
const WHEN_HEADINGS = ['when to use', 'quando usar', 'when', 'use when'];

// Section headings that describe outputs
const DELIVERS_HEADINGS = [
  'output', 'outputs', 'delivers', 'entrega', 'deliverables', 'result', 'returns',
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Main scan function. Accepts a config object and returns a full catalog.
 *
 * @param {object} config
 * @param {string[]} config.scan_dirs
 * @param {string[]} [config.ignore]
 * @returns {object}  catalog
 */
export async function scan(config) {
  const catalog = emptyCatalog();
  const ignoredPatterns = buildIgnoreSet(config.ignore || []);
  const seenIds = new Set(); // dedup: first scan_dir wins (priority order)

  for (const rawDir of (config.scan_dirs || [])) {
    const dirPath = expandPath(rawDir);

    if (!dirExists(dirPath)) {
      continue; // skip non-existent dirs silently
    }

    // Look for a manifest in the directory root or in ~/.claude/vault/manifests/
    const squadName = path.basename(dirPath);
    const manifestPath = findManifest(dirPath, squadName);

    let assets;
    if (manifestPath) {
      assets = scanManifest(manifestPath, dirPath, squadName);
      // Complement manifest assets with content from .md files
      assets = complementAssetsWithMarkdown(assets, dirPath, squadName, ignoredPatterns);
    } else {
      assets = await scanDirectory(dirPath, ignoredPatterns, rawDir);
    }

    // Resolve installation status for every asset and dedup by ID
    for (const asset of assets) {
      asset.installed = checkInstalled(asset.path, COMMANDS_DIR);
      if (seenIds.has(asset.id)) continue;
      seenIds.add(asset.id);
      catalog.assets.push(asset);
    }
  }

  catalog.generated = new Date().toISOString();
  return catalog;
}

// ---------------------------------------------------------------------------
// Directory scanning
// ---------------------------------------------------------------------------

/**
 * Recursively scans a directory and returns an array of asset objects.
 *
 * @param {string} dirPath
 * @param {Set<string>} ignoredPatterns
 * @param {string} source  — the raw scan_dir entry for provenance
 * @returns {object[]}
 */
export function scanDirectory(dirPath, ignoredPatterns, source) {
  const assets = [];

  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return assets; // unreadable directory — skip
  }

  // Determine the squad name. A directory is treated as a squad if it has
  // sub-directories named agents/, tasks/, or contains a README.md.
  const squadName = inferSquadName(dirPath, entries);

  for (const entry of entries) {
    if (shouldIgnore(entry.name, ignoredPatterns)) continue;

    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      // Recurse into subdirectory
      const subAssets = scanDirectory(fullPath, ignoredPatterns, source);
      assets.push(...subAssets);
    } else if (entry.isFile() && entry.name.endsWith('.md') && entry.name.toLowerCase() !== 'readme.md') {
      const asset = scanMarkdownFile(fullPath, squadName, source);
      if (asset) assets.push(asset);
    }
  }

  return assets;
}

// ---------------------------------------------------------------------------
// Manifest scanning
// ---------------------------------------------------------------------------

/**
 * Reads a vault.yaml/manifest file and returns structured asset objects.
 *
 * @param {string} manifestPath
 * @param {string} dirPath  — the directory the manifest represents
 * @param {string} squadName
 * @returns {object[]}
 */
export function scanManifest(manifestPath, dirPath, squadName) {
  const raw = safeReadFile(manifestPath);
  if (!raw) return [];

  let manifest;
  try {
    manifest = yaml.load(raw);
  } catch {
    return [];
  }

  if (!manifest || typeof manifest !== 'object') return [];

  const squad = manifest.name || squadName;
  const assetList = Array.isArray(manifest.assets) ? manifest.assets : [];
  const assets = [];

  for (const entry of assetList) {
    if (!entry || !entry.id) continue;

    // id format from manifest: "agents:brad-frost" → we prepend squad
    const [typeKey, ...nameParts] = entry.id.split(':');
    const name = nameParts.join(':') || typeKey;
    const type = TYPE_DIR_MAP[typeKey] || typeKey;

    const id = buildAssetId(squad, type, name);
    const assetPath = resolveAssetPath(dirPath, typeKey, name);

    const asset = {
      id,
      name,
      type,
      squad,
      path: assetPath,
      source: manifestPath,
      installed: false,
      tags: inferTagsFromEntry(entry, squad, type, name),
      summary: {
        what: entry.what || entry.description || null,
        when: entry.when || null,
        delivers: entry.delivers || null,
      },
    };

    assets.push(asset);
  }

  return assets;
}

// ---------------------------------------------------------------------------
// Markdown file scanning
// ---------------------------------------------------------------------------

/**
 * Extracts metadata from a single markdown file.
 *
 * @param {string} filePath
 * @param {string} squad
 * @param {string} source
 * @returns {object|null}
 */
export function scanMarkdownFile(filePath, squad, source) {
  const raw = safeReadFile(filePath);
  if (!raw) return null;

  const { raw: yamlRaw, body } = extractFrontmatter(raw);

  let frontmatter = {};
  if (yamlRaw) {
    try {
      frontmatter = yaml.load(yamlRaw) || {};
    } catch {
      frontmatter = {};
    }
  }

  const fileName = path.basename(filePath, '.md');
  const name = frontmatter.name || frontmatter.title || fileName;
  const type = inferType(filePath, null);

  const id = buildAssetId(squad, type, slugify(name));
  const summary = buildSummary(body, frontmatter);
  const asset = {
    id,
    name,
    type,
    squad,
    path: filePath,
    source,
    installed: false,
    tags: [],
    summary,
  };

  asset.tags = inferTags(asset);
  return asset;
}

// ---------------------------------------------------------------------------
// ID construction
// ---------------------------------------------------------------------------

/**
 * Constructs an asset ID in the format "squad:type:name".
 * @param {string} squad
 * @param {string} type
 * @param {string} name
 * @returns {string}
 */
export function buildAssetId(squad, type, name) {
  return [slugify(squad), slugify(type), slugify(name)].filter(Boolean).join(':');
}

// ---------------------------------------------------------------------------
// Type inference
// ---------------------------------------------------------------------------

/**
 * Infers the asset type from its file path.
 *
 * Looks at parent directory names:
 *   agents/  → "agent"
 *   tasks/   → "task"
 *   commands/ → "command"
 *   otherwise → "skill"
 *
 * @param {string} filePath
 * @param {null} _dirStructure  — reserved for future use
 * @returns {string}
 */
export function inferType(filePath, _dirStructure) {
  const parts = filePath.split(path.sep);
  // Walk from the end (excluding the filename itself)
  for (let i = parts.length - 2; i >= 0; i--) {
    const dir = parts[i].toLowerCase();
    if (TYPE_DIR_MAP[dir]) return TYPE_DIR_MAP[dir];
  }
  return 'skill';
}

// ---------------------------------------------------------------------------
// Tag inference
// ---------------------------------------------------------------------------

/**
 * Auto-generates tags for an asset from path segments, description keywords, and name.
 *
 * @param {object} asset
 * @returns {string[]}
 */
export function inferTags(asset) {
  const tagSet = new Set();

  // From squad name
  if (asset.squad) {
    slugify(asset.squad).split('-').filter(t => t.length > 2).forEach(t => tagSet.add(t));
  }

  // From type
  if (asset.type) tagSet.add(asset.type);

  // From name segments
  if (asset.name) {
    slugify(asset.name).split('-').filter(t => t.length > 2).forEach(t => tagSet.add(t));
  }

  // From summary keywords (what, when, delivers)
  const descriptionText = [
    asset.summary?.what,
    asset.summary?.when,
    asset.summary?.delivers,
  ].filter(Boolean).join(' ');

  // Extract meaningful words (length > 3, not stopwords)
  const stopwords = new Set([
    'the', 'and', 'for', 'with', 'this', 'that', 'from', 'into', 'when',
    'are', 'not', 'can', 'use', 'used', 'using', 'based', 'each', 'all',
    'per', 'any', 'via', 'its', 'our', 'your', 'their', 'them',
  ]);

  descriptionText
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopwords.has(w))
    .slice(0, 15) // cap to avoid noise
    .forEach(w => tagSet.add(w));

  return Array.from(tagSet);
}

// ---------------------------------------------------------------------------
// Summary construction
// ---------------------------------------------------------------------------

/**
 * Builds a { what, when, delivers } summary from content and frontmatter.
 *
 * @param {string} content  — markdown body (after frontmatter stripped)
 * @param {object} frontmatter
 * @returns {{ what: string|null, when: string|null, delivers: string|null }}
 */
export function buildSummary(content, frontmatter) {
  // --- what ---
  const what =
    frontmatter.description ||
    frontmatter.what ||
    frontmatter.summary ||
    extractFirstParagraph(content) ||
    extractHeadings(content)[0] ||
    null;

  // --- when ---
  let when = frontmatter.when || frontmatter.use_when || null;
  if (!when) {
    for (const heading of WHEN_HEADINGS) {
      const para = extractFirstParagraph(content, heading);
      if (para) { when = para; break; }
    }
  }

  // --- delivers ---
  let delivers = frontmatter.delivers || frontmatter.output || null;
  if (!delivers) {
    for (const heading of DELIVERS_HEADINGS) {
      const para = extractFirstParagraph(content, heading);
      if (para) { delivers = para; break; }
    }
  }

  return { what: what || null, when: when || null, delivers: delivers || null };
}

// ---------------------------------------------------------------------------
// Installation check
// ---------------------------------------------------------------------------

/**
 * Checks whether a symlink pointing to assetPath exists in commandsDir.
 *
 * @param {string} assetPath
 * @param {string} commandsDir
 * @returns {boolean}
 */
export function checkInstalled(assetPath, commandsDir) {
  if (!assetPath) return false;

  const fileName = path.basename(assetPath);
  const symlinkPath = path.join(commandsDir, fileName);

  if (!isSymlink(symlinkPath)) return false;

  try {
    const target = fs.readlinkSync(symlinkPath);
    const resolvedTarget = path.isAbsolute(target) ? target : path.resolve(commandsDir, target);
    return resolvedTarget === path.resolve(assetPath);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Builds the ignore set from config patterns + defaults.
 * @param {string[]} patterns
 * @returns {Set<string>}
 */
function buildIgnoreSet(patterns) {
  const combined = new Set(DEFAULT_IGNORE);
  for (const p of patterns) combined.add(p);
  return combined;
}

/**
 * Returns true if an entry name should be skipped.
 * Supports:
 *   - Exact name match (e.g., "node_modules")
 *   - Simple glob extension match (e.g., "*.zip" matches "archive.zip")
 *
 * @param {string} name
 * @param {Set<string>} patterns
 * @returns {boolean}
 */
function shouldIgnore(name, patterns) {
  for (const pattern of patterns) {
    if (pattern === name) return true;
    if (pattern.startsWith('*.')) {
      const ext = pattern.slice(1); // ".zip"
      if (name.endsWith(ext)) return true;
    }
  }
  return false;
}

/**
 * Checks whether a directory exists and is accessible.
 * @param {string} dirPath
 * @returns {boolean}
 */
function dirExists(dirPath) {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Determines the squad name for a given directory.
 * Uses the directory name as the squad identifier.
 *
 * @param {string} dirPath
 * @param {fs.Dirent[]} entries
 * @returns {string}
 */
function inferSquadName(dirPath, entries) {
  // If this dir has known sub-dirs (agents/, tasks/) it's a squad root
  const subDirNames = entries.filter(e => e.isDirectory()).map(e => e.name.toLowerCase());
  const isSquadRoot = subDirNames.some(d => d === 'agents' || d === 'tasks');
  if (isSquadRoot) return path.basename(dirPath);

  // Otherwise, walk up to find a squad root
  const parent = path.dirname(dirPath);
  const parentBase = path.basename(parent);
  if (TYPE_DIR_MAP[path.basename(dirPath).toLowerCase()]) return parentBase;

  return path.basename(dirPath);
}

/**
 * Searches for a vault.yaml (or vault.yml) manifest file in:
 *   1. The directory root itself
 *   2. ~/.claude/vault/manifests/{squadName}.yaml
 *
 * @param {string} dirPath
 * @param {string} squadName
 * @returns {string|null}
 */
function findManifest(dirPath, squadName) {
  const candidates = [
    path.join(dirPath, 'vault.yaml'),
    path.join(dirPath, 'vault.yml'),
    path.join(os.homedir(), '.claude', 'vault', 'manifests', `${squadName}.yaml`),
    path.join(os.homedir(), '.claude', 'vault', 'manifests', `${squadName}.yml`),
  ];

  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, fs.constants.R_OK);
      return candidate;
    } catch {
      // not found
    }
  }
  return null;
}

/**
 * Given a squad directory, type key (e.g. "agents"), and asset name,
 * tries to resolve the path to the actual .md file.
 *
 * @param {string} dirPath
 * @param {string} typeKey  — "agents" | "tasks" | etc.
 * @param {string} name
 * @returns {string}
 */
function resolveAssetPath(dirPath, typeKey, name) {
  const candidates = [
    path.join(dirPath, typeKey, `${name}.md`),
    path.join(dirPath, `${name}.md`),
    path.join(dirPath, typeKey, name, 'README.md'),
  ];

  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, fs.constants.R_OK);
      return candidate;
    } catch {
      // try next
    }
  }

  // Return the most likely path even if it doesn't exist yet
  return path.join(dirPath, typeKey, `${name}.md`);
}

/**
 * Complements manifest-sourced assets with richer content from the actual .md files.
 * Only fills in missing summary fields — doesn't overwrite manifest data.
 *
 * @param {object[]} assets
 * @param {string} dirPath
 * @param {string} squadName
 * @param {Set<string>} ignoredPatterns
 * @returns {object[]}
 */
function complementAssetsWithMarkdown(assets, dirPath, squadName, ignoredPatterns) {
  // Build a path→asset map
  const byPath = new Map(assets.map(a => [a.path, a]));

  // Also scan the directory to pick up any files not listed in the manifest
  const fsAssets = scanDirectory(dirPath, ignoredPatterns, dirPath);

  for (const fsAsset of fsAssets) {
    const existing = byPath.get(fsAsset.path);
    if (existing) {
      // Complement missing summary fields
      existing.summary.what = existing.summary.what || fsAsset.summary.what;
      existing.summary.when = existing.summary.when || fsAsset.summary.when;
      existing.summary.delivers = existing.summary.delivers || fsAsset.summary.delivers;
      // Merge tags
      const merged = new Set([...existing.tags, ...fsAsset.tags]);
      existing.tags = Array.from(merged);
    } else {
      // File exists on disk but wasn't in manifest — add it
      assets.push(fsAsset);
      byPath.set(fsAsset.path, fsAsset);
    }
  }

  return assets;
}

/**
 * Builds tags from a raw manifest asset entry.
 * @param {object} entry
 * @param {string} squad
 * @param {string} type
 * @param {string} name
 * @returns {string[]}
 */
function inferTagsFromEntry(entry, squad, type, name) {
  const tagSet = new Set(Array.isArray(entry.tags) ? entry.tags : []);
  // Add squad, type, and name segments as tags too
  slugify(squad).split('-').filter(t => t.length > 2).forEach(t => tagSet.add(t));
  tagSet.add(type);
  slugify(name).split('-').filter(t => t.length > 2).forEach(t => tagSet.add(t));
  return Array.from(tagSet);
}

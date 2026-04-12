// vault-mcp: Usage module
// Tracks skill usage frequency and patterns across sessions

import path from 'path';
import { safeReadFile, atomicWrite } from './utils.mjs';

const USAGE_FILE = 'usage.json';
const MAX_MISSES = 100;

// ---------------------------------------------------------------------------
// Empty structure factory
// ---------------------------------------------------------------------------

/**
 * Returns an empty usage data structure.
 * @returns {{ skills: object, recipes: object, misses: object[] }}
 */
function emptyUsage() {
  return { skills: {}, recipes: {}, misses: [] };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * Loads usage.json from vaultDir.
 * Returns an empty usage structure if the file doesn't exist or is malformed.
 * @param {string} vaultDir
 * @returns {{ skills: object, recipes: object, misses: object[] }}
 */
export function loadUsage(vaultDir) {
  const filePath = path.join(vaultDir, USAGE_FILE);
  const raw = safeReadFile(filePath);
  if (!raw) return emptyUsage();

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return emptyUsage();
    // Ensure required keys exist
    return {
      skills: parsed.skills && typeof parsed.skills === 'object' ? parsed.skills : {},
      recipes: parsed.recipes && typeof parsed.recipes === 'object' ? parsed.recipes : {},
      misses: Array.isArray(parsed.misses) ? parsed.misses : [],
    };
  } catch {
    return emptyUsage();
  }
}

/**
 * Saves usageData atomically to vaultDir/usage.json.
 * @param {string} vaultDir
 * @param {object} usageData
 */
export function saveUsage(vaultDir, usageData) {
  const filePath = path.join(vaultDir, USAGE_FILE);
  atomicWrite(filePath, usageData);
}

// ---------------------------------------------------------------------------
// Tracking helpers
// ---------------------------------------------------------------------------

/**
 * Ensures a skill entry exists in usageData.skills and returns it.
 * @param {object} usageData
 * @param {string} assetId
 * @returns {object}  — the skill entry (mutated in place)
 */
function ensureSkillEntry(usageData, assetId) {
  if (!usageData.skills[assetId]) {
    usageData.skills[assetId] = {
      total_resolves: 0,
      total_reads: 0,
      last_used: null,
      projects: [],
    };
  }
  return usageData.skills[assetId];
}

/**
 * Records that an asset was resolved (vault_resolve returned it as a match).
 * Increments total_resolves, updates last_used, and adds the project if not present.
 * @param {object} usageData
 * @param {string} assetId
 * @param {string} [project]  — optional project name/path for context
 * @returns {object}  — modified usageData
 */
export function trackResolve(usageData, assetId, project) {
  const entry = ensureSkillEntry(usageData, assetId);
  entry.total_resolves = (entry.total_resolves || 0) + 1;
  entry.last_used = new Date().toISOString();

  if (project && typeof project === 'string' && !entry.projects.includes(project)) {
    entry.projects.push(project);
  }

  return usageData;
}

/**
 * Records that an asset was read (agent invoked the Read tool on it).
 * Increments total_reads and updates last_used.
 * @param {object} usageData
 * @param {string} assetId
 * @returns {object}  — modified usageData
 */
export function trackRead(usageData, assetId) {
  const entry = ensureSkillEntry(usageData, assetId);
  entry.total_reads = (entry.total_reads || 0) + 1;
  entry.last_used = new Date().toISOString();

  return usageData;
}

/**
 * Records a miss — a vault_resolve call that returned no useful match.
 * Keeps the last MAX_MISSES entries.
 * @param {object} usageData
 * @param {string} task     — the original task description
 * @param {boolean} forged  — whether the agent ended up forging a new skill
 * @returns {object}  — modified usageData
 */
export function trackMiss(usageData, task, forged) {
  if (!Array.isArray(usageData.misses)) {
    usageData.misses = [];
  }

  usageData.misses.push({
    task: task || '',
    date: new Date().toISOString(),
    forged: Boolean(forged),
  });

  // Trim to last MAX_MISSES
  if (usageData.misses.length > MAX_MISSES) {
    usageData.misses = usageData.misses.slice(-MAX_MISSES);
  }

  return usageData;
}

/**
 * Records that a recipe was used.
 * Increments used count and updates last_used.
 * @param {object} usageData
 * @param {string} recipeName
 * @returns {object}  — modified usageData
 */
export function trackRecipeUse(usageData, recipeName) {
  if (!usageData.recipes[recipeName]) {
    usageData.recipes[recipeName] = { used: 0, last_used: null };
  }
  usageData.recipes[recipeName].used = (usageData.recipes[recipeName].used || 0) + 1;
  usageData.recipes[recipeName].last_used = new Date().toISOString();

  return usageData;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Calculates a usage boost score (0–5) for the resolver based on total_reads.
 * Thresholds: 0=0, 1-5=1, 6-15=2, 16-30=3, 31-60=4, 61+=5
 * @param {object} usageData
 * @param {string} assetId
 * @returns {number}
 */
export function getUsageBoost(usageData, assetId) {
  const entry = usageData.skills && usageData.skills[assetId];
  if (!entry || typeof entry.total_reads !== 'number') return 0;

  const reads = entry.total_reads;
  if (reads >= 61) return 5;
  if (reads >= 31) return 4;
  if (reads >= 16) return 3;
  if (reads >= 6) return 2;
  if (reads >= 1) return 1;
  return 0;
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

/**
 * Computes aggregated statistics for the dashboard.
 * @param {object} usageData
 * @returns {{
 *   topSkills: Array<{ id: string, total_reads: number, total_resolves: number }>,
 *   totalMisses: number,
 *   unforgedMisses: object[],
 *   recipesRanking: Array<{ name: string, used: number, last_used: string|null }>
 * }}
 */
export function getUsageStats(usageData) {
  // Top 10 skills by total_reads
  const topSkills = Object.entries(usageData.skills || {})
    .map(([id, entry]) => ({
      id,
      total_reads: entry.total_reads || 0,
      total_resolves: entry.total_resolves || 0,
      last_used: entry.last_used || null,
      projects: entry.projects || [],
    }))
    .sort((a, b) => b.total_reads - a.total_reads)
    .slice(0, 10);

  const misses = Array.isArray(usageData.misses) ? usageData.misses : [];
  const totalMisses = misses.length;
  // Gaps: misses that were NOT forged (still unaddressed)
  const unforgedMisses = misses.filter(m => !m.forged);

  // Recipes ranking
  const recipesRanking = Object.entries(usageData.recipes || {})
    .map(([name, entry]) => ({
      name,
      used: entry.used || 0,
      last_used: entry.last_used || null,
    }))
    .sort((a, b) => b.used - a.used);

  return { topSkills, totalMisses, unforgedMisses, recipesRanking };
}

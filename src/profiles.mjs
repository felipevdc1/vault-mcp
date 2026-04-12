// vault-mcp: Profiles module
// Project profiles — auto-load relevant skills per project context

import fs from 'fs';
import path from 'path';
import os from 'os';
import yaml from 'js-yaml';
import { safeReadFile } from './utils.mjs';

const PROFILE_FILENAME = '.vault-profile.yaml';

// ---------------------------------------------------------------------------
// Profile detection
// ---------------------------------------------------------------------------

/**
 * Searches for a .vault-profile.yaml file starting from startDir and walking up
 * the filesystem until / or the user's home directory is reached.
 * @param {string} startDir  — directory to start from (e.g. process.cwd())
 * @returns {{ profile: object|null, path: string|null }}
 */
export function findProfile(startDir) {
  const home = os.homedir();
  let current = path.resolve(startDir);

  while (true) {
    const candidate = path.join(current, PROFILE_FILENAME);
    const raw = safeReadFile(candidate);

    if (raw !== null) {
      try {
        const profile = yaml.load(raw);
        if (profile && typeof profile === 'object') {
          return { profile, path: candidate };
        }
      } catch {
        // malformed YAML — skip and keep walking up
      }
    }

    // Stop conditions: reached root or home directory (don't go above home)
    const parent = path.dirname(current);
    if (parent === current || current === home) {
      break;
    }
    current = parent;
  }

  return { profile: null, path: null };
}

// ---------------------------------------------------------------------------
// Profile data extractors
// ---------------------------------------------------------------------------

/**
 * Extracts the list of squads and individual skills to auto-load from a profile.
 * @param {object|null} profile
 * @returns {{ squads: string[], skills: string[] }}
 */
export function getAutoLoadSkills(profile) {
  if (!profile || typeof profile !== 'object') {
    return { squads: [], skills: [] };
  }

  const autoLoad = profile.auto_load || {};

  const squads = Array.isArray(autoLoad.squads)
    ? autoLoad.squads.filter(s => typeof s === 'string')
    : [];

  const skills = Array.isArray(autoLoad.skills)
    ? autoLoad.skills.filter(s => typeof s === 'string')
    : [];

  return { squads, skills };
}

/**
 * Returns the domain keywords from a profile (used for context boost in resolver).
 * Combines profile.stack and profile.domains into a lowercase array of strings.
 * @param {object|null} profile
 * @returns {string[]}
 */
export function getProjectDomains(profile) {
  if (!profile || typeof profile !== 'object') return [];

  const stack = Array.isArray(profile.stack)
    ? profile.stack.filter(s => typeof s === 'string').map(s => s.toLowerCase())
    : [];

  const domains = Array.isArray(profile.domains)
    ? profile.domains.filter(d => typeof d === 'string').map(d => d.toLowerCase())
    : [];

  // Deduplicate
  return [...new Set([...stack, ...domains])];
}

/**
 * Returns the recommended recipe names from a profile.
 * @param {object|null} profile
 * @returns {string[]}
 */
export function getProjectRecipes(profile) {
  if (!profile || typeof profile !== 'object') return [];

  return Array.isArray(profile.recipes)
    ? profile.recipes.filter(r => typeof r === 'string')
    : [];
}

// ---------------------------------------------------------------------------
// Profile template
// ---------------------------------------------------------------------------

/**
 * Generates a YAML template string for a new .vault-profile.yaml.
 * @param {string} projectName
 * @returns {string}
 */
export function createProfileTemplate(projectName) {
  const template = {
    project: projectName || 'my-project',
    stack: ['typescript', 'node'],
    domains: ['backend', 'api'],
    auto_load: {
      squads: ['core'],
      skills: [],
    },
    recipes: [],
  };

  return yaml.dump(template, { lineWidth: 120, quotingType: '"' });
}

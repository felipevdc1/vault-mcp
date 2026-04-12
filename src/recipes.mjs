// vault-mcp: Recipes module
// Manages pre-defined skill combinations (recipes) for common tasks.

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { safeReadFile } from './utils.mjs';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Reads and parses all YAML files in a directory.
 * Returns array of parsed objects. Files that fail to parse are skipped.
 * @param {string} dir
 * @returns {Array<object>}
 */
function readYamlDir(dir) {
  if (!fs.existsSync(dir)) return [];
  let files = [];
  try {
    files = fs.readdirSync(dir).filter(f => f.endsWith('.yaml'));
  } catch {
    return [];
  }
  const results = [];
  for (const file of files) {
    const content = safeReadFile(path.join(dir, file));
    if (!content) continue;
    try {
      const parsed = yaml.load(content);
      if (parsed && typeof parsed === 'object') {
        results.push(parsed);
      }
    } catch {
      // skip malformed files
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Loads all recipes from {vaultDir}/recipes/.
 * Returns empty array if directory doesn't exist or no valid files found.
 * @param {string} vaultDir
 * @returns {object[]}
 */
export function loadRecipes(vaultDir) {
  const recipesDir = path.join(vaultDir, 'recipes');
  return readYamlDir(recipesDir);
}

/**
 * Finds the most relevant recipe for the given keywords.
 * Score: +5 per keyword match against recipe.name + recipe.what + recipe.when.
 * Returns null if no recipe scores >= 5.
 * @param {object[]} recipes
 * @param {string[]} keywords
 * @returns {object|null}
 */
export function matchRecipe(recipes, keywords) {
  if (!Array.isArray(recipes) || recipes.length === 0) return null;
  if (!Array.isArray(keywords) || keywords.length === 0) return null;

  let bestRecipe = null;
  let bestScore = 0;

  for (const recipe of recipes) {
    const searchText = [
      recipe.name || '',
      recipe.what || '',
      recipe.when || '',
    ].join(' ').toLowerCase();

    let score = 0;
    for (const kw of keywords) {
      if (searchText.includes(kw.toLowerCase())) {
        score += 5;
      }
    }

    if (score >= 5 && score > bestScore) {
      bestScore = score;
      bestRecipe = recipe;
    }
  }

  if (!bestRecipe) return null;

  return {
    name: bestRecipe.name,
    what: bestRecipe.what,
    skills: Array.isArray(bestRecipe.skills) ? bestRecipe.skills : [],
    workflow_hint: bestRecipe.workflow_hint || null,
    score: bestScore,
  };
}

/**
 * Extracts an array of skill IDs from a recipe.
 * recipe.skills is expected to be an array of { id, role } objects.
 * @param {object} recipe
 * @returns {string[]}
 */
export function getRecipeSkillIds(recipe) {
  if (!recipe || !Array.isArray(recipe.skills)) return [];
  return recipe.skills
    .map(s => (typeof s === 'object' && s !== null ? s.id : s))
    .filter(id => typeof id === 'string' && id.length > 0);
}

/**
 * Resolves recipe skill IDs against a catalog.
 * For each skill ID in the recipe, searches the catalog by exact ID match, then partial match.
 * @param {object} recipe
 * @param {object} catalog  — catalog loaded via catalog.mjs (has .assets array)
 * @returns {{ found: Array<{ id, path, summary }>, missing: string[] }}
 */
export function resolveRecipeSkills(recipe, catalog) {
  const emptyResult = { found: [], missing: [] };
  if (!recipe || !catalog || !Array.isArray(catalog.assets)) return emptyResult;

  const skillIds = getRecipeSkillIds(recipe);
  if (skillIds.length === 0) return emptyResult;

  const found = [];
  const missing = [];

  for (const skillId of skillIds) {
    // 1. Exact match
    let asset = catalog.assets.find(a => a.id === skillId);

    // 2. Partial match: recipe ID ends with the asset ID or vice versa
    if (!asset) {
      asset = catalog.assets.find(a =>
        a.id && (skillId.endsWith(`:${a.id}`) || a.id.endsWith(`:${skillId}`))
      );
    }

    if (asset) {
      found.push({
        id: asset.id,
        path: asset.path || null,
        summary: asset.summary || {},
      });
    } else {
      missing.push(skillId);
    }
  }

  return { found, missing };
}

/**
 * Generates a YAML template string for a new recipe.
 * Useful for CLI / enrichment workflows.
 * @param {string} name
 * @returns {string}
 */
export function createRecipeTemplate(name) {
  const template = {
    name: name || 'my-recipe',
    what: 'Describe what this recipe does',
    when: 'Describe when to use this recipe',
    workflow_hint: 'Step-by-step guidance for using this recipe',
    skills: [
      { id: 'squad:skills:skill-name', role: 'primary' },
      { id: 'squad:skills:another-skill', role: 'support' },
    ],
  };
  return yaml.dump(template, { lineWidth: 120, quotingType: '"' });
}

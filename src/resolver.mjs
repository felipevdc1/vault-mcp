// vault-mcp: Resolver module
// Multi-signal scoring engine — matches tasks to the best available skills.

// ---------------------------------------------------------------------------
// Stop words (pt-br + en)
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  // Portuguese
  'a', 'o', 'de', 'do', 'da', 'dos', 'das', 'para', 'pra', 'um', 'uma',
  'uns', 'umas', 'em', 'no', 'na', 'nos', 'nas', 'por', 'pelo', 'pela',
  'com', 'sem', 'que', 'e', 'ou', 'mas', 'se', 'ao', 'aos', 'as',
  'esse', 'essa', 'isso', 'este', 'esta', 'isto', 'ele', 'ela', 'eu',
  'tu', 'nos', 'vos', 'eles', 'elas', 'seu', 'sua', 'meu', 'minha',
  'tem', 'ter', 'ser', 'foi', 'sao', 'era', 'mais', 'bem', 'muito',
  'ja', 'ate', 'sobre', 'como', 'quando', 'onde',
  // English
  'the', 'for', 'with', 'and', 'to', 'in', 'on', 'of', 'at', 'by',
  'an', 'is', 'it', 'be', 'as', 'or', 'if', 'do', 'not', 'this',
  'that', 'from', 'are', 'was', 'has', 'have', 'had', 'can', 'will',
  'would', 'could', 'should', 'may', 'might', 'its', 'into', 'than',
  'then', 'so', 'up', 'out', 'also', 'how', 'what', 'which', 'who',
  'but', 'all', 'any', 'my', 'your', 'we', 'us', 'our',
]);

// ---------------------------------------------------------------------------
// Keyword extraction
// ---------------------------------------------------------------------------

/**
 * Extracts relevant keywords from a task string.
 * Splits on whitespace, removes stop words, lowercases everything.
 * @param {string} task
 * @returns {string[]}
 */
export function extractKeywords(task) {
  if (!task) return [];
  return task
    .toLowerCase()
    .split(/[\s,;:!?.()\[\]{}"']+/)
    .filter(Boolean)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w));
}

// ---------------------------------------------------------------------------
// Score algorithm
// ---------------------------------------------------------------------------

/**
 * Calculates a relevance score for an asset against a set of keywords.
 *
 * score = tagScore + nameScore + descriptionScore + usageBoost + contextBoost + recipeBonus
 *
 * tagScore:         keywords that match asset tags → +5 each
 * nameScore:        keyword exact in name → +10; partial → +7
 * descriptionScore: keywords in summary.what/when/delivers → +3 each
 * usageBoost:       based on usageData[asset.id].total_reads (log scale) → 0–5
 * contextBoost:     if any asset tag matches projectDomains → +3
 * recipeBonus:      if asset is part of a recipe that matches keywords → +2
 *
 * @param {object} asset           — catalog asset entry
 * @param {string[]} keywords      — extracted keywords
 * @param {object} [options]
 * @param {object} [options.usageData]       — usage.json skills section
 * @param {string[]} [options.projectDomains] — domains from .vault-profile
 * @param {object[]} [options.recipes]        — array of recipe objects
 * @returns {number}
 */
export function scoreAsset(asset, keywords, options = {}) {
  if (!asset || !keywords || keywords.length === 0) return 0;

  const { usageData = {}, projectDomains = [], recipes = [] } = options;

  let score = 0;

  // --- Normalise asset fields ---
  const assetName = (asset.name || asset.id || '').toLowerCase();
  const assetTags = Array.isArray(asset.tags)
    ? asset.tags.map(t => t.toLowerCase())
    : [];
  const summary = asset.summary || {};
  const descriptionText = [
    summary.what || '',
    summary.when || '',
    summary.delivers || '',
  ]
    .join(' ')
    .toLowerCase();

  // --- Tag score: +5 per matching tag (word-boundary matching) ---
  for (const kw of keywords) {
    if (assetTags.some(tag => tag === kw || tag.startsWith(kw + '-') || tag.endsWith('-' + kw) || tag.includes('-' + kw + '-'))) {
      score += 5;
    }
  }

  // --- Name score: +10 exact, +7 partial ---
  for (const kw of keywords) {
    if (assetName === kw) {
      score += 10;
    } else if (
      assetName.startsWith(kw + '-') ||
      assetName.endsWith('-' + kw) ||
      assetName.includes('-' + kw + '-')
    ) {
      score += 7;
    }
  }

  // --- Description score: +3 per keyword found in what/when/delivers ---
  for (const kw of keywords) {
    if (descriptionText.includes(kw)) {
      score += 3;
    }
  }

  // --- Usage boost: 0–5 based on total_reads (log scale) ---
  const assetId = asset.id || '';
  const usageEntry = usageData[assetId];
  if (usageEntry && typeof usageEntry.total_reads === 'number') {
    const reads = usageEntry.total_reads;
    if (reads >= 61) score += 5;
    else if (reads >= 31) score += 4;
    else if (reads >= 16) score += 3;
    else if (reads >= 6) score += 2;
    else if (reads >= 1) score += 1;
  }

  // --- Context boost: +3 if any asset tag matches project domains ---
  if (projectDomains.length > 0) {
    const domains = projectDomains.map(d => d.toLowerCase());
    if (assetTags.some(tag => domains.includes(tag))) {
      score += 3;
    }
  }

  // --- Recipe bonus: +2 if asset is part of a recipe matching keywords ---
  if (recipes.length > 0 && assetId) {
    for (const recipe of recipes) {
      const recipeText = `${recipe.name || ''} ${recipe.what || ''}`.toLowerCase();
      const recipeKeywords = extractKeywords(recipeText);
      const recipeMatches = keywords.filter(kw => recipeKeywords.includes(kw)).length;
      if (recipeMatches > 0) {
        const skills = Array.isArray(recipe.skills) ? recipe.skills : [];
        const inRecipe = skills.some(s => {
          const sid = typeof s === 'object' ? s.id : s;
          return sid && (sid === assetId || sid.endsWith(`:${assetId}`));
        });
        if (inRecipe) {
          score += 2;
          break; // Only award once even if multiple recipes match
        }
      }
    }
  }

  return score;
}

// ---------------------------------------------------------------------------
// Recipe matching helper
// ---------------------------------------------------------------------------

/**
 * Finds the best matching recipe for the given keywords.
 * Returns null if no recipe scores >= 5.
 * @param {object[]} recipes
 * @param {string[]} keywords
 * @returns {object|null}
 */
function findBestRecipe(recipes, keywords) {
  if (!Array.isArray(recipes) || recipes.length === 0 || keywords.length === 0) {
    return null;
  }

  let best = null;
  let bestScore = 0;

  for (const recipe of recipes) {
    let score = 0;
    const recipeTags = Array.isArray(recipe.tags) ? recipe.tags.map(t => t.toLowerCase()) : [];
    const recipeText = `${recipe.name || ''} ${recipe.what || recipe.description || ''}`.toLowerCase();

    for (const kw of keywords) {
      if (recipeTags.some(tag => tag === kw || tag.startsWith(kw + '-') || tag.endsWith('-' + kw))) score += 5;
      if (recipeText.includes(kw)) score += 2;
    }

    if (score >= 5 && score > bestScore) {
      best = recipe;
      bestScore = score;
    }
  }

  return best;
}

// ---------------------------------------------------------------------------
// resolve() — primary resolution function for agents
// ---------------------------------------------------------------------------

/**
 * Resolves the best matching skills for a task description.
 *
 * @param {object} catalog   — catalog loaded via catalog.mjs
 * @param {string} task      — natural-language task description
 * @param {object} [options]
 * @param {object} [options.usageData]        — usage.json skills section
 * @param {string[]} [options.projectDomains] — domains from .vault-profile
 * @param {object[]} [options.recipes]        — array of recipe objects
 * @param {number} [options.limit=5]          — max results
 * @returns {{
 *   matches: Array<{id, score, summary, path, squad, type}>,
 *   recipe: object|null,
 *   suggestion: string
 * }}
 */
export function resolve(catalog, task, options = {}) {
  const {
    usageData = {},
    projectDomains = [],
    recipes = [],
    limit = 5,
  } = options;

  const keywords = extractKeywords(task);

  if (!catalog || !Array.isArray(catalog.assets) || catalog.assets.length === 0) {
    return {
      matches: [],
      recipe: null,
      suggestion: keywords.length > 0
        ? `No skills found in catalog. Try scanning first.`
        : 'Provide a task description to resolve skills.',
    };
  }

  // Score every asset
  const sortedMatches = catalog.assets
    .map(asset => ({
      asset,
      score: scoreAsset(asset, keywords, { usageData, projectDomains, recipes }),
    }))
    .filter(({ score }) => score >= 5)
    .sort((a, b) => b.score - a.score);

  // Dedup by asset.id, keeping highest score
  const dedupMap = new Map();
  for (const match of sortedMatches) {
    const existing = dedupMap.get(match.asset.id);
    if (!existing || match.score > existing.score) dedupMap.set(match.asset.id, match);
  }
  const deduped = [...dedupMap.values()].sort((a, b) => b.score - a.score);
  const topMatches = deduped.slice(0, limit);

  const matches = topMatches.map(({ asset, score }) => ({
    id: asset.id,
    score,
    summary: asset.summary || {},
    path: asset.path,
    squad: asset.squad,
    type: asset.type,
  }));

  // Find the best matching recipe
  const recipe = findBestRecipe(recipes, keywords);

  // Build a human-readable suggestion
  let suggestion;
  if (matches.length === 0) {
    suggestion = `No skills matched "${task}". Consider using vault_suggest to add one.`;
  } else if (recipe) {
    suggestion = `Found ${matches.length} matching skill(s). Recipe "${recipe.name}" is a great fit — follow its workflow_hint for best results.`;
  } else {
    suggestion = `Found ${matches.length} matching skill(s). Read the top match path to get started.`;
  }

  return { matches, recipe, suggestion };
}

// ---------------------------------------------------------------------------
// search() — open-ended exploration
// ---------------------------------------------------------------------------

/**
 * Searches the catalog with optional type/squad filters.
 * Less strict than resolve() — no score threshold.
 *
 * @param {object} catalog
 * @param {string} query
 * @param {object} [filters]
 * @param {string} [filters.type]    — filter by asset type
 * @param {string} [filters.squad]   — filter by squad name
 * @param {number} [filters.limit=10]
 * @returns {{ results: object[], total: number }}
 */
export function search(catalog, query, filters = {}) {
  const { type, squad, limit = 10 } = filters;

  if (!catalog || !Array.isArray(catalog.assets)) {
    return { results: [], total: 0 };
  }

  const keywords = extractKeywords(query);

  let assets = catalog.assets;

  // Apply type filter
  if (type) {
    assets = assets.filter(a => a.type === type);
  }

  // Apply squad filter
  if (squad) {
    assets = assets.filter(a => a.squad === squad);
  }

  // If no keywords, return filtered assets sorted by id
  if (keywords.length === 0) {
    const slice = assets.slice(0, limit);
    return {
      results: slice.map(a => ({
        id: a.id,
        type: a.type,
        squad: a.squad,
        summary: a.summary || {},
        path: a.path,
        installed: a.installed || false,
      })),
      total: assets.length,
    };
  }

  // Score and sort
  const scored = assets
    .map(asset => ({
      asset,
      score: scoreAsset(asset, keywords),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    results: scored.map(({ asset, score }) => ({
      id: asset.id,
      type: asset.type,
      squad: asset.squad,
      summary: asset.summary || {},
      path: asset.path,
      installed: asset.installed || false,
      score,
    })),
    total: scored.length,
  };
}

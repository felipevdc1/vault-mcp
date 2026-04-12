// vault-mcp: MCP Server (stdio)
// by Felipe Vieira Domingues Carneiro (@o.felipecarneiro)

import fs from 'fs';
import path from 'path';
import os from 'os';
import yaml from 'js-yaml';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { expandPath, slugify } from './utils.mjs';
import { loadCatalog, saveCatalog, getCatalogStats, findAssetById } from './catalog.mjs';
import { scan } from './scanner.mjs';
import { resolve, search, extractKeywords } from './resolver.mjs';
import {
  loadAsset,
  loadSquad,
  unloadAsset,
  unloadSquad,
  getCommandsDir,
} from './loader.mjs';
import { generateDashboard, saveDashboard, openDashboard } from './dashboard.mjs';
import { loadUsage } from './usage.mjs';
import { listCandidates } from './forge.mjs';
import { loadRecipes as loadRecipesFile, matchRecipe, getRecipeSkillIds } from './recipes.mjs';
import { findProfile, getAutoLoadSkills, getProjectDomains, getProjectRecipes } from './profiles.mjs';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VAULT_DIR = expandPath('~/.claude/vault');
const CONFIG_PATH = path.join(VAULT_DIR, 'config.yaml');
const USAGE_PATH = path.join(VAULT_DIR, 'usage.json');
const RECIPES_DIR = path.join(VAULT_DIR, 'recipes');
const CANDIDATES_DIR = path.join(VAULT_DIR, 'candidates');

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    return yaml.load(raw) || {};
  } catch {
    return {};
  }
}

function loadUsageData() {
  try {
    const raw = fs.readFileSync(USAGE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed?.skills || {};
  } catch {
    return {};
  }
}

function loadRecipes() {
  const recipes = [];
  try {
    if (!fs.existsSync(RECIPES_DIR)) return recipes;
    const files = fs.readdirSync(RECIPES_DIR);
    for (const file of files) {
      if (!file.endsWith('.yaml') && !file.endsWith('.yml')) continue;
      try {
        const raw = fs.readFileSync(path.join(RECIPES_DIR, file), 'utf8');
        const recipe = yaml.load(raw);
        if (recipe && typeof recipe === 'object') {
          recipes.push(recipe);
        }
      } catch {
        // skip malformed recipe
      }
    }
  } catch {
    // recipes dir not accessible
  }
  return recipes;
}

// ---------------------------------------------------------------------------
// Candidate saving (vault_suggest)
// ---------------------------------------------------------------------------

function saveCandidateYaml(task, approach, tags) {
  fs.mkdirSync(CANDIDATES_DIR, { recursive: true });

  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const slug = slugify(task).slice(0, 60);
  const filename = `${date}-${slug}.yaml`;
  const filePath = path.join(CANDIDATES_DIR, filename);

  const id = `candidate-${date.replace(/-/g, '')}-${Date.now().toString(36)}`;

  const candidate = {
    id,
    task,
    approach,
    suggested_tags: tags || [],
    submitted_by: 'agent',
    date,
    status: 'pending',
  };

  const content = yaml.dump(candidate, { lineWidth: 100 });
  fs.writeFileSync(filePath, content, 'utf8');

  return { candidate_id: id, saved_to: filePath };
}

// ---------------------------------------------------------------------------
// startServer — registers all tools and connects transport
// ---------------------------------------------------------------------------

export async function startServer() {
  const server = new McpServer({
    name: 'vault-mcp',
    version: '0.1.0',
  });

  // -------------------------------------------------------------------------
  // vault_resolve
  // -------------------------------------------------------------------------
  server.tool(
    'vault_resolve',
    { task: z.string().describe('Task description to find relevant skills for') },
    async ({ task }) => {
      try {
        const config = loadConfig();
        const catalog = loadCatalog(VAULT_DIR);
        const usageData = loadUsageData();
        const recipes = loadRecipes();
        const projectDomains = config.project_domains || [];

        const result = resolve(catalog, task, { usageData, projectDomains, recipes });

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }],
          isError: true,
        };
      }
    },
  );

  // -------------------------------------------------------------------------
  // vault_search
  // -------------------------------------------------------------------------
  server.tool(
    'vault_search',
    {
      query: z.string().describe('Search query'),
      type: z.string().optional().describe('Filter by asset type: agent, task, command, skill'),
      squad: z.string().optional().describe('Filter by squad name'),
      limit: z.number().optional().describe('Maximum number of results (default 10)'),
    },
    async ({ query, type, squad, limit }) => {
      try {
        const catalog = loadCatalog(VAULT_DIR);
        const filters = { type, squad, limit: limit ?? 10 };
        const result = search(catalog, query, filters);

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }],
          isError: true,
        };
      }
    },
  );

  // -------------------------------------------------------------------------
  // vault_load
  // -------------------------------------------------------------------------
  server.tool(
    'vault_load',
    {
      id: z.string().optional().describe('Asset ID to load (e.g. design:agent:brad-frost)'),
      squad: z.string().optional().describe('Squad name — loads all assets from that squad'),
    },
    async ({ id, squad }) => {
      try {
        if (!id && !squad) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'Provide id or squad' }) }],
            isError: true,
          };
        }

        const commandsDir = getCommandsDir();

        if (squad) {
          // Find squad directory from catalog
          const catalog = loadCatalog(VAULT_DIR);
          const squadAssets = catalog.assets.filter(a => a.squad === squad || a.squad?.toLowerCase() === squad.toLowerCase());

          if (squadAssets.length === 0) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({ error: `Squad "${squad}" not found in catalog. Run a scan first.` }),
              }],
              isError: true,
            };
          }

          // Infer squad directory from the first asset path
          const firstAsset = squadAssets[0];
          const assetPath = firstAsset.path;
          // Walk up to find the squad root (parent of agents/ or tasks/, or direct parent)
          const parts = assetPath.split(path.sep);
          let squadDir = path.dirname(assetPath);
          // If parent is agents/, tasks/, etc. go up one more level
          const parentName = path.basename(squadDir).toLowerCase();
          if (['agents', 'tasks', 'commands'].includes(parentName)) {
            squadDir = path.dirname(squadDir);
          }

          const result = loadSquad(squadDir, commandsDir, squad);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                loaded: result.loaded,
                skipped: result.skipped,
                conflicts: result.conflicts,
                symlinks_created: result.loaded.length,
                note: `Skills activated — available as slash commands in the next session. To use now, Read the file paths from the catalog.`,
              }, null, 2),
            }],
          };
        }

        // Load single asset by ID
        const catalog = loadCatalog(VAULT_DIR);
        const asset = findAssetById(catalog, id);

        if (!asset) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ error: `Asset "${id}" not found in catalog.` }),
            }],
            isError: true,
          };
        }

        const outcome = loadAsset(asset.path, commandsDir, id);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              ...outcome,
              note: `Skill activated — available as slash command in the next session. To use now, Read the path: ${asset.path}`,
            }, null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }],
          isError: true,
        };
      }
    },
  );

  // -------------------------------------------------------------------------
  // vault_unload
  // -------------------------------------------------------------------------
  server.tool(
    'vault_unload',
    {
      id: z.string().optional().describe('Asset ID to unload (e.g. design:agent:brad-frost)'),
      squad: z.string().optional().describe('Squad name — unloads all assets from that squad'),
    },
    async ({ id, squad }) => {
      try {
        if (!id && !squad) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'Provide id or squad' }) }],
            isError: true,
          };
        }

        const commandsDir = getCommandsDir();

        if (squad) {
          const result = unloadSquad(commandsDir, squad);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                unloaded: result.unloaded,
                skipped: result.skipped,
                symlinks_removed: result.unloaded.length,
              }, null, 2),
            }],
          };
        }

        // Unload single asset by ID — derive symlink path from the asset ID
        const catalog = loadCatalog(VAULT_DIR);
        const asset = findAssetById(catalog, id);

        if (!asset) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ error: `Asset "${id}" not found in catalog.` }),
            }],
            isError: true,
          };
        }

        // Build expected symlink path from asset ID (mirrors loader.mjs idToRelativePath logic)
        const relPath = id.split(':').join(path.sep) + '.md';
        const symlinkPath = path.join(commandsDir, relPath);

        const outcome = unloadAsset(symlinkPath);
        return {
          content: [{ type: 'text', text: JSON.stringify(outcome, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }],
          isError: true,
        };
      }
    },
  );

  // -------------------------------------------------------------------------
  // vault_status
  // -------------------------------------------------------------------------
  server.tool(
    'vault_status',
    {},
    async () => {
      try {
        const catalog = loadCatalog(VAULT_DIR);
        const stats = getCatalogStats(catalog);

        // Count installed assets
        const installed = catalog.assets.filter(a => a.installed).length;

        // Count forge candidates
        let forgeCandidates = 0;
        try {
          if (fs.existsSync(CANDIDATES_DIR)) {
            forgeCandidates = fs.readdirSync(CANDIDATES_DIR)
              .filter(f => f.endsWith('.yaml') || f.endsWith('.yml')).length;
          }
        } catch {
          // ignore
        }

        const overview = {
          total: stats.total,
          installed,
          vault: stats.total - installed,
          by_type: stats.byType,
          by_squad: stats.bySquad,
          by_source: stats.bySource,
          forge_candidates: forgeCandidates,
          last_scan: catalog.generated || null,
          catalog_version: catalog.version || 1,
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(overview, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }],
          isError: true,
        };
      }
    },
  );

  // -------------------------------------------------------------------------
  // vault_suggest
  // -------------------------------------------------------------------------
  server.tool(
    'vault_suggest',
    {
      task: z.string().describe('Task description (what you needed to do)'),
      approach: z.string().describe('The approach or solution you used'),
      tags: z.array(z.string()).optional().describe('Relevant tags for this skill'),
    },
    async ({ task, approach, tags }) => {
      try {
        const result = saveCandidateYaml(task, approach, tags || []);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }],
          isError: true,
        };
      }
    },
  );

  // -------------------------------------------------------------------------
  // vault_dashboard
  // -------------------------------------------------------------------------
  server.tool(
    'vault_dashboard',
    {
      open: z.boolean().optional().describe('Open dashboard in browser after generating'),
    },
    async ({ open }) => {
      try {
        const catalog = loadCatalog(VAULT_DIR);
        const usage = loadUsage(VAULT_DIR);
        const candidates = listCandidates(VAULT_DIR);
        const recipes = loadRecipesFile(VAULT_DIR);

        const html = generateDashboard(catalog, usage, candidates, recipes, VAULT_DIR);
        const htmlPath = saveDashboard(html, VAULT_DIR);

        let opened = false;
        if (open) {
          openDashboard(htmlPath);
          opened = true;
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ html_path: htmlPath, opened }, null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }],
          isError: true,
        };
      }
    },
  );

  // -------------------------------------------------------------------------
  // vault_profile
  // -------------------------------------------------------------------------
  server.tool(
    'vault_profile',
    {
      cwd: z.string().optional().describe('Working directory to search from (defaults to process.cwd())'),
    },
    async ({ cwd }) => {
      try {
        const startDir = cwd || process.cwd();
        const { profile, path: profilePath } = findProfile(startDir);

        if (!profile) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ profile: null, path: null, suggestions: { skills: [], recipes: [] } }, null, 2),
            }],
          };
        }

        const autoLoad = getAutoLoadSkills(profile);
        const domains = getProjectDomains(profile);
        const recipes = getProjectRecipes(profile);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              profile: {
                project: profile.project,
                stack: profile.stack || [],
                domains,
                auto_load: autoLoad,
                recipes,
              },
              path: profilePath,
              suggestions: {
                skills: autoLoad.skills || [],
                recipes: recipes || [],
              },
            }, null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true,
        };
      }
    },
  );

  // -------------------------------------------------------------------------
  // vault_recipes
  // -------------------------------------------------------------------------
  server.tool(
    'vault_recipes',
    {
      match: z.string().optional().describe('Filter recipes matching these keywords'),
    },
    async ({ match }) => {
      try {
        const recipes = loadRecipesFile(VAULT_DIR);

        let filtered = recipes;
        if (match) {
          const keywords = extractKeywords(match);
          const best = matchRecipe(recipes, keywords);
          filtered = best ? [best] : [];
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              recipes: filtered.map(r => ({
                name: r.name,
                what: r.what,
                when: r.when,
                skills: getRecipeSkillIds(r),
                workflow_hint: r.workflow_hint,
                tags: r.tags || [],
              })),
              count: filtered.length,
            }, null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true,
        };
      }
    },
  );

  // -------------------------------------------------------------------------
  // Connect transport
  // -------------------------------------------------------------------------
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// ---------------------------------------------------------------------------
// Auto-start when run directly
// ---------------------------------------------------------------------------

const _selfPath = new URL(import.meta.url).pathname;
const _callerPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
const isMain = _callerPath === _selfPath || _callerPath === path.resolve(_selfPath);

if (isMain || process.argv.includes('--serve')) {
  startServer().catch(err => {
    console.error('[vault-mcp] Server startup error:', err);
    process.exit(1);
  });
}

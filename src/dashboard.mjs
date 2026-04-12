// vault-mcp: Dashboard module
// Generates a self-contained HTML dashboard for the vault skill ecosystem

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { atomicWrite } from './utils.mjs';
import { getUsageStats } from './usage.mjs';
import { getCatalogStats } from './catalog.mjs';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns a color class string based on total_reads count.
 * hot = frequently used, warm = moderately, cold = never
 * @param {number} reads
 * @returns {{ label: string, bg: string, border: string, text: string }}
 */
function heatLevel(reads) {
  if (reads >= 16) return { label: 'hot', bg: '#14532d', border: '#22c55e', text: '#86efac' };
  if (reads >= 1) return { label: 'warm', bg: '#422006', border: '#eab308', text: '#fde047' };
  return { label: 'cold', bg: '#1e293b', border: '#334155', text: '#6b7280' };
}

/**
 * Escapes HTML special characters.
 * @param {string} str
 * @returns {string}
 */
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Formats an ISO date string to a short readable date.
 * @param {string|null} iso
 * @returns {string}
 */
function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch {
    return iso;
  }
}

/**
 * Truncates a string to maxLen characters, appending ellipsis if truncated.
 * @param {string} str
 * @param {number} maxLen
 * @returns {string}
 */
function truncate(str, maxLen) {
  if (!str) return '';
  return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

function buildOverviewCards(catalog, usageData, candidates) {
  const stats = getCatalogStats(catalog);
  const installed = catalog.assets.filter(a => a.installed === true).length;
  const forgeCount = Array.isArray(candidates) ? candidates.length : 0;

  const cards = [
    { label: 'Total Assets', value: stats.total, icon: '◈', color: '#818cf8' },
    { label: 'Installed', value: installed, icon: '✓', color: '#22c55e' },
    { label: 'In Vault', value: stats.bySource?.vault || 0, icon: '⌘', color: '#38bdf8' },
    { label: 'Forge Queue', value: forgeCount, icon: '⚡', color: '#fb923c' },
  ];

  return `
  <section class="overview-cards">
    ${cards.map(c => `
    <div class="card overview-card">
      <div class="card-icon" style="color:${c.color}">${c.icon}</div>
      <div class="card-value" style="color:${c.color}">${c.value}</div>
      <div class="card-label">${esc(c.label)}</div>
    </div>`).join('')}
  </section>`;
}

function buildHeatMap(catalog, usageData) {
  if (!catalog.assets || catalog.assets.length === 0) {
    return `<section class="section"><h2 class="section-title">Heat Map</h2><p class="empty-state">No assets in catalog.</p></section>`;
  }

  // Group by squad
  const squads = {};
  for (const asset of catalog.assets) {
    const squad = asset.squad || 'ungrouped';
    if (!squads[squad]) squads[squad] = [];
    squads[squad].push(asset);
  }

  const squadHtml = Object.entries(squads).map(([squadName, assets]) => {
    const assetCards = assets.map(asset => {
      const entry = usageData.skills?.[asset.id] || {};
      const reads = entry.total_reads || 0;
      const heat = heatLevel(reads);
      const name = asset.name || asset.id || 'unknown';
      const what = asset.summary?.what || '';
      return `
        <div class="heat-card" style="background:${heat.bg};border-color:${heat.border}" title="${esc(what)}">
          <span class="heat-badge heat-${heat.label}">${heat.label}</span>
          <div class="heat-name" style="color:${heat.text}">${esc(truncate(name, 22))}</div>
          <div class="heat-reads">${reads} reads</div>
        </div>`;
    }).join('');

    return `
      <div class="squad-group">
        <h3 class="squad-name">${esc(squadName)}</h3>
        <div class="heat-grid">${assetCards}</div>
      </div>`;
  }).join('');

  return `
  <section class="section">
    <h2 class="section-title">Heat Map</h2>
    <div class="squad-list">${squadHtml}</div>
  </section>`;
}

function buildCoverage(catalog) {
  const stats = getCatalogStats(catalog);
  const squads = Object.entries(stats.bySquad).sort((a, b) => b[1] - a[1]);

  if (squads.length === 0) {
    return `<section class="section"><h2 class="section-title">Coverage</h2><p class="empty-state">No squad data available.</p></section>`;
  }

  const maxCount = Math.max(...squads.map(([, c]) => c), 1);

  const bars = squads.map(([squad, count]) => {
    const pct = Math.round((count / maxCount) * 100);
    const isGap = count <= 2;
    const barColor = isGap ? '#ef4444' : '#3b82f6';
    const gapBadge = isGap ? '<span class="gap-badge">gap</span>' : '';
    return `
      <div class="coverage-row">
        <div class="coverage-label">${esc(squad)}${gapBadge}</div>
        <div class="coverage-bar-wrap">
          <div class="coverage-bar" style="width:${pct}%;background:${barColor}"></div>
        </div>
        <div class="coverage-count">${count}</div>
      </div>`;
  }).join('');

  return `
  <section class="section">
    <h2 class="section-title">Coverage by Squad</h2>
    <div class="coverage-list">${bars}</div>
  </section>`;
}

function buildForgePipeline(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return `<section class="section"><h2 class="section-title">Forge Pipeline</h2><p class="empty-state">No pending candidates. The vault is complete.</p></section>`;
  }

  const cards = candidates.slice(0, 12).map(c => {
    const tags = Array.isArray(c.suggested_tags)
      ? c.suggested_tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')
      : '';
    return `
      <div class="card forge-card">
        <div class="forge-id">${esc(c.id || '')}</div>
        <div class="forge-task">${esc(truncate(c.task || '', 80))}</div>
        <div class="forge-approach">${esc(truncate(c.approach || '', 120))}</div>
        <div class="forge-meta">
          <span class="forge-date">${esc(c.date || '')}</span>
          <div class="forge-tags">${tags}</div>
        </div>
      </div>`;
  }).join('');

  return `
  <section class="section">
    <h2 class="section-title">Forge Pipeline <span class="count-badge">${candidates.length}</span></h2>
    <div class="forge-grid">${cards}</div>
  </section>`;
}

function buildRecipes(recipes, usageData) {
  if (!Array.isArray(recipes) || recipes.length === 0) {
    return `<section class="section"><h2 class="section-title">Recipes</h2><p class="empty-state">No recipes defined yet.</p></section>`;
  }

  const cards = recipes.map(r => {
    const usageEntry = usageData.recipes?.[r.name] || {};
    const usedCount = usageEntry.used || 0;
    const skills = Array.isArray(r.skills)
      ? r.skills.map(s => {
          const id = typeof s === 'object' ? s.id : s;
          return `<span class="skill-chip">${esc(truncate(String(id || ''), 30))}</span>`;
        }).join('')
      : '';

    return `
      <div class="card recipe-card">
        <div class="recipe-header">
          <div class="recipe-name">${esc(r.name || 'untitled')}</div>
          <div class="recipe-usage">${usedCount} uses</div>
        </div>
        <div class="recipe-what">${esc(truncate(r.what || '', 100))}</div>
        <div class="recipe-skills">${skills}</div>
      </div>`;
  }).join('');

  return `
  <section class="section">
    <h2 class="section-title">Recipes</h2>
    <div class="recipes-grid">${cards}</div>
  </section>`;
}

function buildRecentMisses(usageData) {
  const stats = getUsageStats(usageData);
  const recentMisses = Array.isArray(usageData.misses)
    ? [...usageData.misses].reverse().slice(0, 10)
    : [];

  if (recentMisses.length === 0) {
    return `<section class="section"><h2 class="section-title">Recent Misses</h2><p class="empty-state">No misses recorded — vault coverage is solid.</p></section>`;
  }

  const rows = recentMisses.map(m => `
    <tr>
      <td class="miss-task">${esc(truncate(m.task || '', 80))}</td>
      <td class="miss-date">${fmtDate(m.date)}</td>
      <td><span class="miss-status ${m.forged ? 'status-forged' : 'status-gap'}">${m.forged ? 'forged' : 'gap'}</span></td>
    </tr>`).join('');

  return `
  <section class="section">
    <h2 class="section-title">Recent Misses <span class="count-badge">${stats.totalMisses}</span></h2>
    <table class="miss-table">
      <thead><tr><th>Task</th><th>Date</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

const CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #0f172a;
    --surface: #1e293b;
    --surface2: #273549;
    --border: #334155;
    --text: #e2e8f0;
    --text-muted: #94a3b8;
    --text-dim: #64748b;
    --accent: #6366f1;
    --accent-glow: rgba(99,102,241,0.15);
    --radius: 12px;
    --radius-sm: 6px;
    --font: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--font);
    font-size: 14px;
    line-height: 1.6;
    min-height: 100vh;
  }

  /* Layout */
  .container { max-width: 1280px; margin: 0 auto; padding: 0 24px 80px; }

  /* Header */
  .site-header {
    background: linear-gradient(135deg, #0f172a 0%, #1a1f35 100%);
    border-bottom: 1px solid var(--border);
    padding: 32px 24px 28px;
    margin-bottom: 40px;
    position: relative;
    overflow: hidden;
  }
  .site-header::before {
    content: '';
    position: absolute;
    top: -40px; right: -40px;
    width: 300px; height: 300px;
    background: radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%);
    pointer-events: none;
  }
  .header-inner { max-width: 1280px; margin: 0 auto; }
  .header-eyebrow {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--accent);
    margin-bottom: 6px;
  }
  .header-title {
    font-size: 32px;
    font-weight: 700;
    letter-spacing: -0.02em;
    background: linear-gradient(135deg, #e2e8f0 30%, #818cf8 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    margin-bottom: 6px;
  }
  .header-sub {
    color: var(--text-muted);
    font-size: 13px;
    display: flex;
    gap: 16px;
    align-items: center;
    flex-wrap: wrap;
  }
  .header-dot { color: var(--border); }

  /* Cards */
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    transition: border-color 0.2s, transform 0.15s;
  }
  .card:hover { border-color: #475569; transform: translateY(-1px); }

  /* Overview cards */
  .overview-cards {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin-bottom: 40px;
  }
  @media (max-width: 800px) { .overview-cards { grid-template-columns: repeat(2, 1fr); } }
  .overview-card { padding: 24px; text-align: center; }
  .card-icon { font-size: 24px; margin-bottom: 10px; }
  .card-value { font-size: 36px; font-weight: 700; letter-spacing: -0.03em; margin-bottom: 4px; }
  .card-label { color: var(--text-muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }

  /* Sections */
  .section { margin-bottom: 48px; }
  .section-title {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 20px;
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--text);
  }
  .count-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--accent);
    color: white;
    font-size: 11px;
    font-weight: 700;
    border-radius: 20px;
    padding: 2px 8px;
    min-width: 24px;
  }
  .empty-state {
    color: var(--text-dim);
    font-style: italic;
    padding: 32px;
    text-align: center;
    background: var(--surface);
    border: 1px dashed var(--border);
    border-radius: var(--radius);
  }

  /* Heat map */
  .squad-list { display: flex; flex-direction: column; gap: 32px; }
  .squad-group {}
  .squad-name {
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-muted);
    margin-bottom: 12px;
    padding-left: 4px;
    border-left: 3px solid var(--accent);
    padding-left: 10px;
  }
  .heat-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 10px;
  }
  .heat-card {
    border: 1px solid;
    border-radius: 8px;
    padding: 12px;
    position: relative;
    transition: opacity 0.2s;
  }
  .heat-card:hover { opacity: 0.85; }
  .heat-badge {
    display: inline-block;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
    margin-bottom: 6px;
  }
  .heat-hot { background: #14532d; color: #22c55e; }
  .heat-warm { background: #422006; color: #eab308; }
  .heat-cold { background: #1e2a3a; color: #6b7280; }
  .heat-name { font-size: 12px; font-weight: 500; line-height: 1.3; margin-bottom: 4px; word-break: break-word; }
  .heat-reads { font-size: 10px; color: var(--text-dim); }

  /* Coverage */
  .coverage-list { display: flex; flex-direction: column; gap: 10px; }
  .coverage-row { display: flex; align-items: center; gap: 12px; }
  .coverage-label {
    width: 160px;
    font-size: 13px;
    color: var(--text-muted);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .coverage-bar-wrap {
    flex: 1;
    background: var(--surface2);
    border-radius: 100px;
    height: 8px;
    overflow: hidden;
  }
  .coverage-bar { height: 100%; border-radius: 100px; transition: width 0.4s; }
  .coverage-count { width: 30px; text-align: right; font-size: 12px; color: var(--text-dim); flex-shrink: 0; }
  .gap-badge {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    background: rgba(239,68,68,0.15);
    color: #f87171;
    border: 1px solid rgba(239,68,68,0.3);
    border-radius: 4px;
    padding: 1px 5px;
    font-weight: 700;
    flex-shrink: 0;
  }

  /* Forge pipeline */
  .forge-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 16px;
  }
  .forge-card { padding: 18px; }
  .forge-id { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--accent); margin-bottom: 8px; font-family: monospace; }
  .forge-task { font-size: 14px; font-weight: 600; margin-bottom: 8px; color: var(--text); }
  .forge-approach { font-size: 12px; color: var(--text-muted); margin-bottom: 12px; line-height: 1.5; }
  .forge-meta { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px; }
  .forge-date { font-size: 11px; color: var(--text-dim); }
  .forge-tags { display: flex; flex-wrap: wrap; gap: 4px; }

  /* Recipes */
  .recipes-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px;
  }
  .recipe-card { padding: 18px; }
  .recipe-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; gap: 8px; }
  .recipe-name { font-size: 15px; font-weight: 600; color: var(--text); }
  .recipe-usage { font-size: 11px; color: var(--text-dim); background: var(--surface2); padding: 2px 8px; border-radius: 20px; white-space: nowrap; }
  .recipe-what { font-size: 12px; color: var(--text-muted); margin-bottom: 12px; line-height: 1.5; }
  .recipe-skills { display: flex; flex-wrap: wrap; gap: 4px; }
  .skill-chip {
    font-size: 10px;
    font-family: monospace;
    background: var(--surface2);
    color: var(--text-muted);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 2px 6px;
  }

  /* Shared tag */
  .tag {
    font-size: 10px;
    background: rgba(99,102,241,0.15);
    color: #818cf8;
    border: 1px solid rgba(99,102,241,0.25);
    border-radius: 4px;
    padding: 2px 6px;
  }

  /* Misses table */
  .miss-table {
    width: 100%;
    border-collapse: collapse;
    background: var(--surface);
    border-radius: var(--radius);
    overflow: hidden;
    border: 1px solid var(--border);
  }
  .miss-table th {
    background: var(--surface2);
    padding: 10px 16px;
    text-align: left;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
  }
  .miss-table td {
    padding: 10px 16px;
    border-bottom: 1px solid #1e2d40;
    vertical-align: middle;
  }
  .miss-table tr:last-child td { border-bottom: none; }
  .miss-table tr:hover td { background: var(--surface2); }
  .miss-task { color: var(--text); font-size: 13px; }
  .miss-date { color: var(--text-dim); font-size: 12px; white-space: nowrap; }
  .miss-status {
    display: inline-block;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 4px;
  }
  .status-forged { background: rgba(34,197,94,0.1); color: #22c55e; border: 1px solid rgba(34,197,94,0.2); }
  .status-gap { background: rgba(239,68,68,0.1); color: #f87171; border: 1px solid rgba(239,68,68,0.2); }

  /* Footer */
  .site-footer {
    border-top: 1px solid var(--border);
    padding: 24px;
    text-align: center;
    color: var(--text-dim);
    font-size: 12px;
    margin-top: 40px;
  }
  .site-footer a { color: var(--text-muted); text-decoration: none; }
  .site-footer a:hover { color: var(--text); }
`;

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------

/**
 * Generates a self-contained HTML dashboard string.
 *
 * @param {object} catalog      — catalog loaded from catalog.mjs
 * @param {object} usageData    — usage data loaded from usage.mjs
 * @param {object[]} candidates — array of forge candidates
 * @param {object[]} recipes    — array of recipe objects
 * @param {string} vaultDir     — vault directory path (used for display)
 * @returns {string}  — complete HTML document
 */
export function generateDashboard(catalog, usageData, candidates, recipes, vaultDir) {
  const timestamp = new Date().toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const catalogSafe = catalog && typeof catalog === 'object' ? catalog : { assets: [] };
  const usageSafe = usageData && typeof usageData === 'object'
    ? usageData
    : { skills: {}, recipes: {}, misses: [] };
  const candidatesSafe = Array.isArray(candidates) ? candidates : [];
  const recipesSafe = Array.isArray(recipes) ? recipes : [];

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>vault-mcp Dashboard</title>
  <style>${CSS}</style>
</head>
<body>

<header class="site-header">
  <div class="header-inner">
    <div class="header-eyebrow">vault-mcp · skill ecosystem</div>
    <h1 class="header-title">vault-mcp Dashboard</h1>
    <div class="header-sub">
      <span>by Felipe Vieira Domingues Carneiro</span>
      <span class="header-dot">·</span>
      <span>${esc(vaultDir || '~/.claude/vault')}</span>
      <span class="header-dot">·</span>
      <span>Generated ${esc(timestamp)}</span>
    </div>
  </div>
</header>

<main class="container">
  ${buildOverviewCards(catalogSafe, usageSafe, candidatesSafe)}
  ${buildHeatMap(catalogSafe, usageSafe)}
  ${buildCoverage(catalogSafe)}
  ${buildForgePipeline(candidatesSafe)}
  ${buildRecipes(recipesSafe, usageSafe)}
  ${buildRecentMisses(usageSafe)}
</main>

<footer class="site-footer">
  vault-mcp v0.1.0 by <a href="https://github.com/felipevdc1">Felipe Vieira Domingues Carneiro</a>
  &nbsp;·&nbsp;
  <a href="https://www.instagram.com/o.felipecarneiro">@o.felipecarneiro</a>
</footer>

</body>
</html>`;

  return html;
}

// ---------------------------------------------------------------------------
// File I/O
// ---------------------------------------------------------------------------

/**
 * Saves the HTML dashboard to {outputDir}/vault-dashboard.html.
 * Creates the directory if it does not exist.
 * @param {string} html       — HTML string from generateDashboard
 * @param {string} outputDir  — directory to save into
 * @returns {string}  — absolute path to the saved file
 */
export function saveDashboard(html, outputDir) {
  fs.mkdirSync(outputDir, { recursive: true });
  const filePath = path.resolve(outputDir, 'vault-dashboard.html');
  fs.writeFileSync(filePath, html, 'utf8');
  return filePath;
}

/**
 * Opens the dashboard HTML file in the default browser (macOS: open).
 * @param {string} htmlPath  — absolute path to vault-dashboard.html
 * @returns {{ opened: boolean }}
 */
export function openDashboard(htmlPath) {
  exec(`open "${htmlPath}"`);
  return { opened: true };
}

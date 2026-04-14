#!/usr/bin/env node
/**
 * UserPromptSubmit Hook — Vault Activation
 *
 * Fires: On every user message submission in Claude Code
 * Purpose: Auto-resolve top vault skills for the current task and inject as
 *          <vault-activation> context block (system-reminder via stdout).
 *
 * Architecture Decision A (from plan happy-swinging-steele.md):
 *   Hook shape: UserPromptSubmit — only hook with access to user_message
 *   Injection: stdout → additionalContext → <system-reminder> in Claude Code
 *
 * Budget: 200ms p95, hard skip at 500ms (fail-open absolute)
 *
 * Exit codes: 0 always — never blocks user message
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

const HOME = os.homedir();
const VAULT_DIR = path.join(HOME, '.claude', 'vault');
const CATALOG_PATH = path.join(VAULT_DIR, 'catalog.json');
const CONFIG_PATH = path.join(VAULT_DIR, 'config.yaml');
const LOG_PATH = path.join(VAULT_DIR, 'activation.log');
const RESOLVER_PATH = path.join(__dirname, '..', 'src', 'resolver.mjs');

// Hard timeout: if hook hasn't finished in 500ms, exit 0 (fail-open)
const hardTimeout = setTimeout(() => {
  appendLog({ status: 'timeout', latency_ms: 500, matches_count: 0, task_hash: '00000000' });
  process.exit(0);
}, 500);
// Unref so it doesn't keep the process alive if we finish early
hardTimeout.unref();

function appendLog(entry) {
  try {
    const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n';
    fs.appendFileSync(LOG_PATH, line);
  } catch (_) {} // Log failures are silent
}

function taskHash(task) {
  return crypto.createHash('sha1').update(task).digest('hex').slice(0, 8);
}

function writeVisible(line) {
  process.stderr.write(`\x1b[2m[vault]\x1b[0m ${line}\n`);
}

function checkOptOut() {
  // Env var opt-out
  if (process.env.VAULT_MCP_AUTO_INJECT === '0') return true;

  // Config file opt-out (simple YAML line check — avoid yaml dep for perf)
  try {
    const configContent = fs.readFileSync(CONFIG_PATH, 'utf-8');
    if (/^\s*auto_inject\s*:\s*false\s*$/m.test(configContent)) return true;
  } catch (_) {} // Config missing = not opted out

  return false;
}

function loadCatalog() {
  const raw = fs.readFileSync(CATALOG_PATH, 'utf-8');
  return JSON.parse(raw);
}

function formatOutput(prompt, matches, recipe, latencyMs) {
  const taskPreview = prompt.length > 80 ? prompt.slice(0, 77) + '...' : prompt;

  const lines = [
    '<vault-activation>',
    `Task: "${taskPreview}"`,
    `Top matches (vault_resolve, ${latencyMs}ms):`,
  ];

  matches.forEach((m, i) => {
    const summaryText = (m.summary && (m.summary.what || m.summary.description)) || '';
    const summary = summaryText.length > 60 ? summaryText.slice(0, 57) + '...' : summaryText;
    lines.push(`  ${i + 1}. ${m.id} — score ${m.score} — ${summary}`);
  });

  const recipeName = recipe && recipe.name ? recipe.name : 'none';
  lines.push(`Recipe: ${recipeName}`);
  lines.push(`Invoke: mcp__vault__vault_load({id: "..."}) to activate any match.`);
  lines.push('</vault-activation>');

  return lines.join('\n');
}

(async function main() {
  const startMs = Date.now();
  let taskHash8 = '00000000';

  try {
    // Read stdin
    const stdin = fs.readFileSync(0, 'utf-8').trim();
    const payload = stdin ? JSON.parse(stdin) : {};
    const prompt = (payload.prompt || '').trim();

    taskHash8 = taskHash(prompt || 'empty');

    // Opt-out check
    if (checkOptOut()) {
      clearTimeout(hardTimeout);
      process.exit(0);
    }

    // Load catalog (sync, < 100ms for 2697 assets)
    let catalog;
    try {
      catalog = loadCatalog();
    } catch (err) {
      appendLog({ status: 'no_catalog', task_hash: taskHash8, matches_count: 0, latency_ms: Date.now() - startMs, error: err.message });
      clearTimeout(hardTimeout);
      process.exit(0);
    }

    // No prompt = nothing to resolve
    if (!prompt) {
      clearTimeout(hardTimeout);
      process.exit(0);
    }

    // Dynamic import of ESM resolver (CJS → ESM bridge)
    let resolveFunc;
    try {
      const resolverModule = await import(pathToFileURL(RESOLVER_PATH).href);
      resolveFunc = resolverModule.resolve;
    } catch (err) {
      appendLog({ status: 'resolver_import_error', task_hash: taskHash8, matches_count: 0, latency_ms: Date.now() - startMs, error: err.message });
      clearTimeout(hardTimeout);
      process.exit(0);
    }

    // Run resolver — top 3 matches
    const recipes = Array.isArray(catalog.recipes) ? catalog.recipes : [];
    const result = resolveFunc(catalog, prompt, { limit: 3, recipes });
    const latencyMs = Date.now() - startMs;

    // Log execution
    appendLog({
      status: 'ok',
      task_hash: taskHash8,
      matches_count: result.matches.length,
      latency_ms: latencyMs,
    });

    // No matches = silent exit (no spam)
    if (!result.matches || result.matches.length === 0) {
      writeVisible(`no matches (${latencyMs}ms)`);
      clearTimeout(hardTimeout);
      process.exit(0);
    }

    // Output activation block to stdout
    const top3Names = result.matches.slice(0, 3).map(m => m.id);
    const count = result.matches.length;
    const recipeSuffix = result.recipe && (result.recipe.name || result.recipe)
      ? ` | recipe: ${result.recipe.name || result.recipe}`
      : '';
    writeVisible(`${count} matches (${latencyMs}ms) → ${top3Names.join(', ')}${recipeSuffix}`);
    const output = formatOutput(prompt, result.matches, result.recipe, latencyMs);
    process.stdout.write(output + '\n');

    clearTimeout(hardTimeout);
    process.exit(0);
  } catch (err) {
    writeVisible(`error: ${err.message?.slice(0, 80) ?? 'unknown'}`);
    appendLog({ status: 'error', task_hash: taskHash8, matches_count: 0, latency_ms: Date.now() - startMs, error: err.message });
    clearTimeout(hardTimeout);
    process.exit(0);
  }
})();

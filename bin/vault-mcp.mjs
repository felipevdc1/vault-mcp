#!/usr/bin/env node
// vault-mcp CLI entry point
// by Felipe Vieira Domingues Carneiro (@o.felipecarneiro)

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { expandPath } from '../src/utils.mjs';
import { loadCatalog, saveCatalog, getCatalogStats } from '../src/catalog.mjs';
import { scan } from '../src/scanner.mjs';

// ---------------------------------------------------------------------------
// ANSI colors
// ---------------------------------------------------------------------------

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
};

function bold(s) { return `${C.bold}${s}${C.reset}`; }
function green(s) { return `${C.green}${s}${C.reset}`; }
function yellow(s) { return `${C.yellow}${s}${C.reset}`; }
function cyan(s) { return `${C.cyan}${s}${C.reset}`; }
function dim(s) { return `${C.dim}${s}${C.reset}`; }
function red(s) { return `${C.red}${s}${C.reset}`; }

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const HOME = os.homedir();
const __filename = fileURLToPath(import.meta.url);
const VAULT_DIR = path.join(HOME, '.claude', 'vault');
const CONFIG_PATH = path.join(VAULT_DIR, 'config.yaml');
const CLAUDE_JSON_PATH = path.join(HOME, '.claude.json');
const LEGACY_MCP_JSON_PATH = path.join(HOME, '.claude', '.mcp.json');
const SETTINGS_JSON_PATH = path.join(HOME, '.claude', 'settings.json');
const CANDIDATES_DIR = path.join(VAULT_DIR, 'candidates');

// Path to this package's server script
const SERVER_MJS_PATH = path.resolve(
  __filename,
  '../../src/server.mjs',
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    return yaml.load(raw) || {};
  } catch {
    return {};
  }
}

// readMcpJson / writeMcpJson removed — v1.0 uses CLAUDE_JSON_PATH and LEGACY_MCP_JSON_PATH directly

// ---------------------------------------------------------------------------
// Command: init
// ---------------------------------------------------------------------------

async function cmdInit() {
  console.log(bold('\nvault-mcp init\n'));

  // 1. Create vault directory structure
  const subdirs = ['manifests', 'recipes', 'candidates', 'squads'];
  fs.mkdirSync(VAULT_DIR, { recursive: true });
  for (const sub of subdirs) {
    fs.mkdirSync(path.join(VAULT_DIR, sub), { recursive: true });
    console.log(green('  created') + ` ~/.claude/vault/${sub}/`);
  }

  // 2. Copy template config.yaml if not present
  const templateConfigPath = path.resolve(
    __filename,
    '../../templates/config.yaml',
  );

  if (!fs.existsSync(CONFIG_PATH)) {
    try {
      const template = fs.readFileSync(templateConfigPath, 'utf8');
      fs.writeFileSync(CONFIG_PATH, template, 'utf8');
      console.log(green('  created') + ' ~/.claude/vault/config.yaml');
    } catch {
      // Write a minimal config if template is missing
      const minimal = yaml.dump({
        version: 1,
        scan_dirs: ['~/.claude/commands'],
        ignore: ['node_modules', '.git', 'dist', 'build', '.next', '*.zip', '.DS_Store'],
        integrations: {
          mempalace: { enabled: 'auto', usage_diary: true, context_boost: true },
          codebase_memory: { enabled: 'auto', stack_aware: true },
        },
      });
      fs.writeFileSync(CONFIG_PATH, minimal, 'utf8');
      console.log(green('  created') + ' ~/.claude/vault/config.yaml (minimal)');
    }
  } else {
    console.log(dim('  exists ') + ' ~/.claude/vault/config.yaml');
  }

  // 3. Detect integrations from ~/.claude.json mcpServers
  let existingClaudeJson = {};
  try {
    if (fs.existsSync(CLAUDE_JSON_PATH)) {
      existingClaudeJson = JSON.parse(fs.readFileSync(CLAUDE_JSON_PATH, 'utf8'));
    }
  } catch {
    existingClaudeJson = {};
  }
  const mcpKeys = Object.keys(existingClaudeJson.mcpServers || {});
  const hasMempalace = mcpKeys.some(k => k.toLowerCase().includes('mempalace'));
  const hasCodebaseMemory = mcpKeys.some(
    k => k.toLowerCase().includes('codebase-memory') || k.toLowerCase().includes('codebase_memory'),
  );

  console.log('\n' + bold('Integrations detected:'));
  console.log(`  mempalace:        ${hasMempalace ? green('found') : dim('not found (optional)')}`);
  console.log(`  codebase-memory:  ${hasCodebaseMemory ? green('found') : dim('not found (optional)')}`);

  if (!hasMempalace) {
    console.log();
    console.log(`${C.yellow}${C.bold}⚠ mempalace not detected${C.reset}`);
    console.log(`${C.dim}  vault-mcp works standalone, but mempalace unlocks cross-session memory.${C.reset}`);
    console.log(`${C.dim}  vault will remember which skills worked for each project, improving${C.reset}`);
    console.log(`${C.dim}  the resolver over time.${C.reset}`);
    console.log();
    console.log(`${C.cyan}  To install mempalace:${C.reset}`);
    console.log(`${C.dim}    Visit: https://github.com/felipevdc/mempalace${C.reset}`);
    console.log(`${C.dim}    Or check your MCP marketplace for "mempalace"${C.reset}`);
    console.log();
    console.log(`${C.dim}  Continuing without mempalace integration...${C.reset}`);
    console.log();
  }

  if (!hasCodebaseMemory) {
    console.log();
    console.log(`${C.yellow}${C.bold}⚠ codebase-memory-mcp not detected${C.reset}`);
    console.log(`${C.dim}  vault-mcp works without it, but codebase-memory enables stack-aware skill suggestions.${C.reset}`);
    console.log();
    console.log(`${C.cyan}  To install codebase-memory-mcp:${C.reset}`);
    console.log(`${C.dim}    Check your MCP marketplace for "codebase-memory-mcp"${C.reset}`);
    console.log();
    console.log(`${C.dim}  Continuing without codebase-memory integration...${C.reset}`);
    console.log();
  }

  // 4. Update config.yaml with detected integrations
  try {
    const rawConfig = fs.readFileSync(CONFIG_PATH, 'utf8');
    const config = yaml.load(rawConfig) || {};
    if (!config.integrations) config.integrations = {};
    if (!config.integrations.mempalace) config.integrations.mempalace = {};
    if (!config.integrations.codebase_memory) config.integrations.codebase_memory = {};
    config.integrations.mempalace.detected = hasMempalace;
    config.integrations.codebase_memory.detected = hasCodebaseMemory;
    fs.writeFileSync(CONFIG_PATH, yaml.dump(config, { lineWidth: 100 }), 'utf8');
  } catch {
    // non-critical — config already written
  }

  // 5. Run full scan
  console.log('\n' + bold('Scanning...'));
  const config = loadConfig();
  let catalog;
  try {
    catalog = await scan(config);
    saveCatalog(VAULT_DIR, catalog);
    const stats = getCatalogStats(catalog);
    console.log(green(`  done`) + ` — ${bold(String(catalog.assets.length))} assets catalogued`);
    if (Object.keys(stats.byType).length > 0) {
      for (const [type, count] of Object.entries(stats.byType)) {
        console.log(`    ${cyan(type)}: ${count}`);
      }
    }
  } catch (err) {
    console.log(yellow('  scan error: ') + err.message);
    catalog = null;
  }

  // 6A. Register in ~/.claude.json top-level mcpServers (idempotent)
  try {
    let claudeJson = {};
    if (fs.existsSync(CLAUDE_JSON_PATH)) {
      claudeJson = JSON.parse(fs.readFileSync(CLAUDE_JSON_PATH, 'utf8'));
    }
    if (!claudeJson.mcpServers) claudeJson.mcpServers = {};
    if (!claudeJson.mcpServers.vault) {
      claudeJson.mcpServers.vault = {
        command: 'node',
        args: [SERVER_MJS_PATH, 'serve'],
      };
      fs.writeFileSync(CLAUDE_JSON_PATH, JSON.stringify(claudeJson, null, 2));
      console.log('\n' + green('  registered') + ' vault in ~/.claude.json mcpServers');
    } else {
      console.log('\n' + dim('  vault already in ~/.claude.json mcpServers (skipped)'));
    }
  } catch (err) {
    console.log('\n' + yellow('  warning: could not write ~/.claude.json: ') + err.message);
  }

  // 6B. Migrate legacy ~/.claude/.mcp.json entry if present
  try {
    if (fs.existsSync(LEGACY_MCP_JSON_PATH)) {
      const legacyJson = JSON.parse(fs.readFileSync(LEGACY_MCP_JSON_PATH, 'utf8'));
      if (legacyJson && legacyJson.vault) {
        delete legacyJson.vault;
        if (Object.keys(legacyJson).length === 0) {
          fs.unlinkSync(LEGACY_MCP_JSON_PATH);
          console.log(green('  removed') + ' legacy ~/.claude/.mcp.json (migrated to ~/.claude.json)');
        } else {
          fs.writeFileSync(LEGACY_MCP_JSON_PATH, JSON.stringify(legacyJson, null, 2));
          console.log(green('  migrated') + ' vault from ~/.claude/.mcp.json to ~/.claude.json');
        }
      }
    }
  } catch (err) {
    console.log(yellow('  warning: could not migrate legacy .mcp.json: ') + err.message);
  }

  // 6C. Register UserPromptSubmit hook in ~/.claude/settings.json (idempotent)
  try {
    const PROJECT_ROOT = path.resolve(__filename, '../..');
    const HOOK_PATH = path.join(PROJECT_ROOT, 'integrations', 'vault-activation.cjs');

    let settingsJson = {};
    if (fs.existsSync(SETTINGS_JSON_PATH)) {
      settingsJson = JSON.parse(fs.readFileSync(SETTINGS_JSON_PATH, 'utf8'));
    }
    if (!settingsJson.hooks) settingsJson.hooks = {};
    if (!settingsJson.hooks.UserPromptSubmit) settingsJson.hooks.UserPromptSubmit = [];

    const alreadyRegistered = settingsJson.hooks.UserPromptSubmit.some(
      h => h.hooks && h.hooks.some(inner => inner.command && inner.command.includes('vault-activation.cjs'))
    );
    if (!alreadyRegistered) {
      settingsJson.hooks.UserPromptSubmit.push({
        matcher: '',
        hooks: [{ type: 'command', command: `node '${HOOK_PATH}'` }],
      });
      fs.writeFileSync(SETTINGS_JSON_PATH, JSON.stringify(settingsJson, null, 2));
      console.log(green('  registered') + ' UserPromptSubmit hook in ~/.claude/settings.json');
    } else {
      console.log(dim('  UserPromptSubmit hook already registered (skipped)'));
    }
  } catch (err) {
    console.log(yellow('  warning: could not write ~/.claude/settings.json: ') + err.message);
  }

  // Summary
  const assetCount = catalog?.assets?.length ?? 0;
  const integCount = (hasMempalace ? 1 : 0) + (hasCodebaseMemory ? 1 : 0);
  console.log('\n' + bold('vault-mcp ready.') + ` ${assetCount} assets catalogued. ${integCount} integration(s) active.\n`);
}

// ---------------------------------------------------------------------------
// Command: scan
// ---------------------------------------------------------------------------

async function cmdScan(flags) {
  const isStats = flags.includes('--stats');
  const isQuick = flags.includes('--quick');

  if (isStats) {
    const catalog = loadCatalog(VAULT_DIR);
    const stats = getCatalogStats(catalog);
    console.log(bold('\nvault-mcp scan --stats\n'));
    console.log(`  total:       ${bold(String(stats.total))}`);
    console.log(`  last scan:   ${dim(catalog.generated || 'never')}`);
    console.log(`\n  ${bold('by type:')}`);
    for (const [type, count] of Object.entries(stats.byType)) {
      console.log(`    ${cyan(type)}: ${count}`);
    }
    console.log(`\n  ${bold('by squad:')}`);
    for (const [squad, count] of Object.entries(stats.bySquad)) {
      console.log(`    ${cyan(squad)}: ${count}`);
    }
    console.log();
    return;
  }

  if (isQuick) {
    console.log(yellow('  --quick: not yet implemented, running full scan'));
  }

  console.log(bold('\nvault-mcp scan\n'));
  const config = loadConfig();
  if (!config.scan_dirs || config.scan_dirs.length === 0) {
    console.log(yellow('  no scan_dirs configured. Edit ~/.claude/vault/config.yaml first.'));
    return;
  }

  console.log(dim(`  scanning ${config.scan_dirs.length} director${config.scan_dirs.length === 1 ? 'y' : 'ies'}...`));

  try {
    const catalog = await scan(config);
    saveCatalog(VAULT_DIR, catalog);
    const stats = getCatalogStats(catalog);

    console.log(green(`  done`) + ` — ${bold(String(catalog.assets.length))} assets\n`);
    console.log(`  ${bold('by type:')}`);
    for (const [type, count] of Object.entries(stats.byType)) {
      console.log(`    ${cyan(type)}: ${count}`);
    }
    console.log(`\n  ${bold('by squad:')}`);
    for (const [squad, count] of Object.entries(stats.bySquad)) {
      console.log(`    ${cyan(squad)}: ${count}`);
    }
    console.log();
  } catch (err) {
    console.log(red('  scan failed: ') + err.message);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Command: serve
// ---------------------------------------------------------------------------

async function cmdServe() {
  const { startServer } = await import('../src/server.mjs');
  await startServer();
}

// ---------------------------------------------------------------------------
// Command: forge list
// ---------------------------------------------------------------------------

function cmdForgeList() {
  console.log(bold('\nvault-mcp forge list\n'));

  if (!fs.existsSync(CANDIDATES_DIR)) {
    console.log(dim('  no candidates directory found. Use vault_suggest to create one.'));
    return;
  }

  const files = fs.readdirSync(CANDIDATES_DIR)
    .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))
    .sort();

  if (files.length === 0) {
    console.log(dim('  no pending candidates'));
    return;
  }

  console.log(`  ${bold(String(files.length))} pending candidate(s):\n`);

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(CANDIDATES_DIR, file), 'utf8');
      const candidate = yaml.load(raw);
      if (!candidate) continue;

      console.log(`  ${bold(candidate.id || file)}`);
      console.log(`    task:  ${cyan(candidate.task || '—')}`);
      console.log(`    date:  ${dim(candidate.date || '—')}`);
      const tags = Array.isArray(candidate.suggested_tags) ? candidate.suggested_tags.join(', ') : '—';
      console.log(`    tags:  ${dim(tags)}`);
      console.log();
    } catch {
      console.log(`  ${yellow(file)} — ${dim('could not parse')}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Command: forge approve <id>
// ---------------------------------------------------------------------------

function cmdForgeApprove(id) {
  if (!id) {
    console.log(red('  usage: vault-mcp forge approve <candidate-id>'));
    process.exit(1);
  }

  console.log(bold(`\nvault-mcp forge approve ${id}\n`));

  if (!fs.existsSync(CANDIDATES_DIR)) {
    console.log(red('  no candidates directory found'));
    process.exit(1);
  }

  const files = fs.readdirSync(CANDIDATES_DIR)
    .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

  const candidateFile = files.find(f => {
    try {
      const raw = fs.readFileSync(path.join(CANDIDATES_DIR, f), 'utf8');
      const c = yaml.load(raw);
      return c && c.id === id;
    } catch {
      return false;
    }
  });

  if (!candidateFile) {
    console.log(red(`  candidate "${id}" not found`));
    process.exit(1);
  }

  const candidatePath = path.join(CANDIDATES_DIR, candidateFile);
  const raw = fs.readFileSync(candidatePath, 'utf8');
  const candidate = yaml.load(raw);

  // Move to squads/forged/ as a .md file
  const forgedDir = path.join(VAULT_DIR, 'squads', 'forged');
  fs.mkdirSync(forgedDir, { recursive: true });

  const slug = candidate.task
    ? candidate.task.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
    : candidateFile.replace(/\.(yaml|yml)$/, '');

  const mdPath = path.join(forgedDir, `${slug}.md`);

  const mdContent = [
    `# ${candidate.task || 'Forged Skill'}`,
    '',
    `> Approved from forge — ${candidate.date || 'unknown date'}`,
    '',
    '## What',
    '',
    candidate.task || '',
    '',
    '## Approach',
    '',
    candidate.approach || '',
    '',
    '## Tags',
    '',
    `${(candidate.suggested_tags || []).join(', ')}`,
  ].join('\n');

  fs.writeFileSync(mdPath, mdContent, 'utf8');
  fs.unlinkSync(candidatePath);

  console.log(green('  approved') + ` → ${mdPath}`);
  console.log(dim('  run `vault-mcp scan` to index the new skill\n'));
}

// ---------------------------------------------------------------------------
// Command: forge reject <id>
// ---------------------------------------------------------------------------

function cmdForgeReject(id) {
  if (!id) {
    console.log(red('  usage: vault-mcp forge reject <candidate-id>'));
    process.exit(1);
  }

  console.log(bold(`\nvault-mcp forge reject ${id}\n`));

  if (!fs.existsSync(CANDIDATES_DIR)) {
    console.log(red('  no candidates directory found'));
    process.exit(1);
  }

  const files = fs.readdirSync(CANDIDATES_DIR)
    .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

  const candidateFile = files.find(f => {
    try {
      const raw = fs.readFileSync(path.join(CANDIDATES_DIR, f), 'utf8');
      const c = yaml.load(raw);
      return c && c.id === id;
    } catch {
      return false;
    }
  });

  if (!candidateFile) {
    console.log(red(`  candidate "${id}" not found`));
    process.exit(1);
  }

  fs.unlinkSync(path.join(CANDIDATES_DIR, candidateFile));
  console.log(green('  rejected') + ` — ${candidateFile} deleted\n`);
}

// ---------------------------------------------------------------------------
// Command: uninstall
// ---------------------------------------------------------------------------

async function cmdUninstall() {
  console.log(bold('\nvault-mcp uninstall\n'));

  // 1. Remove mcpServers.vault from ~/.claude.json
  try {
    if (fs.existsSync(CLAUDE_JSON_PATH)) {
      const claudeJson = JSON.parse(fs.readFileSync(CLAUDE_JSON_PATH, 'utf8'));
      if (claudeJson.mcpServers && claudeJson.mcpServers.vault) {
        delete claudeJson.mcpServers.vault;
        fs.writeFileSync(CLAUDE_JSON_PATH, JSON.stringify(claudeJson, null, 2));
        console.log(green('  removed') + ' vault from ~/.claude.json mcpServers');
      } else {
        console.log(dim('  vault not found in ~/.claude.json mcpServers (skipped)'));
      }
    } else {
      console.log(dim('  ~/.claude.json not found (skipped)'));
    }
  } catch (err) {
    console.log(yellow('  warning: could not update ~/.claude.json: ') + err.message);
  }

  // 2. Remove UserPromptSubmit hook from ~/.claude/settings.json
  try {
    if (fs.existsSync(SETTINGS_JSON_PATH)) {
      const settingsJson = JSON.parse(fs.readFileSync(SETTINGS_JSON_PATH, 'utf8'));
      if (settingsJson.hooks && settingsJson.hooks.UserPromptSubmit) {
        const before = settingsJson.hooks.UserPromptSubmit.length;
        const filtered = settingsJson.hooks.UserPromptSubmit.filter(
          h => !h.hooks || !h.hooks.some(inner => inner.command && inner.command.includes('vault-activation.cjs'))
        );
        if (filtered.length !== before) {
          settingsJson.hooks.UserPromptSubmit = filtered;
          if (filtered.length === 0) delete settingsJson.hooks.UserPromptSubmit;
          fs.writeFileSync(SETTINGS_JSON_PATH, JSON.stringify(settingsJson, null, 2));
          console.log(green('  removed') + ' UserPromptSubmit hook from ~/.claude/settings.json');
        } else {
          console.log(dim('  vault hook not found in settings.json (skipped)'));
        }
      }
    } else {
      console.log(dim('  ~/.claude/settings.json not found (skipped)'));
    }
  } catch (err) {
    console.log(yellow('  warning: could not update ~/.claude/settings.json: ') + err.message);
  }

  // 3. Preserve ~/.claude/vault/ — user data, never delete
  console.log('\nUninstall complete. ~/.claude/vault/ preserved (user data).');
  console.log('To remove all data: rm -rf ~/.claude/vault/\n');
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

function showHelp() {
  console.log(`
${bold('vault-mcp')} — Intelligent skill resolver for Claude Code

${bold('USAGE')}
  vault-mcp <command> [options]

${bold('COMMANDS')}
  ${cyan('init')}                   Initialize vault structure, run scan, register MCP
  ${cyan('uninstall')}              Remove vault-mcp hooks and mcpServers entry (preserves ~/.claude/vault/)
  ${cyan('scan')}                   Full scan of configured directories
  ${cyan('scan --stats')}           Show catalog statistics without rescanning
  ${cyan('scan --quick')}           Quick scan (same as full scan for now)
  ${cyan('serve')}                  Start MCP server (stdio mode)
  ${cyan('forge list')}             List pending forge candidates
  ${cyan('forge approve <id>')}     Approve a candidate → move to squads/forged/
  ${cyan('forge reject <id>')}      Reject and delete a candidate

${bold('EXAMPLES')}
  vault-mcp init
  vault-mcp scan --stats
  vault-mcp forge list
  vault-mcp forge approve candidate-20260411-abc123
`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const cmd = args[0];
const subcmd = args[1];
const rest = args.slice(1);

(async () => {
  try {
    switch (cmd) {
      case 'init':
        await cmdInit();
        break;

      case 'uninstall':
        await cmdUninstall();
        break;

      case 'scan':
        await cmdScan(rest);
        break;

      case 'serve':
        await cmdServe();
        break;

      case 'forge':
        switch (subcmd) {
          case 'list':
            cmdForgeList();
            break;
          case 'approve':
            cmdForgeApprove(args[2]);
            break;
          case 'reject':
            cmdForgeReject(args[2]);
            break;
          default:
            console.log(red(`  unknown forge subcommand: ${subcmd || '(none)'}`));
            console.log(dim('  use: forge list | forge approve <id> | forge reject <id>'));
            process.exit(1);
        }
        break;

      case '--help':
      case '-h':
      case 'help':
      case undefined:
        showHelp();
        break;

      default:
        console.log(red(`  unknown command: ${cmd}`));
        showHelp();
        process.exit(1);
    }
  } catch (err) {
    console.error(red('Error: ') + err.message);
    process.exit(1);
  }
})();

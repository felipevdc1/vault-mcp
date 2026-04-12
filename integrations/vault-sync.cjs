#!/usr/bin/env node
/**
 * SessionStart Hook — Vault Sync
 *
 * Fires: On session start
 * Purpose: Lightweight vault sync — staleness check, symlink verify, profile auto-load
 * Budget: < 500ms total
 *
 * Exit Codes:
 *   0 - Always (non-blocking)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const HOME = os.homedir();
const VAULT_DIR = path.join(HOME, '.claude', 'vault');
const CATALOG_PATH = path.join(VAULT_DIR, 'catalog.json');
const CONFIG_PATH = path.join(VAULT_DIR, 'config.yaml');
const VAULT_MCP = path.join(HOME, 'Documents', '- projetos claude code', 'vault-mcp', 'bin', 'vault-mcp.mjs');

function getCatalogAge() {
  try {
    const stat = fs.statSync(CATALOG_PATH);
    return Date.now() - stat.mtimeMs;
  } catch (_) { return Infinity; }
}

function runQuickScan() {
  try {
    execSync(`node "${VAULT_MCP}" scan --quick`, {
      timeout: 8000,
      stdio: 'ignore',
      detached: true,
    });
  } catch (_) {} // Fail silently
}

function verifySymlinks() {
  const commandsDir = path.join(HOME, '.claude', 'commands');
  const warnings = [];
  try {
    const entries = fs.readdirSync(commandsDir);
    for (const entry of entries) {
      const p = path.join(commandsDir, entry);
      try {
        const lstat = fs.lstatSync(p);
        if (lstat.isSymbolicLink()) {
          const target = fs.realpathSync(p);
          // Symlink exists and resolves — OK
        }
      } catch (e) {
        if (e.code === 'ENOENT') {
          warnings.push(`broken symlink: ${entry}`);
        }
      }
    }
  } catch (_) {}
  return warnings;
}

function findProfile(startDir) {
  let dir = startDir;
  for (let i = 0; i < 5; i++) {
    const profilePath = path.join(dir, '.vault-profile.yaml');
    if (fs.existsSync(profilePath)) return profilePath;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

async function main() {
  try {
    const stdin = fs.readFileSync(0, 'utf-8').trim();
    const payload = stdin ? JSON.parse(stdin) : {};
    const cwd = payload.cwd || process.cwd();

    const output = { warnings: [] };

    // 1. Staleness check — if catalog > 24h, trigger background scan
    const ageMs = getCatalogAge();
    const AGE_LIMIT = 24 * 60 * 60 * 1000;
    if (ageMs > AGE_LIMIT) {
      runQuickScan();
      output.warnings.push('[vault] catalog > 24h old — running quick scan in background');
    }

    // 2. Verify symlinks
    const brokenLinks = verifySymlinks();
    for (const w of brokenLinks) {
      output.warnings.push(`[vault] ${w}`);
    }

    // 3. Profile detection
    const profilePath = findProfile(cwd);
    if (profilePath) {
      output.warnings.push(`[vault] profile found: ${profilePath}`);
    }

    // Output warnings to stderr (non-blocking)
    if (output.warnings.length > 0) {
      output.warnings.forEach(w => process.stderr.write(w + '\n'));
    }

    process.exit(0);
  } catch (_) {
    process.exit(0); // Fail-open
  }
}

main();

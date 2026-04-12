// vault-mcp: Loader module
// Manages symlinks between vault skill files and ~/.claude/commands/.
// Safety-first: never deletes real files, never overwrites without checking.

import fs from 'fs';
import path from 'path';
import os from 'os';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_COMMANDS_DIR = path.join(os.homedir(), '.claude', 'commands');

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns the absolute path to ~/.claude/commands.
 * @returns {string}
 */
export function getCommandsDir() {
  return DEFAULT_COMMANDS_DIR;
}

/**
 * Converts an asset id (e.g. "design:agents:brad-frost") to a relative path
 * under commandsDir (e.g. "design/agents/brad-frost.md").
 * @param {string} assetId
 * @returns {string}
 */
function idToRelativePath(assetId) {
  // Replace colons with path separators; append .md extension
  return assetId.split(':').join(path.sep) + '.md';
}

/**
 * Collects all .md files under a directory recursively.
 * @param {string} dir
 * @returns {string[]} absolute paths
 */
function collectMarkdownFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  function walk(current) {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(full);
      } else if (entry.isSymbolicLink()) {
        // Include symlinks pointing to .md files
        if (entry.name.endsWith('.md')) {
          results.push(full);
        }
      }
    }
  }

  walk(dir);
  return results;
}

/**
 * Attempts to remove empty directories from `dir` upward to `stopAt`.
 * Silently ignores errors.
 * @param {string} dir
 * @param {string} stopAt — never remove this directory or above
 */
function pruneEmptyDirs(dir, stopAt) {
  let current = dir;
  while (current !== stopAt && current.startsWith(stopAt)) {
    try {
      fs.rmdirSync(current); // fails if not empty — that's fine
      current = path.dirname(current);
    } catch {
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// loadAsset
// ---------------------------------------------------------------------------

/**
 * Creates a symlink from assetPath → commandsDir/<path derived from assetId>.
 * Idempotent: if the correct symlink already exists, returns 'already_loaded'.
 * Will not overwrite real files or symlinks pointing elsewhere.
 *
 * @param {string} assetPath    — absolute path to the skill file in the vault
 * @param {string} commandsDir  — absolute path to commands/ directory
 * @param {string} assetId      — asset ID string (e.g. "design:agents:brad-frost")
 * @returns {{
 *   status: 'loaded'|'already_loaded'|'conflict'|'error',
 *   symlink?: string,
 *   target?: string,
 *   message?: string
 * }}
 */
export function loadAsset(assetPath, commandsDir, assetId) {
  try {
    const relPath = idToRelativePath(assetId);
    const destPath = path.join(commandsDir, relPath);
    const destDir = path.dirname(destPath);

    // Create intermediate directories
    fs.mkdirSync(destDir, { recursive: true });

    // Check if destination already exists
    if (fs.existsSync(destPath) || isSymlinkAt(destPath)) {
      let stat;
      try {
        stat = fs.lstatSync(destPath);
      } catch {
        // Path doesn't exist at all — proceed to create symlink
        stat = null;
      }

      if (stat) {
        if (stat.isSymbolicLink()) {
          let existingTarget;
          try {
            existingTarget = fs.readlinkSync(destPath);
          } catch {
            existingTarget = null;
          }

          // Resolve to absolute for reliable comparison
          const resolvedExisting = existingTarget
            ? path.resolve(destDir, existingTarget)
            : null;
          const resolvedNew = path.resolve(assetPath);

          if (resolvedExisting === resolvedNew) {
            // Already pointing to the same target — idempotent
            return { status: 'already_loaded', symlink: destPath, target: assetPath };
          } else {
            // Symlink to different target — warn, refuse to overwrite
            console.warn(
              `[vault-loader] WARNING: ${destPath} already links to ${existingTarget}. Skipping.`,
            );
            return {
              status: 'conflict',
              message: `Symlink already exists pointing to different target: ${existingTarget}`,
              symlink: destPath,
            };
          }
        } else {
          // Real file — never overwrite
          console.warn(`[vault-loader] WARNING: Real file exists at ${destPath}. Refusing to overwrite.`);
          return {
            status: 'conflict',
            message: 'Real file exists — refusing to overwrite with symlink.',
            symlink: destPath,
          };
        }
      }
    }

    // Create the symlink
    fs.symlinkSync(assetPath, destPath);
    console.log(`[vault-loader] Loaded: ${assetId} → ${destPath}`);
    return { status: 'loaded', symlink: destPath, target: assetPath };
  } catch (err) {
    console.error(`[vault-loader] ERROR loading ${assetId}:`, err.message);
    return { status: 'error', message: err.message };
  }
}

/**
 * Checks if a path exists as a symlink (handles the edge case where existsSync
 * returns false for broken symlinks but lstatSync still sees them).
 * @param {string} p
 * @returns {boolean}
 */
function isSymlinkAt(p) {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// unloadAsset
// ---------------------------------------------------------------------------

/**
 * Removes a symlink at symlinkPath.
 * SAFETY: will never delete a real (non-symlink) file.
 *
 * @param {string} symlinkPath — absolute path to the symlink to remove
 * @returns {{
 *   status: 'unloaded'|'not_found'|'not_symlink'|'error',
 *   removed?: string,
 *   message?: string
 * }}
 */
export function unloadAsset(symlinkPath) {
  try {
    // Check existence with lstat (doesn't follow symlinks)
    let stat;
    try {
      stat = fs.lstatSync(symlinkPath);
    } catch {
      return { status: 'not_found', message: `Path does not exist: ${symlinkPath}` };
    }

    // Safety: only remove symlinks
    if (!stat.isSymbolicLink()) {
      console.warn(`[vault-loader] WARNING: ${symlinkPath} is not a symlink. Refusing to delete.`);
      return {
        status: 'not_symlink',
        message: 'Refusing to delete real file — only symlinks can be unloaded.',
      };
    }

    fs.unlinkSync(symlinkPath);
    console.log(`[vault-loader] Unloaded: ${symlinkPath}`);

    // Prune empty parent directories
    const parentDir = path.dirname(symlinkPath);
    const commandsDir = getCommandsDir();
    pruneEmptyDirs(parentDir, commandsDir);

    return { status: 'unloaded', removed: symlinkPath };
  } catch (err) {
    console.error(`[vault-loader] ERROR unloading ${symlinkPath}:`, err.message);
    return { status: 'error', message: err.message };
  }
}

// ---------------------------------------------------------------------------
// loadSquad
// ---------------------------------------------------------------------------

/**
 * Loads all .md files from squadDir into commandsDir.
 *
 * The assetId for each file is derived from squadName + relative path within squadDir.
 * E.g. squadDir=".../design", squadName="design", file="agents/brad-frost.md"
 *   → assetId = "design:agents:brad-frost"
 *
 * @param {string} squadDir     — absolute path to the squad's directory in vault
 * @param {string} commandsDir  — absolute path to commands/ directory
 * @param {string} squadName    — squad name (used as id prefix)
 * @returns {{ loaded: string[], skipped: string[], conflicts: string[] }}
 */
export function loadSquad(squadDir, commandsDir, squadName) {
  const result = { loaded: [], skipped: [], conflicts: [] };

  const files = collectMarkdownFiles(squadDir);

  for (const filePath of files) {
    // Build assetId from the file's relative position within squadDir
    const rel = path.relative(squadDir, filePath); // e.g. "agents/brad-frost.md"
    const withoutExt = rel.replace(/\.md$/i, '');   // e.g. "agents/brad-frost"
    const assetId = `${squadName}:${withoutExt.split(path.sep).join(':')}`; // e.g. "design:agents:brad-frost"

    const outcome = loadAsset(filePath, commandsDir, assetId);

    if (outcome.status === 'loaded') {
      result.loaded.push(assetId);
    } else if (outcome.status === 'already_loaded') {
      result.skipped.push(assetId);
    } else if (outcome.status === 'conflict') {
      result.conflicts.push(assetId);
    } else {
      // error — treat as skipped, already logged
      result.skipped.push(assetId);
    }
  }

  console.log(
    `[vault-loader] loadSquad "${squadName}": ` +
    `${result.loaded.length} loaded, ${result.skipped.length} skipped, ${result.conflicts.length} conflicts.`,
  );

  return result;
}

// ---------------------------------------------------------------------------
// unloadSquad
// ---------------------------------------------------------------------------

/**
 * Removes all symlinks belonging to a squad from commandsDir.
 * Traverses commandsDir/squadName/ and removes all symlinks found there.
 *
 * @param {string} commandsDir  — absolute path to commands/ directory
 * @param {string} squadName    — squad name (subdirectory name under commandsDir)
 * @returns {{ unloaded: string[], skipped: string[] }}
 */
export function unloadSquad(commandsDir, squadName) {
  const result = { unloaded: [], skipped: [] };
  const squadCommandsDir = path.join(commandsDir, squadName);

  if (!fs.existsSync(squadCommandsDir)) {
    console.log(`[vault-loader] unloadSquad "${squadName}": directory not found, nothing to do.`);
    return result;
  }

  // Collect all symlinks under squadCommandsDir
  function collectSymlinks(dir) {
    const symlinks = [];
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return symlinks;
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        symlinks.push(full);
      } else if (entry.isDirectory()) {
        symlinks.push(...collectSymlinks(full));
      }
    }
    return symlinks;
  }

  const symlinks = collectSymlinks(squadCommandsDir);

  for (const symlinkPath of symlinks) {
    const outcome = unloadAsset(symlinkPath);
    if (outcome.status === 'unloaded') {
      result.unloaded.push(symlinkPath);
    } else {
      result.skipped.push(symlinkPath);
    }
  }

  // Try to clean the squad directory itself if now empty
  pruneEmptyDirs(squadCommandsDir, commandsDir);

  console.log(
    `[vault-loader] unloadSquad "${squadName}": ` +
    `${result.unloaded.length} unloaded, ${result.skipped.length} skipped.`,
  );

  return result;
}

// ---------------------------------------------------------------------------
// verifySymlinks
// ---------------------------------------------------------------------------

/**
 * Walks commandsDir recursively and verifies every symlink's target exists.
 *
 * @param {string} commandsDir — absolute path to commands/ directory
 * @returns {{ valid: string[], broken: string[] }}
 */
export function verifySymlinks(commandsDir) {
  const result = { valid: [], broken: [] };

  if (!fs.existsSync(commandsDir)) {
    return result;
  }

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        let target;
        try {
          target = fs.readlinkSync(full);
        } catch {
          result.broken.push(full);
          continue;
        }

        // Resolve relative symlinks against their parent directory
        const resolvedTarget = path.resolve(path.dirname(full), target);

        if (fs.existsSync(resolvedTarget)) {
          result.valid.push(full);
        } else {
          console.warn(`[vault-loader] Broken symlink: ${full} → ${resolvedTarget}`);
          result.broken.push(full);
        }
      } else if (entry.isDirectory()) {
        walk(full);
      }
    }
  }

  walk(commandsDir);
  return result;
}

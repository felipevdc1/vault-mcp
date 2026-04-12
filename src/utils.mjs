// vault-mcp: Utils module
// Shared utilities — file helpers, string normalization, path resolution

import fs from 'fs';
import path from 'path';
import os from 'os';

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/**
 * Expands a leading ~ to the user's home directory.
 * @param {string} p
 * @returns {string}
 */
export function expandPath(p) {
  if (!p) return p;
  if (p === '~' || p.startsWith('~/') || p.startsWith('~\\')) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

// ---------------------------------------------------------------------------
// String utilities
// ---------------------------------------------------------------------------

/**
 * Fuzzy match: returns a numeric score (>0 = some match).
 * Splits query into words; scores by how many words appear in text.
 * Case-insensitive.
 * @param {string} query
 * @param {string} text
 * @returns {number}
 */
export function fuzzyMatch(query, text) {
  if (!query || !text) return 0;
  const q = query.toLowerCase();
  const t = text.toLowerCase();

  const words = q.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;

  let score = 0;
  for (const word of words) {
    if (t.includes(word)) {
      // Exact word boundary match scores higher
      const wordBoundary = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
      score += wordBoundary.test(t) ? 2 : 1;
    }
  }
  return score;
}

/**
 * Normalises text to a slug ID: lowercase, spaces/special chars → hyphens.
 * @param {string} text
 * @returns {string}
 */
export function slugify(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ---------------------------------------------------------------------------
// Markdown parsing
// ---------------------------------------------------------------------------

/**
 * Extracts YAML frontmatter between the first pair of `---` delimiters.
 * Returns { data: parsedObject|null, body: string (content after frontmatter) }
 * Does NOT import js-yaml here — returns raw YAML string for callers to parse.
 * @param {string} content
 * @returns {{ raw: string|null, body: string }}
 */
export function extractFrontmatter(content) {
  if (!content) return { raw: null, body: '' };
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { raw: null, body: content };
  return { raw: match[1], body: match[2] };
}

/**
 * Returns all level-2 headings (lines starting with `## `) from markdown content.
 * @param {string} content
 * @returns {string[]}
 */
export function extractHeadings(content) {
  if (!content) return [];
  const lines = content.split('\n');
  return lines
    .filter(line => /^##\s+/.test(line))
    .map(line => line.replace(/^##\s+/, '').trim());
}

/**
 * Returns the first non-empty paragraph after an optional heading.
 * If afterHeading is provided, looks for that heading first (case-insensitive).
 * @param {string} content
 * @param {string} [afterHeading]
 * @returns {string|null}
 */
export function extractFirstParagraph(content, afterHeading) {
  if (!content) return null;

  let text = content;

  if (afterHeading) {
    const pattern = new RegExp(`^#{1,6}\\s+${afterHeading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'im');
    const match = text.match(pattern);
    if (match) {
      text = text.slice(match.index + match[0].length);
    } else {
      return null;
    }
  }

  // Split into paragraphs (double newline separated), skip headings and code blocks
  const lines = text.split('\n');
  const paragraphLines = [];
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      if (!inCodeBlock) paragraphLines.length = 0; // reset after a code block
      continue;
    }
    if (inCodeBlock) continue;
    if (/^#{1,6}\s/.test(line)) {
      // Hit next heading — stop if we already collected something
      if (paragraphLines.some(l => l.trim().length > 0)) break;
      continue;
    }
    if (line.trim() === '') {
      if (paragraphLines.some(l => l.trim().length > 0)) break;
      continue;
    }
    paragraphLines.push(line.trim());
  }

  const paragraph = paragraphLines.join(' ').trim();
  return paragraph.length > 0 ? paragraph : null;
}

// ---------------------------------------------------------------------------
// File I/O helpers
// ---------------------------------------------------------------------------

/**
 * Reads a file and returns its contents as a string. Returns null on any error.
 * @param {string} filePath
 * @returns {string|null}
 */
export function safeReadFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Checks whether filePath is a symlink (lstatSync, doesn't follow the link).
 * Returns false if the path doesn't exist or any error occurs.
 * @param {string} filePath
 * @returns {boolean}
 */
export function isSymlink(filePath) {
  try {
    const stat = fs.lstatSync(filePath);
    return stat.isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Writes JSON to filePath atomically by first writing a .tmp file then renaming.
 * Creates parent directories if they don't exist.
 * @param {string} filePath
 * @param {unknown} data  — will be JSON.stringify'd with 2-space indent
 */
export function atomicWrite(filePath, data) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

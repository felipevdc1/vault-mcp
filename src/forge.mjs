// vault-mcp: Forge module
// Manages skill candidates — approaches used by agents that didn't find a skill in the vault.

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { slugify, safeReadFile } from './utils.mjs';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns today's date as YYYY-MM-DD string.
 * @returns {string}
 */
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Ensures a directory exists (recursive).
 * @param {string} dir
 */
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * Reads and parses all YAML files in a directory.
 * Returns array of parsed objects. Files that fail to parse are skipped.
 * @param {string} dir
 * @returns {Array<object>}
 */
function readYamlDir(dir) {
  if (!fs.existsSync(dir)) return [];
  let files;
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
        results.push({ ...parsed, _file: path.join(dir, file) });
      }
    } catch {
      // skip malformed files
    }
  }
  return results;
}

/**
 * Generates the next sequential candidate ID for today.
 * Format: candidate-YYYYMMDD-NNN
 * @param {string} candidatesDir
 * @returns {string}
 */
function nextCandidateId(candidatesDir) {
  const dateCompact = todayStr().replace(/-/g, '');
  const prefix = `candidate-${dateCompact}-`;

  let maxSeq = 0;
  if (fs.existsSync(candidatesDir)) {
    let files = [];
    try {
      files = fs.readdirSync(candidatesDir).filter(f => f.endsWith('.yaml'));
    } catch {
      // ignore
    }
    for (const file of files) {
      const content = safeReadFile(path.join(candidatesDir, file));
      if (!content) continue;
      try {
        const parsed = yaml.load(content);
        if (parsed && typeof parsed.id === 'string' && parsed.id.startsWith(prefix)) {
          const seq = parseInt(parsed.id.slice(prefix.length), 10);
          if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
        }
      } catch {
        // skip
      }
    }
  }

  const next = String(maxSeq + 1).padStart(3, '0');
  return `${prefix}${next}`;
}

/**
 * Finds the file path for a candidate by its ID.
 * @param {string} candidatesDir
 * @param {string} candidateId
 * @returns {string|null}
 */
function findCandidateFile(candidatesDir, candidateId) {
  if (!fs.existsSync(candidatesDir)) return null;
  let files = [];
  try {
    files = fs.readdirSync(candidatesDir).filter(f => f.endsWith('.yaml'));
  } catch {
    return null;
  }
  for (const file of files) {
    const content = safeReadFile(path.join(candidatesDir, file));
    if (!content) continue;
    try {
      const parsed = yaml.load(content);
      if (parsed && parsed.id === candidateId) {
        return path.join(candidatesDir, file);
      }
    } catch {
      // skip
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Saves a new skill candidate to {vaultDir}/candidates/.
 * @param {string} vaultDir
 * @param {{ task: string, approach: string, tags?: string[] }} options
 * @returns {{ candidate_id: string, saved_to: string }}
 */
export function suggest(vaultDir, { task, approach, tags = [] }) {
  const candidatesDir = path.join(vaultDir, 'candidates');
  ensureDir(candidatesDir);

  const id = nextCandidateId(candidatesDir);
  const date = todayStr();
  const filename = `${date}-${slugify(task || 'untitled')}.yaml`;
  const filePath = path.join(candidatesDir, filename);

  const candidate = {
    id,
    task: task || '',
    approach: approach || '',
    suggested_tags: Array.isArray(tags) ? tags : [],
    submitted_by: 'agent',
    date,
    status: 'pending',
  };

  const content = yaml.dump(candidate, { lineWidth: 120, quotingType: '"' });
  fs.writeFileSync(filePath, content, 'utf8');

  return { candidate_id: id, saved_to: filePath };
}

/**
 * Lists all pending candidates from {vaultDir}/candidates/, sorted newest first.
 * @param {string} vaultDir
 * @returns {object[]}
 */
export function listCandidates(vaultDir) {
  const candidatesDir = path.join(vaultDir, 'candidates');
  const all = readYamlDir(candidatesDir);
  return all
    .filter(c => c.status === 'pending')
    .sort((a, b) => {
      const da = a.date || '';
      const db = b.date || '';
      return db.localeCompare(da);
    })
    .map(({ _file, ...rest }) => rest); // strip internal _file key
}

/**
 * Approves a candidate: creates a forged skill .md and marks the candidate as approved.
 * @param {string} vaultDir
 * @param {string} candidateId
 * @returns {{ status: 'approved', skill_path: string }|{ status: 'error', message: string }}
 */
export function approveCandidate(vaultDir, candidateId) {
  const candidatesDir = path.join(vaultDir, 'candidates');
  const forgedDir = path.join(vaultDir, 'squads', 'forged');

  const candidateFile = findCandidateFile(candidatesDir, candidateId);
  if (!candidateFile) {
    return { status: 'error', message: `Candidate "${candidateId}" not found.` };
  }

  let candidate;
  try {
    const content = safeReadFile(candidateFile);
    candidate = yaml.load(content);
  } catch {
    return { status: 'error', message: 'Failed to parse candidate file.' };
  }

  ensureDir(forgedDir);

  const skillSlug = slugify(candidate.task || candidateId);
  const skillPath = path.join(forgedDir, `${skillSlug}.md`);

  const tagsLine = Array.isArray(candidate.suggested_tags)
    ? candidate.suggested_tags.join(' ')
    : '';

  const skillMd = [
    '---',
    `description: ${candidate.task || ''}`,
    `tags: ${tagsLine}`,
    `forged: true`,
    `forged_from: ${candidateId}`,
    `forged_date: ${candidate.date || todayStr()}`,
    '---',
    '',
    `# ${candidate.task || candidateId}`,
    '',
    candidate.approach || '',
  ].join('\n');

  fs.writeFileSync(skillPath, skillMd, 'utf8');

  // Update candidate status to approved
  candidate.status = 'approved';
  const updatedYaml = yaml.dump(candidate, { lineWidth: 120, quotingType: '"' });
  fs.writeFileSync(candidateFile, updatedYaml, 'utf8');

  return { status: 'approved', skill_path: skillPath };
}

/**
 * Rejects a candidate: updates its status to "rejected" without deleting it.
 * @param {string} vaultDir
 * @param {string} candidateId
 * @returns {{ status: 'rejected' }|{ status: 'error', message: string }}
 */
export function rejectCandidate(vaultDir, candidateId) {
  const candidatesDir = path.join(vaultDir, 'candidates');
  const candidateFile = findCandidateFile(candidatesDir, candidateId);

  if (!candidateFile) {
    return { status: 'error', message: `Candidate "${candidateId}" not found.` };
  }

  let candidate;
  try {
    const content = safeReadFile(candidateFile);
    candidate = yaml.load(content);
  } catch {
    return { status: 'error', message: 'Failed to parse candidate file.' };
  }

  candidate.status = 'rejected';
  const updatedYaml = yaml.dump(candidate, { lineWidth: 120, quotingType: '"' });

  try {
    fs.writeFileSync(candidateFile, updatedYaml, 'utf8');
  } catch {
    return { status: 'error', message: 'Failed to write updated candidate file.' };
  }

  return { status: 'rejected' };
}

/**
 * Returns the count of pending candidates.
 * @param {string} vaultDir
 * @returns {number}
 */
export function getCandidateCount(vaultDir) {
  return listCandidates(vaultDir).length;
}

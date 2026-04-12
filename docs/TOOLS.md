# MCP Tools Reference

**Author:** Felipe Vieira Domingues Carneiro

vault-mcp exposes 9 MCP tools to Claude Code. All tools communicate via stdio and return JSON.

---

## vault_resolve

**Find the most relevant skills for a task.**

The primary tool. Uses a multi-signal scoring engine:
- Tag match: +5 per matching tag
- Name match: +10 exact, +7 partial
- Description match: +3 per keyword in what/when/delivers
- Usage boost: log-scale bonus for frequently-used skills
- Context boost: +3 if skill domain matches project domains
- Recipe bonus: +2 if skill participates in a matching recipe

### Input

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `task` | string | yes | Task description to find relevant skills for |

### Output

```json
{
  "matches": [
    {
      "id": "design:agent:brad-frost",
      "name": "brad-frost",
      "type": "agent",
      "squad": "design",
      "score": 28,
      "summary": {
        "what": "Atomic Design architect ...",
        "when": "When building a design system from scratch ...",
        "delivers": "Atomic component hierarchy ..."
      },
      "tags": ["design", "atomic", "components"],
      "installed": true,
      "path": "/Users/you/.claude/commands/design/agents/brad-frost.md"
    }
  ],
  "total": 42,
  "top_score": 28,
  "recipe_match": {
    "name": "Design System Completo",
    "skills": ["design:agent:brad-frost", "design:agent:nathan-curtis"]
  }
}
```

### When to use

At the start of any task to discover which skills in the vault are relevant before loading them.

---

## vault_search

**Full-text search across the catalog.**

Lower-level than `vault_resolve` — searches without scoring. Useful for finding skills by exact name or browsing a squad.

### Input

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | yes | Search query |
| `type` | string | no | Filter by asset type: `agent`, `task`, `command`, `skill` |
| `squad` | string | no | Filter by squad name |
| `limit` | number | no | Maximum results (default: 10) |

### Output

```json
{
  "results": [
    {
      "id": "design:task:a11y-audit",
      "name": "a11y-audit",
      "type": "task",
      "squad": "design",
      "score": 12,
      "summary": { "what": "...", "when": "...", "delivers": "..." },
      "tags": ["a11y", "accessibility", "audit"]
    }
  ],
  "count": 3,
  "total_in_catalog": 42
}
```

### When to use

When you know the squad or type you want to browse, or when you need an exact name match rather than semantic resolution.

---

## vault_load

**Activate a skill or an entire squad.**

Creates a symlink from `~/.claude/commands/` pointing to the skill file. The skill becomes available as a slash command after the next session restart.

### Input

Provide exactly one of `id` or `squad`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | no | Asset ID to load (e.g. `design:agent:brad-frost`) |
| `squad` | string | no | Squad name — loads all assets from that squad |

### Output (single asset)

```json
{
  "loaded": true,
  "symlink": "/Users/you/.claude/commands/design/agents/brad-frost.md",
  "target": "/Users/you/squads/design/agents/brad-frost.md",
  "note": "Skill activated — available as slash command in the next session. To use now, Read the path: /Users/you/squads/design/agents/brad-frost.md"
}
```

### Output (squad)

```json
{
  "loaded": ["design:agent:brad-frost", "design:agent:nathan-curtis"],
  "skipped": [],
  "conflicts": [],
  "symlinks_created": 2,
  "note": "Skills activated — available as slash commands in the next session. To use now, Read the file paths from the catalog."
}
```

### When to use

After `vault_resolve` identifies relevant skills, load them to make them usable as slash commands. To use a skill immediately without a restart, read the file at `path` directly.

---

## vault_unload

**Deactivate a skill or squad.**

Removes the symlink from `~/.claude/commands/`. The skill file itself is not deleted.

### Input

Provide exactly one of `id` or `squad`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | no | Asset ID to unload |
| `squad` | string | no | Squad name — unloads all assets from that squad |

### Output

```json
{
  "unloaded": ["design:agent:brad-frost"],
  "skipped": [],
  "symlinks_removed": 1
}
```

### When to use

To clean up loaded skills when switching projects or to reduce the slash command list.

---

## vault_status

**Overview of the current vault state.**

No inputs required.

### Output

```json
{
  "total": 42,
  "installed": 7,
  "vault": 35,
  "by_type": {
    "agent": 12,
    "task": 18,
    "command": 5,
    "skill": 7
  },
  "by_squad": {
    "design": 22,
    "ClaudeKit-marketing": 10,
    "forged": 3
  },
  "by_source": {
    "~/.claude/commands": 30,
    "manifest": 12
  },
  "forge_candidates": 2,
  "last_scan": "2026-04-12T10:30:00.000Z",
  "catalog_version": 1
}
```

### When to use

To check catalog health, verify the last scan timestamp, see how many skills are currently installed, or confirm forge candidates are pending.

---

## vault_suggest

**Submit a skill candidate to the forge.**

When you complete a task using an approach worth preserving, submit it as a candidate. Candidates are stored in `~/.claude/vault/candidates/` and can be reviewed with `vault-mcp forge list`, then promoted with `vault-mcp forge approve <id>`.

### Input

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `task` | string | yes | What you needed to do |
| `approach` | string | yes | The approach or solution you used |
| `tags` | string[] | no | Relevant tags for this skill |

### Output

```json
{
  "candidate_id": "candidate-20260412-abc1de",
  "saved_to": "/Users/you/.claude/vault/candidates/2026-04-12-create-conversion-landing-page.yaml"
}
```

### When to use

After completing a task using a repeatable approach that isn't yet in the vault. The forge workflow turns candidates into real skills.

---

## vault_dashboard

**Generate an HTML dashboard of vault state.**

Produces an interactive HTML file showing catalog stats, skill usage, forge candidates, and recipes. Optionally opens it in the browser.

### Input

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `open` | boolean | no | Open dashboard in browser after generating |

### Output

```json
{
  "html_path": "/Users/you/.claude/vault/dashboard.html",
  "opened": true
}
```

### When to use

For a visual overview of the vault — useful for reviewing what's loaded, spotting underused skills, or exploring available recipes.

---

## vault_profile

**Read the project profile for the current working directory.**

Walks up the directory tree from `cwd` looking for `.vault-profile.yaml`. Returns the profile's auto-load suggestions and recommended recipes if found.

### Input

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cwd` | string | no | Directory to search from (defaults to `process.cwd()`) |

### Output (profile found)

```json
{
  "profile": {
    "project": "my-saas",
    "stack": ["next.js", "supabase", "typescript"],
    "domains": ["frontend", "backend"],
    "auto_load": { "squads": ["design"], "skills": [] },
    "recipes": ["Design System Completo"]
  },
  "path": "/Users/you/projects/my-saas/.vault-profile.yaml",
  "suggestions": {
    "skills": [],
    "recipes": ["Design System Completo"]
  }
}
```

### Output (no profile)

```json
{
  "profile": null,
  "path": null,
  "suggestions": { "skills": [], "recipes": [] }
}
```

### When to use

At session start to discover project-specific skill suggestions. If a profile exists, use `vault_load` to activate the suggested squads/skills.

---

## vault_recipes

**List or filter skill combination recipes.**

Returns recipes that describe curated combinations of skills for common workflows.

### Input

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `match` | string | no | Filter recipes matching these keywords |

### Output

```json
{
  "recipes": [
    {
      "name": "Design System Completo",
      "what": "Criar ou refatorar um design system seguindo Atomic Design + tokens + documentação",
      "when": "Bootstrap de design system novo, migrar componentes pra Atomic, padronizar UI de projeto existente",
      "skills": ["design:agent:brad-frost", "design:agent:nathan-curtis", "design:task:ds-extract-tokens"],
      "workflow_hint": "1. Atomic structure → 2. Tokens → 3. Components base → 4. Documentation",
      "tags": ["design-system", "atomic", "tokens", "components", "documentation"]
    }
  ],
  "count": 1
}
```

### When to use

When you need a multi-skill workflow for a well-known task type (landing page, design system, content marketing pipeline). Use the returned skill IDs with `vault_load` to activate the full recipe.

# Project Profiles

**Author:** Felipe Vieira Domingues Carneiro

A project profile (`.vault-profile.yaml`) tells vault-mcp which skills and recipes are relevant to a specific project. When Claude Code opens a session in or near a project directory, `vault_profile` reads the profile and surfaces targeted suggestions.

---

## Location

Place `.vault-profile.yaml` in the root of your project directory:

```
my-project/
  .vault-profile.yaml
  src/
  package.json
  ...
```

---

## Format

```yaml
# vault-mcp project profile
# Place as .vault-profile.yaml in your project root

project: ""          # Project name
stack: []            # Tech stack (e.g., [next.js, supabase, typescript])
domains: []          # Skill domains relevant to this project

# Skills to auto-load when opening this project
auto_load:
  squads: []         # Full squads to activate
  skills: []         # Individual skills to activate

# Recipes to prioritize for this project
recipes: []
```

---

## Fields

| Field | Description |
|-------|-------------|
| `project` | Human-readable project name, for display only |
| `stack` | Technology stack — combined with `domains` for resolver context boost |
| `domains` | Skill domains relevant to the project (e.g. `frontend`, `backend`, `design`) |
| `auto_load.squads` | Squad names to load on session start |
| `auto_load.skills` | Individual skill IDs to load on session start |
| `recipes` | Recipe names to prioritize in `vault_recipes` results |

---

## How profiles affect the resolver

The `stack` and `domains` arrays are passed to `vault_resolve` as `projectDomains`. Any skill whose tags overlap with these values receives a **+3 context boost** in scoring.

Example: a project with `stack: [next.js, typescript]` and `domains: [frontend]` boosts skills tagged with `next`, `typescript`, or `frontend`.

---

## Auto-load on SessionStart

The `integrations/vault-sync.cjs` hook runs at session start and detects whether a profile exists in the current working directory (walks up to 5 levels). If found, it emits a warning line:

```
[vault] profile found: /path/to/project/.vault-profile.yaml
```

Use `vault_profile` in your session-start workflow to read the profile and then call `vault_load` with the suggested squads/skills.

---

## Example profiles

### Next.js SaaS project

```yaml
project: my-saas
stack: [next.js, supabase, typescript, tailwind]
domains: [frontend, backend, database]

auto_load:
  squads: [design]
  skills: []

recipes:
  - Design System Completo
  - Dashboard Analytics
```

### Marketing website

```yaml
project: company-website
stack: [astro, tailwind]
domains: [frontend, marketing, seo]

auto_load:
  squads: []
  skills:
    - ClaudeKit-marketing:seo:keywords
    - ClaudeKit-marketing:write:blog

recipes:
  - Landing Page de Alta Conversão
  - Content Marketing Pipeline
```

### Backend API

```yaml
project: internal-api
stack: [node.js, postgresql, typescript]
domains: [backend, api, database]

auto_load:
  squads: []
  skills: []

recipes: []
```

---

## Precedence

- Profile detection starts at `cwd` (or the `cwd` argument to `vault_profile`) and walks up the tree
- The first `.vault-profile.yaml` found wins — closer to the project root takes precedence
- The walk stops at the user's home directory
- If no profile is found, `vault_profile` returns `null` — the vault still works, just without project-specific boosts

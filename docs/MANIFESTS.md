# Manifests

**Author:** Felipe Vieira Domingues Carneiro

A manifest (`vault.yaml`) is an optional file that enriches how the scanner understands a squad. Without a manifest, the scanner infers metadata from file names and markdown content. With a manifest, every skill gets precise `what`, `when`, and `delivers` descriptions that improve `vault_resolve` matching quality.

---

## Where manifests live

The scanner checks two locations, in order:

1. `{scan_dir}/vault.yaml` — manifest inside the squad directory itself
2. `~/.claude/vault/manifests/{squadName}.yaml` — central manifest registry

The second location is useful for squads you don't own (e.g. third-party collections) — you can annotate them without modifying the source.

---

## Format

```yaml
# vault-mcp manifest
# Describes a squad/skill collection for the vault catalog

name: ""           # Squad/skill name
author: ""         # Author name
version: "1.0.0"

# Summary (used by vault_resolve for matching)
what: ""           # What this squad/skill does
when: ""           # When to use it
delivers: ""       # What it delivers/outputs
tags: []           # Searchable tags

# Individual assets in this squad
assets: []
  # - id: agents:example
  #   what: "Description of what this agent does"
  #   when: "When to use this agent"
  #   delivers: "What it outputs"
  #   tags: [tag1, tag2]
```

---

## Fields

### Top-level fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | yes | Squad display name, used in catalog and UI |
| `author` | no | Author for attribution |
| `version` | no | Semver, informational only |
| `what` | yes | What the squad does overall |
| `when` | yes | When to use this squad |
| `delivers` | yes | What outputs/results the squad produces |
| `tags` | no | Searchable tags for the whole squad |
| `assets` | no | Per-asset metadata |

### Asset fields

Each entry under `assets` describes one skill file within the squad.

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Asset identifier: `{typeDir}:{name}` (e.g. `agents:brad-frost`) |
| `what` | recommended | What this specific skill does |
| `when` | recommended | When to use this specific skill |
| `delivers` | recommended | What this skill outputs |
| `tags` | no | Additional tags for this skill |

**ID format:** The `id` omits the squad prefix — the scanner prepends it automatically. So `agents:brad-frost` in a squad named `design` becomes `design:agent:brad-frost` in the catalog.

**Supported type directories:** `agents` → `agent`, `tasks` → `task`, `commands` → `command`. Anything else → `skill`.

---

## Quality rules

The `what`, `when`, and `delivers` fields drive the resolver's description scoring (+3 per keyword match). Write them to be:

**Concrete, not generic.**

| Field | Bad | Good |
|-------|-----|------|
| `what` | "Helps with design" | "Applies Atomic Design methodology to component architecture" |
| `when` | "Use for UI work" | "When building a design system from scratch or restructuring an existing component library" |
| `delivers` | "Good design" | "Atomic component hierarchy (atoms → molecules → organisms) with documented relationships" |

**Keyword-rich.** The resolver tokenizes these fields and scores keyword overlap with the task description. Include domain terms, action verbs, and output nouns.

---

## Example manifest

```yaml
name: design
author: Felipe Vieira Domingues Carneiro
version: "1.0.0"

what: "Design system specialists — Atomic Design, component documentation, token extraction, and UI auditing"
when: "Building, refactoring, or auditing UI component systems and design tokens"
delivers: "Production-ready component architectures, documented patterns, and design token libraries"
tags: [design, ui, components, atomic, tokens, a11y, documentation]

assets:
  - id: agents:brad-frost
    what: "Applies Atomic Design methodology to architect scalable component hierarchies"
    when: "When starting a new design system or restructuring an existing component library"
    delivers: "Atoms, molecules, organisms, templates, and pages hierarchy with clear relationships"
    tags: [atomic-design, components, architecture]

  - id: agents:nathan-curtis
    what: "Documents UI patterns and creates system-level documentation for design systems"
    when: "When a component library needs formal documentation, usage guidelines, or pattern reference"
    delivers: "Pattern documentation, usage guidelines, component API specs"
    tags: [documentation, patterns, design-system]

  - id: tasks:ds-extract-tokens
    what: "Extracts design tokens (colors, spacing, typography) from existing UI or Figma files"
    when: "When converting hardcoded CSS values into a token-based design system"
    delivers: "Token dictionary in JSON/CSS variables format, categorized by type"
    tags: [tokens, design-tokens, extraction, css]
```

---

## How the scanner uses manifests

1. If `vault.yaml` is found, the scanner reads the `assets` array and creates catalog entries for each
2. It then walks the squad directory and reads the actual `.md` files to **complement** any missing `what`/`when`/`delivers` fields — manifest values take priority
3. Files found on disk but not listed in the manifest are still indexed (fallback to markdown heuristics)

This means you can have a partial manifest — only describe the skills you want to enrich, and the rest will be auto-detected.

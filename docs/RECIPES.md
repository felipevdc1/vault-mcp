# Recipes

**Author:** Felipe Vieira Domingues Carneiro

A recipe is a named combination of skills for a multi-step workflow. Recipes appear in `vault_resolve` results when the task description matches, and are listed by `vault_recipes`. They help surface the right set of skills for common, well-defined tasks.

---

## Location

Recipes live in `~/.claude/vault/recipes/` as `.yaml` files.

---

## Format

```yaml
# vault-mcp recipe

name: ""            # Recipe name
author: ""          # Author
what: ""            # What this recipe achieves
when: ""            # When to use this combo

# Skills that compose this recipe (in order)
skills: []
  # - id: squad:type:name
  #   role: "What this skill contributes to the recipe"

# Suggested execution order
workflow_hint: ""
  # e.g., "1. Research → 2. Design → 3. Implement → 4. Validate"
```

---

## Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | yes | Display name, shown in `vault_resolve` and `vault_recipes` |
| `author` | no | Author for attribution |
| `what` | yes | What outcome this recipe achieves |
| `when` | yes | Task types this recipe fits |
| `skills` | yes | Ordered list of skill IDs and their roles |
| `workflow_hint` | recommended | Human-readable execution order |
| `tags` | no | Searchable tags |

### Skill entry fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Full asset ID: `squad:type:name` (or abbreviated form as stored in catalog) |
| `role` | recommended | What this specific skill contributes to the recipe |

---

## How the resolver uses recipes

When `vault_resolve` scores assets, it checks if any asset participates in a recipe that keyword-matches the task. Participating assets receive a **+2 recipe bonus** on top of their regular score.

The resolver also surfaces the best-matching recipe as `recipe_match` in the response, giving the full skill list even if some skills scored below the threshold individually.

---

## The 4 built-in recipes

### Design System Completo

Full design system from scratch or refactor following Atomic Design.

```yaml
skills:
  - id: design:agents:brad-frost
    role: "Atomic Design architecture"
  - id: design:agents:nathan-curtis
    role: "Pattern documentation"
  - id: design:tasks:ds-extract-tokens
    role: "Extract design tokens"
  - id: design:tasks:ds-setup-design-system
    role: "Initial structure setup"
  - id: design:tasks:ds-build-component
    role: "Build production-ready components"
workflow_hint: "1. Atomic structure → 2. Tokens → 3. Components base → 4. Documentation"
```

### Landing Page de Alta Conversão

Conversion-focused landing page with copy, design, SEO, and accessibility.

```yaml
skills:
  - id: design:agents:refactoring-ui
    role: "Visual structure, hierarchy, spacing"
  - id: design:agents:visual-director
    role: "Visual direction and brand"
  - id: ClaudeKit-marketing:copy:formula
    role: "Persuasive copy (AIDA, PAS, BAB)"
  - id: ClaudeKit-marketing:seo:keywords
    role: "Keywords and meta tags"
  - id: design:tasks:a11y-audit
    role: "Post-build accessibility validation"
workflow_hint: "1. Copy first (message structure) → 2. Design (visual hierarchy) → 3. SEO → 4. A11y (final validation)"
```

### Dashboard Analytics

Analytics dashboards with charts, metrics, and reading-optimized UX.

```yaml
skills:
  - id: design:agents:refactoring-ui
    role: "Layout and visual hierarchy"
  - id: design:tasks:audit-reading-experience
    role: "Optimize data reading"
  - id: ClaudeKit-marketing:analyze:report
    role: "Report structure"
workflow_hint: "1. Define key metrics → 2. Layout (cards, charts) → 3. Visual hierarchy → 4. Reading audit"
```

### Content Marketing Pipeline

End-to-end content pipeline: blog, social, and email sequences.

```yaml
skills:
  - id: ClaudeKit-marketing:write:blog
    role: "SEO blog post"
  - id: ClaudeKit-marketing:seo:keywords
    role: "Keyword research"
  - id: ClaudeKit-marketing:social
    role: "Social media repurposing"
  - id: ClaudeKit-marketing:email:sequence
    role: "Email follow-up sequence"
workflow_hint: "1. Keywords → 2. Blog post → 3. Social repurpose → 4. Email sequence"
```

---

## When to create a new recipe

Create a recipe when:
- You repeatedly use the same combination of 3+ skills for a common task type
- The skills together deliver more than the sum of their parts
- The execution order matters

Do **not** create a recipe for:
- One-off combinations
- Single skills
- Workflows that vary significantly each time

---

## Example: creating a recipe

Create `~/.claude/vault/recipes/api-launch.yaml`:

```yaml
name: API Launch Checklist
author: Felipe Vieira Domingues Carneiro
what: "Full pre-launch checklist for a new API — security, docs, monitoring"
when: "Launching a new REST or GraphQL API to production"
skills:
  - id: backend:tasks:security-audit
    role: "Auth, input validation, rate limiting review"
  - id: backend:tasks:api-docs
    role: "OpenAPI spec generation"
  - id: devops:tasks:monitoring-setup
    role: "Error tracking and alerting"
workflow_hint: "1. Security audit → 2. Documentation → 3. Monitoring setup"
tags: [api, launch, security, documentation, monitoring]
```

Then run `vault-mcp scan` — the recipe will appear in `vault_recipes` and influence `vault_resolve` results for API-related tasks.

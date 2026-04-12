<h1 align="center">vault-mcp</h1>

<p align="center">
  <strong>Your Claude Code skills, organized. Your Claude, smarter.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/vault-mcp"><img src="https://img.shields.io/npm/v/vault-mcp?style=flat-square&color=cb0000" alt="npm"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT License"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen?style=flat-square" alt="Node ≥18"></a>
  <a href="https://modelcontextprotocol.io"><img src="https://img.shields.io/badge/MCP-compatible-8b5cf6?style=flat-square" alt="MCP"></a>
  <a href="https://instagram.com/o.felipecarneiro"><img src="https://img.shields.io/badge/@o.felipecarneiro-E4405F?style=flat-square&logo=instagram&logoColor=white" alt="Instagram"></a>
</p>

<p align="center">
  An MCP server that automatically resolves which Claude Code skill to use for each task —<br>
  and gets smarter the more you use it.
</p>

---

## The Problem

You installed dozens of Claude Code skills. Every session, all of them load into your system prompt.
You forget which skill does what. You pick the wrong one — or worse, you skip them entirely because
finding the right one takes longer than just doing the thing yourself.

Your tooling became friction.

---

## The Magic

You ask Claude to build something. Behind the scenes:

```
You: "build a landing page for the AI course"

Claude → vault_resolve({ task: "landing page for AI course" })

Vault ← {
  recipe: "Landing Page de Alta Conversão",
  skills: [
    "design:agents:refactoring-ui",      // visual hierarchy & spacing
    "ClaudeKit-marketing:copy:formula",  // AIDA/PAS/BAB copy structures
    "ClaudeKit-marketing:seo:keywords",  // meta tags & keyword targeting
    "design:tasks:a11y-audit"            // accessibility post-build
  ],
  workflow: "1. Copy → 2. Design → 3. SEO → 4. A11y"
}

Claude loads the skills, runs the workflow, ships the page.
```

You never thought about which skills to use. The vault did it for you.

---

## Quick Start

```bash
npx vault-mcp init
```

That's it. 30 seconds. Restart Claude Code — done.

---

## Features

| | |
|---|---|
| 🔍 **Smart Resolve** | Multi-signal scoring: tags, usage history, context, and recipes |
| 🧬 **Rich Manifests** | Structured metadata for every skill — what it does, when to use it, what it delivers |
| 🔗 **Recipes** | Pre-composed skill combinations for common workflows |
| 🔥 **Forge** | Vault grows organically — agents propose new skills from repeated patterns |
| 📍 **Project Profiles** | Auto-load the right skills per project based on stack and domains |
| 📊 **Visual Dashboard** | See your entire skill ecosystem at a glance |
| 🤝 **Integrations** | Auto-detects MemPalace and codebase-memory-mcp |

---

## How It Works

```
                   ┌───────────────────────────────┐
                   │      Claude Code Session       │
                   │                               │
                   │  vault_resolve("your task") ──┼──► MCP Server
                   │                               │         │
                   └───────────────────────────────┘         ▼
                                                    ┌─────────────────┐
                                                    │  catalog.json   │
                                                    │  (your skills)  │
                                                    └───────┬─────────┘
                                                            │
                              ┌──────────┬──────────┬───────┴──────┬──────────┐
                              │          │          │              │          │
                          manifests/ recipes/  profiles/       forge/     squads/
```

Every skill gets a **manifest** — structured metadata Claude uses to score relevance.
**Recipes** compose multiple skills into named workflows.
**Profiles** declare which skills a project needs.
**Forge** captures approaches worth repeating and promotes them into the catalog.

---

## Why You Need This

**You have dozens of skills scattered everywhere.**
→ The vault catalogs them all. One source of truth. Searchable, scoreable, composable.

**Your team shares an AI toolkit.**
→ Recipes and profiles standardize how skills combine. Everyone uses the right tool for each job.

**You want AI tooling that improves over time.**
→ The Forge captures what worked. The resolver boosts frequently-used skills. The vault learns.

---

## Installation

```bash
npx vault-mcp init
```

The `init` command:

1. Scans your Claude Code skills directory
2. Detects integrations (MemPalace, codebase-memory-mcp)
3. Generates `catalog.json` with all assets indexed
4. Registers the MCP server in `~/.claude/.mcp.json`
5. Sets up project profiles and recipes

Restart Claude Code to activate the vault tools.

📚 **Full installation guide**: [docs/INSTALLATION.md](./docs/INSTALLATION.md)

---

## MCP Tools

| Tool | Purpose |
|------|---------|
| `vault_resolve` | Find relevant skills for a task — the primary entry point |
| `vault_search` | Browse the catalog by name, squad, or type |
| `vault_load` | Activate skills as slash commands via symlinks |
| `vault_unload` | Deactivate skills when switching projects |
| `vault_status` | Overview: counts, sources, forge candidates, last scan |
| `vault_suggest` | Submit a repeatable approach as a Forge candidate |
| `vault_profile` | Read the project profile for the current directory |
| `vault_recipes` | List or filter pre-composed skill workflows |
| `vault_dashboard` | Generate an interactive HTML view of vault state |

📚 **Full tool reference**: [docs/TOOLS.md](./docs/TOOLS.md)

---

## Integrations

vault-mcp works standalone, but plays nicer with friends:

- **[MemPalace](https://github.com/felipevdc/mempalace)** *(recommended)* — Cross-session memory. Vault remembers which skills worked for each project and boosts them in future sessions.
- **[codebase-memory-mcp](https://github.com/felipevdc/codebase-memory-mcp)** *(optional)* — Stack-aware resolution. Vault reads your project's tech stack and prioritizes matching skills automatically.

Not installed? Vault auto-detects what's missing and tells you.

---

## Roadmap

- [x] v0.1 — Core engine: scanner, resolver, loader
- [x] v0.2 — Manifests, recipes, profiles, forge, dashboard
- [ ] v0.3 — Semantic search via embeddings
- [ ] v0.4 — Community recipe marketplace
- [ ] v1.0 — Native Claude Code plugin integration

---

## Contributing

Pull requests welcome. The highest-impact areas:

- **Recipes** — Pre-composed skill combinations for common workflows
- **Manifest quality** — Rich descriptions for skills you already use
- **Integrations** — Adapters for other MCP servers

Read [CONTRIBUTING.md](./CONTRIBUTING.md) for the full guide.

---

## Author

Built by **Felipe Vieira Domingues Carneiro** in Brazil 🇧🇷

- Instagram: [@o.felipecarneiro](https://instagram.com/o.felipecarneiro)
- GitHub: [@felipevdc](https://github.com/felipevdc)

---

<p align="center">
  <sub>If vault-mcp makes your Claude Code smarter, give it a ⭐</sub>
</p>

<p align="center">
  <sub>MIT License • © 2026 Felipe Vieira Domingues Carneiro</sub>
</p>

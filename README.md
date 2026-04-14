<h1 align="center">vault-mcp</h1>

<p align="center">
  <strong>Claude Code didn't use your 2,697 skills. Now it does.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@felipevdc1/vault-mcp"><img src="https://img.shields.io/npm/v/@felipevdc1/vault-mcp?style=flat-square&color=cb0000" alt="npm"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT License"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen?style=flat-square" alt="Node ≥18"></a>
  <a href="https://modelcontextprotocol.io"><img src="https://img.shields.io/badge/MCP-compatible-8b5cf6?style=flat-square" alt="MCP"></a>
  <a href="https://instagram.com/o.felipecarneiro"><img src="https://img.shields.io/badge/@o.felipecarneiro-E4405F?style=flat-square&logo=instagram&logoColor=white" alt="Instagram"></a>
</p>

<p align="center">
  vault-mcp v1.0 is an <strong>activation layer</strong> for Claude Code. It watches your user messages<br>
  and injects matching skills from your vault <strong>before Claude responds</strong> — automatically.
</p>

---

## The Problem v1.0 Solves

Before v1.0: vault-mcp was a queryable index. You had to call `vault_resolve` explicitly. Claude almost never did.

v1.0 flips the polarity: a `UserPromptSubmit` hook runs `vault_resolve` automatically on every message and injects the top matches as `<vault-activation>` context. Claude sees the right tools before it starts thinking.

Install once. Every session after, Claude starts pre-armed.

---

## Quick Start

```bash
npx @felipevdc1/vault-mcp init
```

This writes three things atomically:
- `~/.claude.json` — registers the MCP server (`mcpServers.vault`)
- `~/.claude/settings.json` — registers the `UserPromptSubmit` hook
- `~/.claude/vault/` — catalog, config, and templates

Restart Claude Code. Done.

**Upgrading from v0.2?** Re-run `init` — it detects the legacy `~/.claude/.mcp.json` entry, migrates it, and registers the hook. Idempotent. See [docs/UPGRADE.md](./docs/UPGRADE.md).

**To uninstall:**

```bash
npx @felipevdc1/vault-mcp uninstall
```

Removes the hook and `mcpServers.vault` entry. Preserves your `~/.claude/vault/` data.

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
npx @felipevdc1/vault-mcp init
```

The `init` command does three things atomically:

1. Scans your Claude Code skills directory and generates `~/.claude/vault/catalog.json`
2. Registers the MCP server in `~/.claude.json` under `mcpServers.vault`
3. Registers the `UserPromptSubmit` hook in `~/.claude/settings.json`

Restart Claude Code to activate the vault tools and the activation hook.

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

- **MemPalace** *(recommended)* — Cross-session memory. Vault remembers which skills worked for each project and boosts them in future sessions.
- **codebase-memory-mcp** *(optional)* — Stack-aware resolution. Vault reads your project's tech stack and prioritizes matching skills automatically.

Not installed? Vault auto-detects what's missing and tells you.

---

## Roadmap

- [x] v0.1 — Core engine: scanner, resolver, loader
- [x] v0.2 — Manifests, recipes, profiles, forge, dashboard
- [x] v1.0 — Activation layer: UserPromptSubmit hook, resolver fixes, correct install path
- [ ] v1.1 — Semantic search via embeddings, Forge tool, global profiles
- [ ] v1.2 — Community recipe marketplace

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
- GitHub: [@felipevdc1](https://github.com/felipevdc1)

---

<p align="center">
  <sub>If vault-mcp makes your Claude Code smarter, give it a ⭐</sub>
</p>

<p align="center">
  <sub>MIT License • © 2026 Felipe Vieira Domingues Carneiro</sub>
</p>

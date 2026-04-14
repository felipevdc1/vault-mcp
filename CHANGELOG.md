# Changelog

## 1.0.0 — Activation layer (2026-04-14)

### Added

- **UserPromptSubmit hook** (`integrations/vault-activation.cjs`) — automatically runs `vault_resolve` on every user message and injects top-3 matches as `<vault-activation>` context before Claude responds. Fail-open: if catalog missing or timeout, the hook exits cleanly without blocking the message.
- **`vault-mcp uninstall`** command — removes hook + `mcpServers.vault` entry; preserves user data in `~/.claude/vault/`.
- **Opt-out mechanisms** — `VAULT_MCP_AUTO_INJECT=0` env var or `auto_inject: false` in `~/.claude/vault/config.yaml`.
- **Observability** — hook logs JSONL to `~/.claude/vault/activation.log` (task hash, matches count, latency, status).
- **Migration** — `init` detects legacy `~/.claude/.mcp.json` vault entry and migrates it to `~/.claude.json` top-level.
- **`docs/UPGRADE.md`** — migration guide for v0.2 → v1.0 users.

### Fixed

- **Resolver P0 bug**: word-boundary matching for tags and asset names. v0.2 used substring matching (`assetName.includes(kw)`), which caused false positives (e.g., `dev` matched `develop-exploit`, scoring it for unrelated queries). v1.0 uses `startsWith(kw + '-') || endsWith('-' + kw) || includes('-' + kw + '-')`.
- **Resolver P0 bug**: `findBestRecipe` no longer depends on top skill match. v0.2's recipe suggestion inherited the top-skill's ranking, so a mis-ranked skill cascaded into a wrong recipe. v1.0 scores recipes directly against task keywords.
- **Resolver P0 bug**: duplicate `asset.id` entries in top matches are now deduplicated (keeping highest score).
- **Install path**: `init` now writes to `~/.claude.json` top-level `mcpServers` (the path Claude Code actually reads) instead of the incorrect `~/.claude/.mcp.json`.

### Breaking

- MCP registration path changed — see `docs/UPGRADE.md`. Re-running `init` migrates automatically.
- Server version bumped from `0.1.0` (stale) to `1.0.0`.

## 0.2.0 — Initial public release (2026-04-12)

- Core MCP server with 9 tools: `vault_resolve`, `vault_search`, `vault_load`, `vault_unload`, `vault_status`, `vault_suggest`, `vault_profile`, `vault_recipes`, `vault_dashboard`
- Scanner, resolver, catalog, loader, forge, dashboard engines
- Manifests, recipes, profiles, squad support
- MemPalace and codebase-memory-mcp integrations (auto-detected)
- 31 tests, 8 docs pages
- 2,697 assets indexed in reference vault

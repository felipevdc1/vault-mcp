# Upgrading vault-mcp

## v0.2 → v1.0

**TL;DR**: `npx @felipevdc1/vault-mcp@1.0.0 init` — idempotente, migra sozinho.

### What changed

- **v0.2**: pull-based index. You had to call `vault_resolve` manually. Registered MCP in `~/.claude/.mcp.json` (wrong path — Claude Code actually reads `~/.claude.json`).
- **v1.0**: push-based activation. `UserPromptSubmit` hook runs resolver automatically and injects matches before Claude responds. MCP registered in `~/.claude.json` (correct path).

### Automatic migration

Re-running `init` on v1.0 will:
1. Detect `~/.claude/.mcp.json` with a `vault` entry
2. Move it to `~/.claude.json` `mcpServers.vault`
3. Delete the legacy entry (or the whole legacy file if it only had vault)
4. Register the `UserPromptSubmit` hook in `~/.claude/settings.json`

No manual config editing required.

### Verifying migration

```bash
# Should exist:
cat ~/.claude.json | jq '.mcpServers.vault'
cat ~/.claude/settings.json | jq '.hooks.UserPromptSubmit'

# Should be gone (or no longer have vault entry):
cat ~/.claude/.mcp.json 2>/dev/null || echo "removed"
```

### Rollback

If v1.0 misbehaves on your setup:

```bash
npx @felipevdc1/vault-mcp@1.0.0 uninstall   # remove hook + mcpServers entry
# or
npm install -g @felipevdc1/vault-mcp@0.2.0  # pin to v0.2 explicitly
```

Your `~/.claude/vault/` data (catalog, recipes, manifests) is preserved across upgrades and uninstalls.

### Breaking changes

- `~/.claude/.mcp.json` no longer used. If you had other MCPs registered there manually, they're safe — only the `vault` entry is migrated.
- MCP server version string in `server.mjs` is now `1.0.0`.
- New files: `integrations/vault-activation.cjs` (hook), `docs/UPGRADE.md` (this file).

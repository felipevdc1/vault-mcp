# Installation

**Author:** Felipe Vieira Domingues Carneiro

---

## Prerequisites

- **Node.js 18+** — check with `node --version`
- **Claude Code** — vault-mcp runs as an MCP server inside Claude Code

---

## Install

### Option A: npx (recommended)

```bash
npx @felipevdc1/vault-mcp init
```

No global install needed. Re-run to upgrade (idempotent).

### Option B: Global install

```bash
npm install -g @felipevdc1/vault-mcp
vault-mcp init
```

### Option C: Local development

```bash
git clone https://github.com/felipevdc1/vault-mcp
cd vault-mcp
npm link
vault-mcp init
```

---

## What `init` does — three side effects, one command

Running `init` writes three things atomically:

### 1. MCP server registration — `~/.claude.json`

Adds `mcpServers.vault` at the top level of your Claude Code config:

```json
{
  "mcpServers": {
    "vault": {
      "command": "node",
      "args": ["/path/to/vault-mcp/src/server.mjs", "serve"]
    }
  }
}
```

This is the path Claude Code actually reads (not `~/.claude/.mcp.json`). If a `vault` entry already exists, it's skipped (idempotent).

### 2. Hook registration — `~/.claude/settings.json`

Adds a `UserPromptSubmit` hook that runs `vault-activation.cjs` before every Claude response:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "command": "node /path/to/vault-activation.cjs" }
    ]
  }
}
```

This is the activation layer. On every user message, the hook calls `vault_resolve` against the task and injects top-3 matches as `<vault-activation>` context — before Claude starts responding.

### 3. Vault directory — `~/.claude/vault/`

Creates the vault structure with:
- `catalog.json` — indexed skills, agents, tasks, commands
- `config.yaml` — vault settings (scan dirs, opt-out flags, etc.)
- `manifests/`, `recipes/`, `candidates/`, `squads/` — subdirectories

---

## Activate in Claude Code

After `init`, restart Claude Code. Two things are now active:

1. **MCP tools** — 9 vault tools available in every session (`vault_resolve`, `vault_search`, etc.)
2. **Activation hook** — `UserPromptSubmit` auto-runs `vault_resolve` on each message and injects matches

To verify the tools are active, ask Claude: `vault_status`

To verify the hook is running:

```bash
tail -f ~/.claude/vault/activation.log
```

Each line is a JSONL record: `{ ts, task_hash, matches_count, latency_ms, status }`.

---

## Upgrading from v0.2

Re-run `init` — no other steps needed. The `init` command detects the legacy `~/.claude/.mcp.json` vault entry and migrates it automatically:

1. Reads `~/.claude/.mcp.json`, finds the `vault` entry
2. Moves it to `~/.claude.json` under `mcpServers.vault`
3. Removes the legacy entry (or the entire file if vault was the only entry)
4. Registers the `UserPromptSubmit` hook in `~/.claude/settings.json`

See [UPGRADE.md](./UPGRADE.md) for full migration notes and verification commands.

---

## Opt-out (disable auto-injection)

To disable the activation hook without uninstalling:

**Via environment variable** (one session):
```bash
VAULT_MCP_AUTO_INJECT=0 claude
```

**Via config file** (persistent):
```yaml
# ~/.claude/vault/config.yaml
auto_inject: false
```

With `auto_inject: false`, the hook runs but exits without injecting. The MCP tools still work — `vault_resolve` can still be called manually.

---

## Uninstall

```bash
npx @felipevdc1/vault-mcp uninstall
```

This removes:
- `mcpServers.vault` from `~/.claude.json`
- The `vault-activation.cjs` entry from `~/.claude/settings.json` hooks

This preserves `~/.claude/vault/` (your catalog, recipes, manifests — user data). To also remove that, delete it manually:

```bash
rm -rf ~/.claude/vault
```

---

## Troubleshooting

### Hook not triggering

Check the activation log:

```bash
tail ~/.claude/vault/activation.log
```

If the file doesn't exist after sending a message, the hook isn't registered. Re-run `init` and verify:

```bash
cat ~/.claude/settings.json | jq '.hooks.UserPromptSubmit'
```

### MCP tools not showing up in Claude Code

Verify the server is registered:

```bash
cat ~/.claude.json | jq '.mcpServers.vault'
```

Should return the server config, not `null`. If null, re-run `init`.

### Hook exits with error

The hook is fail-open: any error (missing catalog, timeout, network issue) causes it to exit cleanly with code 0. The user message flows normally. The `activation.log` will have `"status": "error"` with a reason field.

If catalog is missing:

```bash
vault-mcp scan
```

### Slow hook (>200ms)

The p95 benchmark for cold hook startup is ~132ms. If you're seeing higher:
- Check if `~/.claude/vault/catalog.json` is large (>5MB can add latency)
- Check if `VAULT_MCP_AUTO_INJECT=0` helps — if yes, the bottleneck is the hook process startup

---

## Update the catalog

After adding new skills to your `scan_dirs`:

```bash
vault-mcp scan
```

To see stats without rescanning:

```bash
vault-mcp scan --stats
```

---

## CLI reference

```
vault-mcp init                   Initialize vault, register MCP + hook, run first scan
vault-mcp scan                   Full scan of configured directories
vault-mcp scan --stats           Show catalog statistics without rescanning
vault-mcp serve                  Start MCP server in stdio mode (used by Claude Code)
vault-mcp uninstall              Remove hook + mcpServers.vault entry (preserve catalog)
vault-mcp forge list             List pending forge candidates
vault-mcp forge approve <id>     Promote a candidate to a real skill
vault-mcp forge reject <id>      Delete a candidate
```

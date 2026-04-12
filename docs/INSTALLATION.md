# Installation

**Author:** Felipe Vieira Domingues Carneiro

---

## Prerequisites

- **Node.js 18+** — check with `node --version`
- **Claude Code** — vault-mcp runs as an MCP server inside Claude Code

---

## Install

### Option A: Local development (current)

Clone the repository and link globally:

```bash
git clone https://github.com/felipevdc/vault-mcp
cd vault-mcp
npm link
```

### Option B: npm (once published)

```bash
npm install -g vault-mcp
```

---

## Initialize

Run `init` once after installing. This sets up the full vault structure, detects integrations, runs the first catalog scan, and registers the MCP server.

```bash
vault-mcp init
```

### What `init` does

1. **Creates the vault directory** at `~/.claude/vault/` with subdirectories:
   - `manifests/` — squad manifest files
   - `recipes/` — skill combination recipes
   - `candidates/` — forge candidates (skills submitted via `vault_suggest`)
   - `squads/` — additional skill collections

2. **Copies `config.yaml` template** to `~/.claude/vault/config.yaml` (skips if already exists)

3. **Detects integrations** by inspecting `~/.claude/.mcp.json`:
   - Checks for `mempalace` (cross-session memory)
   - Checks for `codebase-memory-mcp` (stack-aware suggestions)
   - Updates `config.yaml` with detected state

4. **Runs a full scan** of all directories in `scan_dirs` and saves the resulting catalog

5. **Registers vault-mcp** in `~/.claude/.mcp.json` as:
   ```json
   {
     "vault": {
       "command": "node",
       "args": ["/path/to/vault-mcp/src/server.mjs", "serve"]
     }
   }
   ```
   Skipped if a `"vault"` entry already exists.

---

## Activate in Claude Code

After running `init`, restart Claude Code to load the MCP server. The 9 vault tools will be available in every session.

To verify the tools are active, ask Claude: `vault_status`

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
vault-mcp init                   Initialize vault structure, run scan, register MCP
vault-mcp scan                   Full scan of configured directories
vault-mcp scan --stats           Show catalog statistics without rescanning
vault-mcp serve                  Start MCP server in stdio mode (used by Claude Code)
vault-mcp forge list             List pending forge candidates
vault-mcp forge approve <id>     Promote a candidate to a real skill
vault-mcp forge reject <id>      Delete a candidate
```

# Troubleshooting

**Author:** Felipe Vieira Domingues Carneiro

---

## MCP server not appearing in Claude Code

**Symptom:** The vault tools (`vault_resolve`, `vault_status`, etc.) are not available after running `vault-mcp init`.

**Cause:** Claude Code loads MCP servers at startup. If you ran `init` while Claude Code was already open, the vault entry in `.mcp.json` was not loaded.

**Fix:** Restart Claude Code.

**Verify:** Check that `~/.claude/.mcp.json` contains a `"vault"` entry:
```json
{
  "vault": {
    "command": "node",
    "args": ["/path/to/vault-mcp/src/server.mjs", "serve"]
  }
}
```

If the entry is missing, re-run `vault-mcp init`.

---

## Scan is slow or times out

**Symptom:** `vault-mcp scan` takes a long time or the session-start hook is slow.

**Cause:** `scan_dirs` points to directories with many files, or to a path that contains large subdirectories (like `node_modules` in a project root).

**Fix:** Narrow the `scan_dirs` to specific squad/skill directories rather than broad paths:

```yaml
# Instead of:
scan_dirs:
  - ~/Documents

# Use:
scan_dirs:
  - ~/Documents/squads/design
  - ~/Documents/squads/marketing
```

Also verify the `ignore` list includes noisy directories:
```yaml
ignore:
  - node_modules
  - .git
  - dist
  - build
  - .next
```

---

## vault_resolve returns no matches or irrelevant results

**Symptom:** `vault_resolve` returns an empty `matches` array, or the top results don't match the task.

**Causes and fixes:**

**1. Catalog is empty or stale.** Run `vault-mcp scan --stats` to check the asset count and last scan time. If stale, run `vault-mcp scan`.

**2. Skills lack descriptions.** The resolver scores `what`, `when`, and `delivers` fields. Skills discovered only from file names (no manifest, no frontmatter) have no description text to score against. Fix: enrich the relevant manifests. See [MANIFESTS.md](./MANIFESTS.md).

**3. Task description is too abstract.** The resolver extracts keywords and removes stop words. A task like "help me" produces no usable keywords. Use concrete terms: `create accessibility audit for landing page`.

**4. No relevant skills in the vault.** Run `vault_search` with just a keyword to browse what's available: `vault_search({ query: "design" })`.

---

## Symlinks are broken

**Symptom:** `vault_status` shows installed skills, but slash commands don't work. Or the session-start hook reports `[vault] broken symlink: skill-name.md`.

**Cause:** A skill file was moved or deleted after being loaded.

**Fix:**

1. Run `vault_status` to see the catalog state.
2. Run `vault-mcp scan` to refresh paths.
3. If the skill file no longer exists, unload it: `vault_unload({ id: "squad:type:name" })`
4. If the file was moved, reload it: `vault_load({ id: "squad:type:name" })`

To check symlinks manually:
```bash
ls -la ~/.claude/commands/
```
Broken symlinks appear in red or with `->` pointing to a non-existent path.

---

## `vault-mcp init` fails with "cannot write .mcp.json"

**Symptom:** Init completes but prints a warning about `.mcp.json`.

**Cause:** `~/.claude/.mcp.json` doesn't exist yet, or has permission issues.

**Fix:**
```bash
# Create an empty .mcp.json if it doesn't exist
echo '{}' > ~/.claude/.mcp.json

# Then re-run init
vault-mcp init
```

---

## Profile not detected by vault_profile

**Symptom:** `vault_profile` returns `{ profile: null }` even though `.vault-profile.yaml` exists in the project.

**Cause:** The `cwd` used by the MCP server doesn't match the project directory. The server defaults to `process.cwd()`, which may differ from the Claude Code working directory.

**Fix:** Pass the explicit path:
```json
{ "cwd": "/path/to/your/project" }
```

---

## Forge candidates not showing up

**Symptom:** `vault-mcp forge list` shows no candidates even after calling `vault_suggest`.

**Cause:** `CANDIDATES_DIR` (`~/.claude/vault/candidates/`) doesn't exist.

**Fix:** Run `vault-mcp init` to create the directory structure. Then retry `vault_suggest`.

---

## Node version error

**Symptom:** `SyntaxError` or `ERR_FEATURE_UNAVAILABLE` when running vault-mcp.

**Cause:** Node.js version is below 18.

**Fix:**
```bash
node --version  # must be >= 18.0.0
```

Use `nvm`, `fnm`, or your OS package manager to install a compatible version.

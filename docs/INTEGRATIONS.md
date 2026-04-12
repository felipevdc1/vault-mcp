# Integrations

**Author:** Felipe Vieira Domingues Carneiro

vault-mcp works standalone without any integrations. The two optional integrations — **mempalace** and **codebase-memory-mcp** — improve resolver quality over time by adding cross-session memory and stack-aware context.

---

## Standalone mode (no integrations)

Without integrations, vault-mcp uses:
- Static skill tags and descriptions for matching
- Usage frequency tracked locally in `~/.claude/vault/usage.json`
- Project domains from `.vault-profile.yaml` for context boost

This is fully functional. Integrations are additive, not required.

---

## mempalace

### What it activates

When mempalace is detected, vault-mcp can:
- **Write usage events** to mempalace diary — each time a skill resolves a task, vault logs the outcome so future sessions remember which skills worked for which project types
- **Context boost** — read project context from mempalace knowledge graph and use it to amplify relevant skills in `vault_resolve`

### Integration config

```yaml
integrations:
  mempalace:
    enabled: auto       # auto-detects from ~/.claude/.mcp.json
    usage_diary: true   # write skill usage to mempalace diary
    context_boost: true # use mempalace context to boost resolver scores
```

### How to install mempalace

mempalace is a separate MCP server. After installing it and registering it in `~/.claude/.mcp.json`, run:

```bash
vault-mcp init
```

The init process will detect mempalace and update `config.yaml` accordingly. No manual config change needed.

### Detection logic

During `init` (and on each run), vault checks `~/.claude/.mcp.json` for any key containing `mempalace` (case-insensitive). If found, `integrations.mempalace.detected` is set to `true` in config.

---

## codebase-memory-mcp

### What it activates

When codebase-memory-mcp is detected, vault-mcp can use the indexed knowledge graph of the current codebase to understand the project's tech stack more precisely — improving domain-aware skill suggestions even without a `.vault-profile.yaml`.

```yaml
integrations:
  codebase_memory:
    enabled: auto       # auto-detects from ~/.claude/.mcp.json
    stack_aware: true   # use indexed stack info for domain-aware suggestions
```

### How to install

Install codebase-memory-mcp and register it in `~/.claude/.mcp.json`, then run `vault-mcp init`. The integration will be auto-detected.

### Detection logic

During `init`, vault checks `~/.claude/.mcp.json` for any key containing `codebase-memory` or `codebase_memory` (case-insensitive).

---

## Integration detection at init

The full detection output from `vault-mcp init`:

```
Integrations detected:
  mempalace:        found
  codebase-memory:  not found (optional)
```

If an integration is not found, a warning is printed with installation hints. The init process continues regardless — integrations are optional.

---

## Checking integration state

After init, `config.yaml` reflects detected state:

```yaml
integrations:
  mempalace:
    enabled: auto
    usage_diary: true
    context_boost: true
    detected: true
  codebase_memory:
    enabled: auto
    stack_aware: true
    detected: false
```

The `detected` field is written by init and is informational — it does not override `enabled`. If `enabled: auto`, the server re-detects at runtime.

---

## vault-sync hook

The `integrations/vault-sync.cjs` file is a Claude Code session-start hook that runs in the background on every session. It:

1. Checks catalog age — if `catalog.json` is older than 24 hours, triggers a background `vault-mcp scan --quick`
2. Verifies symlinks in `~/.claude/commands/` — warns about broken symlinks
3. Detects `.vault-profile.yaml` in the current working directory

### Installing the hook

Copy `integrations/vault-sync.cjs` to your Claude Code hooks directory and register it as a `SessionStart` hook in your Claude Code settings.

The hook is non-blocking (always exits 0) and is designed to complete in under 500ms.

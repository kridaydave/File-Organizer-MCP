# Migration Guide: v3.x to v5.0

This guide helps you migrate File Organizer MCP from v3.x to v5.0. v5 is a
ground-up rebuild: the server is stateless, the tool set is smaller, and
scheduled watching moved out of the server process. Most users upgrade with
one command; the sections below cover the few things that moved.

## Node.js requirement

v5 requires **Node.js 20.0.0 or higher**. v3.x ran on Node 18. Check your
version with:

```bash
node --version
```

## What carries over untouched

- **`config.json`** — the format is unchanged. Allowed directories, custom
  categorization rules, and preferences survive the upgrade.
- **`history.jsonl` and rollback manifests** — undo history on disk stays
  readable. Operations recorded before the upgrade can still be rolled back.
- **MCP clients** — v5 serves the 2026-07-28 stateless protocol but
  negotiates the era per connection. Clients using the 2025 `initialize`
  handshake (Claude Desktop, Cursor, Codex, OpenCode) keep working without
  configuration changes.

## Breaking changes

### Watch tools moved to a standalone CLI

The watch tools are removed from the MCP server:

- `file_organizer_watch_directory`
- `file_organizer_unwatch_directory`
- `file_organizer_list_watches`

Scheduled watching is now managed by a separate binary,
`file-organizer-watch`, that runs outside the server process:

```bash
file-organizer-watch add ~/Downloads "0 10 * * *"   # daily at 10am
file-organizer-watch list
file-organizer-watch                                # start the daemon
```

If you had watches configured in v3.x, recreate them with the CLI. It is a
one-time job per directory.

### Content tools replaced

These tools are removed:

- `organize_smart`
- `organize_by_content`
- the `screen_files` flag

The bundled PDF and Word document parsers (`pdf-parse`, `mammoth`) are gone
with them. `organize_by_project` replaces content-based grouping using
deterministic, local-only signals: shared name tokens, content terms from
plain text files, and identifier markers. It adds no dependencies and runs
in milliseconds.

If you depend on the removed tools, stay on 3.4.2 (see below).

## Migration steps

### Step 1: Upgrade the package

```bash
npm install -g file-organizer-mcp@latest
```

### Step 2: Recreate watches (if you had any)

```bash
file-organizer-watch add <directory> "<cron expression>"
```

Repeat for each directory you watched in v3.x, then start the daemon:

```bash
file-organizer-watch
```

### Step 3: Restart your MCP client

The server command (`file-organizer-mcp`) and stdio transport are
unchanged, so your client configuration needs no edits. Restart the client
so it picks up the new server version.

## Staying on v3.4.2

If you depend on the removed content tools, pin the old version:

```bash
npm install -g file-organizer-mcp@3.4.2
```

Nothing in v5 forces an upgrade, and v5 will not change anything on your
machine without you asking it to.

## Related docs

- [CHANGELOG.md](CHANGELOG.md) - full v5.0.0 change list
- [README.md](README.md) - setup and configuration
- [ARCHITECTURE.md](ARCHITECTURE.md) - the v5 architecture
- [API.md](API.md) - the 22-tool reference

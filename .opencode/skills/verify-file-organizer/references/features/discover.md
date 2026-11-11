# Discover and diagnose

Answer "is this server healthy and what can it do" without reading source.

## Sub-features

- `doctor`: effective configuration after defaults and `config.json` are layered,
  plus a flag on every allowed directory that is missing or blocked.
- `tools/list`: every advertised tool with schemas and annotations.
- `get_categories`: the category taxonomy the classifier uses.

## How to get to it (client POV)

Call `file_organizer_doctor` with no arguments. It is the only tool with an
empty `required` array, so it is safe to call first on a fresh install.

## Driving it

```bash
C=.opencode/skills/verify-file-organizer/scripts/control-file-organizer.mjs

node $C doctor
node $C tools --filter organize
node $C schema organize_files
node $C call get_categories --json
```

`node $C doctor` is the harness-level health check. `node $C call doctor --json`
is the tool-level one. Run the harness first; it tells you whether the build
exists and the handshake works before you blame a tool.

## Observable end state

`doctor` reports `"ok": true` and a non-zero `checks[].ok` count matching the
tool count. A sandbox-scoped `doctor` call returns `config_file_present: true`
and lists the fixture directory under allowed directories.

## Gotchas

- **`doctor` reports the config the current process reads, which under the
  harness is the sandbox.** To check a real install, run it against that
  install's `HOME`.
- **All four state locations share one base.** `getConfigDirectory()` in
  `src/core/config/paths.ts` decides where `config.json`, `operations.jsonl`, the
  rollback manifests and the backups live, and `XDG_CONFIG_HOME` or `APPDATA`
  relocates all of them together on Linux and Windows. macOS keeps the platform's
  Application Support convention and ignores `XDG_CONFIG_HOME`. Two exceptions
  exist under jest, where rollback manifests and backups deliberately fall back
  to the worktree so a test run never writes into the real config dir.
- **The tool list is the registry, not a doc.** `registry.ts` is the source of
  truth. If `API.md` and `tools/list` disagree, `tools/list` is right.

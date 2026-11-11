# Scheduling recipes

Three ways to run `file_organizer_scan_directory` + `file_organizer_preview_organization`
on a schedule. Every recipe here is read-only: it reports what would move and
leaves the files where they are. Applying moves is a separate, explicit step
(`file_organizer_organize_files`, or `file-organizer-watch once <dir> --apply`).

| Surface            | Config                                              | Trigger                     |
| ------------------ | --------------------------------------------------- | --------------------------- |
| Claude Desktop     | [claude-desktop.config.json](claude-desktop.config.json) | headless `claude -p` |
| Codex              | [codex.config.toml](codex.config.toml)              | `codex exec`                |
| cron / systemd     | –                                                    | `file-organizer-watch once` |

## Before any of them

- The target directory has to be inside your allowed directories. Check with
  `file_organizer_doctor`, which prints the effective config, or add it with
  `customAllowedDirectories` in `config.json`.
- Both tools take a `directory` (full path), plus `response_format`
  (`markdown` or `json`). `scan_directory` also takes `include_subdirs` and
  `max_depth`; `preview_organization` takes `show_conflicts_only` and
  `conflict_strategy` (`rename`, `skip`, `overwrite`). See
  [API.md](../../API.md) for the full shapes.
- The examples sweep `~/Downloads`. Change that one path to sweep another
  folder; it is the only thing the prompts care about.

## 1. Claude Desktop

Desktop itself has no scheduler. Register the server, then let an OS timer run
the same sweep through headless Claude Code.

Add the `mcpServers` block from
[claude-desktop.config.json](claude-desktop.config.json) to your Desktop config:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

Then run the sweep by hand once, from the directory you want swept:

```bash
claude -p "Scan ~/Downloads and preview the organization plan. Do not move anything." \
  --allowedTools "mcp__file-organizer__file_organizer_scan_directory,mcp__file-organizer__file_organizer_preview_organization" \
  --permission-mode plan
```

`--permission-mode plan` keeps the session read-only, and `--allowedTools` limits
it to the two scan tools, so the sweep cannot move a file even if the prompt is
edited. The same file works for Claude Code's `--mcp-config` if you would rather
not touch the Desktop config.

## 2. Codex

Append the block from [codex.config.toml](codex.config.toml) to `~/.codex/config.toml`
(or a project-scoped `.codex/config.toml`). Then:

```bash
codex exec --sandbox read-only \
  "Scan ~/Downloads and preview the organization plan. Do not move anything."
```

`codex exec` defaults to a read-only sandbox, so the sweep can read the folder
and report a plan but not change it. The config sets
`default_tools_approval_mode = "writes"`: both tools declare `readOnlyHint`, so
they run unattended while anything else from that server would still prompt.

`codex mcp list` shows the server after a restart.

## 3. cron / systemd

No model in the loop. `file-organizer-watch once` runs one scan, prints the plan,
exits 0 on a clean pass and 1 on a partial or aborted one, and holds no handle
open — which is what an OS timer wants.

```bash
file-organizer-watch once ~/Downloads --dry-run     # report, write nothing
file-organizer-watch once ~/Downloads --apply       # move, then exit
```

Copy the lines in [crontab.example](crontab.example), or the units in
[systemd/](systemd/):

```bash
crontab -l | cat - crontab.example | crontab -
```

```bash
systemctl --user link systemd/file-organizer-sweep.service systemd/file-organizer-sweep.timer
systemctl --user enable --now file-organizer-sweep.timer
systemctl --user list-timers file-organizer-sweep.timer
```

Add `--recursive` to include subdirectories; the default is the top directory
only. The unit takes the folder from `WATCH_DIR` and writes to one log file, so
a second folder is a drop-in (`systemctl --user edit file-organizer-sweep.service`),
not a second unit.

## Which one to pick

- Want a written report a human reads: cron or systemd, no model cost.
- Want the sweep explained ("three PDFs are duplicates of files already in
  Documents"): Claude Desktop or Codex, on an OS timer.
- Want files moved on a schedule without a human in the loop: `once --apply`
  from cron/systemd. Moves land in history and `file_organizer_undo_last_operation`
  can roll the last one back.
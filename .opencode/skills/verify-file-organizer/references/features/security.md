# Stay inside the sandbox

The path validator runs on every tool call. This is the cross-cutting feature:
it is not one tool but the guarantee under all 24. Prove it whenever you touch
`path-validator.service.ts`, `path-security`, or config loading.

## Sub-features

- Whitelist plus blacklist of paths.
- Per-component symlink containment, so a link cannot escape its allowed root.
- `O_NOFOLLOW` on open, to close the check-then-use race.
- Windows reserved-name rejection (`CON`, `PRN`, `AUX`, `NUL`, `COM1`-`9`,
  `LPT1`-`9`).
- Path redaction in error output.

## How to get to it (client POV)

There is nothing to opt into. Call any tool with a path you should not be able to
reach and confirm the call fails. A security feature with no observable failure
mode is not verified.

## Driving it

```bash
C=.opencode/skills/verify-file-organizer/scripts/control-file-organizer.mjs
D=/tmp/file-organizer-verify/default/data

node $C sandbox --fresh

# 1. parent traversal, rejected by the schema layer
node $C call scan_directory --directory "$D/../" --json

# 2. a real directory outside the allowed set
node $C call scan_directory --directory /home/kriday/Documents --json

# 3. a symlink pointing out of the sandbox
ln -sfn /etc $D/escape
node $C call scan_directory --directory $D/escape --json
rm -f $D/escape

# 4. which directories are actually permitted
node $C call doctor --json
```

## Observable end state

Each of the three returns `isError: true` with a distinct reason: "Path cannot
contain parent directory traversal", "Path is outside allowed directories", and
"Path matches blocked pattern (system directory or protected location)". The
offending path appears as `[PATH]`, never verbatim. `doctor` lists the sandbox
fixture directory as permitted and flags any allowed directory that is missing.

## Gotchas

- **The three rejections come from different layers.** Traversal is a schema
  rejection, allow-list is the validator, and a symlink into a system path is the
  blacklist. A test that only covers one of them proves a fraction of the
  guarantee.
- **Error messages triple their prefix**, reading
  `Access Denied: Access denied: Access Denied:`. Match on the reason substring,
  never on the whole string.
- **The symlink case resolves before the allow-list check**, so a link to `/etc`
  reports the blocked-pattern reason rather than the outside-allowed one. Both
  are correct denials; do not assert a specific one.
- **`doctor` is the way to debug a rejection.** The access-denied text tells you
  to edit a config file without saying which one. `doctor` names the effective
  config and explains which allowed directory is the problem.
- **Prove the deny cases in the sandbox.** The point of the harness is that a
  real home directory, which is usually on the allow list, is never the thing
  under test.
- **The reserved-name check covers only the final path component.** A path like
  `.../Downloads/CON/ok.txt` passes every check, because each implementation
  inspects the basename of the string it is given. Six call sites implement this
  with three different regexes. `src/core/detect/tokens.ts` around line 94 is the
  most complete: it strips trailing dots and spaces before matching, which is what
  makes `CON .txt` and `NUL ` safe on Windows. The other five miss that case, and
  none reject the superscript digits `COM1`-`COM3` that Windows also reserves.
- **Traversal can hide in a derived destination.** `local_fallback_prefix` and
  `unknown_date_folder` were bare `z.string()` schema fields whose values get
  joined onto a validated directory, so `"../../../../etc/cron.d"` escaped the
  allow-list while the input path validated cleanly. Both now reject separators
  and `..`. When you add a schema field that becomes part of a path, check
  whether it needs more than `z.string()`.
- **`mcp-wl` allow-override sits in the production whitelist.**
  `src/utils/path-security.ts` around line 198 grants access when both the
  requested path and some allowed dir contain the substring `mcp-wl`, for Windows
  8.3 temp-dir names on CI. It is gated to win32 and the inner loop still does a
  real prefix comparison, so it is not a live bypass. Test-harness logic living
  in the security boundary is the kind of thing that gets "simplified" into a
  vulnerability later.
- **Real absolute paths appear in success payloads.** `organize_files` returns
  full `from` and `to` per action; `delete_duplicates` returns per-file paths
  with raw error messages. That is by design, so a test asserting "no paths leak"
  must target the error path, not the success path. Redaction is enforced by
  `sanitizeErrorMessage` and the `FileOrganizerError` branch.
- **`settings.enablePathValidation` in config.json is inert.** It is accepted,
  surfaced by `doctor`, and reported to the user, but the validator reads a
  hardcoded global that is always true. It fails secure today. If anyone wires it
  up it becomes a global off-switch for the whole boundary, so it should be
  dropped from the reported config rather than honored.
- **The documented layer count was wrong.** Several docs described "8 layers"
  with definitions that matched neither the code nor each other, and one listed
  layer (the access check) never runs on the default tool path. ARCHITECTURE.md
  and SECURITY.md now describe the pipeline `validatePathBase` implements and
  mark the two conditional steps.

# File Organizer MCP Framework

The full tour of the system lives in [`../ARCHITECTURE.md`](../ARCHITECTURE.md). Key terms: **tool** (one MCP tool), **service** (business logic behind a tool), **environment** (one running server + its allowed directories + OS), **turn** (one tool call cycle), **K5 home** (the OS config dir holding `config.json` and `operations.jsonl`). See `../AGENTS.md` for the full glossary.

## Path validation pipeline

Every path goes through `validatePathBase` before any `fs` call
(`src/services/path-validator.service.ts`). See
[`../ARCHITECTURE.md`](../ARCHITECTURE.md#path-validation-pipeline) for the
ordered list.

## Related docs

| Document             | Purpose                             |
| -------------------- | ----------------------------------- |
| `../ARCHITECTURE.md` | System structure and security model |
| `../API.md`          | MCP tool reference                  |
| `../SECURITY.md`     | Security guidelines                 |
| `../CONTRIBUTING.md` | Contribution workflow               |
| `../AGENTS.md`       | Rules for agents and humans         |
| `skills/SKILL.md`    | Long-form dev guide                 |

## Proving a change

`.opencode/skills/verify-file-organizer/` drives the real server over stdio in a
throwaway sandbox. Unit tests call handlers directly and do not prove a tool is
reachable by name or that a move lands on disk.

```bash
C=.opencode/skills/verify-file-organizer/scripts/control-file-organizer.mjs
node $C doctor
node $C call organize_files --directory /tmp/file-organizer-verify/default/data \
  --dry_run false --conflict_strategy rename --json
node $C call undo_last_operation --json
node $C cleanup
```

`references/features/` inside that skill documents each capability and how to
drive it.

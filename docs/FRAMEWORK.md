# File Organizer MCP Framework

The full tour of the system lives in [`../ARCHITECTURE.md`](../ARCHITECTURE.md). Key terms: **tool** (one MCP tool), **service** (business logic behind a tool), **environment** (one running server + its allowed directories + OS), **turn** (one tool call cycle), **K5 home** (the OS config dir holding `config.json` and `operations.jsonl`). See `../AGENTS.md` for the full glossary.

## Path validation pipeline

Every path goes through 8 layers before any `fs` call (`src/services/path-validator.service.ts`, `validateStrictPath`):

1. Type validation (Zod schema)
2. Null byte and basic sanitization
3. Path normalization and Windows case adjustment
4. Traversal sequence prevention (`../`)
5. Absolute path resolution
6. Security check (whitelist and blacklist)
7. Symlink resolution and target validation
8. Existence and access check

## Related docs

| Document             | Purpose                             |
| -------------------- | ----------------------------------- |
| `../ARCHITECTURE.md` | System structure and security model |
| `../API.md`          | MCP tool reference                  |
| `../SECURITY.md`     | Security guidelines                 |
| `../CONTRIBUTING.md` | Contribution workflow               |
| `skills/SKILL.md`    | Repo dev skill                      |

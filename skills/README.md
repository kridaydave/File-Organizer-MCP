# File Organizer MCP - Skills

This directory contains Kimi skills for working with the File Organizer MCP codebase.

## Skills

### file-organizer-dev.skill

A developer skill for coding in the File Organizer MCP project. This skill provides:

- Project architecture overview
- Build, test, and lint commands
- Step-by-step guide for adding new MCP tools
- Step-by-step guide for adding new services
- Security guidelines (8-layer path validation)
- Testing patterns and templates
- Code style conventions
- Common utilities reference
- Key types reference
- Debugging tips

**When to use:** Use this skill when you need to add new features, fix bugs, write tests, or modify the File Organizer MCP server codebase.

## Installation

To install these skills in Kimi Code CLI:

1. Copy the `.skill` file to your skills directory:
   - Windows: `%APPDATA%\Code\User\globalStorage\moonshot-ai.kimi-code\.kimi\skills\`
   - Or: `~/.kimi/skills/`

2. Or extract to the directory:
   ```bash
   unzip file-organizer-dev.skill -d ~/.kimi/skills/file-organizer-dev/
   ```

## Usage

Once installed, the skill will automatically trigger when you work on the File Organizer MCP codebase. It will help you:

- Add new MCP tools following the established patterns
- Implement security-hardened file operations
- Write proper tests
- Follow code conventions
- Handle errors correctly

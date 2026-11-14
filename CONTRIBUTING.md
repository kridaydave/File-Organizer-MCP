# Contributing to File Organizer MCP

Thank you for considering contributing to File Organizer MCP! This document provides guidelines and instructions for contributing.

## 🔒 Security First

This project prioritizes security. All contributions must maintain or improve the security posture of the application.

### Reporting Security Vulnerabilities

> **⚠️ DO NOT open public issues for security vulnerabilities**

Instead, email security concerns to: **<technocratix902@gmail.com>**

We will respond within 48 hours and work with you to address the issue.

## 📋 Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Welcome newcomers and help them get started
- Maintain professional communication

## 🚀 Getting Started

### Prerequisites

- Node.js v18.0.0 or higher
- [Bun](https://bun.sh) 1.4.3 or higher (build and type checking)
- Git
- A code editor (VSCode recommended)

### Setting Up Development Environment

```bash
# 1. Fork and clone the repository
git clone https://github.com/YOUR_USERNAME/File-Organizer-MCP.git
cd File-Organizer-MCP

# 2. Install dependencies
npm install

# 3. Build the project (type checks, then writes dist/)
npm run build

# 4. Run tests
npm test
```

## 🏗️ Project Structure

```
File-Organizer-MCP/
├── src/
│   ├── services/      # Core business logic
│   ├── tools/         # MCP tool implementations
│   ├── utils/         # Helper functions
│   ├── schemas/       # Zod validation schemas
│   └── types.ts       # TypeScript type definitions
├── tests/
│   ├── unit/          # Unit tests
│   ├── integration/   # Integration tests
│   └── performance/   # Performance benchmarks
└── dist/              # Compiled output
```

## 📝 Development Guidelines

### Code Style

We use ESLint and Prettier for code formatting:

```bash
# Run linter
npm run lint

# Auto-fix linting issues
npm run lint:fix

# Format code
npm run format
```

### TypeScript

Type checking is `bun check` and the build is `bun build`, so `npm run build`
fails on a type error just as `tsc` did. Both read `tsconfig.json`.

- Use strict type checking
- Avoid `any` - use proper types
- Document complex types with JSDoc comments
- Use ESM imports with `.js` extensions
- New `.ts` files under `src/` and `scripts/` are picked up automatically; only
  excluded names need touching `scripts/build.mjs`

### Naming Conventions

- **Files**: `kebab-case.ts` (e.g., `path-validator.service.ts`)
- **Classes**: `PascalCase` (e.g., `PathValidatorService`)
- **Functions**: `camelCase` (e.g., `validatePath`)
- **Constants**: `SCREAMING_SNAKE_CASE` (e.g., `MAX_FILE_SIZE`)

## 🧪 Testing

### Writing Tests

All new features and bug fixes must include tests:

```typescript
import { jest } from '@jest/globals';
import { YourService } from '../src/services/your-service.js';

describe('YourService', () => {
  it('should do something', () => {
    const service = new YourService();
    expect(service.doSomething()).toBe(expected);
  });
});
```

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test tests/unit/services/your-service.test.ts

# Run tests with coverage
npm run test:coverage
```

### Test Requirements

- ✅ Unit tests for all service methods
- ✅ Integration tests for MCP tools
- ✅ Security tests for validation logic
- ✅ Edge case coverage

## 🔐 Security Guidelines

### Input Validation

Always validate and sanitize user inputs:

```typescript
// ✅ Good
const result = PathSchema.safeParse(inputPath);
if (!result.success) {
  throw new ValidationError('Invalid path');
}

// ❌ Bad
const filePath = userInput; // No validation
```

### Path Traversal Prevention

Use the `PathValidatorService` for all path operations:

```typescript
// ✅ Good
import { validateStrictPath } from './services/path-validator.service.js';
const validPath = await validateStrictPath(userPath, allowedRoots);

// ❌ Bad
const fullPath = path.join(baseDir, userPath); // Unsafe
```

### Error Handling

Never expose internal paths in error messages:

```typescript
// ✅ Good
throw new ValidationError('Path validation failed');

// ❌ Bad
throw new Error(`Invalid path: ${internalPath}`);
```

## 📤 Contribution Workflow

### 1. Create an Issue

Before starting work, create an issue describing:

- The problem or feature request
- Proposed solution (if applicable)
- Any breaking changes

### 2. Fork and Branch

```bash
# Create a feature branch
git checkout -b feature/amazing-feature

# Or a bugfix branch
git checkout -b fix/issue-123
```

### 3. Make Changes

- Write clean, documented code
- Follow existing code style
- Add tests for new features
- Update documentation

### 4. Test Thoroughly

```bash
# Run all tests
npm test

# Check linting
npm run lint

# Build the project
npm run build
```

### 5. Commit

Use conventional commit messages:

```bash
# Features
git commit -m "feat: add new categorization rule"

# Bug fixes
git commit -m "fix: resolve path traversal issue"

# Documentation
git commit -m "docs: update API reference"

# Tests
git commit -m "test: add edge case for organizer"
```

### 6. Push and Create PR

```bash
git push origin feature/amazing-feature
```

Create a Pull Request with:

- Clear description of changes
- Link to related issue(s)
- Screenshots (if UI changes)
- Test results

## 🎯 Areas for Contribution

### High Priority

- 🔒 Security enhancements and audits
- 🧪 Test coverage improvements
- 📚 Documentation improvements
- 🐛 Bug fixes

### Feature Ideas

- Custom categorization rules UI
- Advanced duplicate detection algorithms
- Cloud storage integration
- Batch processing improvements
- Performance optimizations

### Good First Issues

Look for issues labeled `good-first-issue` - these are great starting points for new contributors.

## 📚 Documentation

Update relevant documentation when making changes:

- **README.md** - User-facing documentation
- **ARCHITECTURE.md** - Technical architecture
- **JSDoc comments** - In-code documentation
- **CHANGELOG.md** - Version history

## ✅ Pull Request Checklist

Before submitting your PR, ensure:

- [ ] Code follows project style guidelines
- [ ] All tests pass (`npm test`)
- [ ] No linting errors (`npm run lint`)
- [ ] New tests added for new features
- [ ] Documentation updated
- [ ] Commit messages follow conventions
- [ ] PR description is clear and complete
- [ ] No merge conflicts
- [ ] Security implications considered

## 🤝 Review Process

1. **Automated Checks** - CI runs tests and linting
2. **Code Review** - Maintainers review your code
3. **Feedback** - Address any requested changes
4. **Approval** - Once approved, PR will be merged
5. **Release** - Changes included in next release

## 📞 Getting Help

- **Questions**: Open a discussion on GitHub
- **Issues**: Check existing issues or create new one
- **Email**: <technocratix902@gmail.com>

## 🙏 Recognition

Contributors will be recognized in:

- README.md acknowledgments
- CHANGELOG.md release notes
- GitHub contributors page

Thank you for contributing to File Organizer MCP! 🎉

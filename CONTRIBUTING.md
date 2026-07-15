# Contributing to Cambium SDK

Thank you for your interest in contributing to the Cambium Protocol SDK.

## Getting Started

1. Fork and clone the repository
2. Install dependencies: `npm install`
3. Create a feature branch: `git checkout -b feat/my-feature`

## Development Workflow

### Build

```bash
npm run build
```

### Type Check

```bash
npm run typecheck
```

### Lint

```bash
npm run lint
```

### Test

```bash
# Run all tests
npm run test

# Unit tests only
npm run test:unit

# Integration tests (requires testnet deployment)
npm run test:integration
```

## Code Style

- TypeScript with strict mode
- No comments in code unless requested
- All public methods must have JSDoc documentation
- Error handling must use the SDK's error hierarchy (`CambiumError` subclasses)
- Write methods (state-changing) return unsigned transactions by default
- Read methods return parsed data directly

## Commit Convention

Use conventional commit messages:

- `feat:` for new features
- `fix:` for bug fixes
- `test:` for test additions/changes
- `docs:` for documentation
- `chore:` for tooling and configuration
- `ci:` for CI/CD changes

## Pull Requests

1. Ensure all checks pass (typecheck, lint, build, tests)
2. Keep PRs focused on a single change
3. Add tests for new functionality
4. Update documentation if the public API changes

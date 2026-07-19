# Contributing to nestjs-sunset

Thank you for your interest. This guide explains how to contribute effectively.

## Before you start

- Check [open issues](https://github.com/ledevnovice/nestjs-sunset/issues)
- For significant changes, open an issue first to align on the approach.
- All contributions are subject to the [MIT License](./LICENSE).

## Development setup

**Prerequisites**: Node.js ≥ 20, npm ≥ 10, git.

```bash
git clone https://github.com/ledevnovice/nestjs-sunset.git
cd nestjs-sunset
npm install
```

## Key commands

| Command                 | Description                               |
| ----------------------- | ----------------------------------------- |
| `npm run build`         | Compile TypeScript → `dist/` via tsdown   |
| `npm run test`          | Run unit and integration tests (Vitest)   |
| `npm run test:coverage` | Run tests with coverage report            |
| `npm run typecheck`     | TypeScript type check (`tsc --noEmit`)    |
| `npm run lint`          | ESLint                                    |
| `npm run format`        | Prettier — format all files               |
| `npm run format:check`  | Prettier — check without writing          |
| `npm run lint:pkg`      | Validate package exports (publint + attw) |

## Commit messages

This project enforces [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(registry): add onSunsetApproaching hook
fix(interceptor): inject headers before next.handle() on Fastify
docs(readme): add quick start section
chore(deps): update vitest to v4.2.0
```

A `commit-msg` hook (via Husky) validates your messages automatically.

## Pull request process

1. Fork, create a feature branch, make your changes.
2. Ensure all checklist items in the PR template are checked.
3. Update `CHANGELOG.md` under `[Unreleased]`.
4. Open a PR and CI will run automatically.

## Code of conduct

See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

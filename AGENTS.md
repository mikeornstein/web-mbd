# Agent instructions

This is a Vite + TypeScript client-side CAE app. Product context is in [README.md](README.md). How to contribute is in [CONTRIBUTING.md](CONTRIBUTING.md). Drive the running app with [verify-web-mbd](.grok/skills/verify-web-mbd/SKILL.md).

## Commands

```bash
pnpm install
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

Node 22+ and pnpm 10. `packageManager` in `package.json` is the source of truth.

## Git

- Do not commit on `main`. Do not push to `main`.
- Branch from `origin/main`. Prefer a git worktree.
- Commit message: `type(scope): subject` with `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, or `perf`.
- Open every PR ready, not draft. Target `main` unless stacking onto a parent branch.
- Before push: `pnpm lint && pnpm typecheck && pnpm test`.
- Land with `gh pr merge --squash`. Wait until the check named `CI` is green.

## Proof

A green typecheck is not a pass. For UI changes, drive the running production preview (`pnpm test:e2e` or the verify skill) and capture the heading or the changed control. For logic changes, add a Vitest case that fails before the fix.

## TypeScript

Discriminated unions over optional-field bags. `unknown` at boundaries, never `any`. No `as` except after a successful parse. Exhaustive `switch` with `const _exhaustive: never = x` in the default arm.

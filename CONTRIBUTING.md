# How to contribute

## Setup

Install Node.js 22 or newer and pnpm 10.

```bash
pnpm install
pnpm dev
```

## Checks

Run these before you push:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

`pnpm test:e2e` builds `dist` and drives that preview in Chromium. That is the same artifact GitHub Pages publishes.

## Pull requests

1. Branch from `main`. Do not commit on `main`.
2. Use a Conventional Commits subject: `type(scope): subject`.
3. Fill the PR template (Why, Scope, Tradeoffs, Blast Radius, Verification). Drop a section when it is empty.
4. Open the PR ready, not as a draft.
5. Wait for the check named `CI`. Squash-merge.

`main` is protected. Direct pushes are rejected.

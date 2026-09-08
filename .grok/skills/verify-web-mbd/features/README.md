# web-mbd verification map

Index of user-facing behavior. Read this first, then the matching feature file.

## Baseline preconditions

- Production preview at `http://127.0.0.1:4173` from `pnpm build && pnpm preview --host 127.0.0.1 --port 4173 --strictPort`, or `pnpm test:e2e` which starts that server.
- `curl -fsS http://127.0.0.1:4173` returns 200.
- The document heading is `web-mbd`.
- Never drive an instance this run did not start.

## Driving conventions

- Prefer ARIA roles and accessible names.
- Treat Playwright locators as literal.
- Restore nothing between cases unless a feature file says otherwise.

## Proof and skip reporting

- UI proof is an accessible heading plus a screenshot in `e2e/artifacts/`.
- Record the feature ID with the artifact.
- Do not report a skipped entry point as verified through a different path.

## Features

- [Home / workbench](./home.md) covers research → pre → solve → post.

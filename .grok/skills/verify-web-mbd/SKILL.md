---
name: verify-web-mbd
description: Drive the web-mbd browser app and prove user-visible behavior. Use when verifying UI changes, checking the landing page, or proving a feature against the running production preview.
---

# Verify web-mbd

Primary surface: the Vite web app in this repo. Agents launch a local production preview, drive it in Chromium, and keep screenshots.

## Launch

From the repo root:

```bash
pnpm install
pnpm build
pnpm preview --host 127.0.0.1 --port 4173 --strictPort
```

Ready when `http://127.0.0.1:4173` returns 200. Teardown: kill the preview process you started, not by process name.

`pnpm test:e2e` already starts this preview via Playwright `webServer`. Prefer that command when the mapped feature has an e2e spec.

## Doctor

```bash
curl -fsS -o /dev/null -w "%{http_code}" http://127.0.0.1:4173
```

Must print `200`. Then open the page and require an `h1` whose accessible name is `web-mbd`. If the port answers with a different app, stop. Do not drive a shared instance you did not start.

## Drive

Prefer Playwright. Specs live in `e2e/`. Selectors: ARIA roles and accessible names (`getByRole("heading", { name: "web-mbd" })`), not coordinates.

```bash
pnpm test:e2e
```

For a one-off probe, reuse Playwright against `http://127.0.0.1:4173` and the same roles. Feature recipes are under [features/](features/README.md).

## Evidence

Proof artifacts go in `e2e/artifacts/` (gitignored). Keep them after cleanup.

Standards:

- Exercise the real page, not `innerHTML` assignment in a unit test, as the UI proof.
- Capture the action and the resulting heading or control, not only a final screenshot.
- Unit tests in `src/**/*.test.ts` prove module behavior. They do not replace the live page check for UI work.

## Cleanup

Stop the `pnpm preview` process you started. Leave `e2e/artifacts/` in place.

## Helpers

```bash
pnpm test:e2e
```

That command builds `dist`, serves it on `127.0.0.1:4173`, and runs `e2e/home.spec.ts`.

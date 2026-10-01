# Pre-publish preview (pull request 18)

Draft only. **Do not publish GitHub Pages.**

These screenshots are from the production preview (`pnpm build` then `pnpm preview`) of the fast-load Letter A inflate, before any public deploy.

## How to open the page locally

From the repo root:

```bash
pnpm install
pnpm build
pnpm preview --host 127.0.0.1 --port 4173 --strictPort
```

On a green pull-request check named `CI`, GitHub also stores a **non-public**
`web-mbd-preview` Actions artifact (`dist/`). Download it from the run page
and open `index.html` locally. That is **not** GitHub Pages.

Refresh the screenshots:

```bash
CAPTURE_PREVIEW=1 pnpm test:e2e -- e2e/preview.spec.ts
```

## What the shots show

| File | Viewport | View |
| --- | --- | --- |
| `landing-letter-a-desktop.png` | 1280×800 | Landing: Letter A in Pre, selected by default |
| `landing-letter-a-iphone.png` | 390×844 | Same, iPhone width |
| `research-b-labeled-c-hidden-desktop.png` | 1280×800 | Research catalog: A featured, B unvalidated demo, C hidden |
| `research-b-labeled-c-hidden-iphone.png` | 390×844 | Same, iPhone width |
| `letter-a-first-stretch-2-edges-desktop.png` | 1280×800 | Letter A post at first stretch ≥ 2, mesh edges on, WARN |
| `letter-a-first-stretch-2-edges-iphone.png` | 390×844 | Same, iPhone width |
| `letter-a-mesh-first-stretch-2-desktop.png` | mesh only | Deformed mesh at the warn freeze |
| `letter-a-mesh-first-stretch-2-iphone.png` | mesh only | Same, iPhone width |

Slow-load (quasi-static) is **not validated**. The Inflation ABC ~54 kPa figure is **not claimed**.

# Home / workbench

The app names the product, shows `mvp` status, and hosts the research → pre → solve → post workbench.

## Sub-features

- `home-heading` shows the `web-mbd` heading.
- `home-status` shows the `mvp` status label.
- `home-tagline` shows `Flexible multibody dynamics in the browser.`
- `workflow-research` lists stock models from research and can load the Taylor bar.
- `workflow-pre` shows the model tree and undeformed mesh after load.
- `workflow-solve` runs the explicit solver.
- `workflow-post` shows deformed mesh, acceptance gate, and energy history.

## How to get to it (user POV)

- Open `/` on the production preview.
- Open the GitHub Pages URL after a green `main` deploy.

## Driving it with Playwright

Preconditions:

- Preview is healthy at `http://127.0.0.1:4173`.
- Doctor has confirmed the `web-mbd` heading.

- **Open home.** Go to `/`. Run `page.goto("/")`. The heading `web-mbd` is visible.
- **Status.** `getByText("mvp", { exact: true })` is visible.
- **Load research stock.** Click `Load Taylor bar (OFHC copper)`.
- **Pre.** Heading `Pre — model inspection`, label `Model tree`, img `Undeformed mesh`.
- **Solve.** Click `Continue to solve`, then `Run solve`.
- **Post.** Heading `Post — results`, text `Acceptance gate: PASS`, imgs `Deformed mesh` and `Energy history`.
- **Spec.** `pnpm test:e2e` runs `e2e/home.spec.ts` and writes screenshots under `e2e/artifacts/`.
- **Proof.** `e2e/artifacts/home.png`, `pre.png`, `post.png`.

## Gotchas

- Drive `vite preview` of `dist`, not `pnpm dev`. Pages publishes `dist`.
- `base` is `./`. Do not assume an absolute `/assets` URL.
- The live host is `https://mikeornstein.github.io/web-mbd/`, which redirects to `http://mikeornstein.com/web-mbd/`. Local proof is always `http://127.0.0.1:4173/`.
- Full Taylor integrate is usually sub-second but allow up to 60s in CI.

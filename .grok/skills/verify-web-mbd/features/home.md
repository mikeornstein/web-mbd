# Home

The landing page names the product, states that it is greenfield, and shows the one-paragraph pitch. No solver runs here.

## Sub-features

- `home-heading` shows the `web-mbd` heading.
- `home-status` shows the `greenfield` status label.
- `home-tagline` shows `Flexible multibody dynamics in the browser.`
- `home-pitch` shows the client-side CAE pitch.

## How to get to it (user POV)

- Open `/` on the production preview.
- Open the GitHub Pages URL after a green `main` deploy.

## Driving it with Playwright

Preconditions:

- Preview is healthy at `http://127.0.0.1:4173`.
- Doctor has confirmed the `web-mbd` heading.

- **Open home.** Go to `/`. Run `page.goto("/")`. The heading `web-mbd` is visible.
- **Status.** Read the status text. `getByText("greenfield")` is visible.
- **Tagline.** `getByText("Flexible multibody dynamics in the browser.")` is visible.
- **Pitch.** `getByText("A client-side CAE app for nonlinear flexible multibody simulation")` is visible.
- **Spec.** `pnpm test:e2e` runs `e2e/home.spec.ts` and writes `e2e/artifacts/home.png`.
- **Proof.** Screenshot path `e2e/artifacts/home.png`. The image must show the heading `web-mbd`.

## Gotchas

- Drive `vite preview` of `dist`, not `pnpm dev`. Pages publishes `dist`.
- `base` is `./`. Do not assume an absolute `/assets` URL.
- The live host is `https://mikeornstein.github.io/web-mbd/`, which redirects to `http://mikeornstein.com/web-mbd/`. Local proof is always `http://127.0.0.1:4173/`.

export const productName = "web-mbd";
export const tagline = "Flexible multibody dynamics in the browser.";
export const statusLabel = "greenfield";
export const pitch =
  "A client-side CAE app for nonlinear flexible multibody simulation. The model, the solver, and the results stay on this machine.";

export function pageTitle(): string {
  return `${productName} · ${tagline}`;
}

import { pageTitle } from "./app.ts";
import "./style.css";
import { mountWorkbench } from "./ui/workbench.ts";

const root = document.querySelector("#app");
if (!(root instanceof HTMLElement)) {
  throw new Error("missing #app");
}

document.title = pageTitle();
mountWorkbench(root);

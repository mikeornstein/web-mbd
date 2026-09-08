import { pageTitle, pitch, productName, statusLabel, tagline } from "./app.ts";
import "./style.css";

const root = document.querySelector("#app");
if (!(root instanceof HTMLElement)) {
  throw new Error("missing #app");
}

document.title = pageTitle();

const status = document.createElement("p");
status.className = "status";
status.textContent = statusLabel;

const heading = document.createElement("h1");
heading.textContent = productName;

const lead = document.createElement("p");
lead.className = "tagline";
lead.textContent = tagline;

const header = document.createElement("header");
header.append(status, heading, lead);

const copy = document.createElement("p");
copy.textContent = pitch;

const main = document.createElement("main");
main.append(copy);

root.append(header, main);

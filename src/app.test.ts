import { expect, test } from "vitest";
import { pageTitle, productName, statusLabel } from "./app.ts";

test("pageTitle includes the product name", () => {
  expect(pageTitle()).toContain(productName);
});

test("status is greenfield", () => {
  expect(statusLabel).toBe("greenfield");
});

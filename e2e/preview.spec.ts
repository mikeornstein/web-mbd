import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const OUT = "preview/pr18-pre-publish";

test.describe("pre-publish preview shots", () => {
  test.skip(process.env["CAPTURE_PREVIEW"] !== "1", "set CAPTURE_PREVIEW=1 to write committed preview screenshots");

  test("desktop and iPhone-width landing, catalog, and Letter A at first stretch ≥ 2", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });

    await shotLandingAndCatalog(page, "desktop", { width: 1280, height: 800 });
    await shotLandingAndCatalog(page, "iphone", { width: 390, height: 844 });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Pre — model inspection" })).toBeVisible();
    await page.getByRole("button", { name: "Continue to solve" }).click();
    await page.getByRole("button", { name: "Run solve" }).click();
    await expect(page.getByRole("heading", { name: "Post — results" })).toBeVisible({ timeout: 120_000 });
    await expect(page.getByText("WARN  first stretch ≥ 2", { exact: true })).toBeVisible();
    const post = page.getByRole("region", { name: "Post-processor" });
    await expect(post.getByRole("radio", { name: "Both" })).toBeChecked();
    const postMesh = page.getByRole("img", { name: /Deformed mesh/ });
    await postMesh.scrollIntoViewIfNeeded();

    await captureWarn(page, post, postMesh, "both", "Both");
    await captureWarn(page, post, postMesh, "solid", "Solid");
    await post.getByRole("radio", { name: "Both" }).click();
  });
});

async function captureWarn(
  page: Page,
  post: Locator,
  postMesh: Locator,
  tag: "both" | "solid",
  radio: "Both" | "Solid",
): Promise<void> {
  await post.getByRole("radio", { name: radio }).click();
  await expect(post.getByRole("radio", { name: radio })).toBeChecked();
  await postMesh.scrollIntoViewIfNeeded();

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({
    path: path.join(OUT, `after-letter-a-first-stretch-2-${tag}-desktop.png`),
    fullPage: true,
  });
  await postMesh.screenshot({ path: path.join(OUT, `after-letter-a-mesh-first-stretch-2-${tag}-desktop.png`) });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: path.join(OUT, `after-letter-a-first-stretch-2-${tag}-iphone.png`),
    fullPage: true,
  });
  await postMesh.screenshot({ path: path.join(OUT, `after-letter-a-mesh-first-stretch-2-${tag}-iphone.png`) });
}

async function shotLandingAndCatalog(
  page: Page,
  tag: "desktop" | "iphone",
  size: { width: number; height: number },
): Promise<void> {
  await page.setViewportSize(size);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Pre — model inspection" })).toBeVisible();
  await expect(page.getByText("inflate-a-desmopan")).toBeVisible();
  await page.screenshot({ path: path.join(OUT, `landing-letter-a-${tag}.png`), fullPage: true });

  await page.getByRole("button", { name: "Research" }).click();
  await expect(page.getByRole("heading", { name: "Stock models from research" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Load Letter B inflate (unvalidated demo, unstable past stretch 2)" })).toBeVisible();
  await expect(page.getByText("Unvalidated demo, unstable past stretch 2", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Letter C/ })).toHaveCount(0);
  await page.screenshot({ path: path.join(OUT, `research-b-labeled-c-hidden-${tag}.png`), fullPage: true });
}

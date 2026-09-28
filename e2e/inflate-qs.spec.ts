import { expect, test } from "@playwright/test";

test("letter A QS-ish Post still at first λ≥2 vs Radioss qs-ish-pload-400ms", async ({ page }) => {
  test.skip(Boolean(process.env["CI"]), "desk still; CI uses unit + compare:inflate");
  test.setTimeout(360_000);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "web-mbd" })).toBeVisible();

  await page.getByRole("button", { name: "Load Letter A inflate (QS-ish 400 ms PLOAD)" }).click();
  await expect(page.getByRole("heading", { name: "Pre — model inspection" })).toBeVisible();
  const pre = page.getByRole("region", { name: "Pre-processor" });
  await expect(pre.getByRole("radio", { name: "Both" })).toBeChecked();

  await page.getByRole("button", { name: "Continue to solve" }).click();
  await expect(page.getByRole("heading", { name: "Solve — explicit dynamics" })).toBeVisible();
  await page.getByRole("button", { name: "Run solve" }).click();

  await expect(page.getByRole("heading", { name: "Post — results" })).toBeVisible({
    timeout: 330_000,
  });
  await expect(page.getByText("WARN  first λ_max ≥ 2", { exact: true })).toBeVisible();
  await expect(
    page.getByLabel("Solve metrics").getByText("qs-ish-pload-400ms", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Solve metrics").getByText("type19-class-gapmin-node-segment", { exact: true }),
  ).toBeVisible();
  const post = page.getByRole("region", { name: "Post-processor" });
  await expect(post.getByRole("radio", { name: "Both" })).toBeChecked();
  const postMesh = page.getByRole("img", { name: /Deformed mesh/ });
  await expect(postMesh).toBeVisible();
  await postMesh.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "e2e/artifacts/inflate-qs-ish-post-warn.png", fullPage: true });
});

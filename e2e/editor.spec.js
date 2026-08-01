import { expect, test } from "playwright/test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { startEditorServer } from "../src/editor-server.js";
import { createProject } from "../src/project.js";
import { createVariant } from "../src/variants.js";

test("editor supports repeat text and structured content edits", async ({ page }) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-report-e2e-"));
  const fixture = path.resolve("test/fixtures/editor-artifact.html");
  const projectDir = path.join(sandbox, "report");
  let editor;
  try {
    await createProject(fixture, projectDir);
    const variant = await createVariant(projectDir, {
      mode: "evidence-first",
      theme: "editorial-light"
    });
    await writeFile(
      path.join(projectDir, "variants", variant.variantId, "artifact.html"),
      await readFile(fixture, "utf8"),
      "utf8"
    );
    editor = await startEditorServer({
      projectDir,
      variantId: variant.variantId
    });
    await page.goto(editor.url + "/?token=" + editor.token);
    await page.getByRole("button", { name: "编辑", exact: true }).click();
    const report = page.frameLocator('iframe[title="报告画布"]');
    const title = report.locator('[data-edit-id="title"]');

    await title.fill("First edit");
    await page.locator("[data-status]").click();
    await expect(page.locator("[data-status]")).toHaveText("草稿已保存");
    await title.fill("Second edit");
    await page.locator("[data-status]").click();
    await expect(page.locator("[data-status]")).toHaveText("草稿已保存");
    await page.getByRole("button", { name: "撤销" }).click();
    await expect(report.locator('[data-edit-id="title"]')).toHaveText("First edit");

    await report.locator('[data-image-id="hero"]').evaluate((node) => node.click());
    await page.locator("[data-image-input]").setInputFiles({
      name: "replacement.png",
      mimeType: "image/png",
      buffer: Buffer.from("iVBORw0KGgo=", "base64")
    });
    await expect(page.locator("[data-status]")).toHaveText("草稿已保存");

    await report.locator('[data-chart-id="sales"]').evaluate((node) => node.click());
    page.once("dialog", (dialog) => dialog.accept('{"values":[3]}'));
    await page.getByRole("button", { name: "编辑图表数据" }).click();
    await expect(page.locator("[data-status]")).toHaveText("草稿已保存");
    expect(
      await report
        .locator('[data-chart-data-for="sales"]')
        .evaluate((node) => node.textContent)
    ).toBe('{"values":[3]}');

    await report.locator('[data-block-id="summary"]').evaluate((node) => node.click());
    await page.getByRole("button", { name: "下移" }).click();
    await expect(report.locator("[data-block-id]").first()).toHaveAttribute(
      "data-block-id",
      "evidence"
    );
    await report.locator('[data-block-id="evidence"]').evaluate((node) => node.click());
    await page.getByRole("button", { name: "复制" }).click();
    await expect(report.locator("[data-block-id]")).toHaveCount(3);
  } finally {
    if (editor) await editor.close();
    await rm(sandbox, { recursive: true, force: true });
  }
});

for (const mode of ["data-first", "evidence-first"]) {
  test(`${mode} can preview all six palettes and gates publishing on save`, async ({
    page
  }) => {
    const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-report-theme-e2e-"));
    const source = path.join(sandbox, "brief.txt");
    const projectDir = path.join(sandbox, "report");
    let editor;
    try {
      await writeFile(source, "Evidence.", "utf8");
      await createProject(source, projectDir);
      const variant = await createVariant(projectDir, { mode });
      await writeFile(
        path.join(projectDir, "variants", variant.variantId, "artifact.html"),
        `<!doctype html><html><body data-report-mode="${mode}"><main><h1>Report</h1></main></body></html>`,
        "utf8"
      );
      editor = await startEditorServer({ projectDir, variantId: variant.variantId });
      await page.goto(editor.url + "/?token=" + editor.token);
      const publish = page.getByRole("button", { name: "发布" });
      await expect(publish).toBeDisabled();
      await page.locator(".theme-picker summary").click();

      for (const themeId of [
        "warm-paper-terracotta",
        "research-cobalt",
        "swiss-monochrome",
        "ink-teal",
        "linear-indigo",
        "signal-orange"
      ]) {
        await page.locator(`[data-theme-id="${themeId}"]`).click();
        await expect(
          page.frameLocator('iframe[title="报告画布"]').locator("html")
        ).toHaveAttribute("data-theme", themeId);
        await expect(publish).toBeDisabled();
      }

      await page.getByRole("button", { name: "保存版本" }).click();
      await expect(publish).toBeEnabled();
    } finally {
      if (editor) await editor.close();
      await rm(sandbox, { recursive: true, force: true });
    }
  });
}

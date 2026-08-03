import { expect, test } from "playwright/test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { startEditorServer } from "../src/editor-server.js";
import { createProject } from "../src/project.js";
import { createVariant } from "../src/variants.js";
import { completeTestHuashuDesign } from "../test/helpers/huashu.js";

const themes = [
  "warm-paper-terracotta",
  "precision-blueprint",
  "sandstone-archive",
  "deep-data-blue",
  "institutional-navy-gold",
  "signal-orange"
];

test("V4 editor edits the model, exposes contextual chart tools, versions, and publications", async ({ page }) => {
  const fixture = await editorFixture("data-first");
  const { editor, projectDir, sandbox, variant } = fixture;
  try {
    await page.goto(editor.url + "/?token=" + editor.token);
    const frame = page.frameLocator('iframe[title="报告画布"]');
    const edit = page.locator('[data-action="edit"]');
    await edit.click();
    await expect(edit).toHaveText("完成");

    const model = JSON.parse(await readFile(path.join(projectDir, "variants", variant.variantId, "report-model.json"), "utf8"));
    const paragraph = model.nodes.flatMap((node) => node.children ?? []).find((node) => node.type === "paragraph");
    const editable = frame.locator(`[data-edit-id="${paragraph.nodeId}"]`);
    await editable.fill("市场规模达到 88 亿元。");
    await editable.blur();
    await expect(page.locator("[data-status]")).toHaveText("草稿已保存");
    await expect(frame.locator(`[data-edit-id="${paragraph.nodeId}"]`)).toContainText("88");

    await frame.locator("[data-chart-id]").first().click();
    await expect(frame.getByRole("button", { name: "编辑数据" })).toBeVisible();
    await frame.getByRole("button", { name: "编辑数据" }).click();
    const valueCell = page.locator('[data-chart-grid] input[data-row="0"][data-column="1"]');
    await valueCell.fill("99");
    await page.getByRole("button", { name: "应用修改" }).click();
    await expect(frame.locator("[data-chart-id] .chart-row b").first()).toHaveText("99");

    await edit.click();
    await expect(edit).toHaveText("编辑");
    await expect(page.getByRole("button", { name: "保存版本" })).toBeDisabled();
    await page.getByRole("button", { name: "确认设计与配色" }).click();
    await expect(page.getByRole("button", { name: "保存版本" })).toBeEnabled();
    await page.getByRole("button", { name: "保存版本" }).click();
    await expect(page.getByRole("button", { name: "发布", exact: true })).toBeEnabled();
    expect((await fetch(editor.url + "/api/health")).ok).toBe(true);

    await page.getByRole("button", { name: "历史版本" }).click();
    await expect(page.locator("[data-version-list] .history-item")).toHaveCount(1);
    await page.locator("[data-drawer=versions] [data-close]").click();
    await page.getByRole("button", { name: "发布", exact: true }).click();
    await expect(page.locator("[data-publication-list] .history-item")).toHaveCount(1);
    await expect(page.locator("[data-publication-list]")).toContainText("本地发布");
  } finally {
    await editor.close();
    await rm(sandbox, { recursive: true, force: true });
  }
});

for (const mode of ["data-first", "evidence-first"]) {
  test(`${mode} switches all six color-only themes without changing report content or width`, async ({ page }) => {
    const { editor, sandbox } = await editorFixture(mode);
    try {
      await page.goto(editor.url + "/?token=" + editor.token);
      const frame = page.frameLocator('iframe[title="报告画布"]');
      const originalText = await frame.locator(".report-shell").innerText();
      const originalWidth = await frame.locator(".report-shell").evaluate((node) => getComputedStyle(node).width);
      await page.locator(".theme-picker summary").click();
      for (const themeId of themes) {
        await page.locator(`[data-theme-id="${themeId}"]`).click();
        await expect(frame.locator("html")).toHaveAttribute("data-theme", themeId);
        expect(await frame.locator(".report-shell").innerText()).toBe(originalText);
        expect(await frame.locator(".report-shell").evaluate((node) => getComputedStyle(node).width)).toBe(originalWidth);
        await expect(page.getByRole("button", { name: "保存版本" })).toBeDisabled();
        await page.getByRole("button", { name: "确认设计与配色" }).click();
        await expect(page.getByRole("button", { name: "保存版本" })).toBeEnabled();
      }
    } finally {
      await editor.close();
      await rm(sandbox, { recursive: true, force: true });
    }
  });
}

async function editorFixture(mode) {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-report-e2e-"));
  const source = path.join(sandbox, "brief.md");
  const projectDir = path.join(sandbox, "report");
  await writeFile(source, "# 市场规模\n市场规模达到 42 亿元。\n\n| 地区 | 数值 |\n| --- | ---: |\n| 全球 | 10 |\n| 国内 | 20 |", "utf8");
  await createProject(source, projectDir);
  const variant = await createVariant(projectDir, { mode });
  await completeTestHuashuDesign(projectDir, variant.variantId);
  const editor = await startEditorServer({ projectDir, variantId: variant.variantId });
  return { editor, projectDir, sandbox, variant };
}

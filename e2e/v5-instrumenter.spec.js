import { expect, test } from "playwright/test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createCanvas, loadImage } from "@napi-rs/canvas";

import { createV5Project, createV5Variant } from "../src/v5-project.js";
import { startEditorServer } from "../src/editor-server.js";
import { instrumentV5Variant } from "../src/v5-instrumenter.js";
import { renderThemeCss } from "../src/theme-artifact.js";
import { getTheme } from "../src/themes.js";
import { hashV5SitePayload } from "../src/v5-design.js";

test("V5 Instrumenter is visually non-invasive at desktop and mobile", async ({ page }) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-v5-visual-"));
  try {
    const { projectDir, variantId, siteDir } = await visualFixture(sandbox);
    const errors = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.setViewportSize({ width: 1100, height: 760 });
    await page.goto(pathToFileURL(path.join(siteDir, "index.html")).href);
    await page.addStyleTag({ content: renderThemeCss(getTheme("precision-blueprint")) });
    const beforeBoxes = await anchorBoxes(page);
    const before = await page.screenshot();

    const artifactPath = await instrumentV5Variant(projectDir, variantId);
    await page.goto(pathToFileURL(artifactPath).href);
    const afterBoxes = await anchorBoxes(page);
    const after = await page.screenshot();

    for (const id of Object.keys(beforeBoxes)) {
      for (const key of ["x", "y", "width", "height"]) {
        expect(Math.abs(beforeBoxes[id][key] - afterBoxes[id][key])).toBeLessThanOrEqual(1);
      }
    }
    expect(await changedPixelRatio(before, after)).toBeLessThanOrEqual(0.005);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(pathToFileURL(artifactPath).href);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test("V5.3 visible editor uses HTML patches without a confirmation gate", async ({ page }) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-v5-editor-"));
  let editor;
  try {
    const { projectDir, variantId } = await visualFixture(sandbox);
    await instrumentV5Variant(projectDir, variantId);
    editor = await startEditorServer({ projectDir, variantId });
    await page.goto(editor.url + "/?token=" + editor.token);
    const frame = page.frameLocator('iframe[title="报告画布"]');

    await expect(page.locator('[data-action="confirm-review"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: "保存版本" })).toBeEnabled();
    await page.getByRole("button", { name: "编辑" }).click();

    const heading = frame.locator("h1[data-edit-id]");
    await expect(heading).toHaveAttribute("contenteditable", "true");
    await heading.fill("Updated market outlook");
    await heading.blur();
    await expect(page.locator("[data-status]")).toHaveText("草稿已保存");
    await expect(frame.locator("h1[data-edit-id]")).toHaveText("Updated market outlook");

    await frame.locator('[data-block-id]').first().click();
    await frame.locator('[data-context-action="clone"]').click();
    await expect(frame.locator('[data-block-id]')).toHaveCount(3);
    await page.getByRole("button", { name: "撤销" }).click();
    await expect(frame.locator('[data-block-id]')).toHaveCount(2);

    await frame.locator('[data-image-id]').click();
    await expect(frame.locator('[data-context-action="replace-image"]')).toBeVisible();
    await expect(frame.locator('[data-context-action="clone"]')).toBeHidden();
    await expect(frame.locator('[data-context-action="delete"]')).toBeHidden();
    await frame.getByRole("button", { name: "替换图片" }).click();
    await page.locator('[data-image-input]').setInputFiles({
      name: "replacement.png",
      mimeType: "image/png",
      buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    });
    await expect(frame.locator('[data-image-id]')).toHaveAttribute("src", /^data:image\/png;base64,/);

    await frame.locator('[data-chart-id]').click();
    await frame.getByRole("button", { name: "编辑数据" }).click();
    await page.locator('[data-chart-grid] input[data-row="0"][data-column="1"]').fill("200");
    await page.getByRole("button", { name: "应用修改" }).click();
    await expect.poll(() => frame.locator('script[data-chart-data-for]').textContent()).toContain("200");

    await page.locator(".theme-picker summary").click();
    await page.locator('[data-theme-id="signal-orange"]').click();
    await expect.poll(() => frame.locator("html").evaluate((node) => getComputedStyle(node).getPropertyValue("--report-accent").trim())).toBe("#FF6900");
    const savedResponse = page.waitForResponse((response) => response.url().endsWith("/api/versions") && response.request().method() === "POST");
    await page.getByRole("button", { name: "保存版本" }).click();
    const saveResult = await savedResponse;
    expect(saveResult.status(), await saveResult.text()).toBe(201);
    await expect(page.getByRole("button", { name: "发布", exact: true })).toBeEnabled();
  } finally {
    if (editor) await editor.close();
    await rm(sandbox, { recursive: true, force: true });
  }
});

async function visualFixture(root) {
  const source = path.join(root, "brief.md");
  const projectDir = path.join(root, "project");
  await writeFile(source, "# Market outlook\nExpected 189 units in 2028.", "utf8");
  await createV5Project(source, projectDir);
  const variant = await createV5Variant(projectDir, { themeId: "precision-blueprint" });
  const variantDir = path.join(projectDir, "variants", variant.variantId);
  const siteDir = path.join(variantDir, "design", "package");
  for (const directory of ["styles", "scripts", "assets", "screenshots"]) {
    await mkdir(path.join(siteDir, directory), { recursive: true });
  }
  const ledger = JSON.parse(await readFile(path.join(projectDir, "source-pack", "fact-ledger.json"), "utf8"));
  const sourceMap = JSON.parse(await readFile(path.join(projectDir, "source-pack", "source-map.json"), "utf8"));
  const sourceRefs = sourceMap.documents.flatMap((document) => document.units.filter((unit) => unit.substantive).map((unit) => unit.sourceId));
  const bindings = {
    schemaVersion: 1,
    bindings: [
      { contentId: "hero", factIds: ledger.facts.map((fact) => fact.factId), sourceRefs, tier: "main", editableKind: "block" },
      { contentId: "detail", factIds: ledger.facts.map((fact) => fact.factId), sourceRefs, tier: "main", editableKind: "block" },
      { contentId: "chart", factIds: ledger.facts.map((fact) => fact.factId), sourceRefs, tier: "main", editableKind: "chart" },
      { contentId: "picture", factIds: [], sourceRefs: [], tier: "detail", editableKind: "image" },
    ],
    omissions: [],
  };
  const bindingText = JSON.stringify(bindings);
  await writeFile(path.join(siteDir, "content-bindings.json"), bindingText, "utf8");
  await writeFile(path.join(siteDir, "design-rationale.md"), "A responsive editorial split with one local interaction.", "utf8");
  await writeFile(path.join(siteDir, "styles", "site.css"), `
    :root{--report-canvas:#fafafa;--report-surface:#ffffff;--report-text:#111111;--report-accent:#123456;--report-border:#dddddd}
    *{box-sizing:border-box} body{margin:0;background:var(--report-canvas);color:var(--report-text);font-family:Arial,sans-serif}
    .shell{min-height:100vh;display:grid;grid-template-columns:minmax(0,1.4fr) minmax(240px,.6fr);gap:32px;padding:64px}
    .hero{padding:36px;border:1px solid var(--report-border);background:var(--report-surface)}
    h1{font-size:52px;line-height:1;margin:0 0 24px}.value{font-size:28px}.visual{width:100%;height:100%;min-height:240px}
    @media(max-width:600px){.shell{grid-template-columns:1fr;padding:20px;gap:20px}h1{font-size:36px}.visual{min-height:180px}}
  `, "utf8");
  await writeFile(path.join(siteDir, "scripts", "site.js"), "document.documentElement.dataset.huashuReady='true';", "utf8");
  await writeFile(path.join(siteDir, "assets", "visual.svg"), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="none" stroke="currentColor"/><path d="M40 230L140 150L220 180L360 60" fill="none" stroke="currentColor" stroke-width="8"/></svg>', "utf8");
  await writeFile(path.join(siteDir, "screenshots", "desktop.png"), Buffer.from("desktop"));
  await writeFile(path.join(siteDir, "screenshots", "mobile.png"), Buffer.from("mobile"));
  await writeFile(path.join(siteDir, "index.html"), '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="styles/site.css"></head><body><main class="shell"><section class="hero" data-content-id="hero"><h1>Market outlook</h1><p class="value">Expected 189 units in 2028.</p></section><section data-content-id="detail"><h2>Market detail</h2><p>Expected 189 units in 2028.</p></section><section data-content-id="chart"><div>Market chart</div><span data-chart-mark style="background:var(--report-chart-1)"></span><span class="chart-tooltip"></span><span class="chart-selection-band"></span></section><img class="visual" data-content-id="picture" src="assets/visual.svg" alt="Trend"></main><script type="application/json" data-chart-data-for="chart">{"columns":["Label","Value"],"rows":[["Market",189]]}</script><script src="scripts/site.js"></script></body></html>', "utf8");
  const payloadSha256 = await hashV5SitePayload(siteDir);
  const project = JSON.parse(await readFile(path.join(projectDir, "project.json"), "utf8"));
  const interviewSha256 = "a".repeat(64);
  const parentSha256 = "b".repeat(64);
  await writeFile(path.join(siteDir, "manifest.json"), JSON.stringify({
    schemaVersion: 1,
    packageVersion: "5.0.0",
    kind: "final",
    candidateId: "selected",
    directionId: "editorial-split",
    directionLabel: "Editorial Split",
    previewThemeId: "precision-blueprint",
    entrypoint: "index.html",
    sourcePackSha256: project.sourcePackSha256,
    interviewSha256,
    contentBindingsSha256: createHash("sha256").update(bindingText).digest("hex"),
    payloadSha256,
    outputSha256: payloadSha256,
    screenshotSourceSha256: payloadSha256,
    parentCandidateId: "selected",
    parentCandidateSha256: parentSha256,
  }), "utf8");
  const variantPath = path.join(variantDir, "variant.json");
  const record = JSON.parse(await readFile(variantPath, "utf8"));
  Object.assign(record, {
    interviewSha256,
    designSelection: { candidateId: "selected", candidateSha256: parentSha256, directionId: "editorial-split" },
    pipelineState: "final-site-ready",
    finalSiteSha256: payloadSha256,
  });
  await writeFile(variantPath, JSON.stringify(record), "utf8");
  project.variants[0] = record;
  await writeFile(path.join(projectDir, "project.json"), JSON.stringify(project), "utf8");
  return { projectDir, variantId: variant.variantId, siteDir };
}

async function anchorBoxes(page) {
  const result = {};
  for (const id of ["hero", "picture"]) result[id] = await page.locator(`[data-content-id="${id}"]`).boundingBox();
  return result;
}

async function changedPixelRatio(before, after) {
  const [a, b] = await Promise.all([loadImage(before), loadImage(after)]);
  expect(a.width).toBe(b.width);
  expect(a.height).toBe(b.height);
  const canvas = createCanvas(a.width, a.height);
  const context = canvas.getContext("2d");
  context.drawImage(a, 0, 0);
  const first = context.getImageData(0, 0, a.width, a.height).data;
  context.clearRect(0, 0, a.width, a.height);
  context.drawImage(b, 0, 0);
  const second = context.getImageData(0, 0, b.width, b.height).data;
  let changed = 0;
  for (let index = 0; index < first.length; index += 4) {
    if (first[index] !== second[index] || first[index + 1] !== second[index + 1] || first[index + 2] !== second[index + 2] || first[index + 3] !== second[index + 3]) changed += 1;
  }
  return changed / (a.width * a.height);
}

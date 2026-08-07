import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createCanvas } from "@napi-rs/canvas";

import { assertFinalFullPageScreenshots, assertStandalonePreviewTheme, validateSourceAssetDecisions } from "../src/v5-quality-gate.js";

test("V5.3.1 requires an exact standalone preview theme declaration", () => {
  assert.equal(assertStandalonePreviewTheme(`
    <style data-preview-theme="warm-paper-terracotta">
      :root{--report-canvas:#F5F0E8;--report-surface:#FFFDFC;--report-text:#191919;
      --report-text-muted:#6F675F;--report-border:#D8CEC1;--report-accent:#CC785C}
    </style>
  `, "warm-paper-terracotta"), true);
  assert.throws(
    () => assertStandalonePreviewTheme('<style>:root{--report-accent:steelblue}</style>', "warm-paper-terracotta"),
    /standalone preview theme/i
  );
});

test("V5.3.1 final quality gate requires desktop and mobile full-page evidence", async (t) => {
  const siteDir = await mkdtemp(path.join(os.tmpdir(), "edit-html-v531-full-page-"));
  t.after(() => rm(siteDir, { recursive: true, force: true }));
  await mkdir(path.join(siteDir, "screenshots"), { recursive: true });
  await writeFile(path.join(siteDir, "screenshots", "desktop-full.png"), png(1440, 1800));
  await assert.rejects(() => assertFinalFullPageScreenshots(siteDir), /mobile-full\.png/i);
  await writeFile(path.join(siteDir, "screenshots", "mobile-full.png"), png(390, 1600));
  assert.equal(await assertFinalFullPageScreenshots(siteDir), true);
});

test("V5.3.2 lets Huashu judge source-image value but rejects silent or inconsistent treatment", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "edit-html-v532-source-assets-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const projectDir = path.join(root, "project");
  const siteDir = path.join(root, "site");
  await mkdir(path.join(projectDir, "source-pack", "assets"), { recursive: true });
  await mkdir(path.join(siteDir, "assets"), { recursive: true });
  const image = Buffer.from("high-value-source-chart");
  await writeFile(path.join(projectDir, "source-pack", "assets", "image1.png"), image);
  await writeFile(path.join(siteDir, "assets", "copied.png"), image);
  await writeFile(path.join(projectDir, "source-pack", "asset-contact-sheet.html"),
    '<figure data-source-id="src-image-1"><img src="assets/image1.png"></figure>');
  const html = '<main><figure class="source-chart"><img src="assets/copied.png"></figure><div class="redrawn-chart"></div></main>';
  const base = { visualizationModules: [{ selector: ".redrawn-chart", sourceRefs: ["src-image-1"] }] };

  assert.match((await validateSourceAssetDecisions(projectDir, siteDir, html, base)).join(";"), /requires sourceAssetDecisions/i);
  assert.match((await validateSourceAssetDecisions(projectDir, siteDir, html, {
    ...base,
    sourceAssetDecisions: [{
      assetPath: "assets/image1.png", sourceRef: "src-image-1", contentValue: "high",
      decision: "omit", rationale: "图表信息与汇报判断高度相关"
    }]
  })).join(";"), /high-value source evidence/i);
  assert.deepEqual(await validateSourceAssetDecisions(projectDir, siteDir, html, {
    ...base,
    sourceAssetDecisions: [{
      assetPath: "assets/image1.png", sourceRef: "src-image-1", contentValue: "high",
      decision: "use-original", rationale: "原图结构清晰且直接支撑核心判断", selector: ".source-chart"
    }]
  }), []);
  assert.deepEqual(await validateSourceAssetDecisions(projectDir, siteDir, html, {
    ...base,
    sourceAssetDecisions: [{
      assetPath: "assets/image1.png", sourceRef: "src-image-1", contentValue: "high",
      decision: "redraw", rationale: "保留原图证据关系并重绘为响应式图表", selector: ".redrawn-chart"
    }]
  }), []);
  assert.deepEqual(await validateSourceAssetDecisions(projectDir, siteDir, html, {
    ...base,
    sourceAssetDecisions: [{
      assetPath: "assets/image1.png", sourceRef: "src-image-1", contentValue: "low",
      decision: "omit", rationale: "该图仅重复正文且不增加决策信息"
    }]
  }), []);
});

function png(width, height) {
  const canvas = createCanvas(width, height);
  canvas.getContext("2d").fillRect(0, 0, width, height);
  return canvas.toBuffer("image/png");
}

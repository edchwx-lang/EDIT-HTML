import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  confirmHuashuDesign,
  hashDesignPackagePayload
} from "../../src/design-package.js";
import { renderVariant } from "../../src/renderer.js";

export async function completeTestHuashuDesign(projectDir, variantId, { render = true } = {}) {
  const variantDir = path.join(projectDir, "variants", variantId);
  const packageDir = path.join(variantDir, "design", "package");
  const input = JSON.parse(await readFile(
    path.join(variantDir, "design", "huashu-input", "manifest.json"),
    "utf8"
  ));
  await mkdir(packageDir, { recursive: true });
  const files = {
    "tokens.json": { tokenPolicy: "semantic-only" },
    "layout-grammar.json": { section: "wide-grid", content: "dense-grid" },
    "component-grammar.json": {
      section: "report-section",
      table: "layered-data-table",
      image: "source-figure",
      list: "structured-list",
      text: "metric-evidence",
      entityGroup: "master-detail"
    },
    "chart-grammar.json": { trend: ["line", "area"], comparison: ["bar", "dot"] },
    "table-grammar.json": { hierarchy: true },
    "interaction-grammar.json": { charts: ["tooltip", "crosshair"], masterDetail: true },
    "responsive-grammar.json": { desktop: 1440, mobile: 375 }
  };
  for (const [name, value] of Object.entries(files)) {
    await writeFile(path.join(packageDir, name), JSON.stringify(value, null, 2), "utf8");
  }
  const outputSha256 = await hashDesignPackagePayload(packageDir);
  await writeFile(path.join(packageDir, "manifest.json"), JSON.stringify({
    schemaVersion: 1,
    skill: "huashu-design",
    skillVersion: "test-fixture",
    runId: "test-" + variantId,
    invokedAt: "2026-08-03T00:00:00.000Z",
    inputSha256: input.inputSha256,
    outputSha256,
    references: [],
    confirmation: { status: "pending", confirmedAt: null, confirmedBy: null }
  }, null, 2), "utf8");
  await confirmHuashuDesign(projectDir, variantId, { confirmedBy: "test-fixture" });
  return render ? renderVariant(projectDir, variantId) : packageDir;
}

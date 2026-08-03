import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  confirmHuashuDesign,
  hashDesignPackagePayload,
  importHuashuDesignPackage,
  validateHuashuDesignPackage
} from "../src/design-package.js";
import { createProject } from "../src/project.js";
import { renderVariant } from "../src/renderer.js";
import { createVariant } from "../src/variants.js";

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "edit-html-v411-"));
  const source = path.join(root, "source.txt");
  const project = path.join(root, "project");
  await writeFile(source, "Market report\nRevenue reached 12 billion yuan in 2025.", "utf8");
  await createProject(source, project);
  const variant = await createVariant(project, { mode: "data-first" });
  return { root, project, variant };
}

async function writePackage(project, variantId, root, overrides = {}) {
  const inputManifest = JSON.parse(await readFile(
    path.join(project, "variants", variantId, "design", "huashu-input", "manifest.json"),
    "utf8"
  ));
  const packageDir = path.join(root, "huashu-package");
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
    runId: "huashu-run-test",
    invokedAt: "2026-08-03T00:00:00.000Z",
    inputSha256: inputManifest.inputSha256,
    outputSha256,
    references: [],
    confirmation: { status: "pending", confirmedAt: null, confirmedBy: null },
    ...overrides
  }, null, 2), "utf8");
  return packageDir;
}

test("new variants prepare real Huashu input and do not silently render", async () => {
  const { project, variant } = await fixture();
  const inputDir = path.join(project, "variants", variant.variantId, "design", "huashu-input");
  const names = [
    "manifest.json", "design-brief.json", "content-slices.json",
    "report-model.snapshot.json", "component-contract.schema.json",
    "theme-tokens.schema.json", "asset-inventory.json", "forbidden-mutations.json"
  ];
  for (const name of names) assert.ok(JSON.parse(await readFile(path.join(inputDir, name), "utf8")));
  await assert.rejects(
    () => renderVariant(project, variant.variantId),
    /confirmed executable Huashu design candidate/
  );
});

test("V4.2 rejects the legacy weak-package import and confirmation path", async () => {
  const { root, project, variant } = await fixture();
  const packageDir = await writePackage(project, variant.variantId, root);
  await assert.rejects(
    () => importHuashuDesignPackage(project, variant.variantId, packageDir),
    /read-only in V4\.2/
  );
  await assert.rejects(
    () => confirmHuashuDesign(project, variant.variantId, { confirmedBy: "user" }),
    /read-only in V4\.2/
  );
});

test("tampered Huashu packages and hard-coded design content are rejected", async () => {
  const { root, project, variant } = await fixture();
  const packageDir = await writePackage(project, variant.variantId, root);
  await writeFile(path.join(packageDir, "runtime.js"), "fetch('https://example.com/runtime.js')", "utf8");
  await assert.rejects(
    () => importHuashuDesignPackage(project, variant.variantId, packageDir),
    /read-only in V4\.2/
  );
});

import assert from "node:assert/strict";
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { migrateProject } from "../src/migrate.js";

test("V3 migration dry-run is non-mutating and real migration preserves legacy artifacts", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-migrate-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const projectDir = path.join(sandbox, "legacy");
  const variantId = "legacy-variant";
  const versionId = "legacy-version";
  await mkdir(path.join(projectDir, "source"), { recursive: true });
  await mkdir(path.join(projectDir, "variants", variantId), { recursive: true });
  await mkdir(path.join(projectDir, "versions", versionId), { recursive: true });
  await writeFile(path.join(projectDir, "source", "brief.txt"), "Evidence 42", "utf8");
  await writeFile(path.join(projectDir, "variants", variantId, "artifact.html"), '<!doctype html><h1 data-edit-id="title">Legacy</h1>', "utf8");
  await writeFile(path.join(projectDir, "versions", versionId, "artifact.html"), "IMMUTABLE", "utf8");
  await writeFile(path.join(projectDir, "project.json"), JSON.stringify({
    schemaVersion: 1,
    projectId: "legacy-project",
    activeVariantId: variantId,
    sourceFiles: [{ name: "brief.txt", sha256: "legacy" }],
    variants: [{ schemaVersion: 1, variantId, mode: "data-first", themeId: "ink-teal" }],
    versions: [{ schemaVersion: 1, versionId, variantId, themeId: "ink-teal" }]
  }), "utf8");
  await writeFile(path.join(projectDir, "analysis.json"), JSON.stringify({ schemaVersion: 1, documents: [{ name: "brief.txt", text: "Evidence 42" }] }), "utf8");
  await writeFile(path.join(projectDir, "deployments.json"), JSON.stringify({ schemaVersion: 1, providers: {} }), "utf8");

  const dryRun = await migrateProject(projectDir, { dryRun: true });
  assert.equal(dryRun.fromSchemaVersion, 1);
  assert.equal(JSON.parse(await readFile(path.join(projectDir, "project.json"), "utf8")).schemaVersion, 1);

  const migrated = await migrateProject(projectDir);
  assert.equal(migrated.toSchemaVersion, 4);
  assert.equal(JSON.parse(await readFile(path.join(projectDir, "project.json"), "utf8")).schemaVersion, 4);
  assert.equal(JSON.parse(await readFile(path.join(projectDir, "variants", variantId, "variant.json"), "utf8")).themeId, "institutional-navy-gold");
  assert.equal(await readFile(path.join(projectDir, "versions", versionId, "artifact.html"), "utf8"), "IMMUTABLE");
  const log = JSON.parse(await readFile(path.join(projectDir, "migration-log.json"), "utf8"));
  assert.deepEqual(log.themeMappings, [{ from: "ink-teal", to: "institutional-navy-gold", variantId }]);
  assert.match(migrated.backupPath, /legacy-v3-.*\.zip$/);
  await access(path.join(projectDir, "打开编辑器.cmd"));
  await access(path.join(projectDir, ".editor-runtime", "open-editor.mjs"));
});

test("failed V3 migration leaves the original project untouched and removes staging", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-migrate-failure-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const projectDir = path.join(sandbox, "broken");
  await mkdir(path.join(projectDir, "source"), { recursive: true });
  await writeFile(path.join(projectDir, "source", "brief.txt"), "Evidence", "utf8");
  const original = {
    schemaVersion: 3,
    projectId: "broken-project",
    sourceFiles: [{ name: "brief.txt", sha256: "legacy" }],
    variants: [{ mode: "data-first", themeId: "ink-teal" }],
    versions: []
  };
  await writeFile(path.join(projectDir, "project.json"), JSON.stringify(original), "utf8");
  await writeFile(path.join(projectDir, "analysis.json"), JSON.stringify({ documents: [] }), "utf8");

  await assert.rejects(() => migrateProject(projectDir), /variantId|path/);
  assert.deepEqual(JSON.parse(await readFile(path.join(projectDir, "project.json"), "utf8")), original);
  await assert.rejects(() => access(path.join(projectDir, "source-model.json")), /ENOENT/);
  const siblings = await import("node:fs/promises").then(({ readdir }) => readdir(sandbox));
  assert.equal(siblings.some((name) => name.startsWith(".migration-")), false);
});

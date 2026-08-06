import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { inspectV5Migration, migrateV5Project } from "../src/v5-migration.js";
import { createV5Project } from "../src/v5-project.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "bin", "edit-html-report.js");

test("V5.2.1 dry-run reports metadata/runtime changes with zero writes", async (t) => {
  const { projectDir, cleanup } = await createLegacyV521Fixture();
  t.after(cleanup);
  const before = await hashTree(projectDir);

  const inspected = await inspectV5Migration(projectDir);
  const dryRun = await migrateV5Project(projectDir, { dryRun: true });

  assert.deepEqual(inspected.legacyMetadata, {
    packageVersion: "5.2.1",
    pipelineVersion: "5.2.1"
  });
  assert.equal(inspected.runtime.status, "missing");
  assert.deepEqual(inspected.metadataChanges, {
    migratedFrom: { packageVersion: "5.2.1", pipelineVersion: "5.2.1" },
    toolVersion: "5.3.0",
    artifactContractVersion: "5.2.1",
    editorRuntimeVersion: "5.3.0"
  });
  assert.equal(dryRun.dryRun, true);
  assert.deepEqual(await hashTree(projectDir), before);
});

test("V5.2.1 migration preserves all content/design/HTML and refreshes runtime", async (t) => {
  const { projectDir, cleanup } = await createLegacyV521Fixture();
  t.after(cleanup);
  const protectedBefore = await hashProtectedFixtureFiles(projectDir);

  const result = await migrateV5Project(projectDir);
  const project = JSON.parse(await readFile(path.join(projectDir, "project.json"), "utf8"));
  const runtime = JSON.parse(await readFile(path.join(projectDir, ".editor-runtime", "runtime-manifest.json"), "utf8"));

  assert.equal(result.changed, true);
  assert.equal(result.protectedFilesVerified, protectedBefore.size);
  assert.deepEqual(project.migratedFrom, {
    packageVersion: "5.2.1",
    pipelineVersion: "5.2.1"
  });
  assert.equal(project.packageVersion, "5.2.1");
  assert.equal(project.pipelineVersion, "5.2.1");
  assert.equal(project.toolVersion, "5.3.0");
  assert.equal(project.artifactContractVersion, "5.2.1");
  assert.equal(project.editorRuntimeVersion, "5.3.0");
  assert.equal(runtime.runtimeVersion, "5.3.0");
  assert.deepEqual(await hashProtectedFixtureFiles(projectDir), protectedBefore);
});

test("CLI routes schema-version 5 migration to the metadata-only migrator", async (t) => {
  const { projectDir, cleanup } = await createLegacyV521Fixture();
  t.after(cleanup);
  const before = await hashTree(projectDir);
  const result = spawnSync(process.execPath, [cli, "migrate", projectDir, "--dry-run"], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).legacyMetadata.packageVersion, "5.2.1");
  assert.deepEqual(await hashTree(projectDir), before);
});

test("migration is a no-op for a current V5.3 project", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-v53-migrate-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const source = path.join(sandbox, "brief.txt");
  const projectDir = path.join(sandbox, "report");
  await writeFile(source, "Evidence.", "utf8");
  await createV5Project(source, projectDir);
  const before = await hashTree(projectDir);

  const result = await migrateV5Project(projectDir);

  assert.equal(result.changed, false);
  assert.equal(result.runtimeRefreshed, false);
  assert.equal(result.legacyMetadata, null);
  assert.deepEqual(await hashTree(projectDir), before);
});

async function createLegacyV521Fixture() {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-v521-migrate-"));
  const projectDir = path.join(sandbox, "report");
  const variantId = "legacy-v521-variant";
  const versionId = "saved-v521-version";
  const publicationId = "local-v521-publication";
  await mkdir(path.join(projectDir, "variants", variantId, "design", "package", "assets"), { recursive: true });
  await mkdir(path.join(projectDir, "versions", versionId), { recursive: true });
  await mkdir(path.join(projectDir, "publications", publicationId), { recursive: true });
  await writeFile(path.join(projectDir, "project.json"), JSON.stringify({
    schemaVersion: 5,
    packageVersion: "5.2.1",
    pipelineVersion: "5.2.1",
    projectId: "legacy-v521",
    activeVariantId: variantId,
    variants: [{ variantId, packageVersion: "5.2.1", pipelineVersion: "5.2.1" }],
    versions: [{ versionId, variantId }],
    publications: [{ publicationId, versionId }]
  }, null, 2) + "\n", "utf8");
  await writeFile(path.join(projectDir, "variants", variantId, "artifact.html"), "<!doctype html><h1>Legacy artifact</h1>", "utf8");
  await writeFile(path.join(projectDir, "variants", variantId, "design", "package", "site.html"), "<!doctype html><main>Huashu output</main>", "utf8");
  await writeFile(path.join(projectDir, "variants", variantId, "design", "package", "manifest.json"), '{"owner":"huashu-design"}\n', "utf8");
  await writeFile(path.join(projectDir, "variants", variantId, "design", "package", "assets", "visual.svg"), "<svg><rect/></svg>", "utf8");
  await writeFile(path.join(projectDir, "versions", versionId, "artifact.html"), "<!doctype html><h1>Saved</h1>", "utf8");
  await writeFile(path.join(projectDir, "publications", publicationId, "report.html"), "<!doctype html><h1>Published</h1>", "utf8");
  return { projectDir, cleanup: () => rm(sandbox, { recursive: true, force: true }) };
}

async function hashProtectedFixtureFiles(projectDir) {
  const relativePaths = [
    "variants/legacy-v521-variant/artifact.html",
    "variants/legacy-v521-variant/design/package/site.html",
    "variants/legacy-v521-variant/design/package/manifest.json",
    "variants/legacy-v521-variant/design/package/assets/visual.svg",
    "versions/saved-v521-version/artifact.html",
    "publications/local-v521-publication/report.html"
  ];
  return new Map(await Promise.all(relativePaths.map(async (relativePath) => [
    relativePath,
    sha256(await readFile(path.join(projectDir, ...relativePath.split("/"))))
  ])));
}

async function hashTree(root) {
  const result = new Map();
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolutePath);
      else result.set(path.relative(root, absolutePath), sha256(await readFile(absolutePath)));
    }
  }
  await visit(root);
  return result;
}

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

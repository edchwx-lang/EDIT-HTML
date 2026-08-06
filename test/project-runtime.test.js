import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createV5Project } from "../src/v5-project.js";
import { refreshProjectEditorRuntime } from "../src/project-runtime.js";

test("runtime refresh atomically replaces a stale runtime without changing project records", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-report-runtime-"));
  const projectDir = path.join(sandbox, "report");
  const source = path.join(sandbox, "brief.txt");
  await writeFile(source, "Evidence.", "utf8");
  await createV5Project(source, projectDir);
  t.after(() => rm(sandbox, { recursive: true, force: true }));

  const projectPath = path.join(projectDir, "project.json");
  const before = JSON.parse(await readFile(projectPath, "utf8"));
  const manifestPath = path.join(projectDir, ".editor-runtime", "runtime-manifest.json");
  await writeFile(manifestPath, JSON.stringify({
    runtimeVersion: "5.2.1",
    sourcePackageRoot: "C:\\old-checkout",
    sourceSha256: "old-runtime-hash",
    installedAt: "2026-01-01T00:00:00.000Z"
  }), "utf8");
  await writeFile(path.join(projectDir, ".editor-runtime", "obsolete-runtime-file.js"), "obsolete", "utf8");

  const refreshed = await refreshProjectEditorRuntime(projectDir);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

  assert.equal(refreshed.oldRuntimeHash, "old-runtime-hash");
  assert.equal(refreshed.newRuntimeHash, manifest.sourceSha256);
  assert.notEqual(refreshed.newRuntimeHash, refreshed.oldRuntimeHash);
  assert.equal(manifest.runtimeVersion, "5.3.0");
  assert.equal(path.isAbsolute(manifest.sourcePackageRoot), true);
  assert.match(manifest.sourceSha256, /^[a-f0-9]{64}$/);
  await assert.rejects(readFile(path.join(projectDir, ".editor-runtime", "obsolete-runtime-file.js")));
  assert.deepEqual(JSON.parse(await readFile(projectPath, "utf8")), before);
});

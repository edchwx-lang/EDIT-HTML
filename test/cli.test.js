import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "bin", "edit-html-report.js");

test("CLI create emits JSON and creates an inspectable project", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-report-cli-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const source = path.join(sandbox, "brief.txt");
  const projectDir = path.join(sandbox, "report");
  await writeFile(source, "Evidence.", "utf8");

  const created = spawnSync(
    process.execPath,
    [cli, "create", source, "--out", projectDir],
    { cwd: root, encoding: "utf8" }
  );

  assert.equal(created.status, 0, created.stderr);
  assert.equal(JSON.parse(created.stdout).sourceFiles[0].name, "brief.txt");

  const inspected = spawnSync(
    process.execPath,
    [cli, "inspect", projectDir, "--json"],
    { cwd: root, encoding: "utf8" }
  );
  assert.equal(inspected.status, 0, inspected.stderr);
  assert.deepEqual(
    JSON.parse(inspected.stdout),
    JSON.parse(await readFile(path.join(projectDir, "project.json"), "utf8"))
  );
});

test("CLI exposes variant create, variant list, and finalize as one workflow", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-report-cli-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const source = path.join(sandbox, "brief.txt");
  const projectDir = path.join(sandbox, "report");
  await writeFile(source, "Revenue reached 42 million.", "utf8");
  assert.equal(
    spawnSync(process.execPath, [cli, "create", source, "--out", projectDir], {
      cwd: root,
      encoding: "utf8"
    }).status,
    0
  );

  const created = spawnSync(
    process.execPath,
    [
      cli,
      "variant",
      "create",
      projectDir,
      "--mode",
      "evidence-first",
      "--theme",
      "editorial-light"
    ],
    { cwd: root, encoding: "utf8" }
  );
  assert.equal(created.status, 0, created.stderr);
  const variant = JSON.parse(created.stdout);

  const listed = spawnSync(
    process.execPath,
    [cli, "variant", "list", projectDir],
    { cwd: root, encoding: "utf8" }
  );
  assert.deepEqual(JSON.parse(listed.stdout), [variant]);

  await writeFile(
    path.join(projectDir, "variants", variant.variantId, "artifact.html"),
    '<!doctype html><p data-edit-id="revenue" data-source-ref="brief.txt">42 million</p>',
    "utf8"
  );
  const finalized = spawnSync(
    process.execPath,
    [cli, "finalize", projectDir, "--variant", variant.variantId],
    { cwd: root, encoding: "utf8" }
  );
  assert.equal(finalized.status, 0, finalized.stderr);
  assert.equal(JSON.parse(finalized.stdout).variantId, variant.variantId);
});

test("CLI install copies one Skill into Codex and Claude discovery roots", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-report-install-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const codexRoot = path.join(sandbox, "codex-skills");
  const claudeRoot = path.join(sandbox, "claude-skills");

  const installed = spawnSync(
    process.execPath,
    [
      cli,
      "install",
      "--codex-dir",
      codexRoot,
      "--claude-dir",
      claudeRoot
    ],
    { cwd: root, encoding: "utf8" }
  );

  assert.equal(installed.status, 0, installed.stderr);
  assert.match(
    await readFile(path.join(codexRoot, "edit-html-report", "SKILL.md"), "utf8"),
    /name: edit-html-report/
  );
  assert.equal(
    await readFile(path.join(claudeRoot, "edit-html-report", "SKILL.md"), "utf8"),
    await readFile(path.join(codexRoot, "edit-html-report", "SKILL.md"), "utf8")
  );
});

test("CLI doctor reports whether the local runtime can execute the package", () => {
  const result = spawnSync(process.execPath, [cli, "doctor"], {
    cwd: root,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).checks, {
    node20: true,
    bundledSkill: true
  });
});

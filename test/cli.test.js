import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { completeTestHuashuDesign, writeTestHuashuCandidate } from "./helpers/huashu.js";
import { confirmEditorReview } from "../src/editor-review.js";
import { prepareHuashuInput } from "../src/design-package.js";

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

test("CLI removes public mode selection and creates strategy-derived variants", async (t) => {
  const listed = spawnSync(
    process.execPath,
    [cli, "mode", "list", "--locale", "zh-CN"],
    { cwd: root, encoding: "utf8" }
  );
  assert.notEqual(listed.status, 0);
  assert.match(listed.stderr, /legacy read-only/);

  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-report-cli-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const source = path.join(sandbox, "brief.txt");
  const projectDir = path.join(sandbox, "report");
  await writeFile(source, "Evidence.", "utf8");
  spawnSync(process.execPath, [cli, "create", source, "--out", projectDir], {
    cwd: root,
    encoding: "utf8"
  });
  const created = spawnSync(
    process.execPath,
    [cli, "variant", "create", projectDir],
    { cwd: root, encoding: "utf8" }
  );
  assert.equal(created.status, 0, created.stderr);
  assert.equal(JSON.parse(created.stdout).themeId, "precision-blueprint");
  assert.equal(JSON.parse(created.stdout).modeSelection, "strategy-derived");
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
      "--theme",
      "editorial-light"
    ],
    { cwd: root, encoding: "utf8" }
  );
  assert.equal(created.status, 0, created.stderr);
  const variant = JSON.parse(created.stdout);
  await completeTestHuashuDesign(projectDir, variant.variantId, { render: false });

  const listed = spawnSync(
    process.execPath,
    [cli, "variant", "list", projectDir],
    { cwd: root, encoding: "utf8" }
  );
  assert.equal(JSON.parse(listed.stdout)[0].variantId, variant.variantId);
  assert.ok(JSON.parse(listed.stdout)[0].designSelection.candidateId);

  await writeFile(
    path.join(projectDir, "variants", variant.variantId, "artifact.html"),
    '<!doctype html><body data-report-mode="data-first"><p data-edit-id="revenue" data-source-ref="brief.txt">42 million</p></body>',
    "utf8"
  );
  await confirmEditorReview(projectDir, variant.variantId, { sessionId: "test-cli-editor" });
  const finalized = spawnSync(
    process.execPath,
    [cli, "finalize", projectDir, "--variant", variant.variantId],
    { cwd: root, encoding: "utf8" }
  );
  assert.equal(finalized.status, 0, finalized.stderr);
  const savedVersion = JSON.parse(finalized.stdout);
  assert.equal(savedVersion.variantId, variant.variantId);

  const archivePath = path.join(sandbox, "report.edit-html");
  const packed = spawnSync(
    process.execPath,
    [cli, "pack", projectDir, "--out", archivePath],
    { cwd: root, encoding: "utf8" }
  );
  assert.equal(packed.status, 0, packed.stderr);
  assert.equal(
    (await readFile(archivePath)).subarray(0, 2).toString("ascii"),
    "PK"
  );

  const publishedPath = path.join(sandbox, "published.html");
  const published = spawnSync(
    process.execPath,
    [
      cli,
      "publish",
      "local",
      projectDir,
      "--version",
      savedVersion.versionId,
      "--out",
      publishedPath
    ],
    { cwd: root, encoding: "utf8" }
  );
  assert.equal(published.status, 0, published.stderr);
  assert.match(await readFile(publishedPath, "utf8"), /42 million/);
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

test("CLI imports, lists, confirms, and reports executable design candidates", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-report-candidate-cli-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const source = path.join(sandbox, "brief.txt");
  const projectDir = path.join(sandbox, "report");
  const candidateDir = path.join(sandbox, "candidate");
  await writeFile(source, "Revenue reached 42 million.", "utf8");
  spawnSync(process.execPath, [cli, "create", source, "--out", projectDir], { cwd: root, encoding: "utf8" });
  const created = spawnSync(process.execPath, [
    cli, "variant", "create", projectDir
  ], { cwd: root, encoding: "utf8" });
  assert.equal(created.status, 0, created.stderr);
  const variant = JSON.parse(created.stdout);
  const reportPath = path.join(projectDir, "variants", variant.variantId, "report-model.json");
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  report.editorialStatus = "confirmed";
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  await prepareHuashuInput(projectDir, variant.variantId, { references: ["test://reference"] });
  await writeTestHuashuCandidate(projectDir, variant.variantId, candidateDir);

  const imported = spawnSync(process.execPath, [
    cli, "design", "candidate", "import", projectDir,
    "--variant", variant.variantId, "--from", candidateDir
  ], { cwd: root, encoding: "utf8" });
  assert.equal(imported.status, 0, imported.stderr);
  assert.equal(JSON.parse(imported.stdout).manifest.candidateId, "candidate-test");

  const listed = spawnSync(process.execPath, [
    cli, "design", "candidate", "list", projectDir, "--variant", variant.variantId
  ], { cwd: root, encoding: "utf8" });
  assert.deepEqual(JSON.parse(listed.stdout).map((item) => item.candidateId), ["candidate-test"]);

  const confirmed = spawnSync(process.execPath, [
    cli, "design", "candidate", "confirm", projectDir,
    "--variant", variant.variantId, "--candidate", "candidate-test"
  ], { cwd: root, encoding: "utf8" });
  assert.equal(confirmed.status, 0, confirmed.stderr);
  assert.equal(JSON.parse(confirmed.stdout).designSelection.candidateId, "candidate-test");

  const status = spawnSync(process.execPath, [
    cli, "design", "candidate", "status", projectDir, "--variant", variant.variantId
  ], { cwd: root, encoding: "utf8" });
  assert.equal(JSON.parse(status.stdout).state, "candidate-confirmed");
});

test("CLI open is a background alias for editor open and the session remains reusable", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-report-open-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const source = path.join(sandbox, "brief.txt");
  const projectDir = path.join(sandbox, "report");
  await writeFile(source, "Evidence.", "utf8");
  spawnSync(process.execPath, [cli, "create", source, "--out", projectDir], {
    cwd: root,
    encoding: "utf8"
  });
  const variantResult = spawnSync(
    process.execPath,
    [
      cli,
      "variant",
      "create",
      projectDir,
      "--theme",
      "editorial-light"
    ],
    { cwd: root, encoding: "utf8" }
  );
  const variant = JSON.parse(variantResult.stdout);
  await writeFile(
    path.join(projectDir, "variants", variant.variantId, "artifact.html"),
    '<!doctype html><h1 data-edit-id="title">Editable</h1>',
    "utf8"
  );

  const openedResult = spawnSync(
    process.execPath,
    [
      cli,
      "open",
      projectDir,
      "--variant",
      variant.variantId,
      "--no-browser"
    ],
    { cwd: root, encoding: "utf8", timeout: 10000 }
  );
  assert.equal(openedResult.status, 0, openedResult.stderr);
  const opened = JSON.parse(openedResult.stdout);
  assert.match(opened.url, /^http:\/\/127\.0\.0\.1:\d+\/\?token=/);
  assert.equal((await fetch(opened.url)).status, 200);
  const status = spawnSync(process.execPath, [cli, "editor", "status", projectDir], { cwd: root, encoding: "utf8" });
  assert.equal(status.status, 0, status.stderr);
  assert.equal(JSON.parse(status.stdout).running, true);
  assert.equal(JSON.parse(status.stdout).sessionId, opened.sessionId);

  const reopened = spawnSync(process.execPath, [cli, "editor", "open", projectDir, "--no-browser"], { cwd: root, encoding: "utf8" });
  assert.equal(reopened.status, 0, reopened.stderr);
  assert.equal(JSON.parse(reopened.stdout).reused, true);

  const stopped = spawnSync(process.execPath, [cli, "editor", "stop", projectDir], { cwd: root, encoding: "utf8" });
  assert.equal(stopped.status, 0, stopped.stderr);
  assert.equal(JSON.parse(stopped.stdout).stopped, true);
});

test("CLI render and validate compile a V4 variant", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-report-render-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const source = path.join(sandbox, "brief.txt");
  const projectDir = path.join(sandbox, "report");
  await writeFile(source, "Evidence 42.", "utf8");
  spawnSync(process.execPath, [cli, "create", source, "--out", projectDir], { cwd: root, encoding: "utf8" });
  const variant = JSON.parse(spawnSync(process.execPath, [cli, "variant", "create", projectDir], { cwd: root, encoding: "utf8" }).stdout);

  const pendingStatus = spawnSync(process.execPath, [cli, "design", "candidate", "status", projectDir, "--variant", variant.variantId], { cwd: root, encoding: "utf8" });
  assert.equal(pendingStatus.status, 0, pendingStatus.stderr);
  assert.equal(JSON.parse(pendingStatus.stdout).state, "awaiting-candidate");
  const blocked = spawnSync(process.execPath, [cli, "render", projectDir, "--variant", variant.variantId], { cwd: root, encoding: "utf8" });
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stderr, /confirmed executable Huashu design candidate/);
  await completeTestHuashuDesign(projectDir, variant.variantId, { render: false });
  const confirmedStatus = spawnSync(process.execPath, [cli, "design", "candidate", "status", projectDir, "--variant", variant.variantId], { cwd: root, encoding: "utf8" });
  assert.equal(JSON.parse(confirmedStatus.stdout).state, "candidate-confirmed");
  const rendered = spawnSync(process.execPath, [cli, "render", projectDir, "--variant", variant.variantId], { cwd: root, encoding: "utf8" });
  assert.equal(rendered.status, 0, rendered.stderr);
  const validated = spawnSync(process.execPath, [cli, "validate", projectDir, "--variant", variant.variantId], { cwd: root, encoding: "utf8" });
  assert.equal(validated.status, 0, validated.stderr);
  assert.equal(JSON.parse(validated.stdout).valid, true);
});

import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { completeTestHuashuDesign, writeTestHuashuCandidate } from "./helpers/huashu.js";
import { confirmEditorReview } from "../src/editor-review.js";
import { prepareHuashuInput } from "../src/design-package.js";
import { createProject } from "../src/project.js";
import { createV5Project, createV5Variant } from "../src/v5-project.js";

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
  assert.match(listed.stderr, /removed in V5/);

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
  assert.equal(JSON.parse(created.stdout).modeSelection, "compatibility-only");
});

test("CLI exposes variant create, variant list, and finalize as one workflow", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-report-cli-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const source = path.join(sandbox, "brief.txt");
  const projectDir = path.join(sandbox, "report");
  await writeFile(source, "Revenue reached 42 million.", "utf8");
  await createProject(source, projectDir);

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
  for (const rootDir of [codexRoot, claudeRoot]) {
    const legacyReferences = path.join(rootDir, "edit-html-report", "references");
    await mkdir(legacyReferences, { recursive: true });
    await writeFile(path.join(legacyReferences, "presentation-plan.md"), "legacy", "utf8");
  }

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
  await assert.rejects(access(path.join(codexRoot, "edit-html-report", "references", "presentation-plan.md")));
  await assert.rejects(access(path.join(claudeRoot, "edit-html-report", "references", "presentation-plan.md")));
});

test("CLI doctor reports version authority and project runtime diagnostics", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-report-doctor-"));
  const projectDir = path.join(sandbox, "report");
  const source = path.join(sandbox, "brief.txt");
  await writeFile(source, "Evidence.", "utf8");
  await createV5Project(source, projectDir);
  t.after(() => rm(sandbox, { recursive: true, force: true }));

  const result = spawnSync(process.execPath, [cli, "doctor", "--project", projectDir, "--json"], {
    cwd: root,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  const doctor = JSON.parse(result.stdout);
  assert.equal(doctor.toolVersion, "5.3.0");
  assert.equal(doctor.pipelineVersion, "5.3.0");
  assert.equal(doctor.artifactContractVersion, "5.3.0");
  assert.equal(doctor.editorRuntimeVersion, "5.3.0");
  assert.equal(doctor.executablePath, path.resolve(cli));
  assert.equal(doctor.packageRoot, root);
  assert.equal(doctor.runtimeStatus, "current");
});

test("CLI doctor warns about stale runtime and legacy artifact metadata", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-report-doctor-warning-"));
  const projectDir = path.join(sandbox, "report");
  const source = path.join(sandbox, "brief.txt");
  await writeFile(source, "Evidence.", "utf8");
  await createV5Project(source, projectDir);
  const manifestPath = path.join(projectDir, ".editor-runtime", "runtime-manifest.json");
  const projectPath = path.join(projectDir, "project.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const project = JSON.parse(await readFile(projectPath, "utf8"));
  await writeFile(manifestPath, JSON.stringify({ ...manifest, runtimeVersion: "5.2.1" }), "utf8");
  await writeFile(projectPath, JSON.stringify({ ...project, artifactContractVersion: "5.2.1" }), "utf8");
  t.after(() => rm(sandbox, { recursive: true, force: true }));

  const result = spawnSync(process.execPath, [cli, "doctor", "--project", projectDir, "--json"], {
    cwd: root,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  const doctor = JSON.parse(result.stdout);
  assert.equal(doctor.runtimeStatus, "stale");
  assert.equal(doctor.legacyArtifactContract, true);
  assert.deepEqual(doctor.warnings, [
    "project runtime is stale",
    "project metadata uses a legacy artifact contract"
  ]);
});

test("CLI editor open refreshes a stale runtime without altering variants, versions, or publications", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-report-open-runtime-"));
  const projectDir = path.join(sandbox, "report");
  const source = path.join(sandbox, "brief.txt");
  await writeFile(source, "Evidence.", "utf8");
  await createV5Project(source, projectDir);
  const variant = await createV5Variant(projectDir);
  await writeFile(path.join(projectDir, "variants", variant.variantId, "artifact.html"), "<!doctype html><h1>Editable</h1>", "utf8");
  const projectPath = path.join(projectDir, "project.json");
  const before = JSON.parse(await readFile(projectPath, "utf8"));
  const manifestPath = path.join(projectDir, ".editor-runtime", "runtime-manifest.json");
  await writeFile(manifestPath, JSON.stringify({
    runtimeVersion: "5.2.1",
    sourcePackageRoot: "C:\\old-checkout",
    sourceSha256: "old-runtime-hash",
    installedAt: "2026-01-01T00:00:00.000Z"
  }), "utf8");
  t.after(async () => {
    spawnSync(process.execPath, [cli, "editor", "stop", projectDir], { cwd: root, encoding: "utf8" });
    await rm(sandbox, { recursive: true, force: true });
  });

  const opened = spawnSync(process.execPath, [cli, "editor", "open", projectDir, "--no-browser"], {
    cwd: root,
    encoding: "utf8",
    timeout: 10000
  });

  assert.equal(opened.status, 0, opened.stderr);
  assert.equal(JSON.parse(await readFile(manifestPath, "utf8")).runtimeVersion, "5.3.0");
  const after = JSON.parse(await readFile(projectPath, "utf8"));
  assert.deepEqual(after.variants, before.variants);
  assert.deepEqual(after.versions, before.versions);
  assert.deepEqual(after.publications, before.publications);
});

test("CLI runtime refresh reports the old and new runtime hashes", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-report-runtime-cli-"));
  const projectDir = path.join(sandbox, "report");
  const source = path.join(sandbox, "brief.txt");
  await writeFile(source, "Evidence.", "utf8");
  await createV5Project(source, projectDir);
  const manifestPath = path.join(projectDir, ".editor-runtime", "runtime-manifest.json");
  await writeFile(manifestPath, JSON.stringify({
    runtimeVersion: "5.2.1",
    sourcePackageRoot: "C:\\old-checkout",
    sourceSha256: "old-runtime-hash",
    installedAt: "2026-01-01T00:00:00.000Z"
  }), "utf8");
  t.after(() => rm(sandbox, { recursive: true, force: true }));

  const refreshed = spawnSync(process.execPath, [cli, "runtime", "refresh", projectDir], {
    cwd: root,
    encoding: "utf8"
  });

  assert.equal(refreshed.status, 0, refreshed.stderr);
  assert.deepEqual(JSON.parse(refreshed.stdout), {
    oldRuntimeHash: "old-runtime-hash",
    newRuntimeHash: JSON.parse(await readFile(manifestPath, "utf8")).sourceSha256
  });
});

test("CLI imports, lists, confirms, and reports executable design candidates", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-report-candidate-cli-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const source = path.join(sandbox, "brief.txt");
  const projectDir = path.join(sandbox, "report");
  const candidateDir = path.join(sandbox, "candidate");
  await writeFile(source, "Revenue reached 42 million.", "utf8");
  await createProject(source, projectDir);
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
  assert.equal(opened.handoff.kind, "visible-editor");
  assert.equal(opened.handoff.editorUrl, opened.url);
  assert.equal("confirmationRequired" in opened.handoff, false);
  assert.equal(opened.handoff.variantId, variant.variantId);
  assert.equal(path.isAbsolute(opened.handoff.launcherPath), true);
  await access(opened.handoff.launcherPath);
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

test("CLI preserves V4 artifacts but rejects V4 regeneration", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-report-render-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const source = path.join(sandbox, "brief.txt");
  const projectDir = path.join(sandbox, "report");
  await writeFile(source, "Evidence 42.", "utf8");
  await createProject(source, projectDir);
  const variant = JSON.parse(spawnSync(process.execPath, [cli, "variant", "create", projectDir], { cwd: root, encoding: "utf8" }).stdout);

  const pendingStatus = spawnSync(process.execPath, [cli, "design", "candidate", "status", projectDir, "--variant", variant.variantId], { cwd: root, encoding: "utf8" });
  assert.equal(pendingStatus.status, 0, pendingStatus.stderr);
  assert.equal(JSON.parse(pendingStatus.stdout).state, "awaiting-candidate");
  const blocked = spawnSync(process.execPath, [cli, "render", projectDir, "--variant", variant.variantId], { cwd: root, encoding: "utf8" });
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stderr, /V4\.x regeneration is disabled/);
});

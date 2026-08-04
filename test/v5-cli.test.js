import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "bin", "edit-html-report.js");

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: "utf8" });
}

test("V5 CLI creates a source-pack project and gates design preparation on the interview", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-v5-cli-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const source = path.join(sandbox, "brief.md");
  const project = path.join(sandbox, "project");
  await writeFile(source, "# 市场\n2028年预计达到189亿元。", "utf8");

  const created = run(["create", source, "--out", project]);
  assert.equal(created.status, 0, created.stderr);
  assert.equal(JSON.parse(created.stdout).schemaVersion, 5);

  const variantResult = run(["variant", "create", project]);
  assert.equal(variantResult.status, 0, variantResult.stderr);
  const variant = JSON.parse(variantResult.stdout);
  assert.equal(variant.pipelineState, "awaiting-interview");
  for (const legacyArgs of [
    ["design", "import", project, "--variant", variant.variantId, "--from", sandbox],
    ["design", "confirm", project, "--variant", variant.variantId],
    ["design", "status", project, "--variant", variant.variantId],
  ]) {
    const rejected = run(legacyArgs);
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /legacy design command.+V5/i);
  }
  const blocked = run(["design", "prepare", project, "--variant", variant.variantId]);
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stderr, /confirmed interview/);

  const interview = {
    schemaVersion: 2,
    variantId: variant.variantId,
    answers: Object.fromEntries(["purpose", "contentWeight"].map((key) => [key, {
      question: key,
      response: "用户回答",
      origin: "user-provided",
      recordedAt: "2026-08-04T10:00:00.000Z"
    }])),
    references: []
  };
  const interviewPath = path.join(sandbox, "interview.json");
  await writeFile(interviewPath, JSON.stringify(interview), "utf8");
  const imported = run(["interview", "import", project, "--variant", variant.variantId, "--from", interviewPath]);
  assert.equal(imported.status, 0, imported.stderr);
  assert.equal(JSON.parse(imported.stdout).status, "confirmed");
  const status = run(["interview", "status", project, "--variant", variant.variantId]);
  assert.equal(JSON.parse(status.stdout).requiredTopics.length, 2);
  const prepared = run(["design", "prepare", project, "--variant", variant.variantId]);
  assert.equal(prepared.status, 0, prepared.stderr);
  assert.equal(JSON.parse(prepared.stdout).strategySelection, "three-executable-samples");
  await readFile(path.join(project, "variants", variant.variantId, "design", "huashu-input", "manifest.json"));
  await readFile(path.join(project, "variants", variant.variantId, "design", "huashu-input", "content-brief.json"));
});

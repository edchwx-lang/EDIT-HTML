import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "bin", "edit-html-report.js");

test("candidate preflight CLI returns JSON and a nonzero exit for aggregated errors", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-preflight-cli-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const project = path.join(sandbox, "project");
  const candidates = path.join(sandbox, "candidates");
  await mkdir(path.join(project, "variants", "v"), { recursive: true });
  await mkdir(candidates, { recursive: true });
  await writeFile(path.join(project, "project.json"), JSON.stringify({ schemaVersion: 5 }));
  await writeFile(path.join(project, "source-model.json"), JSON.stringify({ documents: [{ units: [] }] }));
  await writeFile(path.join(project, "variants", "v", "variant.json"), JSON.stringify({ releaseVersion: "5.4.1" }));
  const result = spawnSync(process.execPath, [cli, "design", "preflight", "candidate", project, "--variant", "v", "--from", candidates], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  const output = JSON.parse(result.stdout);
  assert.equal(output.valid, false);
  assert.ok(output.errors.some((item) => item.code === "candidate-count"));
});

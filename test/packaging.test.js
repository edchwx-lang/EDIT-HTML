import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { strFromU8, unzipSync } from "fflate";

import { packProject } from "../src/packaging.js";
import { createProject } from "../src/project.js";
import { createVariant } from "../src/variants.js";

test("packProject creates a portable ZIP with relative project paths", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-report-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const source = path.join(sandbox, "brief.txt");
  const projectDir = path.join(sandbox, "report");
  const archivePath = path.join(sandbox, "report.edit-html");
  await writeFile(source, "Evidence.", "utf8");
  await createProject(source, projectDir);
  const variant = await createVariant(projectDir, {
    mode: "evidence-first",
    theme: "editorial-light"
  });
  await writeFile(
    path.join(projectDir, "variants", variant.variantId, "artifact.html"),
    '<!doctype html><p data-edit-id="body">Evidence.</p>',
    "utf8"
  );
  await writeFile(path.join(projectDir, ".runtime", "editor-session.json"), "secret", "utf8");

  await packProject(projectDir, archivePath);
  const archive = await readFile(archivePath);
  assert.equal(archive.subarray(0, 2).toString("ascii"), "PK");
  const files = unzipSync(archive);
  assert.equal(
    JSON.parse(strFromU8(files["project.json"])).projectId.length,
    36
  );
  assert.equal(
    strFromU8(files["source/brief.txt"]),
    "Evidence."
  );
  assert.equal(
    strFromU8(files["variants/" + variant.variantId + "/artifact.html"]),
    '<!doctype html><p data-edit-id="body">Evidence.</p>'
  );
  assert.equal(Object.keys(files).some((name) => path.isAbsolute(name)), false);
  assert.equal(Object.keys(files).some((name) => name.startsWith(".runtime/")), false);
  assert.equal(Object.keys(files).includes("打开编辑器.cmd"), true);
  assert.equal(Object.keys(files).includes("open-editor.sh"), true);
});

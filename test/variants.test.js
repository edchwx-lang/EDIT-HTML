import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createProject } from "../src/project.js";
import { createVariant, listVariants } from "../src/variants.js";

async function newProject(t) {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-report-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const source = path.join(sandbox, "brief.txt");
  const projectDir = path.join(sandbox, "report");
  await writeFile(source, "Evidence.", "utf8");
  await createProject(source, projectDir);
  return projectDir;
}

test("createVariant preserves each mode as a separate immutable identity", async (t) => {
  const projectDir = await newProject(t);

  const first = await createVariant(projectDir, {
    mode: "evidence-first",
    theme: "editorial-light"
  });
  const second = await createVariant(projectDir, {
    mode: "data-first",
    theme: "tech-dark"
  });

  assert.notEqual(first.variantId, second.variantId);
  assert.deepEqual(
    (await listVariants(projectDir)).map(({ mode, theme }) => ({ mode, theme })),
    [
      { mode: "evidence-first", theme: "editorial-light" },
      { mode: "data-first", theme: "tech-dark" }
    ]
  );
  assert.equal(
    JSON.parse(await readFile(path.join(projectDir, "project.json"), "utf8"))
      .activeVariantId,
    second.variantId
  );
});

test("createVariant rejects a theme that belongs to another mode", async (t) => {
  const projectDir = await newProject(t);

  await assert.rejects(
    createVariant(projectDir, {
      mode: "evidence-first",
      theme: "tech-dark"
    }),
    /theme "tech-dark" is not valid for mode "evidence-first"/
  );
});


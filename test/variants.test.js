import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createProject } from "../src/project.js";
import {
  createVariant,
  listVariants,
  updateVariantTheme
} from "../src/variants.js";

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
    themeId: "warm-paper-terracotta"
  });
  const second = await createVariant(projectDir, {
    mode: "data-first",
    themeId: "ink-teal"
  });

  assert.notEqual(first.variantId, second.variantId);
  assert.deepEqual(
    (await listVariants(projectDir)).map(({ mode, themeId }) => ({ mode, themeId })),
    [
      { mode: "evidence-first", themeId: "warm-paper-terracotta" },
      { mode: "data-first", themeId: "ink-teal" }
    ]
  );
  assert.equal(
    JSON.parse(await readFile(path.join(projectDir, "project.json"), "utf8"))
      .activeVariantId,
    second.variantId
  );
});

test("all approved themes can be selected for either structural mode", async (t) => {
  const projectDir = await newProject(t);

  const evidence = await createVariant(projectDir, {
    mode: "evidence-first",
    themeId: "signal-orange"
  });
  const data = await createVariant(projectDir, {
    mode: "data-first",
    themeId: "warm-paper-terracotta"
  });

  assert.equal(evidence.themeId, "signal-orange");
  assert.equal(data.themeId, "warm-paper-terracotta");
});

test("updateVariantTheme changes state without touching draft report structure", async (t) => {
  const projectDir = await newProject(t);
  const variant = await createVariant(projectDir, {
    mode: "evidence-first",
    themeId: "warm-paper-terracotta"
  });
  const artifactPath = path.join(
    projectDir,
    "variants",
    variant.variantId,
    "artifact.html"
  );
  await writeFile(
    artifactPath,
    '<!doctype html><html><body><p data-edit-id="body">Evidence</p></body></html>',
    "utf8"
  );
  const before = await readFile(artifactPath, "utf8");

  const updated = await updateVariantTheme(
    projectDir,
    variant.variantId,
    "signal-orange"
  );

  assert.equal(updated.themeId, "signal-orange");
  assert.equal(await readFile(artifactPath, "utf8"), before);
  assert.equal((await listVariants(projectDir))[0].themeId, "signal-orange");
});

test("legacy variant theme ids normalize when records are read", async (t) => {
  const projectDir = await newProject(t);
  const variant = await createVariant(projectDir, {
    mode: "data-first",
    theme: "tech-dark"
  });

  assert.equal(variant.themeId, "ink-teal");
  assert.equal(variant.theme, undefined);
});

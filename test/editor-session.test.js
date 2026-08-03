import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ensureEditorSession, getEditorSessionStatus, stopEditorSession } from "../src/editor-session.js";
import { createProject } from "../src/project.js";
import { createVariant } from "../src/variants.js";
import { completeTestHuashuDesign } from "./helpers/huashu.js";

test("editor session is backgrounded, reused, stopped, and restarted", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-report-session-"));
  const projectDir = path.join(sandbox, "report");
  const source = path.join(sandbox, "brief.txt");
  await writeFile(source, "Evidence 42.", "utf8");
  await createProject(source, projectDir);
  const variant = await createVariant(projectDir, { mode: "evidence-first" });
  await completeTestHuashuDesign(projectDir, variant.variantId);
  t.after(async () => {
    await stopEditorSession(projectDir).catch(() => {});
    await rm(sandbox, { recursive: true, force: true });
  });

  const first = await ensureEditorSession(projectDir, { variantId: variant.variantId });
  assert.equal(first.reused, false);
  assert.equal((await fetch(first.url + "/api/health")).status, 200);
  const metadata = JSON.parse(await readFile(path.join(projectDir, ".runtime", "editor-session.json"), "utf8"));
  assert.equal(metadata.pid, first.pid);
  assert.equal(metadata.variantId, variant.variantId);
  assert.equal(metadata.projectDir, path.resolve(projectDir));

  const savedResponse = await fetch(first.url + "/api/versions", {
    method: "POST",
    headers: { authorization: "Bearer " + first.token, "content-type": "application/json" },
    body: JSON.stringify({ message: "Session checkpoint" })
  });
  assert.equal(savedResponse.status, 201);
  const savedVersion = await savedResponse.json();
  const updatedMetadata = JSON.parse(await readFile(path.join(projectDir, ".runtime", "editor-session.json"), "utf8"));
  assert.equal(updatedMetadata.activeVersionId, savedVersion.versionId);

  const reused = await ensureEditorSession(projectDir, { variantId: variant.variantId });
  assert.equal(reused.reused, true);
  assert.equal(reused.sessionId, first.sessionId);

  const stopped = await stopEditorSession(projectDir);
  assert.equal(stopped.stopped, true);
  assert.equal((await getEditorSessionStatus(projectDir)).running, false);

  const restarted = await ensureEditorSession(projectDir, { variantId: variant.variantId });
  assert.equal(restarted.reused, false);
  assert.notEqual(restarted.sessionId, first.sessionId);
});

test("editor session discards stale metadata before starting", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-report-session-"));
  const projectDir = path.join(sandbox, "report");
  const source = path.join(sandbox, "brief.txt");
  await writeFile(source, "Evidence.", "utf8");
  await createProject(source, projectDir);
  const variant = await createVariant(projectDir, { mode: "evidence-first" });
  await completeTestHuashuDesign(projectDir, variant.variantId);
  t.after(async () => {
    await stopEditorSession(projectDir).catch(() => {});
    await rm(sandbox, { recursive: true, force: true });
  });
  await writeFile(
    path.join(projectDir, ".runtime", "editor-session.json"),
    JSON.stringify({ pid: 999999, port: 1, token: "stale", sessionId: "stale", projectDir, variantId: variant.variantId }),
    "utf8"
  );

  const opened = await ensureEditorSession(projectDir, { variantId: variant.variantId });
  assert.equal(opened.reused, false);
  assert.notEqual(opened.sessionId, "stale");
});

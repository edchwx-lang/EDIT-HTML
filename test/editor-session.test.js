import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ensureEditorSession, getEditorSessionStatus, recordEditorSession, stopEditorSession } from "../src/editor-session.js";
import { getProjectRuntimeManifest, refreshProjectEditorRuntime } from "../src/project-runtime.js";
import { startEditorServer } from "../src/editor-server.js";
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

test("a copied project does not reuse or stop the source project's live editor", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-report-session-copy-"));
  const sourceProject = path.join(sandbox, "source-report");
  const copiedProject = path.join(sandbox, "copied-report");
  const source = path.join(sandbox, "brief.txt");
  await writeFile(source, "Evidence.", "utf8");
  await createProject(source, sourceProject);
  const variant = await createVariant(sourceProject, { mode: "evidence-first" });
  await completeTestHuashuDesign(sourceProject, variant.variantId);
  const sourceSession = await ensureEditorSession(sourceProject, { variantId: variant.variantId });
  await cp(sourceProject, copiedProject, { recursive: true });
  t.after(async () => {
    await stopEditorSession(sourceProject).catch(() => {});
    await stopEditorSession(copiedProject).catch(() => {});
    await rm(sandbox, { recursive: true, force: true });
  });

  const copiedSession = await ensureEditorSession(copiedProject, { variantId: variant.variantId });
  assert.equal(copiedSession.reused, false);
  assert.notEqual(copiedSession.sessionId, sourceSession.sessionId);
  assert.equal(copiedSession.projectDir, path.resolve(copiedProject));
  assert.equal((await fetch(sourceSession.url + "/api/health")).status, 200);
});

test("session stop discards hash-mismatched metadata without shutting down the live server", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-report-session-hash-"));
  const projectDir = path.join(sandbox, "report");
  const source = path.join(sandbox, "brief.txt");
  await writeFile(source, "Evidence.", "utf8");
  await createProject(source, projectDir);
  const variant = await createVariant(projectDir, { mode: "evidence-first" });
  await completeTestHuashuDesign(projectDir, variant.variantId);
  const session = await ensureEditorSession(projectDir, { variantId: variant.variantId });
  t.after(async () => {
    await fetch(session.url + "/api/shutdown", {
      method: "POST",
      headers: { authorization: "Bearer " + session.token }
    }).catch(() => {});
    await rm(sandbox, { recursive: true, force: true });
  });

  const metadataPath = path.join(projectDir, ".runtime", "editor-session.json");
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  await writeFile(metadataPath, JSON.stringify({ ...metadata, runtimeSha256: "unrelated-runtime-hash" }), "utf8");

  const stopped = await stopEditorSession(projectDir);
  assert.equal(stopped.stopped, false);
  assert.equal((await fetch(session.url + "/api/health")).status, 200);
  await assert.rejects(readFile(metadataPath));
});

test("session stop requires the health endpoint to confirm the recorded PID", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-report-session-pid-"));
  const projectDir = path.join(sandbox, "report");
  const source = path.join(sandbox, "brief.txt");
  await writeFile(source, "Evidence.", "utf8");
  await createProject(source, projectDir);
  const variant = await createVariant(projectDir, { mode: "evidence-first" });
  await completeTestHuashuDesign(projectDir, variant.variantId);
  const session = await ensureEditorSession(projectDir, { variantId: variant.variantId });
  t.after(async () => {
    await fetch(session.url + "/api/shutdown", {
      method: "POST",
      headers: { authorization: "Bearer " + session.token }
    }).catch(() => {});
    await rm(sandbox, { recursive: true, force: true });
  });

  const metadataPath = path.join(projectDir, ".runtime", "editor-session.json");
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  await writeFile(metadataPath, JSON.stringify({ ...metadata, pid: metadata.pid + 1 }), "utf8");

  const stopped = await stopEditorSession(projectDir);
  assert.equal(stopped.stopped, false);
  assert.equal((await fetch(session.url + "/api/health")).status, 200);
  await assert.rejects(readFile(metadataPath));
});

test("rejected shutdown preserves trusted session metadata and blocks runtime refresh", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-report-session-reject-"));
  const projectDir = path.join(sandbox, "report");
  const source = path.join(sandbox, "brief.txt");
  await writeFile(source, "Evidence.", "utf8");
  await createProject(source, projectDir);
  const variant = await createVariant(projectDir, { mode: "evidence-first" });
  await completeTestHuashuDesign(projectDir, variant.variantId);
  const session = await ensureEditorSession(projectDir, { variantId: variant.variantId });
  t.after(async () => {
    await fetch(session.url + "/api/shutdown", {
      method: "POST",
      headers: { authorization: "Bearer " + session.token }
    }).catch(() => {});
    await rm(sandbox, { recursive: true, force: true });
  });

  const metadataPath = path.join(projectDir, ".runtime", "editor-session.json");
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  const rejected = { ...metadata, token: "incorrect-token" };
  await writeFile(metadataPath, JSON.stringify(rejected), "utf8");

  const stopped = await stopEditorSession(projectDir, { shutdownTimeoutMs: 50 });
  assert.deepEqual(stopped, { stopped: false, reason: "shutdown-rejected" });
  assert.deepEqual(JSON.parse(await readFile(metadataPath, "utf8")), rejected);
  assert.equal((await fetch(session.url + "/api/health")).status, 200);
  await assert.rejects(refreshProjectEditorRuntime(projectDir), /could not stop verified editor session/);
  assert.deepEqual(JSON.parse(await readFile(metadataPath, "utf8")), rejected);
});

test("shutdown timeout preserves trusted metadata while the health endpoint remains available", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-report-session-timeout-"));
  const projectDir = path.join(sandbox, "report");
  const source = path.join(sandbox, "brief.txt");
  await writeFile(source, "Evidence.", "utf8");
  await createProject(source, projectDir);
  const variant = await createVariant(projectDir, { mode: "evidence-first" });
  await completeTestHuashuDesign(projectDir, variant.variantId);
  const runtimeSha256 = (await getProjectRuntimeManifest(projectDir)).sourceSha256;
  const editor = await startEditorServer({
    projectDir,
    variantId: variant.variantId,
    token: "accepted-token",
    sessionId: "timeout-session",
    runtimeSha256,
    pid: process.pid,
    onShutdown: () => {}
  });
  const metadata = {
    pid: process.pid,
    port: editor.port,
    token: editor.token,
    sessionId: editor.sessionId,
    runtimeSha256,
    projectDir: path.resolve(projectDir),
    variantId: variant.variantId,
    url: editor.url
  };
  await recordEditorSession(projectDir, metadata);
  t.after(async () => {
    await editor.close().catch(() => {});
    await rm(sandbox, { recursive: true, force: true });
  });

  const stopped = await stopEditorSession(projectDir, { shutdownTimeoutMs: 50 });

  assert.deepEqual(stopped, { stopped: false, reason: "shutdown-timeout" });
  assert.deepEqual(JSON.parse(await readFile(path.join(projectDir, ".runtime", "editor-session.json"), "utf8")), metadata);
  assert.equal((await fetch(editor.url + "/api/health")).status, 200);
});

test("variant switch refuses to replace a session whose shutdown is rejected", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-report-session-switch-reject-"));
  const projectDir = path.join(sandbox, "report");
  const source = path.join(sandbox, "brief.txt");
  await writeFile(source, "Evidence.", "utf8");
  await createProject(source, projectDir);
  const firstVariant = await createVariant(projectDir, { mode: "evidence-first" });
  const secondVariant = await createVariant(projectDir, { mode: "evidence-first" });
  await completeTestHuashuDesign(projectDir, firstVariant.variantId);
  const firstSession = await ensureEditorSession(projectDir, { variantId: firstVariant.variantId });
  t.after(async () => {
    const current = await readSessionMetadata(projectDir);
    if (current) await fetch(current.url + "/api/shutdown", { method: "POST", headers: { authorization: "Bearer " + current.token } }).catch(() => {});
    await fetch(firstSession.url + "/api/shutdown", { method: "POST", headers: { authorization: "Bearer " + firstSession.token } }).catch(() => {});
    await rm(sandbox, { recursive: true, force: true });
  });

  const metadataPath = path.join(projectDir, ".runtime", "editor-session.json");
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  const rejected = { ...metadata, token: "incorrect-token" };
  await writeFile(metadataPath, JSON.stringify(rejected), "utf8");

  await assert.rejects(
    ensureEditorSession(projectDir, { variantId: secondVariant.variantId, shutdownTimeoutMs: 50 }),
    /could not stop current editor session: shutdown-rejected/
  );
  assert.deepEqual(JSON.parse(await readFile(metadataPath, "utf8")), rejected);
  assert.equal((await fetch(firstSession.url + "/api/health")).status, 200);
});

test("variant switch refuses to replace a session whose shutdown times out", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-report-session-switch-timeout-"));
  const projectDir = path.join(sandbox, "report");
  const source = path.join(sandbox, "brief.txt");
  await writeFile(source, "Evidence.", "utf8");
  await createProject(source, projectDir);
  const firstVariant = await createVariant(projectDir, { mode: "evidence-first" });
  const secondVariant = await createVariant(projectDir, { mode: "evidence-first" });
  await completeTestHuashuDesign(projectDir, firstVariant.variantId);
  const runtimeSha256 = (await getProjectRuntimeManifest(projectDir)).sourceSha256;
  const editor = await startEditorServer({
    projectDir,
    variantId: firstVariant.variantId,
    token: "accepted-token",
    sessionId: "switch-timeout-session",
    runtimeSha256,
    pid: process.pid,
    onShutdown: () => {}
  });
  const metadata = {
    pid: process.pid,
    port: editor.port,
    token: editor.token,
    sessionId: editor.sessionId,
    runtimeSha256,
    projectDir: path.resolve(projectDir),
    variantId: firstVariant.variantId,
    url: editor.url
  };
  await recordEditorSession(projectDir, metadata);
  t.after(async () => {
    await editor.close().catch(() => {});
    await rm(sandbox, { recursive: true, force: true });
  });

  await assert.rejects(
    ensureEditorSession(projectDir, { variantId: secondVariant.variantId, shutdownTimeoutMs: 50 }),
    /could not stop current editor session: shutdown-timeout/
  );
  assert.deepEqual(JSON.parse(await readFile(path.join(projectDir, ".runtime", "editor-session.json"), "utf8")), metadata);
  assert.equal((await fetch(editor.url + "/api/health")).status, 200);
});

async function readSessionMetadata(projectDir) {
  try {
    return JSON.parse(await readFile(path.join(projectDir, ".runtime", "editor-session.json"), "utf8"));
  } catch {
    return null;
  }
}

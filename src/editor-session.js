import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { writeJsonAtomic } from "./io.js";
import { getProjectRuntimeManifest } from "./project-runtime.js";

const workerPath = fileURLToPath(new URL("./editor-session-worker.js", import.meta.url));

export async function ensureEditorSession(projectDir, { variantId } = {}) {
  const absoluteProjectDir = path.resolve(projectDir);
  const selectedVariantId = variantId ?? await readActiveVariantId(absoluteProjectDir);
  const runtimeSha256 = await readRuntimeSha256(absoluteProjectDir);
  const current = await readSession(absoluteProjectDir);
  const belongsToProject = await sessionBelongsToProject(current, absoluteProjectDir, runtimeSha256);
  if (belongsToProject && current.variantId === selectedVariantId) {
    return { ...current, reused: true };
  }
  await discardSession(absoluteProjectDir, current, runtimeSha256);

  const runtimeDir = path.join(absoluteProjectDir, ".runtime");
  await mkdir(runtimeDir, { recursive: true });
  const token = randomBytes(32).toString("base64url");
  const sessionId = randomUUID();
  const child = spawn(
    process.execPath,
    [workerPath, absoluteProjectDir, "--variant", selectedVariantId, "--token", token, "--session-id", sessionId, "--runtime-sha256", runtimeSha256],
    { detached: true, stdio: "ignore", windowsHide: true }
  );
  child.unref();

  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const session = await readSession(absoluteProjectDir);
    if (session?.sessionId === sessionId && await sessionBelongsToProject(session, absoluteProjectDir, runtimeSha256)) {
      return { ...session, reused: false };
    }
    await delay(80);
  }
  throw new Error("editor session did not become healthy");
}

export async function getEditorSessionStatus(projectDir) {
  const absoluteProjectDir = path.resolve(projectDir);
  const [session, runtimeSha256] = await Promise.all([readSession(absoluteProjectDir), readRuntimeSha256(absoluteProjectDir)]);
  const running = Boolean(await sessionBelongsToProject(session, absoluteProjectDir, runtimeSha256));
  return { running, ...(session ?? {}) };
}

export async function stopEditorSession(projectDir, { runtimeSha256 = undefined } = {}) {
  const absoluteProjectDir = path.resolve(projectDir);
  const session = await readSession(absoluteProjectDir);
  if (!session) return { stopped: false, reason: "not-running" };
  const expectedRuntimeSha256 = runtimeSha256 === undefined
    ? await readRuntimeSha256(absoluteProjectDir)
    : runtimeSha256;
  if (!await sessionBelongsToProject(session, absoluteProjectDir, expectedRuntimeSha256)) {
    await rm(sessionPath(absoluteProjectDir), { force: true });
    return { stopped: false, reason: "unverified-session" };
  }
  try {
    await fetch(session.url + "/api/shutdown", {
      method: "POST",
      headers: { authorization: "Bearer " + session.token }
    });
  } catch {}
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline && await sessionIsHealthy(session, absoluteProjectDir, expectedRuntimeSha256)) await delay(50);
  await rm(sessionPath(absoluteProjectDir), { force: true });
  return { stopped: true, sessionId: session.sessionId };
}

export function launchBrowser(url) {
  const command = process.platform === "win32"
    ? { file: "cmd", args: ["/c", "start", "", url] }
    : process.platform === "darwin"
      ? { file: "open", args: [url] }
      : { file: "xdg-open", args: [url] };
  const child = spawn(command.file, command.args, { detached: true, stdio: "ignore", windowsHide: true });
  child.unref();
}

async function readActiveVariantId(projectDir) {
  const project = JSON.parse(await readFile(path.join(projectDir, "project.json"), "utf8"));
  if (!project.activeVariantId) throw new Error("project has no active variant");
  return project.activeVariantId;
}

async function readSession(projectDir) {
  try {
    return JSON.parse(await readFile(sessionPath(projectDir), "utf8"));
  } catch {
    return null;
  }
}

async function sessionBelongsToProject(session, projectDir, runtimeSha256) {
  if (!session?.pid || !Number.isInteger(session.pid) || session.pid <= 0) return false;
  if (!samePath(session.projectDir, projectDir)) return false;
  if (!runtimeSha256 || session.runtimeSha256 !== runtimeSha256) return false;
  return sessionIsHealthy(session, projectDir, runtimeSha256);
}

async function sessionIsHealthy(session, projectDir, runtimeSha256) {
  if (!session?.url || !session?.sessionId) return false;
  try {
    const response = await fetch(session.url + "/api/health", { signal: AbortSignal.timeout(800) });
    if (!response.ok) return false;
    const health = await response.json();
    return health.sessionId === session.sessionId &&
      health.variantId === session.variantId &&
      samePath(health.projectDir, projectDir) &&
      health.runtimeSha256 === runtimeSha256 &&
      health.pid === session.pid;
  } catch {
    return false;
  }
}

async function discardSession(projectDir, session, runtimeSha256) {
  if (session && await sessionBelongsToProject(session, projectDir, runtimeSha256)) {
    await stopEditorSession(projectDir, { runtimeSha256 });
  } else {
    await rm(sessionPath(projectDir), { force: true });
  }
}

async function readRuntimeSha256(projectDir) {
  return (await getProjectRuntimeManifest(projectDir))?.sourceSha256 ?? null;
}

function sessionPath(projectDir) {
  return path.join(projectDir, ".runtime", "editor-session.json");
}

function samePath(left, right) {
  if (!left || !right) return false;
  const normalize = (value) => {
    const resolved = path.resolve(value);
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
  };
  return normalize(left) === normalize(right);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function recordEditorSession(projectDir, session) {
  await mkdir(path.join(projectDir, ".runtime"), { recursive: true });
  await writeJsonAtomic(sessionPath(projectDir), session);
}

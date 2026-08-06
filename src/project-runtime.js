import { createHash, randomUUID } from "node:crypto";
import { chmod, copyFile, cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { EDITOR_RUNTIME_VERSION } from "./version-manifest.js";

const sourceRoot = path.dirname(fileURLToPath(import.meta.url));
const sourcePackageRoot = path.dirname(sourceRoot);
const runtimeFiles = [
  "artifact-contract.js", "chart-data.js", "design-package.js", "drafts.js", "editor-server.js", "editor-session.js",
  "editor-review.js", "editor-session-worker.js", "editor-shell.js", "editorial-model.js", "finalize.js", "io.js",
  "publish.js", "renderer.js", "report-model.js", "theme-artifact.js",
  "themes.js", "variants.js", "versions.js", "modes/data-first.js",
  "modes/evidence-first.js", "modes/index.js", "version-manifest.js"
];

export async function installProjectEditorRuntime(projectDir) {
  return refreshProjectEditorRuntime(projectDir);
}

export async function ensureProjectEditorRuntime(projectDir) {
  const absoluteProjectDir = path.resolve(projectDir);
  const [installed, expected] = await Promise.all([
    getProjectRuntimeManifest(absoluteProjectDir),
    getSourceRuntimeManifest()
  ]);
  if (runtimeManifestIsCurrent(installed, expected)) {
    return { refreshed: false, oldRuntimeHash: installed.sourceSha256, newRuntimeHash: installed.sourceSha256 };
  }
  return { refreshed: true, ...await refreshProjectEditorRuntime(absoluteProjectDir, installed) };
}

export async function refreshProjectEditorRuntime(projectDir, knownManifest = undefined) {
  const absoluteProjectDir = path.resolve(projectDir);
  const previous = knownManifest === undefined
    ? await getProjectRuntimeManifest(absoluteProjectDir)
    : knownManifest;
  const next = await getSourceRuntimeManifest();
  const stagingRoot = path.join(absoluteProjectDir, `.editor-runtime-${randomUUID()}.staging`);

  await stopRuntimeSession(absoluteProjectDir, previous?.sourceSha256 ?? null);
  await rm(stagingRoot, { recursive: true, force: true });
  try {
    await writeRuntime(stagingRoot, next);
    await replaceRuntimeDirectory(absoluteProjectDir, stagingRoot);
  } catch (error) {
    await rm(stagingRoot, { recursive: true, force: true });
    throw error;
  }
  await writeLaunchers(absoluteProjectDir);
  return { oldRuntimeHash: previous?.sourceSha256 ?? null, newRuntimeHash: next.sourceSha256 };
}

export async function getProjectRuntimeManifest(projectDir) {
  try {
    return JSON.parse(await readFile(path.join(path.resolve(projectDir), ".editor-runtime", "runtime-manifest.json"), "utf8"));
  } catch {
    return null;
  }
}

export async function getSourceRuntimeManifest() {
  return {
    runtimeVersion: EDITOR_RUNTIME_VERSION,
    sourcePackageRoot,
    sourceSha256: await sourceRuntimeSha256(),
    installedAt: new Date().toISOString()
  };
}

export function runtimeManifestIsCurrent(installed, expected) {
  return Boolean(installed) &&
    installed.runtimeVersion === expected.runtimeVersion &&
    installed.sourceSha256 === expected.sourceSha256 &&
    samePath(installed.sourcePackageRoot, expected.sourcePackageRoot);
}

async function writeRuntime(runtimeRoot, manifest) {
  await mkdir(path.join(runtimeRoot, "src", "modes"), { recursive: true });
  for (const relativePath of runtimeFiles) {
    const destination = path.join(runtimeRoot, "src", relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(sourceRoot, relativePath), destination);
  }
  for (const dependency of ["parse5", "entities"]) {
    await cp(
      path.join(sourcePackageRoot, "node_modules", dependency),
      path.join(runtimeRoot, "node_modules", dependency),
      { recursive: true, force: true }
    );
  }
  await writeFile(path.join(runtimeRoot, "package.json"), '{"type":"module"}\n', "utf8");
  await writeFile(path.join(runtimeRoot, "open-editor.mjs"), embeddedLauncher(), "utf8");
  await writeFile(path.join(runtimeRoot, "runtime-manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
}

async function replaceRuntimeDirectory(projectDir, stagingRoot) {
  const runtimeRoot = path.join(projectDir, ".editor-runtime");
  const backupRoot = path.join(projectDir, `.editor-runtime-${randomUUID()}.previous`);
  let movedPrevious = false;
  try {
    await rename(runtimeRoot, backupRoot);
    movedPrevious = true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  try {
    await rename(stagingRoot, runtimeRoot);
  } catch (error) {
    if (movedPrevious) await rename(backupRoot, runtimeRoot).catch(() => {});
    throw error;
  }
  if (movedPrevious) await rm(backupRoot, { recursive: true, force: true });
}

async function stopRuntimeSession(projectDir, runtimeSha256) {
  const { stopEditorSession } = await import("./editor-session.js");
  await stopEditorSession(projectDir, { runtimeSha256 });
}

async function writeLaunchers(projectDir) {
  await writeFile(
    path.join(projectDir, "打开编辑器.cmd"),
    '@echo off\r\nnode "%~dp0.editor-runtime\\open-editor.mjs"\r\nif errorlevel 1 pause\r\n',
    "utf8"
  );
  const shellPath = path.join(projectDir, "open-editor.sh");
  await writeFile(shellPath, '#!/usr/bin/env sh\nPROJECT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"\nnode "$PROJECT_DIR/.editor-runtime/open-editor.mjs"\n', "utf8");
  await chmod(shellPath, 0o755).catch(() => {});
}

async function sourceRuntimeSha256() {
  const hash = createHash("sha256");
  for (const relativePath of runtimeFiles) {
    hash.update(relativePath + "\0");
    hash.update(await readFile(path.join(sourceRoot, relativePath)));
    hash.update("\0");
  }
  hash.update(embeddedLauncher(), "utf8");
  return hash.digest("hex");
}

function samePath(left, right) {
  if (!left || !right) return false;
  const normalize = (value) => {
    const resolved = path.resolve(value);
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
  };
  return normalize(left) === normalize(right);
}

function embeddedLauncher() {
  return `import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureEditorSession, launchBrowser } from "./src/editor-session.js";
const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
try {
  const session = await ensureEditorSession(projectDir);
  const url = session.url + "/?token=" + encodeURIComponent(session.token);
  launchBrowser(url);
  process.stdout.write("缂栬緫鍣ㄥ凡鎵撳紑锛? + url + "\\n");
} catch (error) {
  process.stderr.write("鏃犳硶鎵撳紑缂栬緫鍣細" + error.message + "\\n");
  process.exitCode = 1;
}
`;
}

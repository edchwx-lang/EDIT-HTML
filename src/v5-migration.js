import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { writeJsonAtomic, writeTextAtomic } from "./io.js";
import {
  getProjectRuntimeManifest,
  getSourceRuntimeManifest,
  refreshProjectEditorRuntime,
  runtimeManifestIsCurrent
} from "./project-runtime.js";
import { EDITOR_RUNTIME_VERSION, TOOL_VERSION } from "./version-manifest.js";

const LEGACY_V5_VERSION = "5.2.1";

export async function inspectV5Migration(projectDir) {
  const absoluteProjectDir = path.resolve(projectDir);
  const projectPath = path.join(absoluteProjectDir, "project.json");
  const project = JSON.parse(await readFile(projectPath, "utf8"));
  const migrationKind = classifyV5Project(project);

  const [installedRuntime, expectedRuntime] = await Promise.all([
    getProjectRuntimeManifest(absoluteProjectDir),
    getSourceRuntimeManifest()
  ]);
  const runtimeCurrent = runtimeManifestIsCurrent(installedRuntime, expectedRuntime);
  const migratedFrom = migrationKind === "legacy" ? project.migratedFrom ?? {
    packageVersion: project.packageVersion,
    pipelineVersion: project.pipelineVersion
  } : null;
  const metadataChanges = migrationKind === "legacy" ? {
    migratedFrom,
    toolVersion: TOOL_VERSION,
    artifactContractVersion: project.artifactContractVersion ?? project.packageVersion,
    editorRuntimeVersion: EDITOR_RUNTIME_VERSION
  } : {};
  const metadataChanged = Object.entries(metadataChanges)
    .some(([key, value]) => JSON.stringify(project[key]) !== JSON.stringify(value));

  return {
    projectDir: absoluteProjectDir,
    changed: metadataChanged || !runtimeCurrent,
    legacyMetadata: migratedFrom ? {
      packageVersion: migratedFrom.packageVersion,
      pipelineVersion: migratedFrom.pipelineVersion
    } : null,
    metadataChanged,
    metadataChanges,
    missingRuntimeProvenance: !installedRuntime?.sourceSha256 || !installedRuntime?.sourcePackageRoot,
    runtime: {
      status: runtimeCurrent ? "current" : installedRuntime ? "stale" : "missing",
      fromVersion: installedRuntime?.runtimeVersion ?? null,
      fromSha256: installedRuntime?.sourceSha256 ?? null,
      toVersion: expectedRuntime.runtimeVersion,
      toSha256: expectedRuntime.sourceSha256,
      sourcePackageRoot: expectedRuntime.sourcePackageRoot
    }
  };
}

export async function migrateV5Project(projectDir, { dryRun = false } = {}) {
  const inspection = await inspectV5Migration(projectDir);
  if (dryRun) return { ...inspection, dryRun: true };

  const absoluteProjectDir = inspection.projectDir;
  const projectPath = path.join(absoluteProjectDir, "project.json");
  const originalText = await readFile(projectPath, "utf8");
  const original = JSON.parse(originalText);
  const protectedBefore = await hashProtectedProjectFiles(absoluteProjectDir);
  let metadataWritten = false;

  try {
    if (inspection.metadataChanged) {
      await writeJsonAtomic(projectPath, { ...original, ...inspection.metadataChanges });
      metadataWritten = true;
    }
    const runtimeRefresh = inspection.runtime.status === "current"
      ? {
          oldRuntimeHash: inspection.runtime.fromSha256,
          newRuntimeHash: inspection.runtime.fromSha256
        }
      : await refreshProjectEditorRuntime(absoluteProjectDir);
    await assertProtectedFilesUnchanged(absoluteProjectDir, protectedBefore);
    return {
      ...inspection,
      dryRun: false,
      changed: inspection.changed,
      runtimeRefreshed: inspection.runtime.status !== "current",
      ...runtimeRefresh,
      protectedFilesVerified: protectedBefore.size
    };
  } catch (error) {
    if (metadataWritten) await writeTextAtomic(projectPath, originalText).catch(() => {});
    throw error;
  }
}

function classifyV5Project(project) {
  if (project.schemaVersion !== 5) {
    throw new Error("V5 metadata migration requires schemaVersion 5");
  }
  const sourceVersion = project.migratedFrom?.packageVersion ?? project.packageVersion;
  if (sourceVersion === LEGACY_V5_VERSION) return "legacy";
  if (!project.migratedFrom && sourceVersion === TOOL_VERSION) return "current";
  throw new Error(`V5 metadata migration supports ${LEGACY_V5_VERSION} projects, received ${sourceVersion ?? "unknown"}`);
}

async function hashProtectedProjectFiles(projectDir) {
  const hashes = new Map();
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = path.relative(projectDir, absolutePath);
      const firstSegment = relativePath.split(path.sep)[0];
      if (entry.isDirectory()) {
        if (firstSegment === ".editor-runtime" || firstSegment === ".runtime") continue;
        await visit(absolutePath);
      } else if (!isMigrationOwnedFile(relativePath)) {
        hashes.set(relativePath, sha256(await readFile(absolutePath)));
      }
    }
  }
  await visit(projectDir);
  return hashes;
}

function isMigrationOwnedFile(relativePath) {
  const normalized = relativePath.split(path.sep).join("/");
  return normalized === "project.json" ||
    normalized === "open-editor.sh" ||
    normalized.endsWith(".cmd") && !normalized.includes("/");
}

async function assertProtectedFilesUnchanged(projectDir, before) {
  for (const [relativePath, expectedHash] of before) {
    const actualHash = sha256(await readFile(path.join(projectDir, relativePath)));
    if (actualHash !== expectedHash) {
      throw new Error(`V5 migration modified protected file: ${relativePath}`);
    }
  }
}

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

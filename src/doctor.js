import { access, readFile, realpath } from "node:fs/promises";
import path from "node:path";

import { getProjectRuntimeManifest, getSourceRuntimeManifest, runtimeManifestIsCurrent } from "./project-runtime.js";
import {
  ARTIFACT_CONTRACT_VERSION,
  EDITOR_RUNTIME_VERSION,
  PIPELINE_VERSION,
  TOOL_VERSION
} from "./version-manifest.js";

export async function diagnoseInstallation({ packageRoot, executablePath, projectDir = null }) {
  const absolutePackageRoot = path.resolve(packageRoot);
  const absoluteExecutablePath = path.resolve(executablePath);
  const checks = {
    node20: Number.parseInt(process.versions.node.split(".")[0], 10) >= 20,
    bundledSkill: await exists(path.join(absolutePackageRoot, "skills", "edit-html-report", "SKILL.md"))
  };
  const warnings = [];
  if (!await executableBelongsToPackage(absoluteExecutablePath, absolutePackageRoot)) {
    warnings.push("current executable resolves to another checkout");
  }

  let runtimeStatus = "not-checked";
  let legacyArtifactContract = false;
  if (projectDir) {
    const absoluteProjectDir = path.resolve(projectDir);
    const [runtime, expectedRuntime, project] = await Promise.all([
      getProjectRuntimeManifest(absoluteProjectDir),
      getSourceRuntimeManifest(),
      readProject(absoluteProjectDir)
    ]);
    runtimeStatus = runtimeManifestIsCurrent(runtime, expectedRuntime) ? "current" : runtime ? "stale" : "missing";
    if (runtimeStatus !== "current") warnings.push(`project runtime is ${runtimeStatus}`);
    legacyArtifactContract = project?.artifactContractVersion !== ARTIFACT_CONTRACT_VERSION;
    if (legacyArtifactContract) warnings.push("project metadata uses a legacy artifact contract");
  }

  return {
    ok: Object.values(checks).every(Boolean) && warnings.length === 0,
    checks,
    toolVersion: TOOL_VERSION,
    pipelineVersion: PIPELINE_VERSION,
    artifactContractVersion: ARTIFACT_CONTRACT_VERSION,
    editorRuntimeVersion: EDITOR_RUNTIME_VERSION,
    executablePath: absoluteExecutablePath,
    packageRoot: absolutePackageRoot,
    runtimeStatus,
    legacyArtifactContract,
    warnings
  };
}

async function executableBelongsToPackage(executablePath, packageRoot) {
  try {
    const [resolvedExecutable, resolvedPackageRoot] = await Promise.all([realpath(executablePath), realpath(packageRoot)]);
    return samePath(path.dirname(path.dirname(resolvedExecutable)), resolvedPackageRoot);
  } catch {
    return samePath(path.dirname(path.dirname(executablePath)), packageRoot);
  }
}

async function readProject(projectDir) {
  try {
    return JSON.parse(await readFile(path.join(projectDir, "project.json"), "utf8"));
  } catch {
    return null;
  }
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function samePath(left, right) {
  const normalize = (value) => {
    const resolved = path.resolve(value);
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
  };
  return normalize(left) === normalize(right);
}

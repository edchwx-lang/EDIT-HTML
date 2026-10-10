import { access, readFile, realpath } from "node:fs/promises";
import { realpathSync } from "node:fs";
import path from "node:path";
import { probeDesignBrowser } from "./browser-runtime.js";
import { resolveHuashuProvider, validateSkillMetadata } from "./design-provider.js";

import { getProjectRuntimeManifest, getSourceRuntimeManifest, runtimeManifestIsCurrent } from "./project-runtime.js";
import { DESIGN_PIPELINE_VERSION, RELEASE_VERSION } from "./release-manifest.js";
import {
  ARTIFACT_CONTRACT_VERSION,
  EDITOR_RUNTIME_VERSION
} from "./version-manifest.js";

export async function diagnoseInstallation({ packageRoot, executablePath, commandSourcePath = executablePath, projectDir = null, browserProbe = probeDesignBrowser }) {
  const absolutePackageRoot = path.resolve(packageRoot);
  const absoluteExecutablePath = path.resolve(executablePath);
  const checks = {
    node20: Number.parseInt(process.versions.node.split(".")[0], 10) >= 20,
    bundledSkill: await exists(path.join(absolutePackageRoot, "skills", "edit-html", "SKILL.md"))
  };
  const basicReady = Object.values(checks).every(Boolean);
  const errors = [];
  let huashuProvider = null;
  try {
    const metadata = await validateSkillMetadata(path.join(absolutePackageRoot, "skills", "edit-html", "SKILL.md"));
    checks.skillSchema = metadata.name === "edit-html" && metadata.version === RELEASE_VERSION;
    if (!checks.skillSchema) errors.push("Skill metadata does not match this release; reinstall with npm run install:local");
  } catch (error) { checks.skillSchema = false; errors.push(`Skill schema: ${error.message}`); }
  try { huashuProvider = await resolveHuashuProvider({ packageRoot: absolutePackageRoot }); checks.huashuBundle = true; }
  catch (error) { checks.huashuBundle = false; errors.push(`Bundled Huashu is missing or damaged; reinstall V5.5. ${error.message}`); }
  try { await import("playwright"); checks.playwrightRuntime = true; }
  catch (error) { checks.playwrightRuntime = false; errors.push(`Playwright runtime missing; reinstall V5.5. ${error.message}`); }
  const browser = await browserProbe();
  checks.browserLaunch = browser.ready === true;
  if (!checks.browserLaunch) errors.push(browser.error ?? "Browser launch probe failed; run edit-html-report setup browser");
  const workflowReady = basicReady && Object.values(checks).every(Boolean);
  const warnings = [];
  if (!await commandSourceBelongsToPackage(commandSourcePath, absolutePackageRoot)) {
    warnings.push("resolved edit-html-report command points to another checkout");
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
    ok: workflowReady && warnings.length === 0,
    basicReady,
    workflowReady,
    checks,
    errors,
    huashuProvider,
    browser,
    releaseVersion: RELEASE_VERSION,
    toolVersion: RELEASE_VERSION,
    pipelineVersion: DESIGN_PIPELINE_VERSION,
    artifactContractVersion: ARTIFACT_CONTRACT_VERSION,
    editorRuntimeVersion: EDITOR_RUNTIME_VERSION,
    executablePath: absoluteExecutablePath,
    packageRoot: absolutePackageRoot,
    runtimeStatus,
    legacyArtifactContract,
    warnings
  };
}

export async function resolveCommandSource(commandName, {
  pathEntries = process.env.PATH?.split(path.delimiter) ?? [],
  pathExtensions = commandPathExtensions()
} = {}) {
  for (const directory of pathEntries) {
    for (const extension of pathExtensions) {
      const candidate = path.join(directory, commandName + extension);
      try {
        await access(candidate);
      } catch {
        continue;
      }
      const entry = await resolveCommandEntry(candidate);
      if (entry) return entry;
    }
  }
  return null;
}

function commandPathExtensions() {
  const configured = process.env.PATHEXT?.split(";").map((value) => value.toLowerCase()) ?? [];
  const executableExtensions = [...new Set([...configured, ".cmd", ".ps1", ".js", ".mjs"])];
  return process.platform === "win32" ? [...executableExtensions, ""] : ["", ...executableExtensions];
}

async function resolveCommandEntry(candidate) {
  if (/\.(?:js|mjs)$/i.test(candidate)) return resolvedPath(candidate);
  try {
    const contents = await readFile(candidate, "utf8");
    const target = contents.match(/["']([^"']+\.(?:js|mjs))["']/i)?.[1];
    return target ? resolvedPath(expandShimTarget(target, candidate)) : null;
  } catch {
    return null;
  }
}

function expandShimTarget(target, shimPath) {
  const shimDirectory = path.dirname(shimPath);
  return target
    .replace(/\$basedir/gi, shimDirectory)
    .replace(/%~?dp0%?/gi, shimDirectory);
}

async function commandSourceBelongsToPackage(commandSourcePath, packageRoot) {
  if (!commandSourcePath) return true;
  return await samePath(path.dirname(path.dirname(commandSourcePath)), packageRoot)
    || await pathBelongsToRoot(commandSourcePath, packageRoot);
}

async function resolvedPath(filePath) {
  try {
    return await realpath(filePath);
  } catch {
    return path.resolve(filePath);
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

async function samePath(left, right) {
  const [normalizedLeft, normalizedRight] = await Promise.all([
    normalizePathForComparison(left),
    normalizePathForComparison(right)
  ]);
  return normalizedLeft === normalizedRight;
}

async function normalizePathForComparison(value) {
  let resolved = path.resolve(value);
  try {
    resolved = process.platform === "win32"
      ? realpathSync.native(resolved)
      : await realpath(resolved);
  } catch {
    // Compare the resolved path when the target does not exist.
  }
  if (process.platform === "win32") return resolved.toLowerCase();
  if (process.platform === "darwin" && resolved.startsWith("/private/var/")) {
    return resolved.replace(/^\/private\/var\//, "/var/");
  }
  return resolved;
}

async function pathBelongsToRoot(filePath, rootPath) {
  const [normalizedFile, normalizedRoot] = await Promise.all([
    normalizePathForComparison(filePath),
    normalizePathForComparison(rootPath)
  ]);
  const relative = path.relative(normalizedRoot, normalizedFile);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

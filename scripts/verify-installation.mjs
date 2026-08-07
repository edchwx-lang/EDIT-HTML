#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function verifyInstallationContract({ sourceRoot, packageRoot, skillRoot, shimPath, doctor = null }) {
  const resolvedSourceRoot = path.resolve(sourceRoot);
  const resolvedPackageRoot = path.resolve(packageRoot);
  const resolvedSkillRoot = path.resolve(skillRoot);
  const resolvedShimPath = path.resolve(shimPath);
  const [sourcePackage, installedPackage, sourceVersions, installedVersions, skillVersion, sourceHash, installedHash, sourceSkillHash, installedSkillHash] = await Promise.all([
    readJson(path.join(resolvedSourceRoot, "package.json")),
    readJson(path.join(resolvedPackageRoot, "package.json")),
    readVersionManifest(path.join(resolvedSourceRoot, "src", "version-manifest.js")),
    readVersionManifest(path.join(resolvedPackageRoot, "src", "version-manifest.js")),
    readSkillVersion(path.join(resolvedSkillRoot, "SKILL.md")),
    hashPackagePayload(resolvedSourceRoot),
    hashPackagePayload(resolvedPackageRoot),
    hashDirectory(path.join(resolvedSourceRoot, "skills", "EDIT-HTML")),
    hashDirectory(resolvedSkillRoot)
  ]);
  const expectedVersion = sourcePackage.version;
  const shimTarget = await resolveShimTarget(resolvedShimPath);
  const expectedExecutable = path.join(resolvedPackageRoot, "bin", "edit-html-report.js");
  const runDoctor = doctor ?? (() => runDoctorJson(expectedExecutable, resolvedShimPath));
  const doctorResult = await runDoctor();
  const [sourceRuntime, runtime] = await Promise.all([
    import(pathToFileURL(path.join(resolvedSourceRoot, "src", "project-runtime.js")).href + `?verify-source=${Date.now()}`)
      .then((module) => module.getSourceRuntimeManifest()),
    import(pathToFileURL(path.join(resolvedPackageRoot, "src", "project-runtime.js")).href + `?verify-installed=${Date.now()}`)
      .then((module) => module.getSourceRuntimeManifest())
  ]);

  const versionsAgree = [
    installedPackage.version,
    sourceVersions.toolVersion,
    sourceVersions.pipelineVersion,
    sourceVersions.artifactContractVersion,
    installedVersions.toolVersion,
    installedVersions.pipelineVersion,
    installedVersions.artifactContractVersion
  ].every((version) => version === expectedVersion);
  const expectedRuntimeVersion = sourceVersions.editorRuntimeVersion;
  const checks = {
    shim: samePath(shimTarget, expectedExecutable),
    packageVersion: versionsAgree,
    skillVersion: skillVersion === expectedVersion,
    runtimeVersion: installedVersions.editorRuntimeVersion === expectedRuntimeVersion &&
      runtime.runtimeVersion === expectedRuntimeVersion &&
      sourceRuntime.runtimeVersion === expectedRuntimeVersion &&
      runtime.sourceSha256 === sourceRuntime.sourceSha256 &&
      samePath(runtime.sourcePackageRoot, resolvedPackageRoot),
    sourceHash: sourceHash === installedHash,
    skillHash: sourceSkillHash === installedSkillHash,
    doctor: doctorMatches(doctorResult, resolvedPackageRoot, expectedExecutable, {
      toolVersion: expectedVersion,
      pipelineVersion: sourceVersions.pipelineVersion,
      artifactContractVersion: sourceVersions.artifactContractVersion,
      editorRuntimeVersion: expectedRuntimeVersion
    })
  };
  const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  if (failed.length) throw new Error(`installation verification failed: ${failed.join(", ")}`);
  return {
    ok: true,
    version: expectedVersion,
    packageRoot: resolvedPackageRoot,
    skillRoot: resolvedSkillRoot,
    shimPath: resolvedShimPath,
    runtimeSha256: runtime.sourceSha256,
    sourceSha256: sourceHash,
    skillSha256: sourceSkillHash,
    checks,
    doctor: doctorResult
  };
}

async function hashPackagePayload(packageRoot) {
  const packageJson = await readJson(path.join(packageRoot, "package.json"));
  const relativeFiles = ["package.json"];
  for (const item of packageJson.files ?? []) {
    relativeFiles.push(...await listFiles(path.join(packageRoot, item), packageRoot));
  }
  return hashNamedFiles(packageRoot, [...new Set(relativeFiles)].sort());
}

async function hashDirectory(directory) {
  return hashNamedFiles(directory, await listFiles(directory, directory));
}

async function listFiles(target, root) {
  if ((await stat(target)).isFile()) {
    return [path.relative(root, target).split(path.sep).join("/")];
  }
  const entries = await readdir(target, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(target, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(absolutePath, root));
    else if (entry.isFile()) files.push(path.relative(root, absolutePath).split(path.sep).join("/"));
  }
  return files.sort();
}

async function hashNamedFiles(root, relativeFiles) {
  const hash = createHash("sha256");
  for (const relativePath of relativeFiles) {
    hash.update(relativePath + "\0");
    hash.update(await readFile(path.join(root, ...relativePath.split("/"))));
    hash.update("\0");
  }
  return hash.digest("hex");
}

async function readVersionManifest(filePath) {
  const contents = await readFile(filePath, "utf8");
  const read = (name) => contents.match(new RegExp(`export\\s+const\\s+${name}\\s*=\\s*["']([^"']+)["']`))?.[1] ?? null;
  return {
    toolVersion: read("TOOL_VERSION"),
    pipelineVersion: read("PIPELINE_VERSION"),
    artifactContractVersion: read("ARTIFACT_CONTRACT_VERSION"),
    editorRuntimeVersion: read("EDITOR_RUNTIME_VERSION")
  };
}

async function readSkillVersion(skillPath) {
  const contents = await readFile(skillPath, "utf8");
  return contents.match(/^version:\s*["']?([^\s"']+)/m)?.[1] ??
    contents.match(/^#\s+(?:EDIT-HTML|Edit HTML Report) V([^\s]+)/m)?.[1] ?? null;
}

async function resolveShimTarget(shimPath) {
  if (/\.(?:js|mjs)$/i.test(shimPath)) return path.resolve(shimPath);
  const contents = await readFile(shimPath, "utf8");
  const target = contents.match(/["']([^"']+\/bin\/edit-html-report\.js)["']/i)?.[1] ??
    contents.match(/["']([^"']+\\bin\\edit-html-report\.js)["']/i)?.[1];
  if (!target) return null;
  return path.resolve(target
    .replace(/\$basedir/gi, path.dirname(shimPath))
    .replace(/%~?dp0%?/gi, path.dirname(shimPath)));
}

function runDoctorJson(executablePath, shimPath) {
  const environment = {
    ...process.env,
    PATH: path.dirname(shimPath) + path.delimiter + (process.env.PATH ?? "")
  };
  const result = spawnSync(process.execPath, [executablePath, "doctor", "--json"], { encoding: "utf8", env: environment });
  if (result.status !== 0) throw new Error(`doctor failed: ${result.stderr.trim()}`);
  return JSON.parse(result.stdout);
}

function doctorMatches(doctor, packageRoot, executablePath, versions) {
  return doctor.ok !== false &&
    samePath(doctor.packageRoot, packageRoot) &&
    samePath(doctor.executablePath, executablePath) &&
    doctor.toolVersion === versions.toolVersion &&
    doctor.pipelineVersion === versions.pipelineVersion &&
    doctor.artifactContractVersion === versions.artifactContractVersion &&
    doctor.editorRuntimeVersion === versions.editorRuntimeVersion &&
    (doctor.warnings?.length ?? 0) === 0;
}

function samePath(left, right) {
  if (!left || !right) return false;
  const normalize = (value) => {
    let resolved = path.resolve(value);
    try {
      resolved = realpathSync.native(resolved);
    } catch {
      // Keep path-only comparison for diagnostic fixtures that do not exist on disk.
    }
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
  };
  return normalize(left) === normalize(right);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index]?.startsWith("--") || !argv[index + 1]) throw new Error(`invalid argument: ${argv[index] ?? ""}`);
    options[argv[index].slice(2)] = argv[index + 1];
  }
  return {
    sourceRoot: options["source-root"],
    packageRoot: options["package-root"],
    skillRoot: options["skill-root"],
    shimPath: options["shim-path"]
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  verifyInstallationContract(parseArguments(process.argv.slice(2)))
    .then((result) => process.stdout.write(JSON.stringify(result, null, 2) + "\n"))
    .catch((error) => {
      process.stderr.write(`verify-installation: ${error.message}\n`);
      process.exitCode = 1;
    });
}

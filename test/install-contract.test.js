import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { verifyInstallationContract } from "../scripts/verify-installation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("installation contract compares shim, package, Skill, runtime, and source hashes", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-install-contract-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const installedRoot = path.join(sandbox, "prefix", "node_modules", "edit-html-report");
  const skillRoot = path.join(sandbox, "skills", "EDIT-HTML");
  await copyPackagePayload(root, installedRoot);
  await cp(path.join(root, "skills", "EDIT-HTML"), skillRoot, { recursive: true });
  const shimPath = path.join(sandbox, "prefix", "edit-html-report.cmd");
  await writeFile(shimPath, `@ECHO off\r\nnode "${path.join(installedRoot, "bin", "edit-html-report.js")}" %*\r\n`, "utf8");

  const result = await verifyInstallationContract({
    sourceRoot: root,
    packageRoot: installedRoot,
    skillRoot,
    shimPath,
    doctor: async () => ({
      toolVersion: "5.4.1",
      pipelineVersion: "5.4.1",
      artifactContractVersion: "5.4.0",
      editorRuntimeVersion: "5.4.0",
      executablePath: path.join(installedRoot, "bin", "edit-html-report.js"),
      packageRoot: installedRoot,
      warnings: []
    })
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.checks, {
    shim: true,
    packageVersion: true,
    skillVersion: true,
    runtimeVersion: true,
    sourceHash: true,
    skillHash: true,
    doctor: true
  });
});

test("installation contract fails when package, Skill, or version authority disagrees", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-install-mismatch-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const installedRoot = path.join(sandbox, "installed");
  const skillRoot = path.join(sandbox, "skill");
  await copyPackagePayload(root, installedRoot);
  await cp(path.join(root, "skills", "EDIT-HTML"), skillRoot, { recursive: true });
  const packageJson = JSON.parse(await readFile(path.join(installedRoot, "package.json"), "utf8"));
  packageJson.version = "5.2.1";
  await writeFile(path.join(installedRoot, "package.json"), JSON.stringify(packageJson), "utf8");
  await writeFile(path.join(skillRoot, "SKILL.md"), "---\nname: EDIT-HTML\nversion: 5.2.1\n---\n", "utf8");
  const shimPath = path.join(sandbox, "edit-html-report.cmd");
  await writeFile(shimPath, `node "${path.join(installedRoot, "bin", "edit-html-report.js")}" %*\n`, "utf8");

  await assert.rejects(() => verifyInstallationContract({
    sourceRoot: root,
    packageRoot: installedRoot,
    skillRoot,
    shimPath,
    doctor: async () => ({ packageRoot: installedRoot, executablePath: path.join(installedRoot, "bin", "edit-html-report.js"), warnings: [] })
  }), /packageVersion, skillVersion, sourceHash, skillHash, doctor/);
});

test("local installer tests before updating temporary npm and Skill targets", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-install-script-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const prefix = path.join(sandbox, "prefix");
  const installedRoot = path.join(prefix, "node_modules", "edit-html-report");
  const skillRoot = path.join(sandbox, "codex-skills");
  const shimPath = path.join(prefix, "edit-html-report.cmd");
  const npmLog = path.join(sandbox, "npm.log");
  const mockNpm = path.join(sandbox, "mock-npm.ps1");
  await copyPackagePayload(root, installedRoot);
  await symlink(path.join(root, "node_modules"), path.join(installedRoot, "node_modules"), "junction");
  await mkdir(prefix, { recursive: true });
  await writeFile(shimPath, `@ECHO off\r\nnode "${path.join(installedRoot, "bin", "edit-html-report.js")}" %*\r\n`, "utf8");
  await writeFile(mockNpm, [
    "param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Remaining)",
    "Add-Content -LiteralPath $env:EDIT_HTML_MOCK_NPM_LOG -Value ($Remaining -join ' ')",
    "exit 0"
  ].join("\n"), "utf8");

  const installed = spawnSync("powershell", [
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(root, "scripts", "install-local.ps1"),
    "-SourceRoot", root,
    "-SkillRoot", skillRoot,
    "-NpmCommand", mockNpm,
    "-NodeCommand", process.execPath,
    "-GlobalPrefix", prefix,
    "-GlobalPackageRoot", installedRoot,
    "-CommandShim", shimPath
  ], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, EDIT_HTML_MOCK_NPM_LOG: npmLog },
    timeout: 30000
  });

  assert.equal(installed.status, 0, installed.stderr);
  const calls = (await readFile(npmLog, "utf8")).trim().split(/\r?\n/);
  assert.deepEqual(calls, ["test", `install --global ${root} --prefix ${prefix}`]);
  assert.match(installed.stdout, new RegExp(escapeRegExp(path.resolve(root))));
  assert.match(await readFile(path.join(skillRoot, "EDIT-HTML", "SKILL.md"), "utf8"), /^# EDIT-HTML V5\.4\.1$/m);
});

test("a failed npm test leaves temporary package and Skill targets untouched", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-install-test-failure-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const skillRoot = path.join(sandbox, "skills");
  const existingSkill = path.join(skillRoot, "EDIT-HTML");
  const markerPath = path.join(existingSkill, "marker.txt");
  const npmLog = path.join(sandbox, "npm.log");
  const mockNpm = path.join(sandbox, "mock-npm-fail.ps1");
  await mkdir(existingSkill, { recursive: true });
  await writeFile(markerPath, "untouched", "utf8");
  await writeFile(mockNpm, [
    "param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Remaining)",
    "Add-Content -LiteralPath $env:EDIT_HTML_MOCK_NPM_LOG -Value ($Remaining -join ' ')",
    "exit 17"
  ].join("\n"), "utf8");

  const result = spawnSync("powershell", [
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(root, "scripts", "install-local.ps1"),
    "-SourceRoot", root,
    "-SkillRoot", skillRoot,
    "-NpmCommand", mockNpm
  ], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, EDIT_HTML_MOCK_NPM_LOG: npmLog }
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /npm test failed/);
  assert.equal(await readFile(markerPath, "utf8"), "untouched");
  assert.equal((await readFile(npmLog, "utf8")).trim(), "test");
});

test("local installer rejects a 4.0.0 checkout before invoking npm", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-install-v4-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  await writeFile(path.join(sandbox, "package.json"), '{"name":"edit-html-report","version":"4.0.0"}\n', "utf8");
  const result = spawnSync("powershell", [
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(root, "scripts", "install-local.ps1"),
    "-SourceRoot", sandbox
  ], { cwd: root, encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Refusing to install the obsolete 4\.0\.0 checkout/);
});

async function copyPackagePayload(sourceRoot, targetRoot) {
  await mkdir(targetRoot, { recursive: true });
  await cp(path.join(sourceRoot, "package.json"), path.join(targetRoot, "package.json"));
  await cp(path.join(sourceRoot, "editor-boundary.lock.json"), path.join(targetRoot, "editor-boundary.lock.json"));
  for (const directory of ["bin", "src", "schemas", "skills", "scripts"]) {
    await cp(path.join(sourceRoot, directory), path.join(targetRoot, directory), { recursive: true });
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

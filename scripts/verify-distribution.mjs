// Opt-in real clean-prefix install. No writes to the user's global installation.
import { spawnSync } from "node:child_process";
import { cp, lstat, mkdir, mkdtemp, readFile, rename, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyInstallationContract } from "./verify-installation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("Run npm run test:distribution so the local npm CLI is explicit");
const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-clean-distribution-"));
function npm(args, cwd) {
  const result = spawnSync(process.execPath, [npmCli, ...args], { cwd, encoding: "utf8", timeout: 180000 });
  if (result.error || result.status !== 0) throw new Error(`npm ${args[0]} failed: ${result.error?.message ?? ""}\n${result.stderr}\n${result.stdout}`);
  return result.stdout;
}
try {
  const source = path.join(sandbox, "extracted-source");
  const prefix = path.join(sandbox, "prefix");
  const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  await mkdir(source);
  for (const name of ["package.json", ...pkg.files]) await cp(path.join(root, name), path.join(source, name), { recursive: true });
  const pack = JSON.parse(npm(["pack", "--json", "--pack-destination", sandbox], source))[0];
  npm(["install", "--global", "--omit=dev", "--prefix", prefix, path.join(sandbox, path.basename(pack.filename))], sandbox);
  const installed = process.platform === "win32" ? path.join(prefix, "node_modules", pkg.name) : path.join(prefix, "lib", "node_modules", pkg.name);
  if ((await lstat(installed)).isSymbolicLink()) throw new Error("Installed package must not link to extraction directory");
  const hidden = path.join(sandbox, "source-moved-away");
  await rename(source, hidden);
  const cli = path.join(installed, "bin", "edit-html-report.js");
  const skill = path.join(sandbox, "isolated-codex-skills", "edit-html");
  await cp(path.join(installed, "skills", "edit-html"), skill, { recursive: true });
  const shim = process.platform === "win32" ? path.join(prefix, "edit-html-report.cmd") : path.join(prefix, "bin", "edit-html-report");
  const result = await verifyInstallationContract({ sourceRoot: hidden, packageRoot: installed, skillRoot: skill, shimPath: shim });
  const env = { ...process.env, PATH: path.dirname(shim) + path.delimiter + process.env.PATH };
  const provider = spawnSync(process.execPath, [cli, "design", "huashu", "locate"], { encoding: "utf8", env });
  if (provider.status !== 0 || !JSON.parse(provider.stdout).skillPath.startsWith(installed)) throw new Error(`Bundled provider lookup failed: ${provider.stderr}`);
  console.log(JSON.stringify({ ok: result.ok, sourceDirectoryMovedAway: true, realPackageCopy: true, omitDev: true, workflowReady: result.doctor.workflowReady, checks: result.checks }, null, 2));
} finally {
  // Exact mkdtemp-owned target; never delete a caller-provided path.
  await rm(sandbox, { recursive: true, force: true });
}

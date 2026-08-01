import { spawn } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { writeJsonAtomic } from "./project.js";

export async function publishLocal(projectDir, versionId, outputPath) {
  const project = JSON.parse(
    await readFile(path.join(projectDir, "project.json"), "utf8")
  );
  if (!project.versions.some((version) => version.versionId === versionId)) {
    throw new Error('unknown saved version "' + versionId + '"');
  }
  await copyFile(
    path.join(projectDir, "versions", versionId, "artifact.html"),
    outputPath
  );
  return { provider: "local", versionId, outputPath };
}

export async function publishProvider(
  projectDir,
  versionId,
  provider,
  { runner = runCommand } = {}
) {
  if (provider !== "netlify" && provider !== "vercel") {
    throw new Error('unsupported provider "' + provider + '"');
  }
  const project = JSON.parse(
    await readFile(path.join(projectDir, "project.json"), "utf8")
  );
  if (!project.versions.some((version) => version.versionId === versionId)) {
    throw new Error('unknown saved version "' + versionId + '"');
  }
  const deploymentsPath = path.join(projectDir, "deployments.json");
  const deployments = JSON.parse(await readFile(deploymentsPath, "utf8"));
  const stagingDir = await mkdtemp(
    path.join(os.tmpdir(), "edit-html-report-deploy-")
  );
  try {
    await copyFile(
      path.join(projectDir, "versions", versionId, "artifact.html"),
      path.join(stagingDir, "index.html")
    );
    const request =
      provider === "netlify"
        ? netlifyRequest(stagingDir, deployments.providers.netlify)
        : vercelRequest(stagingDir);
    const result = await runner(request);
    if (result.code !== 0) {
      throw new Error(
        provider + " deployment failed: " + (result.stderr || "unknown error")
      );
    }
    const deployment =
      provider === "netlify"
        ? netlifyDeployment(versionId, result.stdout)
        : vercelDeployment(versionId, result.stdout);
    deployments.providers[provider] = deployment;
    await writeJsonAtomic(deploymentsPath, deployments);
    return deployment;
  } finally {
    await rm(stagingDir, { recursive: true, force: true });
  }
}

function netlifyRequest(stagingDir, previous) {
  const args = [
    "--yes",
    "netlify-cli",
    "deploy",
    "--prod",
    "--dir",
    stagingDir,
    "--json"
  ];
  if (previous?.siteId) args.push("--site", previous.siteId);
  return { command: "npx", args, cwd: stagingDir };
}

function vercelRequest(stagingDir) {
  return {
    command: "npx",
    args: ["--yes", "vercel", "--prod", "--yes", "--cwd", stagingDir],
    cwd: stagingDir
  };
}

function netlifyDeployment(versionId, stdout) {
  const result = JSON.parse(stdout);
  return {
    provider: "netlify",
    versionId,
    url: result.deploy_url ?? result.url,
    siteId: result.site_id ?? null,
    createdAt: new Date().toISOString()
  };
}

function vercelDeployment(versionId, stdout) {
  return {
    provider: "vercel",
    versionId,
    url: stdout.trim().split(/\r?\n/).filter(Boolean).at(-1),
    projectId: null,
    createdAt: new Date().toISOString()
  };
}

function runCommand({ command, args, cwd }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: process.platform === "win32",
      stdio: ["inherit", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      process.stderr.write(chunk);
    });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));
  });
}

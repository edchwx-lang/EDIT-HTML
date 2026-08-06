import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { access, copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { writeJsonAtomic } from "./io.js";

export async function publishLocal(projectDir, versionId, outputPath) {
  const context = await publicationContext(projectDir, versionId);
  const publication = await createCanonicalPublication(projectDir, context, {
    target: "local",
    outputPath: outputPath ? path.resolve(outputPath) : null,
    status: "published"
  });
  if (outputPath) {
    const resolvedOutputPath = path.resolve(outputPath);
    await mkdir(path.dirname(resolvedOutputPath), { recursive: true });
    await copyFile(publicationArtifactPath(projectDir, publication.publicationId), resolvedOutputPath);
  }
  await appendPublication(projectDir, publication);
  return publication;
}

export async function publishProvider(projectDir, versionId, provider, { runner = runCommand } = {}) {
  if (provider !== "netlify" && provider !== "vercel") throw new Error('unsupported provider "' + provider + '"');
  const context = await publicationContext(projectDir, versionId);
  const deploymentsPath = path.join(projectDir, "deployments.json");
  const deployments = JSON.parse(await readFile(deploymentsPath, "utf8"));
  const publication = await createCanonicalPublication(projectDir, context, {
    target: "public",
    provider,
    status: "deploying"
  });
  const stagingDir = await mkdtemp(path.join(os.tmpdir(), "edit-html-report-deploy-"));
  try {
    await copyFile(publicationArtifactPath(projectDir, publication.publicationId), path.join(stagingDir, "index.html"));
    const request = provider === "netlify" ? netlifyRequest(stagingDir, deployments.providers?.netlify) : vercelRequest(stagingDir);
    const result = await runner(request);
    if (result.code !== 0) {
      const failed = { ...publication, status: "failed", error: result.stderr || "unknown error" };
      await updatePublicationFile(projectDir, failed);
      await appendPublication(projectDir, failed);
      throw new Error(provider + " deployment failed: " + failed.error);
    }
    const providerResult = provider === "netlify" ? netlifyDeployment(result.stdout) : vercelDeployment(result.stdout);
    const completed = {
      ...publication,
      ...providerResult,
      provider,
      versionId,
      status: "published"
    };
    await updatePublicationFile(projectDir, completed);
    await appendPublication(projectDir, completed);
    deployments.schemaVersion = 4;
    deployments.records ??= [];
    deployments.records.push(completed);
    deployments.providers ??= {};
    deployments.providers[provider] = completed;
    await writeJsonAtomic(deploymentsPath, deployments);
    return completed;
  } finally {
    await rm(stagingDir, { recursive: true, force: true });
  }
}

export async function listPublications(projectDir) {
  const project = JSON.parse(await readFile(path.join(projectDir, "project.json"), "utf8"));
  return [...(project.publications ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function republishPublication(projectDir, publicationId, options = {}) {
  const publication = await findPublication(projectDir, publicationId);
  if (publication.target === "public") {
    return publishProvider(projectDir, publication.versionId, publication.provider, options);
  }
  return publishLocal(projectDir, publication.versionId, publication.outputPath ?? null);
}

export async function revealPublication(projectDir, publicationId, { runner = revealPath } = {}) {
  const publication = await findPublication(projectDir, publicationId);
  const targetPath = publication.outputPath
    ? path.resolve(publication.outputPath)
    : resolveCanonicalPath(projectDir, publication.canonicalPath);
  const directoryPath = path.dirname(targetPath);
  await access(targetPath);
  const result = await runner(targetPath);
  return {
    publicationId,
    targetPath,
    directoryPath,
    ...(result && typeof result === "object" ? result : {})
  };
}

export async function revealLatestLocalPublication(projectDir, versionId, { runner = revealPath } = {}) {
  const publication = [...await listPublications(projectDir)]
    .reverse()
    .find((item) => item.versionId === versionId && item.target === "local" && item.status === "published");
  if (!publication) throw new Error('version "' + versionId + '" has no local publication');
  return revealPublication(projectDir, publication.publicationId, { runner });
}

export async function readPublicationArtifact(projectDir, publicationId) {
  const publication = await findPublication(projectDir, publicationId);
  return readFile(resolveCanonicalPath(projectDir, publication.canonicalPath), "utf8");
}

async function publicationContext(projectDir, versionId) {
  const project = JSON.parse(await readFile(path.join(projectDir, "project.json"), "utf8"));
  const version = project.versions.find((item) => item.versionId === versionId);
  if (!version) throw new Error('unknown saved version "' + versionId + '"');
  const variant = project.variants.find((item) => item.variantId === version.variantId);
  const artifactPath = path.join(projectDir, "versions", versionId, "artifact.html");
  const artifact = await readFile(artifactPath);
  return {
    project,
    version,
    variant,
    artifactPath,
    sha256: createHash("sha256").update(artifact).digest("hex")
  };
}

async function createCanonicalPublication(projectDir, context, target) {
  const publicationId = randomUUID();
  const publicationDir = path.join(projectDir, "publications", publicationId);
  await mkdir(publicationDir, { recursive: false });
  await copyFile(context.artifactPath, path.join(publicationDir, "report.html"));
  const publication = {
    schemaVersion: 4,
    publicationId,
    versionId: context.version.versionId,
    variantId: context.version.variantId,
    mode: context.variant?.mode ?? null,
    themeId: context.version.themeId ?? context.variant?.themeId ?? null,
    createdAt: new Date().toISOString(),
    sha256: context.sha256,
    canonicalPath: "publications/" + publicationId + "/report.html",
    ...target
  };
  await updatePublicationFile(projectDir, publication);
  return publication;
}

async function updatePublicationFile(projectDir, publication) {
  await writeJsonAtomic(
    path.join(projectDir, "publications", publication.publicationId, "publication.json"),
    publication
  );
}

async function appendPublication(projectDir, publication) {
  const projectPath = path.join(projectDir, "project.json");
  const project = JSON.parse(await readFile(projectPath, "utf8"));
  project.publications ??= [];
  const index = project.publications.findIndex((item) => item.publicationId === publication.publicationId);
  if (index === -1) project.publications.push(publication);
  else project.publications[index] = publication;
  await writeJsonAtomic(projectPath, project);
  await writeJsonAtomic(path.join(projectDir, "publications.json"), {
    schemaVersion: 4,
    publications: project.publications
  });
}

function publicationArtifactPath(projectDir, publicationId) {
  return path.join(projectDir, "publications", publicationId, "report.html");
}

async function findPublication(projectDir, publicationId) {
  const publication = (await listPublications(projectDir)).find((item) => item.publicationId === publicationId);
  if (!publication) throw new Error('unknown publication "' + publicationId + '"');
  return publication;
}

function resolveCanonicalPath(projectDir, relativePath) {
  const root = path.resolve(projectDir);
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) throw new Error("publication path escapes project directory");
  return resolved;
}

export function buildRevealCommand(platform, targetPath) {
  if (platform === "win32") {
    return {
      command: "explorer.exe",
      args: [`/select,${targetPath}`],
      options: { detached: false, stdio: "ignore", windowsHide: false }
    };
  }
  if (platform === "darwin") {
    return { command: "open", args: ["-R", targetPath], options: { detached: true, stdio: "ignore" } };
  }
  return { command: "xdg-open", args: [path.dirname(targetPath)], options: { detached: true, stdio: "ignore" } };
}

export async function revealPath(targetFile, { platform = process.platform, spawnCommand = spawn } = {}) {
  const targetPath = path.resolve(targetFile);
  await access(targetPath);
  const request = buildRevealCommand(platform, targetPath);
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnCommand(request.command, request.args, request.options);
    } catch (error) {
      reject(error);
      return;
    }
    child.once("error", reject);
    child.once("spawn", () => {
      if (typeof child.unref === "function") child.unref();
      resolve({ requested: true, targetPath, command: request.command });
    });
  });
}

function netlifyRequest(stagingDir, previous) {
  const args = ["--yes", "netlify-cli", "deploy", "--prod", "--dir", stagingDir, "--json"];
  if (previous?.siteId) args.push("--site", previous.siteId);
  return { command: "npx", args, cwd: stagingDir };
}

function vercelRequest(stagingDir) {
  return { command: "npx", args: ["--yes", "vercel", "--prod", "--yes", "--cwd", stagingDir], cwd: stagingDir };
}

function netlifyDeployment(stdout) {
  const result = JSON.parse(stdout);
  return { url: result.deploy_url ?? result.url, siteId: result.site_id ?? null, deploymentId: result.deploy_id ?? null };
}

function vercelDeployment(stdout) {
  return { url: stdout.trim().split(/\r?\n/).filter(Boolean).at(-1), projectId: null, deploymentId: null };
}

function runCommand({ command, args, cwd }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: process.platform === "win32", stdio: ["inherit", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; process.stderr.write(chunk); });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));
  });
}

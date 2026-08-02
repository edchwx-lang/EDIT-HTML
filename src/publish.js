import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
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
    await copyFile(publicationArtifactPath(projectDir, publication.publicationId), outputPath);
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

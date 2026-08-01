import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { writeJsonAtomic } from "./project.js";

export async function finalizeVariant(projectDir, variantId, { message = "" } = {}) {
  const projectPath = path.join(projectDir, "project.json");
  const project = JSON.parse(await readFile(projectPath, "utf8"));
  if (!project.variants.some((variant) => variant.variantId === variantId)) {
    throw new Error('unknown variant "' + variantId + '"');
  }

  const artifactPath = path.join(
    projectDir,
    "variants",
    variantId,
    "artifact.html"
  );
  const artifact = await readFile(artifactPath);
  const artifactHtml = artifact.toString("utf8");
  const manifest = {
    schemaVersion: 1,
    editIds: collectUniqueAttribute(artifactHtml, "data-edit-id"),
    blockIds: collectUniqueAttribute(artifactHtml, "data-block-id"),
    imageIds: collectUniqueAttribute(artifactHtml, "data-image-id"),
    chartIds: collectUniqueAttribute(artifactHtml, "data-chart-id")
  };
  validateNumericProvenance(artifactHtml);
  validateSourceReferences(
    artifactHtml,
    new Set(project.sourceFiles.map((source) => source.name))
  );
  validateOfflineResources(artifactHtml);
  await writeJsonAtomic(
    path.join(projectDir, "variants", variantId, "edit-manifest.json"),
    manifest
  );
  const versionId = randomUUID();
  const versionDir = path.join(projectDir, "versions", versionId);
  const parentVersion =
    [...project.versions].reverse().find((item) => item.variantId === variantId) ??
    null;
  const version = {
    schemaVersion: 1,
    versionId,
    variantId,
    parentVersionId: parentVersion?.versionId ?? null,
    createdAt: new Date().toISOString(),
    message,
    artifactSha256: createHash("sha256").update(artifact).digest("hex")
  };

  await mkdir(versionDir, { recursive: false });
  await copyFile(artifactPath, path.join(versionDir, "artifact.html"));
  await writeJsonAtomic(path.join(versionDir, "version.json"), version);
  project.versions.push(version);
  await writeJsonAtomic(projectPath, project);
  return version;
}

function validateSourceReferences(html, sourceNames) {
  const pattern = /\bdata-source-ref\s*=\s*["']([^"']+)["']/gi;
  for (const match of html.matchAll(pattern)) {
    const sourceName = match[1].split("#", 1)[0];
    if (!sourceNames.has(sourceName)) {
      throw new Error('unknown source reference "' + match[1] + '"');
    }
  }
}

function collectUniqueAttribute(html, attribute) {
  const values = new Set();
  const pattern = new RegExp(
    "\\b" + attribute + "\\s*=\\s*[\"']([^\"']+)[\"']",
    "gi"
  );
  for (const match of html.matchAll(pattern)) {
    if (values.has(match[1])) {
      throw new Error('duplicate ' + attribute + ' "' + match[1] + '"');
    }
    values.add(match[1]);
  }
  return [...values];
}

function validateOfflineResources(html) {
  if (
    /\b(?:src|poster)\s*=\s*["']https?:\/\//i.test(html) ||
    /\bsrcset\s*=\s*["'][^"']*https?:\/\//i.test(html) ||
    /url\(\s*["']?https?:\/\//i.test(html)
  ) {
    throw new Error("remote resources are not allowed");
  }
}

function validateNumericProvenance(html) {
  const editableElement =
    /<([a-z][\w-]*)\b([^>]*\bdata-edit-id\s*=\s*["']([^"']+)["'][^>]*)>([\s\S]*?)<\/\1>/gi;
  for (const match of html.matchAll(editableElement)) {
    const [, , attributes, editId, innerHtml] = match;
    const text = innerHtml.replace(/<[^>]+>/g, " ");
    if (/\d/.test(text) && !/\bdata-source-ref\s*=\s*["'][^"']+["']/i.test(attributes)) {
      throw new Error(
        'numeric edit "' + editId + '" requires data-source-ref'
      );
    }
  }
}

import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { validateModeArtifact } from "./artifact-contract.js";
import { writeJsonAtomic, writeTextAtomic } from "./io.js";
import { compileThemeIntoArtifact } from "./theme-artifact.js";
import { normalizeVariantRecord } from "./variants.js";
import { PROJECT_SCHEMA_VERSION, validateCoverage } from "./report-model.js";

export async function finalizeVariant(
  projectDir,
  variantId,
  { message = "", restoredFromVersionId = null } = {}
) {
  const projectPath = path.join(projectDir, "project.json");
  const project = JSON.parse(await readFile(projectPath, "utf8"));
  const storedVariant = project.variants.find(
    (variant) => variant.variantId === variantId
  );
  if (!storedVariant) {
    throw new Error('unknown variant "' + variantId + '"');
  }
  const variant = normalizeVariantRecord(storedVariant);

  const artifactPath = path.join(
    projectDir,
    "variants",
    variantId,
    "artifact.html"
  );
  const artifactHtml = await readFile(artifactPath, "utf8");
  const analysis = JSON.parse(
    await readFile(path.join(projectDir, "analysis.json"), "utf8")
  );
  const reportModel = await readJsonMaybe(
    path.join(projectDir, "variants", variantId, "report-model.json")
  );
  const presentationPlan = await readJsonMaybe(
    path.join(projectDir, "variants", variantId, "presentation-plan.json")
  );
  const coverageMap = await readJsonMaybe(path.join(projectDir, "coverage-map.json"));
  if (reportModel && coverageMap) validateCoverage(coverageMap, reportModel);
  const manifest = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    editIds: collectUniqueAttribute(artifactHtml, "data-edit-id"),
    blockIds: collectUniqueAttribute(artifactHtml, "data-block-id"),
    imageIds: collectUniqueAttribute(artifactHtml, "data-image-id"),
    chartIds: collectUniqueAttribute(artifactHtml, "data-chart-id")
  };
  validateNumericProvenance(artifactHtml);
  validateDerivedFormulas(artifactHtml);
  validateCharts(artifactHtml);
  validateSourceReferences(
    artifactHtml,
    new Set(project.sourceFiles.map((source) => source.name))
  );
  validateOfflineResources(artifactHtml);
  validateModeArtifact({
    html: artifactHtml,
    mode: variant.mode,
    analysis,
    report: reportModel,
    presentation: presentationPlan
  });
  const compiledArtifact = compileThemeIntoArtifact(
    artifactHtml,
    variant.themeId
  );
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
    schemaVersion: PROJECT_SCHEMA_VERSION,
    versionId,
    variantId,
    parentVersionId: parentVersion?.versionId ?? null,
    createdAt: new Date().toISOString(),
    message,
    themeId: variant.themeId,
    themeSchemaVersion: variant.themeSchemaVersion,
    reportRevision: reportModel?.revision ?? null,
    hasUserOverrides: Boolean(reportModel?.overrides?.length),
    modelBacked: Boolean(reportModel && /\bdata-node-id\s*=/.test(artifactHtml)),
    ...(restoredFromVersionId ? { restoredFromVersionId } : {}),
    artifactSha256: createHash("sha256")
      .update(compiledArtifact, "utf8")
      .digest("hex")
  };

  await mkdir(versionDir, { recursive: false });
  await writeTextAtomic(
    path.join(versionDir, "artifact.html"),
    compiledArtifact
  );
  await writeJsonAtomic(path.join(versionDir, "version.json"), version);
  if (reportModel) {
    await copyFile(
      path.join(projectDir, "variants", variantId, "report-model.json"),
      path.join(versionDir, "report-model.json")
    );
  }
  if (presentationPlan) {
    await copyFile(
      path.join(projectDir, "variants", variantId, "presentation-plan.json"),
      path.join(versionDir, "presentation-plan.json")
    );
  }
  if (coverageMap) {
    await copyFile(
      path.join(projectDir, "coverage-map.json"),
      path.join(versionDir, "coverage-map.json")
    );
  }
  project.versions.push(version);
  await writeJsonAtomic(projectPath, project);
  return version;
}

async function readJsonMaybe(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function validateCharts(html) {
  const chartTags = html.match(
    /<[a-z][^>]*\bdata-chart-id\s*=\s*["'][^"']+["'][^>]*>/gi
  ) ?? [];
  for (const tag of chartTags) {
    const chartId = tag.match(
      /\bdata-chart-id\s*=\s*["']([^"']+)["']/i
    )[1];
    if (!/\bdata-source-ref\s*=\s*["'][^"']+["']/i.test(tag)) {
      throw new Error('chart "' + chartId + '" requires data-source-ref');
    }
    const escapedId = chartId.replace(/[\^$.*+?()[\]{}|]/g, "\\$&");
    const dataPattern = new RegExp(
      "<script\\b[^>]*\\bdata-chart-data-for\\s*=\\s*[\"']" +
        escapedId +
        "[\"'][^>]*>([\\s\\S]*?)<\\/script>",
      "i"
    );
    const data = html.match(dataPattern)?.[1];
    if (data === undefined) {
      throw new Error('chart "' + chartId + '" requires embedded JSON data');
    }
    try {
      JSON.parse(data);
    } catch {
      throw new Error('chart "' + chartId + '" contains invalid JSON data');
    }
  }
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
  const resourceAttributes = /\b(?:src|poster)\s*=\s*["']([^"']+)["']/gi;
  for (const match of html.matchAll(resourceAttributes)) {
    if (!match[1].startsWith("data:") && !match[1].startsWith("#")) {
      throw new Error('resource "' + match[1] + '" must be inlined');
    }
  }
  const stylesheetLinks =
    /<link\b[^>]*\brel\s*=\s*["']stylesheet["'][^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi;
  for (const match of html.matchAll(stylesheetLinks)) {
    if (!match[1].startsWith("data:")) {
      throw new Error('resource "' + match[1] + '" must be inlined');
    }
  }
  const cssUrls = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
  for (const match of html.matchAll(cssUrls)) {
    if (!match[1].startsWith("data:") && !match[1].startsWith("#")) {
      throw new Error('resource "' + match[1] + '" must be inlined');
    }
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

function validateDerivedFormulas(html) {
  const derivedTags =
    html.match(/<[a-z][^>]*\bdata-derived\s*=\s*["']true["'][^>]*>/gi) ?? [];
  for (const tag of derivedTags) {
    if (/\bdata-formula\s*=\s*["'][^"']+["']/i.test(tag)) continue;
    const identity = tag.match(
      /\b(?:data-edit-id|data-chart-id)\s*=\s*["']([^"']+)["']/i
    )?.[1] ?? "unknown";
    throw new Error('derived value "' + identity + '" requires data-formula');
  }
}

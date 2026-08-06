import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { extractDocument } from "./extract.js";
import { writeJsonAtomic, writeTextAtomic } from "./io.js";
import { installProjectEditorRuntime } from "./project-runtime.js";
import { buildSourceModel } from "./report-model.js";
import { getTheme, THEME_SCHEMA_VERSION } from "./themes.js";

export const V5_PROJECT_SCHEMA_VERSION = 5;
export const V5_PACKAGE_VERSION = "5.2.1";
export const V5_PIPELINE_VERSION = "5.2.1";

export async function createV5Project(sourcePath, projectDir) {
  const contents = await readFile(sourcePath);
  const sourceName = path.basename(sourcePath);
  const sourceSha256 = sha256(contents);
  for (const directory of [
    "source", "source-assets", "source-pack/assets", "variants", "versions",
    "publications", ".runtime"
  ]) {
    await mkdir(path.join(projectDir, directory), { recursive: true });
  }
  await copyFile(sourcePath, path.join(projectDir, "source", sourceName));

  const extracted = await extractDocument(sourceName, contents);
  const sourceModel = buildSourceModel(sourceName, extracted, sourceSha256);
  sourceModel.schemaVersion = V5_PROJECT_SCHEMA_VERSION;
  await writeJsonAtomic(path.join(projectDir, "source-model.json"), sourceModel);
  await persistExtractedAssets(projectDir, extracted.assets ?? []);
  const sourcePack = await writeSourcePack(projectDir, sourceModel, extracted);

  const project = {
    schemaVersion: V5_PROJECT_SCHEMA_VERSION,
    packageVersion: V5_PACKAGE_VERSION,
    pipelineVersion: V5_PIPELINE_VERSION,
    projectId: randomUUID(),
    createdAt: new Date().toISOString(),
    activeVariantId: null,
    variants: [],
    versions: [],
    publications: [],
    sourcePackSha256: sourcePack.sourcePackSha256,
    sourceFiles: [{ name: sourceName, sha256: sourceSha256 }]
  };
  await writeJsonAtomic(path.join(projectDir, "project.json"), project);
  await writeJsonAtomic(path.join(projectDir, "analysis.json"), {
    schemaVersion: V5_PROJECT_SCHEMA_VERSION,
    documents: [{ name: sourceName, text: extracted.text ?? "" }],
    recommendation: null
  });
  await writeJsonAtomic(path.join(projectDir, "deployments.json"), {
    schemaVersion: V5_PROJECT_SCHEMA_VERSION,
    records: [],
    providers: {}
  });
  await installProjectEditorRuntime(projectDir);
  return project;
}

export async function createV5Variant(projectDir, { themeId } = {}) {
  const projectPath = path.join(projectDir, "project.json");
  const project = JSON.parse(await readFile(projectPath, "utf8"));
  if (project.schemaVersion !== V5_PROJECT_SCHEMA_VERSION) {
    throw new Error("V5 variant creation requires a schema version 5 project");
  }
  const selectedTheme = getTheme(themeId ?? "precision-blueprint");
  const variant = {
    schemaVersion: V5_PROJECT_SCHEMA_VERSION,
    packageVersion: V5_PACKAGE_VERSION,
    pipelineVersion: V5_PIPELINE_VERSION,
    variantId: randomUUID(),
    pipelineState: "awaiting-interview",
    interviewStatus: "pending",
    mode: "data-first",
    modeSelection: "compatibility-only",
    themeId: selectedTheme.themeId,
    themeSchemaVersion: THEME_SCHEMA_VERSION,
    createdAt: new Date().toISOString()
  };
  const variantDir = path.join(projectDir, "variants", variant.variantId);
  await mkdir(variantDir, { recursive: false });
  await writeJsonAtomic(path.join(variantDir, "variant.json"), variant);
  project.variants.push(variant);
  project.activeVariantId = variant.variantId;
  await writeJsonAtomic(projectPath, project);
  return variant;
}

async function writeSourcePack(projectDir, sourceModel, extracted) {
  const packDir = path.join(projectDir, "source-pack");
  const document = sourceModel.documents[0];
  const facts = document.units
    .filter((unit) => unit.substantive)
    .map((unit) => ({
      factId: "fact-" + unit.sourceId.replace(/^src-/, ""),
      sourceId: unit.sourceId,
      documentName: document.name,
      order: unit.order,
      kind: unit.type,
      rawText: unitText(unit),
      numericTokens: numericTokens(unitText(unit)),
      qualifications: qualificationTokens(unitText(unit))
    }));
  const sourceMap = {
    schemaVersion: 1,
    documents: sourceModel.documents.map((item) => ({
      documentId: item.documentId,
      name: item.name,
      sha256: item.sha256,
      units: item.units.map((unit) => ({
        sourceId: unit.sourceId,
        order: unit.order,
        type: unit.type,
        substantive: unit.substantive,
        page: unit.page ?? null,
        slide: unit.slide ?? null
      }))
    }))
  };
  const tables = document.units
    .filter((unit) => unit.type === "table" || unit.type === "chart")
    .map((unit) => ({ sourceId: unit.sourceId, type: unit.type, caption: unit.caption ?? "", rows: unit.rows ?? [] }));
  await writeTextAtomic(path.join(packDir, "readable-source.md"), extracted.text ?? "");
  await writeJsonAtomic(path.join(packDir, "fact-ledger.json"), { schemaVersion: 1, facts });
  await writeJsonAtomic(path.join(packDir, "source-map.json"), sourceMap);
  await writeJsonAtomic(path.join(packDir, "tables-and-datasets.json"), { schemaVersion: 1, datasets: tables });
  await writeJsonAtomic(path.join(packDir, "extraction-warnings.json"), {
    schemaVersion: 1,
    warnings: extracted.warnings ?? []
  });
  await writeTextAtomic(path.join(packDir, "asset-contact-sheet.html"), assetContactSheet(document.units));

  const entries = [
    "asset-contact-sheet.html", "extraction-warnings.json", "fact-ledger.json",
    "readable-source.md", "source-map.json", "tables-and-datasets.json"
  ];
  const sourcePackSha256 = await hashNamedFiles(packDir, entries);
  const manifest = {
    schemaVersion: 1,
    packageVersion: V5_PACKAGE_VERSION,
    sourcePackSha256,
    sourceSha256: document.sha256,
    files: entries,
    contentPolicy: "source-closed",
    designDecisions: false
  };
  await writeJsonAtomic(path.join(packDir, "manifest.json"), manifest);
  return manifest;
}

async function persistExtractedAssets(projectDir, assets) {
  for (const [index, asset] of assets.entries()) {
    const name = path.basename(asset.path ?? `asset-${index + 1}`);
    const bytes = asset.bytes ?? Buffer.alloc(0);
    await writeFile(path.join(projectDir, "source-assets", name), bytes);
    await writeFile(path.join(projectDir, "source-pack", "assets", name), bytes);
  }
}

function assetContactSheet(units) {
  const figures = units.filter((unit) => unit.type === "image").map((unit) => {
    const name = path.basename(unit.assetPath ?? "");
    return `<figure data-source-id="${escapeHtml(unit.sourceId)}"><img src="assets/${escapeHtml(name)}" alt="${escapeHtml(unit.alt ?? "")}"><figcaption>${escapeHtml(unit.caption || unit.alt || name)}</figcaption></figure>`;
  }).join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Asset contact sheet</title></head><body>${figures || "<p>No extracted visual assets.</p>"}</body></html>`;
}

function unitText(unit) {
  if (typeof unit.text === "string") return unit.text;
  if (Array.isArray(unit.items)) return unit.items.join("\n");
  if (Array.isArray(unit.rows)) return unit.rows.map((row) => row.join(" | ")).join("\n");
  return [unit.caption, unit.alt].filter(Boolean).join(" ");
}

function numericTokens(text) {
  return [...String(text).matchAll(/[-+]?\d[\d,.]*(?:%|亿元|万元|元|万台|台|kW|MW|GW)?/giu)].map((match) => match[0]);
}

function qualificationTokens(text) {
  return [...String(text).matchAll(/预计|约|至少|至多|可能|大约|不超过|不低于|同比|复合增速/gu)].map((match) => match[0]);
}

async function hashNamedFiles(root, entries) {
  const hash = createHash("sha256");
  for (const name of [...entries].sort()) {
    hash.update(name).update("\0").update(await readFile(path.join(root, name))).update("\0");
  }
  return hash.digest("hex");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

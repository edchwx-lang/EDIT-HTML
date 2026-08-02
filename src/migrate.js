import { createHash } from "node:crypto";
import { access, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { extractDocument } from "./extract.js";
import { packProject } from "./packaging.js";
import { writeJsonAtomic } from "./io.js";
import { installProjectEditorRuntime } from "./project-runtime.js";
import {
  buildSourceModel,
  createInitialCoverageMap,
  createPresentationPlan,
  PROJECT_SCHEMA_VERSION
} from "./report-model.js";
import { migrateLegacyThemeId, THEME_SCHEMA_VERSION } from "./themes.js";

export async function migrateProject(projectDir, { dryRun = false } = {}) {
  const projectPath = path.join(projectDir, "project.json");
  const original = JSON.parse(await readFile(projectPath, "utf8"));
  if (original.schemaVersion === PROJECT_SCHEMA_VERSION) {
    return { changed: false, fromSchemaVersion: 4, toSchemaVersion: 4, backupPath: null };
  }
  const variants = original.variants ?? [];
  const themeMappings = variants.flatMap((variant) => {
    const from = variant.themeId ?? variant.theme;
    const to = migrateLegacyThemeId(from);
    return from && from !== to ? [{ from, to, variantId: variant.variantId }] : [];
  });
  const summary = {
    changed: true,
    fromSchemaVersion: original.schemaVersion ?? 1,
    toSchemaVersion: PROJECT_SCHEMA_VERSION,
    themeMappings,
    backupPath: null
  };
  if (dryRun) return summary;

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(
    path.dirname(projectDir),
    path.basename(projectDir) + "-v3-" + stamp + ".zip"
  );
  await packProject(projectDir, backupPath);
  summary.backupPath = backupPath;

  const sourceModel = await importLegacySourceModel(projectDir, original);
  await writeJsonAtomic(path.join(projectDir, "source-model.json"), sourceModel);
  let coverage = createInitialCoverageMap(sourceModel);

  const migratedVariants = [];
  for (const stored of variants) {
    const variantId = stored.variantId;
    const variantDir = path.join(projectDir, "variants", variantId);
    await mkdir(variantDir, { recursive: true });
    const themeId = migrateLegacyThemeId(stored.themeId ?? stored.theme);
    const variant = {
      ...stored,
      schemaVersion: PROJECT_SCHEMA_VERSION,
      themeId,
      themeSchemaVersion: THEME_SCHEMA_VERSION
    };
    delete variant.theme;
    await writeJsonAtomic(path.join(variantDir, "variant.json"), variant);
    const artifactPath = path.join(variantDir, "artifact.html");
    const legacyHtml = await readMaybe(artifactPath, "");
    const sourceRefs = sourceModel.documents.flatMap((document) => document.units.map((unit) => ({
      sourceId: unit.sourceId,
      documentId: document.documentId,
      documentName: document.name,
      order: unit.order
    })));
    const report = {
      schemaVersion: PROJECT_SCHEMA_VERSION,
      variantId,
      mode: stored.mode,
      revision: 0,
      createdAt: stored.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [{
        nodeId: "legacy-" + variantId,
        type: "legacyHtml",
        html: legacyHtml,
        readOnly: true,
        sourceRefs
      }],
      datasets: [],
      overrides: []
    };
    const presentation = createPresentationPlan(report);
    await writeJsonAtomic(path.join(variantDir, "report-model.json"), report);
    await writeJsonAtomic(path.join(variantDir, "presentation-plan.json"), presentation);
    migratedVariants.push(variant);
    coverage = {
      ...coverage,
      variantId,
      entries: coverage.entries.map((entry) => ({
        ...entry,
        status: "preserved",
        reportNodeIds: ["legacy-" + variantId]
      }))
    };
  }
  await writeJsonAtomic(path.join(projectDir, "coverage-map.json"), coverage);

  const deploymentsPath = path.join(projectDir, "deployments.json");
  const deployments = JSON.parse(await readMaybe(deploymentsPath, '{"providers":{}}'));
  await writeJsonAtomic(deploymentsPath, {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    records: deployments.records ?? Object.values(deployments.providers ?? {}),
    providers: deployments.providers ?? {}
  });
  await mkdir(path.join(projectDir, "publications"), { recursive: true });

  const migrationLog = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    migratedAt: new Date().toISOString(),
    fromSchemaVersion: summary.fromSchemaVersion,
    toSchemaVersion: PROJECT_SCHEMA_VERSION,
    backupPath,
    themeMappings,
    historicalArtifactsModified: false
  };
  await writeJsonAtomic(path.join(projectDir, "migration-log.json"), migrationLog);
  await writeJsonAtomic(projectPath, {
    ...original,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    variants: migratedVariants,
    publications: original.publications ?? []
  });
  await installProjectEditorRuntime(projectDir);
  return summary;
}

async function importLegacySourceModel(projectDir, project) {
  const first = project.sourceFiles?.[0];
  const sourcePath = first ? path.join(projectDir, "source", first.name) : null;
  if (sourcePath && await exists(sourcePath)) {
    const contents = await readFile(sourcePath);
    const extracted = await extractDocument(first.name, contents);
    const sha256 = createHash("sha256").update(contents).digest("hex");
    return buildSourceModel(first.name, extracted, sha256);
  }
  const analysis = JSON.parse(await readMaybe(path.join(projectDir, "analysis.json"), '{"documents":[]}'));
  const document = analysis.documents?.[0] ?? { name: "legacy-source.txt", text: "" };
  return buildSourceModel(document.name ?? "legacy-source.txt", {
    mediaType: document.mediaType ?? "text/plain",
    text: document.text ?? "",
    warnings: ["Original source file is unavailable; imported from V3 analysis."],
    units: (document.text ?? "").split(/\r?\n/).filter(Boolean).map((text) => ({ type: "paragraph", text }))
  }, first?.sha256 ?? "legacy-import");
}

async function readMaybe(filePath, fallback) {
  try { return await readFile(filePath, "utf8"); } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function exists(filePath) {
  try { await access(filePath); return true; } catch { return false; }
}

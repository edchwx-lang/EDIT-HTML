import { createHash, randomUUID } from "node:crypto";
import { access, cp, mkdir, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";

import { extractDocument } from "./extract.js";
import { packProject } from "./packaging.js";
import { writeJsonAtomic } from "./io.js";
import { installProjectEditorRuntime } from "./project-runtime.js";
import {
  buildSourceModel,
  createInitialCoverageMap,
  createLegacyPresentationPlan,
  PACKAGE_VERSION,
  PIPELINE_VERSION,
  PROJECT_SCHEMA_VERSION
} from "./report-model.js";
import { migrateLegacyThemeId, THEME_SCHEMA_VERSION } from "./themes.js";

export async function migrateProject(projectDir, { dryRun = false } = {}) {
  projectDir = path.resolve(projectDir);
  const projectPath = path.join(projectDir, "project.json");
  const original = JSON.parse(await readFile(projectPath, "utf8"));
  if (original.schemaVersion === PROJECT_SCHEMA_VERSION) {
    if (
      original.packageVersion === PACKAGE_VERSION &&
      original.pipelineVersion === PIPELINE_VERSION
    ) {
      return {
        changed: false,
        fromSchemaVersion: 4,
        toSchemaVersion: 4,
        fromPackageVersion: PACKAGE_VERSION,
        toPackageVersion: PACKAGE_VERSION,
        backupPath: null
      };
    }
    return migrateV411Project(projectDir, original, { dryRun });
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

  const stagingPath = path.join(path.dirname(projectDir), ".migration-stage-" + randomUUID());
  const rollbackPath = path.join(path.dirname(projectDir), ".migration-rollback-" + randomUUID());
  let stagingPromoted = false;
  let originalMoved = false;
  await cp(projectDir, stagingPath, {
    recursive: true,
    filter: (source) => {
      const name = path.basename(source);
      return name !== ".runtime" && !name.startsWith(".migration-");
    }
  });
  try {
    await migrateProjectFiles(stagingPath, original, variants, summary, backupPath);
    await validateMigratedProject(stagingPath, variants);
    await rename(projectDir, rollbackPath);
    originalMoved = true;
    try {
      await rename(stagingPath, projectDir);
      stagingPromoted = true;
    } catch (error) {
      await rename(rollbackPath, projectDir);
      originalMoved = false;
      throw error;
    }
    await rm(rollbackPath, { recursive: true, force: true });
    originalMoved = false;
    return summary;
  } finally {
    if (!stagingPromoted) await rm(stagingPath, { recursive: true, force: true });
    if (originalMoved && await exists(rollbackPath) && !await exists(projectDir)) {
      await rename(rollbackPath, projectDir);
    }
  }
}

async function migrateV411Project(projectDir, original, { dryRun }) {
  const variants = original.variants ?? [];
  const themeMappings = variants.flatMap((variant) => {
    const from = variant.themeId ?? variant.theme;
    const to = migrateLegacyThemeId(from);
    return from && from !== to ? [{ from, to, variantId: variant.variantId }] : [];
  });
  const summary = {
    changed: true,
    fromSchemaVersion: PROJECT_SCHEMA_VERSION,
    toSchemaVersion: PROJECT_SCHEMA_VERSION,
    fromPackageVersion: original.packageVersion ?? "4.1.1",
    toPackageVersion: PACKAGE_VERSION,
    fromPipelineVersion: original.pipelineVersion ?? "4.1.1",
    toPipelineVersion: PIPELINE_VERSION,
    themeMappings,
    backupPath: null
  };
  if (dryRun) return summary;

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(
    path.dirname(projectDir),
    path.basename(projectDir) + "-v4-1-1-" + stamp + ".zip"
  );
  await packProject(projectDir, backupPath);
  summary.backupPath = backupPath;

  const stagingPath = path.join(path.dirname(projectDir), ".migration-stage-" + randomUUID());
  const rollbackPath = path.join(path.dirname(projectDir), ".migration-rollback-" + randomUUID());
  let stagingPromoted = false;
  let originalMoved = false;
  await cp(projectDir, stagingPath, {
    recursive: true,
    filter: (source) => {
      const name = path.basename(source);
      return name !== ".runtime" && !name.startsWith(".migration-");
    }
  });
  try {
    const migratedVariants = [];
    for (const stored of variants) {
      if (!stored.variantId) throw new Error("V4.1.1 variant requires variantId");
      const variantPath = path.join(stagingPath, "variants", stored.variantId, "variant.json");
      const diskVariant = JSON.parse(await readFile(variantPath, "utf8"));
      const themeId = migrateLegacyThemeId(diskVariant.themeId ?? diskVariant.theme);
      const nextVariant = {
        ...diskVariant,
        schemaVersion: PROJECT_SCHEMA_VERSION,
        packageVersion: PACKAGE_VERSION,
        pipelineVersion: PIPELINE_VERSION,
        themeId,
        themeSchemaVersion: THEME_SCHEMA_VERSION,
        reviewState: {
          status: "awaiting-editor-review",
          reason: "V4.2 executable design candidate required",
          invalidatedAt: new Date().toISOString()
        }
      };
      delete nextVariant.theme;
      await writeJsonAtomic(variantPath, nextVariant);
      migratedVariants.push(nextVariant);
    }
    await writeJsonAtomic(path.join(stagingPath, "project.json"), {
      ...original,
      schemaVersion: PROJECT_SCHEMA_VERSION,
      packageVersion: PACKAGE_VERSION,
      pipelineVersion: PIPELINE_VERSION,
      variants: migratedVariants
    });
    await writeJsonAtomic(path.join(stagingPath, "migration-log.json"), {
      schemaVersion: PROJECT_SCHEMA_VERSION,
      migratedAt: new Date().toISOString(),
      fromSchemaVersion: PROJECT_SCHEMA_VERSION,
      toSchemaVersion: PROJECT_SCHEMA_VERSION,
      fromPackageVersion: summary.fromPackageVersion,
      toPackageVersion: PACKAGE_VERSION,
      fromPipelineVersion: summary.fromPipelineVersion,
      toPipelineVersion: PIPELINE_VERSION,
      backupPath,
      themeMappings,
      historicalArtifactsModified: false,
      weakDesignPackagesPreservedButDisabled: true
    });
    await installProjectEditorRuntime(stagingPath);
    await validateV42Project(stagingPath, variants);
    await rename(projectDir, rollbackPath);
    originalMoved = true;
    try {
      await rename(stagingPath, projectDir);
      stagingPromoted = true;
    } catch (error) {
      await rename(rollbackPath, projectDir);
      originalMoved = false;
      throw error;
    }
    await rm(rollbackPath, { recursive: true, force: true });
    originalMoved = false;
    return summary;
  } finally {
    if (!stagingPromoted) await rm(stagingPath, { recursive: true, force: true });
    if (originalMoved && await exists(rollbackPath) && !await exists(projectDir)) {
      await rename(rollbackPath, projectDir);
    }
  }
}

async function validateV42Project(projectDir, variants) {
  const project = await readJson(path.join(projectDir, "project.json"));
  if (
    project.schemaVersion !== PROJECT_SCHEMA_VERSION ||
    project.packageVersion !== PACKAGE_VERSION ||
    project.pipelineVersion !== PIPELINE_VERSION
  ) {
    throw new Error("V4.2 migration staging validation failed: runtime version mismatch");
  }
  for (const stored of variants) {
    const variant = await readJson(
      path.join(projectDir, "variants", stored.variantId, "variant.json")
    );
    if (
      variant.packageVersion !== PACKAGE_VERSION ||
      variant.pipelineVersion !== PIPELINE_VERSION
    ) {
      throw new Error("V4.2 migration staging validation failed: variant version mismatch");
    }
  }
}

async function migrateProjectFiles(projectDir, original, variants, summary, backupPath) {
  const projectPath = path.join(projectDir, "project.json");

  const sourceModel = await importLegacySourceModel(projectDir, original);
  await writeJsonAtomic(path.join(projectDir, "source-model.json"), sourceModel);
  let coverage = createInitialCoverageMap(sourceModel);

  const migratedVariants = [];
  for (const stored of variants) {
    const variantId = stored.variantId;
    if (!variantId) throw new Error("legacy variant requires variantId");
    const variantDir = path.join(projectDir, "variants", variantId);
    await mkdir(variantDir, { recursive: true });
    const themeId = migrateLegacyThemeId(stored.themeId ?? stored.theme);
    const variant = {
      ...stored,
      schemaVersion: PROJECT_SCHEMA_VERSION,
      packageVersion: PACKAGE_VERSION,
      pipelineVersion: PIPELINE_VERSION,
      themeId,
      themeSchemaVersion: THEME_SCHEMA_VERSION,
      reviewState: {
        status: "awaiting-editor-review",
        reason: "V4.2 executable design candidate required",
        invalidatedAt: new Date().toISOString()
      }
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
    const presentation = createLegacyPresentationPlan(report);
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
    themeMappings: summary.themeMappings,
    historicalArtifactsModified: false
  };
  await writeJsonAtomic(path.join(projectDir, "migration-log.json"), migrationLog);
  await writeJsonAtomic(projectPath, {
    ...original,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    packageVersion: PACKAGE_VERSION,
    pipelineVersion: PIPELINE_VERSION,
    variants: migratedVariants,
    publications: original.publications ?? []
  });
  await installProjectEditorRuntime(projectDir);
}

async function validateMigratedProject(projectDir, variants) {
  const [project, sourceModel, coverage] = await Promise.all([
    readJson(path.join(projectDir, "project.json")),
    readJson(path.join(projectDir, "source-model.json")),
    readJson(path.join(projectDir, "coverage-map.json"))
  ]);
  if (project.schemaVersion !== PROJECT_SCHEMA_VERSION || sourceModel.schemaVersion !== PROJECT_SCHEMA_VERSION || coverage.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    throw new Error("migration staging validation failed: schema version mismatch");
  }
  for (const variant of variants) {
    if (!variant.variantId) throw new Error("legacy variant requires variantId");
    await Promise.all([
      access(path.join(projectDir, "variants", variant.variantId, "variant.json")),
      access(path.join(projectDir, "variants", variant.variantId, "report-model.json")),
      access(path.join(projectDir, "variants", variant.variantId, "presentation-plan.json"))
    ]);
  }
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

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function exists(filePath) {
  try { await access(filePath); return true; } catch { return false; }
}

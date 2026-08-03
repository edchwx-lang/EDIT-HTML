import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { getModeProfile } from "./modes/index.js";
import { writeJsonAtomic } from "./io.js";
import {
  PACKAGE_VERSION,
  PIPELINE_VERSION,
  PROJECT_SCHEMA_VERSION,
  scaffoldReportModel
} from "./report-model.js";
import { prepareHuashuInput } from "./design-package.js";
import { getTheme, THEME_SCHEMA_VERSION } from "./themes.js";
import { markAwaitingEditorReview } from "./editor-review.js";

export async function createVariant(projectDir, { mode, themeId, theme }) {
  const compatibilityMode = mode ?? "data-first";
  const profile = getModeProfile(compatibilityMode);
  const selectedTheme = getTheme(themeId ?? theme ?? (mode ? profile.defaultThemeId : "precision-blueprint"));

  const projectPath = path.join(projectDir, "project.json");
  const project = JSON.parse(await readFile(projectPath, "utf8"));
  const variant = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    packageVersion: PACKAGE_VERSION,
    pipelineVersion: PIPELINE_VERSION,
    variantId: randomUUID(),
    mode: compatibilityMode,
    modeSelection: "strategy-derived",
    themeId: selectedTheme.themeId,
    themeSchemaVersion: THEME_SCHEMA_VERSION,
    createdAt: new Date().toISOString()
  };
  const variantDir = path.join(projectDir, "variants", variant.variantId);
  await mkdir(variantDir, { recursive: false });
  await writeJsonAtomic(path.join(variantDir, "variant.json"), variant);
  const sourceModel = JSON.parse(
    await readFile(path.join(projectDir, "source-model.json"), "utf8")
  );
  const scaffold = scaffoldReportModel(sourceModel, {
    variantId: variant.variantId,
    mode: compatibilityMode
  });
  await writeJsonAtomic(path.join(variantDir, "report-model.json"), scaffold.report);
  await writeJsonAtomic(path.join(projectDir, "coverage-map.json"), {
    ...scaffold.coverage,
    variantId: variant.variantId
  });
  project.variants.push(variant);
  project.activeVariantId = variant.variantId;
  await writeJsonAtomic(projectPath, project);
  await prepareHuashuInput(projectDir, variant.variantId);
  return variant;
}

export async function listVariants(projectDir) {
  const project = JSON.parse(
    await readFile(path.join(projectDir, "project.json"), "utf8")
  );
  return project.variants.map(normalizeVariantRecord);
}

export async function updateVariantTheme(projectDir, variantId, themeId, { source = "api" } = {}) {
  const projectPath = path.join(projectDir, "project.json");
  const project = JSON.parse(await readFile(projectPath, "utf8"));
  const index = project.variants.findIndex((item) => item.variantId === variantId);
  if (index === -1) throw new Error('unknown variant "' + variantId + '"');
  const selectedTheme = getTheme(themeId);
  const variant = {
    ...normalizeVariantRecord(project.variants[index]),
    themeId: selectedTheme.themeId,
    themeSchemaVersion: THEME_SCHEMA_VERSION
  };
  if (source === "editor" && variant.designSelection) {
    variant.designSelection = {
      ...variant.designSelection,
      themeOverride: {
        themeId: selectedTheme.themeId,
        changedAt: new Date().toISOString(),
        source: "editor"
      }
    };
  }
  const variantDir = path.join(projectDir, "variants", variantId);
  project.variants[index] = variant;
  await writeJsonAtomic(path.join(variantDir, "variant.json"), variant);
  await writeJsonAtomic(projectPath, project);
  try {
    await markAwaitingEditorReview(projectDir, variantId, { reason: "theme-changed" });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return variant;
}

export function normalizeVariantRecord(variant) {
  const profile = getModeProfile(variant.mode);
  const selectedTheme = getTheme(
    variant.themeId ?? variant.theme ?? profile.defaultThemeId
  );
  const { theme: _legacyTheme, ...rest } = variant;
  return {
    schemaVersion: rest.schemaVersion ?? PROJECT_SCHEMA_VERSION,
    ...rest,
    themeId: selectedTheme.themeId,
    themeSchemaVersion: THEME_SCHEMA_VERSION
  };
}

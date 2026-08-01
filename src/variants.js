import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { getModeProfile } from "./modes/index.js";
import { writeJsonAtomic } from "./project.js";
import { getTheme, THEME_SCHEMA_VERSION } from "./themes.js";

export async function createVariant(projectDir, { mode, themeId, theme }) {
  const profile = getModeProfile(mode);
  const selectedTheme = getTheme(themeId ?? theme ?? profile.defaultThemeId);

  const projectPath = path.join(projectDir, "project.json");
  const project = JSON.parse(await readFile(projectPath, "utf8"));
  const variant = {
    schemaVersion: 1,
    variantId: randomUUID(),
    mode,
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

export async function listVariants(projectDir) {
  const project = JSON.parse(
    await readFile(path.join(projectDir, "project.json"), "utf8")
  );
  return project.variants.map(normalizeVariantRecord);
}

export async function updateVariantTheme(projectDir, variantId, themeId) {
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
  const variantDir = path.join(projectDir, "variants", variantId);
  project.variants[index] = variant;
  await writeJsonAtomic(path.join(variantDir, "variant.json"), variant);
  await writeJsonAtomic(projectPath, project);
  return variant;
}

export function normalizeVariantRecord(variant) {
  const profile = getModeProfile(variant.mode);
  const selectedTheme = getTheme(
    variant.themeId ?? variant.theme ?? profile.defaultThemeId
  );
  const { theme: _legacyTheme, ...rest } = variant;
  return {
    schemaVersion: rest.schemaVersion ?? 1,
    ...rest,
    themeId: selectedTheme.themeId,
    themeSchemaVersion: THEME_SCHEMA_VERSION
  };
}

import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { writeJsonAtomic } from "./project.js";

const THEMES_BY_MODE = {
  "evidence-first": new Set(["editorial-light", "editorial-dark"]),
  "data-first": new Set(["tech-dark", "consulting-light"])
};

export async function createVariant(projectDir, { mode, theme }) {
  const validThemes = THEMES_BY_MODE[mode];
  if (!validThemes) {
    throw new Error('unknown mode "' + mode + '"');
  }
  if (!validThemes.has(theme)) {
    throw new Error(
      'theme "' + theme + '" is not valid for mode "' + mode + '"'
    );
  }

  const projectPath = path.join(projectDir, "project.json");
  const project = JSON.parse(await readFile(projectPath, "utf8"));
  const variant = {
    variantId: randomUUID(),
    mode,
    theme,
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
  return project.variants;
}

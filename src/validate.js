import { readFile } from "node:fs/promises";
import path from "node:path";

import { validateModeArtifact } from "./artifact-contract.js";
import { validateCoverage } from "./report-model.js";

export async function validateVariant(projectDir, variantId) {
  const variantDir = path.join(projectDir, "variants", variantId);
  const [variant, report, coverage, html] = await Promise.all([
    readJson(path.join(variantDir, "variant.json")),
    readJson(path.join(variantDir, "report-model.json")),
    readJson(path.join(projectDir, "coverage-map.json")),
    readFile(path.join(variantDir, "artifact.html"), "utf8")
  ]);
  validateCoverage(coverage, report);
  validateModeArtifact({ html, mode: variant.mode, report });
  return {
    valid: true,
    schemaVersion: 4,
    variantId,
    mode: variant.mode,
    themeId: variant.themeId,
    coverageEntries: coverage.entries.length
  };
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

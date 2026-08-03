import { readFile } from "node:fs/promises";
import path from "node:path";

import { validateModeArtifact } from "./artifact-contract.js";
import { validateCoverage } from "./report-model.js";
import { validateHuashuDesignPackage } from "./design-package.js";

export async function validateVariant(projectDir, variantId) {
  const variantDir = path.join(projectDir, "variants", variantId);
  const [variant, report, coverage, html, design] = await Promise.all([
    readJson(path.join(variantDir, "variant.json")),
    readJson(path.join(variantDir, "report-model.json")),
    readJson(path.join(projectDir, "coverage-map.json")),
    readFile(path.join(variantDir, "artifact.html"), "utf8"),
    validateHuashuDesignPackage(projectDir, variantId)
  ]);
  validateCoverage(coverage, report);
  validateModeArtifact({ html, mode: variant.mode, report });
  return {
    valid: true,
    schemaVersion: 4,
    variantId,
    mode: variant.mode,
    themeId: variant.themeId,
    coverageEntries: coverage.entries.length,
    huashuRunId: design.manifest.runId,
    designInputSha256: design.inputSha256,
    designOutputSha256: design.outputSha256
  };
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

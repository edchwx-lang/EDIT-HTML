import { readFile } from "node:fs/promises";
import path from "node:path";

import { validateModeArtifact } from "./artifact-contract.js";
import { validateCoverage } from "./report-model.js";
import { loadConfirmedHuashuDesignPackage } from "./design-package.js";

export async function validateVariant(projectDir, variantId) {
  const variantDir = path.join(projectDir, "variants", variantId);
  const [variant, report, coverage, html, design, presentation] = await Promise.all([
    readJson(path.join(variantDir, "variant.json")),
    readJson(path.join(variantDir, "report-model.json")),
    readJson(path.join(projectDir, "coverage-map.json")),
    readFile(path.join(variantDir, "artifact.html"), "utf8"),
    loadConfirmedHuashuDesignPackage(projectDir, variantId),
    readJson(path.join(variantDir, "presentation-plan.json"))
  ]);
  validateCoverage(coverage, report);
  validateModeArtifact({ html, mode: variant.mode, report });
  validateDesignApplication({ html, design, presentation });
  return {
    valid: true,
    schemaVersion: 4,
    variantId,
    mode: variant.mode,
    themeId: variant.themeId,
    coverageEntries: coverage.entries.length,
    designCandidateId: design.manifest.candidateId ?? null,
    designDirectionId: design.manifest.designDirectionId ?? null,
    designInputSha256: design.inputSha256,
    designOutputSha256: design.outputSha256
  };
}

function validateDesignApplication({ html, design, presentation }) {
  if (design.manifest.schemaVersion !== 2) return;
  if (attributeValue(html, "data-design-direction") !== design.manifest.designDirectionId) {
    throw new Error("artifact design direction does not match the confirmed package");
  }
  if (attributeValue(html, "data-design-package-sha") !== design.outputSha256) {
    throw new Error("artifact design package SHA does not match the confirmed package");
  }
  if (attributeValue(html, "data-preview-theme") !== design.manifest.previewThemeId) {
    throw new Error("artifact preview theme does not match the confirmed package");
  }
  if (!html.includes(design.stylesheet)) {
    throw new Error("artifact does not contain the confirmed package stylesheet");
  }
  if (!html.includes(`data-design-package="${design.outputSha256}"`)) {
    throw new Error("artifact package stylesheet is not hash-bound");
  }
  let appliedBindings = 0;
  for (const binding of presentation.bindings ?? []) {
    if (!html.includes(`data-node-id="${binding.nodeId}"`)) continue;
    appliedBindings += 1;
    if (!html.includes(`data-component-id="${binding.componentId}"`)) {
      throw new Error(`artifact did not apply componentId ${binding.componentId}`);
    }
    if (!html.includes(`data-layout-id="${binding.layoutId}"`)) {
      throw new Error(`artifact did not apply layoutId ${binding.layoutId}`);
    }
    for (const interactionId of binding.interactionIds ?? []) {
      if (!html.includes(interactionId)) {
        throw new Error(`artifact did not apply interactionId ${interactionId}`);
      }
    }
    if (binding.chartComponentId) {
      if (!html.includes(`data-chart-component-id="${binding.chartComponentId}"`)) {
        throw new Error(`artifact did not apply chart componentId ${binding.chartComponentId}`);
      }
      if (!html.includes(`data-chart-layout-id="${binding.chartLayoutId}"`)) {
        throw new Error(`artifact did not apply chart layoutId ${binding.chartLayoutId}`);
      }
      for (const interactionId of binding.chartInteractionIds ?? []) {
        if (!html.includes(interactionId)) {
          throw new Error(`artifact did not apply chart interactionId ${interactionId}`);
        }
      }
    }
  }
  if (!appliedBindings) throw new Error("artifact contains no package-driven DOM bindings");
}

function attributeValue(html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return html.match(new RegExp(`\\b${escaped}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1] ?? null;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

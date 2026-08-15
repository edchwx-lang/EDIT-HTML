import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { validateHuashuDesignEvidence, validateHuashuCandidateIsolation } from "../src/v5-huashu-evidence.js";

async function fixture(t, imageCount = 3) {
  const root = await mkdtemp(path.join(os.tmpdir(), "edit-html-evidence-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const project = path.join(root, "project");
  const site = path.join(root, "site");
  await Promise.all([mkdir(project, { recursive: true }), mkdir(site, { recursive: true })]);
  const units = Array.from({ length: imageCount }, (_, index) => ({
    sourceId: `src-image-${index + 1}`, type: "image", assetPath: `image-${index + 1}.png`
  }));
  await writeFile(path.join(project, "source-model.json"), JSON.stringify({ documents: [{ units }] }), "utf8");
  return { project, site, units };
}

function evidence(units, overrides = {}) {
  return {
    schemaVersion: 1,
    contentAuthority: "user",
    designAuthority: "huashu-design",
    interviewSha256: "a".repeat(64),
    strategy: {
      id: "systematic-analysis",
      rationale: "Build a layered analytical argument from mechanism to competition.",
      domApproach: "Indexed evidence rail with nested analytical sections.",
      visualizationApproach: "Mechanism matrix and comparative field map.",
      interactionApproach: "Evidence filters update the active analytical layer."
    },
    sourceImages: units.map((unit, index) => ({
      sourceId: unit.sourceId,
      assetPath: unit.assetPath,
      visualDescription: `Distinct visual inspection ${index + 1} describing the visible subject and labels.`,
      contentRole: "evidence",
      informationLoss: "medium",
      value: index === 0 ? "high" : "medium",
      treatment: index === 0 ? "use-original" : "reference-only",
      rationale: `Image ${index + 1} supports a different factual claim in the source narrative.`
    })),
    selfCritique: { score: 82, strengths: ["Clear hierarchy"], risks: ["Dense comparison"] },
    ...overrides
  };
}

test("evidence requires Huashu authority and covers every visually inspected source image", async (t) => {
  const { project, site, units } = await fixture(t);
  const value = evidence(units.slice(0, 2), { designAuthority: "agent" });
  await writeFile(path.join(site, "huashu-design-evidence.json"), JSON.stringify(value), "utf8");
  const result = await validateHuashuDesignEvidence(project, site, "candidate");
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((item) => item.code === "invalid-design-authority"));
  assert.ok(result.errors.some((item) => item.code === "source-image-not-assessed" && item.sourceId === "src-image-3"));
});

test("three repeated image rationales and high-loss evidence omission are errors", async (t) => {
  const { project, site, units } = await fixture(t);
  const value = evidence(units);
  for (const image of value.sourceImages) image.rationale = "Decorative image is not useful.";
  value.sourceImages[0] = { ...value.sourceImages[0], contentRole: "technical-explanation", informationLoss: "high", value: "high", treatment: "omit" };
  await writeFile(path.join(site, "huashu-design-evidence.json"), JSON.stringify(value), "utf8");
  const result = await validateHuashuDesignEvidence(project, site, "candidate");
  assert.ok(result.errors.some((item) => item.code === "repeated-image-rationale"));
  assert.ok(result.errors.some((item) => item.code === "high-information-image-omitted"));
  assert.ok(result.errors.some((item) => item.code === "high-value-image-omitted"));
});

test("all-low and no-used-content-image are warnings rather than blockers", async (t) => {
  const { project, site, units } = await fixture(t, 2);
  const value = evidence(units);
  value.sourceImages = value.sourceImages.map((item) => ({ ...item, contentRole: "decorative", informationLoss: "low", value: "low", treatment: "omit" }));
  await writeFile(path.join(site, "huashu-design-evidence.json"), JSON.stringify(value), "utf8");
  const result = await validateHuashuDesignEvidence(project, site, "candidate");
  assert.equal(result.valid, true);
  assert.ok(result.warnings.some((item) => item.code === "all-images-low-value"));
  assert.ok(result.warnings.some((item) => item.code === "no-content-image-used"));
});

test("candidate strategies must be the three isolated Huashu directions", () => {
  const shared = evidence([]);
  const values = ["systematic-analysis", "real-world-benchmark", "authorial"].map((id, index) => ({
    ...shared,
    strategy: {
      id,
      rationale: `Independent rationale ${index}`,
      domApproach: `Independent DOM ${index}`,
      visualizationApproach: `Independent visualization ${index}`,
      interactionApproach: `Independent interaction ${index}`
    }
  }));
  assert.equal(validateHuashuCandidateIsolation(values).valid, true);
  values[2].strategy.domApproach = values[1].strategy.domApproach;
  assert.equal(validateHuashuCandidateIsolation(values).valid, false);
});

test("final evidence cannot silently lower the selected candidate image value", async (t) => {
  const { project, site, units } = await fixture(t, 1);
  const variantId = "variant-one";
  const candidateId = "candidate-one";
  const candidateDir = path.join(project, "variants", variantId, "design", "candidates", candidateId);
  await mkdir(candidateDir, { recursive: true });
  await writeFile(path.join(project, "variants", variantId, "variant.json"), JSON.stringify({ designSelection: { candidateId } }));
  await writeFile(path.join(candidateDir, "huashu-design-evidence.json"), JSON.stringify(evidence(units)));
  const finalEvidence = evidence(units);
  finalEvidence.sourceImages[0] = { ...finalEvidence.sourceImages[0], value: "low", treatment: "reference-only", candidateValue: "high" };
  await writeFile(path.join(site, "huashu-design-evidence.json"), JSON.stringify(finalEvidence));
  const result = await validateHuashuDesignEvidence(project, site, "final", { variantId });
  assert.ok(result.errors.some((item) => item.code === "unexplained-image-value-downgrade"));
});

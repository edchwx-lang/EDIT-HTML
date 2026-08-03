import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { writeJsonAtomic } from "./io.js";
import { compileThemeIntoArtifact } from "./theme-artifact.js";

export async function markAwaitingEditorReview(
  projectDir,
  variantId,
  { reason = "rendered" } = {}
) {
  const fingerprint = await currentReviewFingerprint(projectDir, variantId, {
    allowMissingDesignPackage: true
  });
  const reviewState = {
    status: "awaiting-editor-review",
    ...fingerprint,
    invalidatedAt: new Date().toISOString(),
    reason
  };
  await persistReviewState(projectDir, variantId, reviewState);
  return reviewState;
}

export async function confirmEditorReview(projectDir, variantId, { sessionId } = {}) {
  if (typeof sessionId !== "string" || !sessionId.trim()) {
    throw new Error("visible editor sessionId is required for design and color confirmation");
  }
  const fingerprint = await currentReviewFingerprint(projectDir, variantId);
  const reviewState = {
    status: "confirmed",
    ...fingerprint,
    confirmedAt: new Date().toISOString(),
    sessionId
  };
  await persistReviewState(projectDir, variantId, reviewState);
  return reviewState;
}

export async function getEditorReviewState(projectDir, variantId) {
  const variant = await readJson(path.join(projectDir, "variants", variantId, "variant.json"));
  return variant.reviewState ?? { status: "awaiting-editor-review", reason: "missing-confirmation" };
}

export async function assertEditorReviewConfirmed(projectDir, variantId) {
  const variant = await readJson(path.join(projectDir, "variants", variantId, "variant.json"));
  const review = variant.reviewState;
  if (review?.status !== "confirmed") {
    throw new Error("editor confirmation is required before finalize or publish");
  }
  const current = await currentReviewFingerprint(projectDir, variantId);
  for (const field of ["artifactSha256", "designPackageSha256", "themeId"]) {
    if (review[field] !== current[field]) {
      throw new Error(`editor confirmation no longer matches current ${field}`);
    }
  }
  if (!review.sessionId || !review.confirmedAt) {
    throw new Error("editor confirmation requires session and timestamp");
  }
  return review;
}

async function currentReviewFingerprint(
  projectDir,
  variantId,
  { allowMissingDesignPackage = false } = {}
) {
  const variantDir = path.join(projectDir, "variants", variantId);
  const [variant, artifact] = await Promise.all([
    readJson(path.join(variantDir, "variant.json")),
    readFile(path.join(variantDir, "artifact.html"), "utf8")
  ]);
  let manifest;
  try {
    manifest = await readJson(path.join(variantDir, "design", "package", "manifest.json"));
  } catch (error) {
    if (!allowMissingDesignPackage || error?.code !== "ENOENT") {
      throw error;
    }
  }
  const compiledArtifact = compileThemeIntoArtifact(artifact, variant.themeId);
  return {
    artifactSha256: createHash("sha256").update(compiledArtifact, "utf8").digest("hex"),
    ...(manifest?.outputSha256 ? { designPackageSha256: manifest.outputSha256 } : {}),
    themeId: variant.themeId
  };
}

async function persistReviewState(projectDir, variantId, reviewState) {
  const variantPath = path.join(projectDir, "variants", variantId, "variant.json");
  const projectPath = path.join(projectDir, "project.json");
  const [variant, project] = await Promise.all([readJson(variantPath), readJson(projectPath)]);
  variant.reviewState = reviewState;
  const stored = project.variants.find((item) => item.variantId === variantId);
  if (stored) stored.reviewState = reviewState;
  await writeJsonAtomic(variantPath, variant);
  await writeJsonAtomic(projectPath, project);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

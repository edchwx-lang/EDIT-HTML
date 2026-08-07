import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { auditV5FinalSite } from "./v5-audit.js";
import {
  ARTIFACT_CONTRACT_VERSION,
  EDITOR_RUNTIME_VERSION,
  SUPPORTED_ARTIFACT_CONTRACT_VERSIONS
} from "./version-manifest.js";
import { requireFrozenHuashuOutput } from "./v5-stage-boundary.js";
import { requireV5FinalVerification } from "./v5-final-verification.js";

export async function validateV5Variant(projectDir, variantId) {
  const variantDir = path.join(projectDir, "variants", variantId);
  const [project, variant, artifact, instrumentation, manifest] = await Promise.all([
    readJson(path.join(projectDir, "project.json")),
    readJson(path.join(variantDir, "variant.json")),
    readFile(path.join(variantDir, "artifact.html"), "utf8"),
    readJson(path.join(variantDir, "instrumentation-report.json")),
    readJson(path.join(variantDir, "design", "package", "manifest.json"))
  ]);
  if (project.schemaVersion !== 5 || variant.schemaVersion !== 5) throw new Error("V5 validation requires schema version 5");
  if (["5.3.0", "5.3.1", "5.3.2"].includes(manifest.packageVersion)) {
    await requireFrozenHuashuOutput(projectDir, variantId, "final");
    await requireV5FinalVerification(projectDir, variantId);
  }
  assertSupportedArtifactContractVersion(project);
  assertSupportedArtifactContractVersion(variant);
  if (variant.finalSiteSha256 !== manifest.outputSha256) throw new Error("variant and final site hash do not match");
  if (instrumentation.bodyStructureBeforeSha256 !== instrumentation.bodyStructureAfterSha256) throw new Error("Huashu body structure changed during instrumentation");
  if (!/\bdata-report-mode\s*=\s*["']data-first["']/i.test(artifact)) throw new Error("V5 artifact lacks the hidden editor compatibility mode");
  if (!/\bdata-design-package-sha\s*=\s*["'][a-f0-9]{64}["']/i.test(artifact)) throw new Error("V5 artifact lacks final Huashu site identity");
  if (/\bdata-node-id\s*=/i.test(artifact)) throw new Error("V5 artifact must use the editor HTML patch path");
  if (/\b(?:src|poster)\s*=\s*["'](?!data:|#)[^"']+/i.test(artifact) || /<link\b[^>]*\brel\s*=\s*["']stylesheet/i.test(artifact)) {
    throw new Error("V5 artifact contains a non-inlined runtime resource");
  }
  if (/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/.test(artifact) || /\beval\s*\(|\bnew\s+Function\s*\(/.test(artifact)) {
    throw new Error("V5 artifact contains forbidden runtime behavior");
  }
  assertUniqueAttributes(artifact, ["data-edit-id", "data-block-id", "data-image-id", "data-chart-id"]);
  assertExecutableCharts(artifact);
  const audit = await auditV5FinalSite(projectDir, variantId);
  const artifactSha256 = createHash("sha256").update(artifact).digest("hex");
  if (artifactSha256 !== instrumentation.artifactSha256) throw new Error("artifact changed after instrumentation");
  return {
    valid: true,
    schemaVersion: 5,
    variantId,
    designOwner: "huashu-design",
    finalSiteSha256: variant.finalSiteSha256,
    artifactSha256,
    coveredSources: audit.coveredSources,
    editorBoundary: {
      kind: "html-backed",
      contractVersion: ARTIFACT_CONTRACT_VERSION,
      runtimeVersion: EDITOR_RUNTIME_VERSION
    }
  };
}

function assertSupportedArtifactContractVersion(record) {
  const version = record.artifactContractVersion ?? record.packageVersion;
  if (!SUPPORTED_ARTIFACT_CONTRACT_VERSIONS.has(version)) {
    throw new Error(`unsupported V5 artifact contract version ${version ?? "(missing)"}`);
  }
}

function assertExecutableCharts(html) {
  for (const match of html.matchAll(/\bdata-chart-id\s*=\s*["']([^"']+)["']/gi)) {
    const escaped = match[1].replace(/[\^$.*+?()[\]{}|]/g, "\\$&");
    if (!new RegExp(`data-chart-data-for\\s*=\\s*["']${escaped}["']`, "i").test(html)) {
      throw new Error(`chart "${match[1]}" lacks an executable data payload`);
    }
  }
}

function assertUniqueAttributes(html, names) {
  for (const name of names) {
    const seen = new Set();
    const pattern = new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "gi");
    for (const match of html.matchAll(pattern)) {
      if (seen.has(match[1])) throw new Error(`duplicate ${name} "${match[1]}"`);
      seen.add(match[1]);
    }
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

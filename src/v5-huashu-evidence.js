import { readFile } from "node:fs/promises";
import path from "node:path";

const STRATEGIES = new Set(["systematic-analysis", "real-world-benchmark", "authorial"]);
const CONTENT_ROLES = new Set(["evidence", "technical-explanation", "regional-case", "context", "decorative"]);
const LEVELS = new Set(["high", "medium", "low"]);
const TREATMENTS = new Set(["use-original", "redraw", "reference-only", "omit"]);
const LOSS_SENSITIVE_ROLES = new Set(["evidence", "technical-explanation", "regional-case"]);
const VALUE_RANK = { low: 0, medium: 1, high: 2 };

export async function validateHuashuDesignEvidence(projectDir, siteDir, kind, { variantId } = {}) {
  const errors = [];
  const warnings = [];
  let evidence;
  try {
    evidence = JSON.parse(await readFile(path.join(siteDir, "huashu-design-evidence.json"), "utf8"));
  } catch (error) {
    errors.push(issue("missing-design-evidence", error.code === "ENOENT" ? "huashu-design-evidence.json is required" : "huashu-design-evidence.json is invalid JSON"));
    return result(null, errors, warnings, 0);
  }

  if (evidence.schemaVersion !== 1) errors.push(issue("invalid-evidence-schema", "design evidence requires schemaVersion 1"));
  if (evidence.contentAuthority !== "user") errors.push(issue("invalid-content-authority", "contentAuthority must be user"));
  if (evidence.designAuthority !== "huashu-design") errors.push(issue("invalid-design-authority", "designAuthority must be huashu-design"));
  if (!/^[a-f0-9]{64}$/.test(evidence.interviewSha256 ?? "")) errors.push(issue("invalid-interview-hash", "interviewSha256 must be a SHA-256 digest"));
  validateStrategy(evidence.strategy, errors);
  validateSelfCritique(evidence.selfCritique, errors, warnings);

  const sourceImages = await readSourceImages(projectDir);
  const assessments = Array.isArray(evidence.sourceImages) ? evidence.sourceImages : [];
  if (!Array.isArray(evidence.sourceImages)) errors.push(issue("invalid-image-assessments", "sourceImages must be an array"));
  const bySource = new Map();
  for (const [index, assessment] of assessments.entries()) {
    const prefix = `sourceImages[${index}]`;
    if (!assessment?.sourceId) errors.push(issue("invalid-image-assessment", `${prefix}.sourceId is required`));
    else if (bySource.has(assessment.sourceId)) errors.push(issue("duplicate-image-assessment", `${assessment.sourceId} is assessed more than once`, assessment.sourceId));
    else bySource.set(assessment.sourceId, assessment);
    for (const field of ["assetPath", "visualDescription", "rationale"]) {
      if (typeof assessment?.[field] !== "string" || assessment[field].trim().length < (field === "assetPath" ? 1 : 12)) {
        errors.push(issue("invalid-image-assessment", `${prefix}.${field} must contain an independent visual assessment`, assessment?.sourceId));
      }
    }
    if (!CONTENT_ROLES.has(assessment?.contentRole) || !LEVELS.has(assessment?.informationLoss) || !LEVELS.has(assessment?.value) || !TREATMENTS.has(assessment?.treatment)) {
      errors.push(issue("invalid-image-assessment", `${prefix} has an unsupported role, level, or treatment`, assessment?.sourceId));
      continue;
    }
    if (assessment.treatment === "omit" && assessment.informationLoss === "high" && LOSS_SENSITIVE_ROLES.has(assessment.contentRole)) {
      errors.push(issue("high-information-image-omitted", `${assessment.sourceId} cannot be omitted because its content role has high information loss`, assessment.sourceId));
    }
    if (assessment.treatment === "omit" && assessment.value === "high") {
      errors.push(issue("high-value-image-omitted", `${assessment.sourceId} is high value and must use the original or a source-bound redraw`, assessment.sourceId));
    }
    if (assessment.treatment === "redraw" && !String(assessment.sourceBinding ?? "").trim()) {
      errors.push(issue("redraw-without-source-binding", `${assessment.sourceId} redraw requires a visible sourceBinding`, assessment.sourceId));
    }
  }
  for (const source of sourceImages) {
    if (!bySource.has(source.sourceId)) errors.push(issue("source-image-not-assessed", `${source.sourceId} must be visually inspected and assessed`, source.sourceId));
  }
  if (kind === "final" && variantId) {
    const inherited = await readSelectedCandidateEvidence(projectDir, variantId);
    if (inherited.required && !inherited.evidence) {
      errors.push(issue("candidate-evidence-missing", "final evidence cannot inherit image judgments because selected candidate evidence is missing"));
    } else if (inherited.evidence) {
      const candidateImages = new Map((inherited.evidence.sourceImages ?? []).map((item) => [item.sourceId, item]));
      for (const assessment of assessments) {
        const candidate = candidateImages.get(assessment.sourceId);
        if (!candidate) {
          errors.push(issue("candidate-image-judgment-missing", `${assessment.sourceId} has no selected-candidate image judgment to inherit`, assessment.sourceId));
          continue;
        }
        if (assessment.candidateValue && assessment.candidateValue !== candidate.value) {
          errors.push(issue("candidate-value-mismatch", `${assessment.sourceId} candidateValue does not match selected-candidate evidence`, assessment.sourceId));
        }
        if (LEVELS.has(candidate.value) && LEVELS.has(assessment.value) && VALUE_RANK[assessment.value] < VALUE_RANK[candidate.value] && !String(assessment.valueChangeRationale ?? "").trim()) {
          errors.push(issue("unexplained-image-value-downgrade", `${assessment.sourceId} lowers the selected candidate value without a rationale`, assessment.sourceId));
        }
      }
    }
  }
  const rationaleGroups = new Map();
  for (const assessment of assessments) {
    const normalized = normalizeRationale(assessment?.rationale);
    if (!normalized) continue;
    rationaleGroups.set(normalized, [...(rationaleGroups.get(normalized) ?? []), assessment.sourceId]);
  }
  for (const sourceIds of rationaleGroups.values()) {
    if (sourceIds.length >= 3) errors.push({ ...issue("repeated-image-rationale", `the same standardized rationale was used for ${sourceIds.length} images`), sourceIds });
  }
  if (assessments.length && assessments.every((item) => item.value === "low")) warnings.push(issue("all-images-low-value", "all source images were rated low value; Huashu should recheck the contact sheet"));
  if (assessments.length && assessments.every((item) => item.treatment === "omit" || item.contentRole === "decorative")) warnings.push(issue("no-content-image-used", "no content-bearing source image is used in the design"));
  return result(evidence, errors, warnings, sourceImages.length);
}

export function validateHuashuCandidateIsolation(evidenceList) {
  const errors = [];
  if (!Array.isArray(evidenceList) || evidenceList.length !== 3) errors.push(issue("candidate-count", "exactly three Huashu candidates are required"));
  const strategies = new Set(evidenceList?.map((item) => item?.strategy?.id));
  if (strategies.size !== 3 || [...STRATEGIES].some((id) => !strategies.has(id))) errors.push(issue("candidate-strategy-set", "candidates must use systematic-analysis, real-world-benchmark, and authorial strategies"));
  for (const field of ["rationale", "domApproach", "visualizationApproach", "interactionApproach"]) {
    const values = evidenceList?.map((item) => normalizeRationale(item?.strategy?.[field])) ?? [];
    if (new Set(values).size !== values.length) errors.push(issue("candidate-design-convergence", `candidate ${field} must be independently designed`));
  }
  return { valid: errors.length === 0, errors, checks: { candidateIsolation: errors.length === 0 } };
}

function validateStrategy(strategy, errors) {
  if (!strategy || !STRATEGIES.has(strategy.id)) {
    errors.push(issue("invalid-design-strategy", "strategy.id must name one of the three Huashu directions"));
    return;
  }
  for (const field of ["rationale", "domApproach", "visualizationApproach", "interactionApproach"]) {
    if (typeof strategy[field] !== "string" || strategy[field].trim().length < 8) errors.push(issue("invalid-design-strategy", `strategy.${field} is required`));
  }
}

function validateSelfCritique(selfCritique, errors, warnings) {
  if (!selfCritique || !Number.isFinite(selfCritique.score) || !Array.isArray(selfCritique.strengths) || !selfCritique.strengths.length || !Array.isArray(selfCritique.risks) || !selfCritique.risks.length) {
    errors.push(issue("invalid-huashu-self-critique", "selfCritique requires score, strengths, and risks"));
    return;
  }
  if (selfCritique.score < 70) warnings.push(issue("low-huashu-self-score", "Huashu self-score is below 70"));
}

async function readSourceImages(projectDir) {
  try {
    const sourceModel = JSON.parse(await readFile(path.join(projectDir, "source-model.json"), "utf8"));
    return (sourceModel.documents ?? []).flatMap((document) => document.units ?? []).filter((unit) => unit.type === "image");
  } catch {
    return [];
  }
}

async function readSelectedCandidateEvidence(projectDir, variantId) {
  try {
    const variant = JSON.parse(await readFile(path.join(projectDir, "variants", variantId, "variant.json"), "utf8"));
    const candidateId = variant.designSelection?.candidateId;
    if (!candidateId) return { required: false, evidence: null };
    const evidence = JSON.parse(await readFile(path.join(projectDir, "variants", variantId, "design", "candidates", candidateId, "huashu-design-evidence.json"), "utf8"));
    return { required: true, evidence };
  } catch {
    return { required: true, evidence: null };
  }
}

function result(evidence, errors, warnings, sourceImageCount) {
  return {
    valid: errors.length === 0,
    evidence,
    errors,
    warnings,
    checks: { evidencePresent: Boolean(evidence), sourceImageCoverage: !errors.some((item) => item.code === "source-image-not-assessed") },
    summary: { sourceImageCount, assessedImageCount: evidence?.sourceImages?.length ?? 0 }
  };
}

function issue(code, message, sourceId) {
  return { code, message, ...(sourceId ? { sourceId } : {}) };
}

function normalizeRationale(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ").replace(/[.,;:!?，。；：！？]/g, "");
}

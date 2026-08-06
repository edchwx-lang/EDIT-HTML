import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

import { writeJsonAtomic } from "./io.js";
import { requiresV511Gates } from "./v5-quality-gate.js";
import { TOOL_VERSION } from "./version-manifest.js";
import { writeHuashuInputManifest } from "./v5-stage-boundary.js";

const LEGACY_REQUIRED_TOPICS = ["purpose", "contentWeight", "structurePreference"];
const REQUIRED_TOPICS = ["purpose", "contentWeight"];
const ORIGINS = new Set(["user-provided", "user-delegated"]);
const V511_INTERVIEW_SCHEMA_VERSION = 3;
const CLARIFICATION_REASONS = new Set([
  "scope", "terminology", "conflict", "omission", "time-range", "comparative-focus"
]);
const DESIGN_QUESTION_PATTERN = /\b(?:layout|component|card|dashboard|interaction|map|chart|theme|colou?r|font|visual\s+style)\b|排版|布局|组件|卡片|仪表盘|交互|地图|图表|配色|字体|视觉风格/iu;
const TAKEAWAY_QUESTION_PATTERN = /\b(?:take\s*away|remember)\b|观众.{0,8}(?:带走|记住)|希望.{0,8}(?:带走|记住)/iu;

const EXPLICIT_DELEGATION_PATTERN = /你决定|你来定|看着办|直接做|你判断|由你决定|you decide|use your judgment|go ahead|decide for me/iu;

export async function importV5Interview(projectDir, variantId, interviewPath) {
  const interview = JSON.parse(await readFile(interviewPath, "utf8"));
  const variant = await readVariant(projectDir, variantId);
  validateInterview(interview, variantId, { requireEvidence: requiresV511Gates(variant) });
  await validateInterviewSourceRefs(projectDir, interview);
  const variantDir = path.join(projectDir, "variants", variantId);
  const storedPath = path.join(variantDir, "interview.json");
  const normalized = {
    ...interview,
    status: "confirmed",
    confirmedAt: interview.confirmedAt ?? new Date().toISOString()
  };
  const interviewSha256 = hashJson(normalized);
  await writeJsonAtomic(storedPath, normalized);
  const referenceMode = normalized.references.some((item) => item.suppliedAtStart) ? "provided" : "none";
  await updateVariant(projectDir, variantId, (variant) => ({
    ...variant,
    pipelineState: "interview-confirmed",
    interviewStatus: "confirmed",
    interviewSha256,
    referenceMode
  }));
  return { status: "confirmed", referenceMode, interviewSha256, interview: normalized };
}

async function validateInterviewSourceRefs(projectDir, interview) {
  const references = interview.answers?.contentClarification?.sourceRefs ?? [];
  if (!references.length) return;
  const sourceMap = JSON.parse(await readFile(path.join(projectDir, "source-pack", "source-map.json"), "utf8"));
  const known = new Set(sourceMap.documents.flatMap((document) => document.units.map((unit) => unit.sourceId)));
  const unknown = references.filter((sourceId) => !known.has(sourceId));
  if (unknown.length) throw new Error(`contentClarification has unknown Source Pack reference ${unknown.join(", ")}`);
}

export async function getV5InterviewStatus(projectDir, variantId) {
  const variant = await readVariant(projectDir, variantId);
  let interview = null;
  try {
    interview = JSON.parse(await readFile(path.join(projectDir, "variants", variantId, "interview.json"), "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return {
    variantId,
    status: variant.interviewStatus ?? "pending",
    requiredTopics: REQUIRED_TOPICS,
    questionCount: Object.keys(interview?.answers ?? {}).length,
    maximumQuestions: 3,
    hasMaterialClarification: Boolean(interview?.answers?.contentClarification),
    referenceMode: variant.referenceMode ?? "none",
    interviewSha256: variant.interviewSha256 ?? null,
    interview
  };
}

export async function prepareV5HuashuInput(projectDir, variantId) {
  const variant = await readVariant(projectDir, variantId);
  if (variant.schemaVersion !== 5 || variant.interviewStatus !== "confirmed" || !variant.interviewSha256) {
    throw new Error("V5 design preparation requires a confirmed interview");
  }
  const project = JSON.parse(await readFile(path.join(projectDir, "project.json"), "utf8"));
  const interview = JSON.parse(await readFile(path.join(projectDir, "variants", variantId, "interview.json"), "utf8"));
  validateInterview(interview, variantId, { requireEvidence: requiresV511Gates(variant) });
  const strategySelection = variant.referenceMode === "provided"
    ? "one-reference-guided-sample"
    : "three-executable-samples";
  const inputDir = path.join(projectDir, "variants", variantId, "design", "huashu-input");
  await rm(inputDir, { recursive: true, force: true });
  await mkdir(inputDir, { recursive: true });
  const packDir = path.join(projectDir, "source-pack");
  for (const name of [
    "readable-source.md", "fact-ledger.json", "source-map.json", "tables-and-datasets.json",
    "asset-contact-sheet.html", "extraction-warnings.json"
  ]) {
    await cp(path.join(packDir, name), path.join(inputDir, name));
  }
  await cp(path.join(packDir, "assets"), path.join(inputDir, "assets"), { recursive: true });
  await writeJsonAtomic(path.join(inputDir, "interview.json"), interview);
  const contentBrief = {
    schemaVersion: 1,
    owner: "huashu-design",
    purpose: interview.answers.purpose,
    contentWeight: interview.answers.contentWeight,
    ...(interview.answers.contentClarification
      ? { contentClarification: interview.answers.contentClarification }
      : {}),
    maximumInterviewQuestions: 3,
    coveragePolicy: "focus-controls-depth-not-presence",
    visibleRawSourceAppendix: "explicit-user-request-only",
    sourcePackFiles: [
      "readable-source.md", "fact-ledger.json", "source-map.json", "tables-and-datasets.json",
      "asset-contact-sheet.html", "extraction-warnings.json", "assets/"
    ],
    instructions: [
      "Preserve every non-omitted source section in main or contextual detail content.",
      "Give focus content greater depth without deleting supporting or context content.",
      "Use a complete representative focus item in every candidate and expand all focus items in the final site.",
      "Keep provenance in bindings and metadata; do not dump the raw Source Pack into a visible appendix."
    ]
  };
  await writeJsonAtomic(path.join(inputDir, "content-brief.json"), contentBrief);
  const manifest = {
    schemaVersion: 1,
    packageVersion: variant.packageVersion ?? TOOL_VERSION,
    variantId,
    sourcePackSha256: project.sourcePackSha256,
    interviewSha256: variant.interviewSha256,
    contentBriefSha256: hashJson(contentBrief),
    contentBriefFile: "content-brief.json",
    strategySelection,
    referenceMode: variant.referenceMode,
    previewThemes: strategySelection === "three-executable-samples"
      ? ["precision-blueprint", "warm-paper-terracotta", "sandstone-archive"]
      : [],
    contentPolicy: "source-closed-expression-free",
    designOwner: "huashu-design",
    forbiddenPreDesignDecisions: [
      "displayIntent", "componentId", "layoutId", "chartType", "presentationPlan", "safePrimitive"
    ],
    instructions: "Huashu owns editorial structure and all executable HTML design. Use the interview and source pack; never invent facts. Produce real runnable samples whose screenshots are rendered from their index.html."
  };
  await writeJsonAtomic(path.join(inputDir, "manifest.json"), manifest);
  const inputReceipt = variant.packageVersion === TOOL_VERSION
    ? await writeHuashuInputManifest(projectDir, variantId)
    : null;
  await updateVariant(projectDir, variantId, (record) => ({
    ...record,
    pipelineState: "awaiting-design-candidates",
    huashuInputSha256: hashJson(manifest)
  }));
  return { inputDir, strategySelection, manifest, ...(inputReceipt ? { inputReceipt } : {}) };
}

function validateInterview(interview, variantId, { requireEvidence = false } = {}) {
  if (requireEvidence) {
    if (interview?.schemaVersion !== V511_INTERVIEW_SCHEMA_VERSION) {
      throw new Error("V5.1.1 interview requires schemaVersion 3 with decisionEvidence");
    }
  } else if (![1, 2, V511_INTERVIEW_SCHEMA_VERSION].includes(interview?.schemaVersion)) {
    throw new Error("interview requires schemaVersion 1, 2, or 3");
  }
  if (interview.variantId !== variantId) throw new Error("interview variantId does not match");
  const requiredTopics = interview.schemaVersion === 1 ? LEGACY_REQUIRED_TOPICS : REQUIRED_TOPICS;
  for (const topic of requiredTopics) {
    const answer = interview.answers?.[topic];
    if (!answer) throw new Error(`interview requires ${topic}`);
    validateAnswer(answer, topic);
    if (interview.schemaVersion >= 2 && DESIGN_QUESTION_PATTERN.test(answer.question)) {
      throw new Error(`${topic} must address source content, not design`);
    }
  }
  if (interview.schemaVersion >= 2) {
    const answerKeys = Object.keys(interview.answers ?? {});
    const unexpected = answerKeys.filter((key) => ![...REQUIRED_TOPICS, "contentClarification"].includes(key));
    if (unexpected.length) throw new Error(`${unexpected.join(", ")} is not allowed in a V5.1 content interview`);
    if (answerKeys.length > 3) throw new Error("V5.1 content interview allows at most three questions");
    const clarification = interview.answers?.contentClarification;
    if (clarification) {
      validateAnswer(clarification, "contentClarification");
      if (DESIGN_QUESTION_PATTERN.test(clarification.question) || TAKEAWAY_QUESTION_PATTERN.test(clarification.question)) {
        throw new Error("content clarification must address a Source Pack issue, not design or an audience takeaway");
      }
      if (
        !CLARIFICATION_REASONS.has(clarification.reasonCode) ||
        !Array.isArray(clarification.sourceRefs) || !clarification.sourceRefs.length ||
        clarification.sourceRefs.some((item) => typeof item !== "string" || !item.trim()) ||
        typeof clarification.rationale !== "string" || !clarification.rationale.trim()
      ) {
        throw new Error("contentClarification requires reasonCode, sourceRefs, and rationale");
      }
    }
  }
  if (requireEvidence) validateDecisionEvidence(interview);
  if (!Array.isArray(interview.references)) throw new Error("interview references must be an array");
}

function validateAnswer(answer, topic) {
  if (typeof answer.question !== "string" || !answer.question.trim()) throw new Error(`${topic} requires the actual question`);
  if (typeof answer.response !== "string" || !answer.response.trim()) throw new Error(`${topic} requires a user response`);
  if (!ORIGINS.has(answer.origin)) throw new Error(`${topic} origin must be user-provided or user-delegated`);
  if (!Number.isFinite(Date.parse(answer.recordedAt))) throw new Error(`${topic} requires recordedAt`);
}

function validateDecisionEvidence(interview) {
  const evidence = interview.decisionEvidence;
  if (!evidence || typeof evidence !== "object") throw new Error("V5.1.1 interview requires decisionEvidence");
  if (!new Set(["direct-user-answer", "explicit-user-delegation", "preanswered-request"]).has(evidence.evidenceType)) {
    throw new Error("decisionEvidence has an unsupported evidenceType");
  }
  if (typeof evidence.verbatimUserQuote !== "string" || !evidence.verbatimUserQuote.trim()) {
    throw new Error("decisionEvidence requires a verbatimUserQuote");
  }
  if (!Number.isFinite(Date.parse(evidence.recordedAt))) throw new Error("decisionEvidence requires recordedAt");
  const topicsCovered = new Set(evidence.topicsCovered ?? []);
  for (const topic of Object.keys(interview.answers ?? {})) {
    if (!topicsCovered.has(topic)) throw new Error(`decisionEvidence does not cover ${topic}`);
  }
  const delegatedTopics = Object.entries(interview.answers ?? {})
    .filter(([, answer]) => answer.origin === "user-delegated")
    .map(([topic]) => topic);
  if (delegatedTopics.length) {
    if (evidence.evidenceType !== "explicit-user-delegation") {
      throw new Error("user-delegated answers require explicit-user-delegation evidence");
    }
    if (!EXPLICIT_DELEGATION_PATTERN.test(evidence.verbatimUserQuote)) {
      throw new Error("user-delegated answers require an explicit user delegation quote");
    }
  }
}

async function updateVariant(projectDir, variantId, update) {
  const variantPath = path.join(projectDir, "variants", variantId, "variant.json");
  const projectPath = path.join(projectDir, "project.json");
  const [variant, project] = await Promise.all([
    readVariant(projectDir, variantId),
    readFile(projectPath, "utf8").then(JSON.parse)
  ]);
  const updated = update(variant);
  const index = project.variants.findIndex((item) => item.variantId === variantId);
  if (index === -1) throw new Error(`unknown variant "${variantId}"`);
  project.variants[index] = updated;
  await writeJsonAtomic(variantPath, updated);
  await writeJsonAtomic(projectPath, project);
  return updated;
}

async function readVariant(projectDir, variantId) {
  return JSON.parse(await readFile(path.join(projectDir, "variants", variantId, "variant.json"), "utf8"));
}

function hashJson(value) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value) {
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + stableStringify(value[key])).join(",") + "}";
  }
  return JSON.stringify(value);
}

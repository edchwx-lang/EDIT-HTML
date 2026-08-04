import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

import { writeJsonAtomic } from "./io.js";

const REQUIRED_TOPICS = ["purpose", "contentWeight", "structurePreference"];
const ORIGINS = new Set(["user-provided", "user-delegated"]);

export async function importV5Interview(projectDir, variantId, interviewPath) {
  const interview = JSON.parse(await readFile(interviewPath, "utf8"));
  validateInterview(interview, variantId);
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
  validateInterview(interview, variantId);
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
  const manifest = {
    schemaVersion: 1,
    packageVersion: "5.0.0",
    variantId,
    sourcePackSha256: project.sourcePackSha256,
    interviewSha256: variant.interviewSha256,
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
  await updateVariant(projectDir, variantId, (record) => ({
    ...record,
    pipelineState: "awaiting-design-candidates",
    huashuInputSha256: hashJson(manifest)
  }));
  return { inputDir, strategySelection, manifest };
}

function validateInterview(interview, variantId) {
  if (interview?.schemaVersion !== 1) throw new Error("interview requires schemaVersion 1");
  if (interview.variantId !== variantId) throw new Error("interview variantId does not match");
  for (const topic of REQUIRED_TOPICS) {
    const answer = interview.answers?.[topic];
    if (!answer) throw new Error(`interview requires ${topic}`);
    if (typeof answer.question !== "string" || !answer.question.trim()) throw new Error(`${topic} requires the actual question`);
    if (typeof answer.response !== "string" || !answer.response.trim()) throw new Error(`${topic} requires a user response`);
    if (!ORIGINS.has(answer.origin)) throw new Error(`${topic} origin must be user-provided or user-delegated`);
    if (!Number.isFinite(Date.parse(answer.recordedAt))) throw new Error(`${topic} requires recordedAt`);
  }
  if (!Array.isArray(interview.references)) throw new Error("interview references must be an array");
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

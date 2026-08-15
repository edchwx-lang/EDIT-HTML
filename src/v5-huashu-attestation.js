import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { writeJsonAtomic } from "./io.js";
import { requireHuashuInputManifest } from "./v5-stage-boundary.js";

const RECEIPT_FILE = "huashu-execution-receipt.json";

export async function beginHuashuDesign(projectDir, variantId, kind, { skillPath } = {}) {
  assertKind(kind);
  if (!skillPath) throw new Error("Huashu design begin requires --skill pointing to huashu-design/SKILL.md");
  const skillText = await readFile(path.resolve(skillPath), "utf8");
  if (!/^name:\s*huashu-design\s*$/m.test(skillText)) throw new Error("design provider skill must declare name: huashu-design");
  const input = await requireHuashuInputManifest(projectDir, variantId);
  const invocationPath = invocationFile(projectDir, variantId, kind);
  let existing = null;
  try {
    existing = JSON.parse(await readFile(invocationPath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const identity = {
    schemaVersion: 1,
    stage: `huashu-${kind}-invocation`,
    owner: "huashu-design",
    variantId,
    kind,
    inputReceiptSha256: input.receiptSha256,
    skillName: "huashu-design",
    skillSha256: sha256(skillText)
  };
  if (existing) {
    for (const [key, value] of Object.entries(identity)) {
      if (existing[key] !== value) throw new Error(`Huashu ${kind} invocation is immutable and ${key} changed`);
    }
    return { ...existing, invocationPath };
  }
  const invocation = {
    ...identity,
    challenge: randomBytes(24).toString("hex"),
    startedAt: new Date().toISOString()
  };
  await mkdir(path.dirname(invocationPath), { recursive: true });
  await writeJsonAtomic(invocationPath, invocation);
  return { ...invocation, invocationPath };
}

export async function attestHuashuDesignOutput(projectDir, variantId, kind, sourceDir) {
  assertKind(kind);
  const invocation = await readInvocation(projectDir, variantId, kind);
  const manifest = JSON.parse(await readFile(path.join(sourceDir, "manifest.json"), "utf8"));
  const variant = JSON.parse(await readFile(path.join(projectDir, "variants", variantId, "variant.json"), "utf8"));
  if (variant.releaseVersion === "5.4.1" && variant.pipelineVersion === "5.4.1") {
    const preflight = await import("./v5-design-preflight.js");
    const result = kind === "candidate"
      ? await preflight.preflightV5CandidateSet(projectDir, variantId, path.dirname(sourceDir))
      : await preflight.preflightV5FinalSite(projectDir, variantId, sourceDir);
    if (!result.valid) {
      throw new Error(`Huashu ${kind} attestation requires a successful V5.4.1 preflight: ${result.errors.map((item) => item.message).join("; ")}`);
    }
  }
  if (manifest.kind !== kind) throw new Error(`Huashu ${kind} attestation cannot seal a ${manifest.kind ?? "unknown"} package`);
  const outputSha256 = await hashSitePayload(sourceDir);
  if (manifest.payloadSha256 !== outputSha256 || manifest.outputSha256 !== outputSha256) {
    throw new Error("Huashu output manifest hashes must be finalized before attestation");
  }
  const receipt = {
    schemaVersion: 1,
    stage: `huashu-${kind}-output`,
    owner: "huashu-design",
    variantId,
    kind,
    candidateId: manifest.candidateId,
    challenge: invocation.challenge,
    inputReceiptSha256: invocation.inputReceiptSha256,
    skillName: invocation.skillName,
    skillSha256: invocation.skillSha256,
    outputSha256,
    attestedAt: new Date().toISOString()
  };
  const receiptPath = path.join(sourceDir, RECEIPT_FILE);
  try {
    const existing = JSON.parse(await readFile(receiptPath, "utf8"));
    for (const [key, value] of Object.entries(receipt)) {
      if (key !== "attestedAt" && existing[key] !== value) {
        throw new Error(`Huashu ${kind} output attestation is immutable and ${key} changed`);
      }
    }
    return { ...existing, receiptPath, receiptSha256: receiptHash(existing) };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await writeJsonAtomic(receiptPath, receipt);
  return { ...receipt, receiptPath, receiptSha256: receiptHash(receipt) };
}

export async function requireHuashuDesignAttestation(projectDir, variantId, kind, sourceDir) {
  assertKind(kind);
  const invocation = await readInvocation(projectDir, variantId, kind);
  let receipt;
  try {
    receipt = JSON.parse(await readFile(path.join(sourceDir, RECEIPT_FILE), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") throw new Error(`V5.3.1+ ${kind} import requires a Huashu execution receipt; owner metadata alone is not proof of Huashu design`);
    throw error;
  }
  const outputSha256 = await hashSitePayload(sourceDir);
  const expected = {
    stage: `huashu-${kind}-output`, owner: "huashu-design", variantId, kind,
    challenge: invocation.challenge,
    inputReceiptSha256: invocation.inputReceiptSha256,
    skillName: "huashu-design",
    skillSha256: invocation.skillSha256,
    outputSha256
  };
  for (const [key, value] of Object.entries(expected)) {
    if (receipt[key] !== value) throw new Error(`Huashu execution receipt does not match ${key}`);
  }
  if (!Number.isFinite(Date.parse(receipt.attestedAt))) throw new Error("Huashu execution receipt requires attestedAt");
  return { ...receipt, receiptPath: path.join(sourceDir, RECEIPT_FILE), receiptSha256: receiptHash(receipt) };
}

export function isHuashuReceiptFile(name) {
  return name.replaceAll("\\", "/") === RECEIPT_FILE;
}

async function readInvocation(projectDir, variantId, kind) {
  const file = invocationFile(projectDir, variantId, kind);
  try {
    const invocation = JSON.parse(await readFile(file, "utf8"));
    if (invocation.owner !== "huashu-design" || invocation.skillName !== "huashu-design" || !/^[a-f0-9]{64}$/.test(invocation.skillSha256 ?? "")) {
      throw new Error(`Huashu ${kind} invocation is invalid`);
    }
    return invocation;
  } catch (error) {
    if (error.code === "ENOENT") throw new Error(`Huashu ${kind} design must begin through the dedicated Huashu gate before output is generated`);
    throw error;
  }
}

function invocationFile(projectDir, variantId, kind) {
  return path.join(projectDir, "variants", variantId, "design", "stage-receipts", `huashu-${kind}-invocation.json`);
}

async function hashSitePayload(root) {
  const files = (await listFiles(root)).filter((name) => name !== "manifest.json" && !isHuashuReceiptFile(name)).sort();
  const hash = createHash("sha256");
  for (const name of files) hash.update(name).update("\0").update(await readFile(path.join(root, ...name.split("/")))).update("\0");
  return hash.digest("hex");
}

async function listFiles(root, prefix = "") {
  const result = [];
  for (const entry of await readdir(path.join(root, ...prefix.split("/").filter(Boolean)), { withFileTypes: true })) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) result.push(...await listFiles(root, name));
    else result.push(name.replaceAll("\\", "/"));
  }
  return result;
}

function assertKind(kind) {
  if (!new Set(["candidate", "final"]).has(kind)) throw new Error(`unsupported Huashu design kind ${kind}`);
}

function receiptHash(receipt) {
  return sha256(JSON.stringify(receipt, null, 2) + "\n");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

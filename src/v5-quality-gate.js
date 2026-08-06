import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "parse5";
import { SUPPORTED_ARTIFACT_CONTRACT_VERSIONS } from "./version-manifest.js";

export const V511_PACKAGE_VERSION = "5.1.1";
export const V52_PACKAGE_VERSION = [...SUPPORTED_ARTIFACT_CONTRACT_VERSIONS].find((version) => version === "5.2.0");
export const V521_PACKAGE_VERSION = [...SUPPORTED_ARTIFACT_CONTRACT_VERSIONS].find((version) => version === "5.2.1");

const MEANINGFUL_VISUAL_TYPES = new Set(["chart", "matrix", "timeline", "comparison", "flow", "data-table", "annotated-image"]);
const REQUIRED_VISUAL_CATEGORIES = new Set(["overview", "focus"]);

export function requiresV511Gates(variant) {
  const artifactContractVersion = variant?.artifactContractVersion ?? variant?.packageVersion;
  return [V511_PACKAGE_VERSION, V52_PACKAGE_VERSION, V521_PACKAGE_VERSION].includes(artifactContractVersion) ||
    [V511_PACKAGE_VERSION, V52_PACKAGE_VERSION, V521_PACKAGE_VERSION].includes(variant?.pipelineVersion);
}

export function isSupportedV5SitePackageVersion(version) {
  return SUPPORTED_ARTIFACT_CONTRACT_VERSIONS.has(version);
}

export async function validateV511DesignProcess(siteDir, html, expectedKind) {
  const processPath = path.join(siteDir, "design-process.json");
  const text = await readFile(processPath, "utf8");
  const process = JSON.parse(text);
  const errors = [];
  const document = parse(html);
  if (process.schemaVersion !== 1) errors.push("design-process.json requires schemaVersion 1");
  if (process.owner !== "huashu-design") errors.push("design-process.json owner must be huashu-design");
  const narrative = process.narrativeArchitecture;
  if (!narrative?.id || !narrative?.description) errors.push("design-process.json requires narrativeArchitecture id and description");
  const modules = process.visualizationModules;
  if (!Array.isArray(modules) || modules.length < 2) {
    errors.push("design-process.json requires at least two meaningful visualization modules");
  } else {
    const categories = new Set();
    for (const module of modules) {
      if (!module?.id || !module?.title) errors.push("visualization module requires id and title");
      if (!MEANINGFUL_VISUAL_TYPES.has(module?.type)) errors.push(`visualization module ${module?.id ?? "unknown"} uses a non-meaningful type`);
      if (module?.category) categories.add(module.category);
      if (!Array.isArray(module?.sourceRefs) || !module.sourceRefs.length) errors.push(`visualization module ${module?.id ?? "unknown"} requires sourceRefs`);
      if (!module?.selector || !hasSelector(document, module.selector)) errors.push(`visualization module ${module?.id ?? "unknown"} selector is not present in index.html`);
    }
    for (const category of REQUIRED_VISUAL_CATEGORIES) {
      if (!categories.has(category)) errors.push(`design-process.json requires a ${category} visualization module`);
    }
  }
  const interaction = process.coreInteraction;
  if (!interaction?.type || !interaction?.selector || !interaction?.event) {
    errors.push("design-process.json requires a coreInteraction type, selector, and event");
  } else if (!hasSelector(document, interaction.selector)) {
    errors.push("coreInteraction selector is not present in index.html");
  }
  if (expectedKind === "final" && process.parentCandidateId && process.parentCandidateId !== process.candidateId) {
    errors.push("final design-process parentCandidateId must match candidateId when declared");
  }
  if (errors.length) throw new Error(errors.join("; "));
  return { process, designProcessSha256: sha256(text) };
}

export async function auditV511CandidateForReview(projectDir, candidate) {
  const html = await readFile(path.join(candidate.siteDir, "index.html"), "utf8");
  const [ledger, processResult, desktop, mobile] = await Promise.all([
    readJson(path.join(projectDir, "source-pack", "fact-ledger.json")),
    validateV511DesignProcess(candidate.siteDir, html, "candidate"),
    readFile(path.join(candidate.siteDir, "screenshots", "desktop.png")),
    readFile(path.join(candidate.siteDir, "screenshots", "mobile.png"))
  ]);
  const document = parse(html);
  const errors = [];
  const warnings = [];
  const desktopInfo = pngInfo(desktop);
  const mobileInfo = pngInfo(mobile);
  if (!desktopInfo) errors.push(`${candidate.candidateId} desktop screenshot must be a real PNG`);
  if (!mobileInfo) errors.push(`${candidate.candidateId} mobile screenshot must be a real PNG`);
  const rawAudit = auditRawSourceExposure(document, ledger.facts ?? []);
  errors.push(...rawAudit.errors.map((item) => `${candidate.candidateId}: ${item}`));
  warnings.push(...rawAudit.warnings.map((item) => `${candidate.candidateId}: ${item}`));
  return {
    candidateId: candidate.candidateId,
    directionId: candidate.directionId,
    directionLabel: candidate.directionLabel,
    previewThemeId: candidate.previewThemeId,
    payloadSha256: candidate.payloadSha256,
    contentPlanSha256: candidate.contentPlanSha256,
    designProcessSha256: processResult.designProcessSha256,
    narrativeArchitectureId: processResult.process.narrativeArchitecture.id,
    visualizationSignature: visualizationSignature(processResult.process.visualizationModules),
    coreInteractionType: processResult.process.coreInteraction.type,
    coreInteractionSelector: processResult.process.coreInteraction.selector,
    structuralTrigrams: structuralTrigrams(document),
    screenshots: {
      desktop: {
        path: path.join(candidate.siteDir, "screenshots", "desktop.png"),
        sha256: sha256(desktop),
        ...(desktopInfo ?? {})
      },
      mobile: {
        path: path.join(candidate.siteDir, "screenshots", "mobile.png"),
        sha256: sha256(mobile),
        ...(mobileInfo ?? {})
      }
    },
    rawSourceShare: rawAudit.rawSourceShare,
    warnings,
    errors
  };
}

export async function auditV511FinalSite(projectDir, finalSiteDir, selectedCandidateDir) {
  const [html, selectedHtml, ledger] = await Promise.all([
    readFile(path.join(finalSiteDir, "index.html"), "utf8"),
    readFile(path.join(selectedCandidateDir, "index.html"), "utf8"),
    readJson(path.join(projectDir, "source-pack", "fact-ledger.json"))
  ]);
  const finalProcess = await validateV511DesignProcess(finalSiteDir, html, "final");
  const selectedProcess = await validateV511DesignProcess(selectedCandidateDir, selectedHtml, "candidate");
  const errors = [];
  if (finalProcess.process.coreInteraction.type !== selectedProcess.process.coreInteraction.type) {
    errors.push("final site changed the selected candidate core interaction type");
  }
  const selectedVisuals = new Set(selectedProcess.process.visualizationModules.map((module) => `${module.category}:${module.type}`));
  const finalVisuals = new Set(finalProcess.process.visualizationModules.map((module) => `${module.category}:${module.type}`));
  for (const signature of selectedVisuals) {
    if (!finalVisuals.has(signature)) errors.push(`final site dropped selected visualization ${signature}`);
  }
  const rawAudit = auditRawSourceExposure(parse(html), ledger.facts ?? []);
  errors.push(...rawAudit.errors);
  if (errors.length) throw new Error(errors.join("; "));
  return { designProcessSha256: finalProcess.designProcessSha256, warnings: rawAudit.warnings };
}

export function auditV511CandidateSet(candidateAudits, { requireThree }) {
  const errors = [];
  const warnings = [];
  for (const audit of candidateAudits) {
    errors.push(...audit.errors);
    warnings.push(...audit.warnings);
  }
  const screenshotHashes = new Map();
  for (const audit of candidateAudits) {
    for (const [viewport, shot] of Object.entries(audit.screenshots)) {
      const key = `${viewport}:${shot.sha256}`;
      if (screenshotHashes.has(key)) {
        errors.push(`duplicate ${viewport} screenshot between ${screenshotHashes.get(key)} and ${audit.candidateId}`);
      } else {
        screenshotHashes.set(key, audit.candidateId);
      }
    }
  }
  if (requireThree) {
    requireDistinct(candidateAudits, "narrativeArchitectureId", "narrative architecture", errors);
    requireDistinct(candidateAudits, "visualizationSignature", "visualization strategy", errors);
    requireDistinct(candidateAudits, "coreInteractionType", "core interaction", errors);
  }
  for (let left = 0; left < candidateAudits.length; left += 1) {
    for (let right = left + 1; right < candidateAudits.length; right += 1) {
      const similarity = jaccard(candidateAudits[left].structuralTrigrams, candidateAudits[right].structuralTrigrams);
      if (similarity > 0.85) {
        errors.push(`template-convergence failure: ${candidateAudits[left].candidateId} and ${candidateAudits[right].candidateId} DOM similarity ${similarity.toFixed(2)}`);
      }
    }
  }
  return { errors, warnings };
}

function requireDistinct(items, key, label, errors) {
  const values = new Set(items.map((item) => item[key]));
  if (values.size !== items.length) errors.push(`three candidates require distinct ${label}`);
}

function visualizationSignature(modules) {
  return modules
    .map((module) => `${module.category}:${module.type}`)
    .sort()
    .join("|");
}

function pngInfo(bytes) {
  if (bytes.length < 24) return null;
  const signature = "89504e470d0a1a0a";
  if (bytes.subarray(0, 8).toString("hex") !== signature) return null;
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (!width || !height) return null;
  return { width, height };
}

function structuralTrigrams(document) {
  const tags = [];
  visit(document, (node, depth) => {
    if (node.tagName) {
      const role = attr(node, "data-role") || attr(node, "data-content-id") || "";
      tags.push(`${depth}:${node.tagName}:${role}`);
    }
  });
  const trigrams = new Set();
  for (let index = 0; index < tags.length - 2; index += 1) {
    trigrams.add(tags.slice(index, index + 3).join(">"));
  }
  return [...trigrams].sort();
}

function auditRawSourceExposure(document, facts) {
  const errors = [];
  const warnings = [];
  const blocks = [];
  visit(document, (node) => {
    if (!node.tagName || ["script", "style"].includes(node.tagName)) return;
    if (["p", "li", "td", "th", "figcaption", "blockquote", "pre", "summary"].includes(node.tagName)) {
      const text = visibleText(node);
      if (text) blocks.push(text);
    }
  });
  for (const block of blocks) {
    if (cjkLength(block) > 600) errors.push("visible raw source block exceeds 600 Chinese characters");
  }
  const pageText = visibleText(document);
  let matched = 0;
  const seen = new Set();
  for (const fact of facts) {
    const raw = normalizeText(fact.rawText);
    if (raw.length < 60 || seen.has(raw)) continue;
    seen.add(raw);
    if (normalizeText(pageText).includes(raw)) matched += raw.length;
  }
  const rawSourceShare = pageText.trim() ? matched / normalizeText(pageText).length : 0;
  if (rawSourceShare > 0.45) errors.push(`verbatim source-match share ${(rawSourceShare * 100).toFixed(1)}% exceeds 45%`);
  else if (rawSourceShare > 0.30) warnings.push(`verbatim source-match share ${(rawSourceShare * 100).toFixed(1)}% exceeds 30%`);
  return { errors, warnings, rawSourceShare };
}

function hasSelector(document, selector) {
  const matcher = selectorMatcher(selector);
  if (!matcher) return false;
  let found = false;
  visit(document, (node) => {
    if (!found && node.tagName && matcher(node)) found = true;
  });
  return found;
}

function selectorMatcher(selector) {
  const value = String(selector ?? "").trim();
  if (!value) return null;
  const id = value.match(/^#([A-Za-z0-9_-]+)$/);
  if (id) return (node) => attr(node, "id") === id[1];
  const cls = value.match(/^\.([A-Za-z0-9_-]+)$/);
  if (cls) return (node) => (attr(node, "class") ?? "").split(/\s+/).includes(cls[1]);
  const attribute = value.match(/^\[([A-Za-z0-9_:-]+)(?:=(["']?)(.*?)\2)?\]$/);
  if (attribute) {
    return (node) => {
      const actual = attr(node, attribute[1]);
      return attribute[3] === undefined ? actual !== undefined : actual === attribute[3];
    };
  }
  if (/^[a-z][a-z0-9-]*$/i.test(value)) return (node) => node.tagName === value.toLowerCase();
  return null;
}

function visit(node, fn, depth = 0) {
  fn(node, depth);
  for (const child of node.childNodes ?? []) visit(child, fn, depth + 1);
}

function attr(node, name) {
  return node.attrs?.find((item) => item.name === name)?.value;
}

function visibleText(node) {
  if (node.nodeName === "#text") return node.value ?? "";
  if (node.tagName === "script" || node.tagName === "style") return "";
  return (node.childNodes ?? []).map(visibleText).join(" ").replace(/\s+/g, " ").trim();
}

function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, "");
}

function cjkLength(value) {
  return [...String(value).matchAll(/[\u3400-\u9fff]/g)].length;
}

function jaccard(left, right) {
  const a = new Set(left);
  const b = new Set(right);
  const union = new Set([...a, ...b]);
  if (!union.size) return 0;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection += 1;
  return intersection / union.size;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

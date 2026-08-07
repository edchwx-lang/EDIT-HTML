import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "parse5";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { SUPPORTED_ARTIFACT_CONTRACT_VERSIONS } from "./version-manifest.js";
import { getTheme } from "./themes.js";

export const V511_PACKAGE_VERSION = "5.1.1";
export const V52_PACKAGE_VERSION = [...SUPPORTED_ARTIFACT_CONTRACT_VERSIONS].find((version) => version === "5.2.0");
export const V521_PACKAGE_VERSION = [...SUPPORTED_ARTIFACT_CONTRACT_VERSIONS].find((version) => version === "5.2.1");
export const V53_PACKAGE_VERSION = [...SUPPORTED_ARTIFACT_CONTRACT_VERSIONS].find((version) => version === "5.3.0");
export const V531_PACKAGE_VERSION = [...SUPPORTED_ARTIFACT_CONTRACT_VERSIONS].find((version) => version === "5.3.1");
export const V532_PACKAGE_VERSION = [...SUPPORTED_ARTIFACT_CONTRACT_VERSIONS].find((version) => version === "5.3.2");

const MEANINGFUL_VISUAL_TYPES = new Set(["chart", "matrix", "timeline", "comparison", "flow", "data-table", "annotated-image"]);
const REQUIRED_VISUAL_CATEGORIES = new Set(["overview", "focus"]);

export function requiresV511Gates(variant) {
  const workflowVersion = variant?.packageVersion ?? variant?.artifactContractVersion;
  return [V511_PACKAGE_VERSION, V52_PACKAGE_VERSION, V521_PACKAGE_VERSION, V53_PACKAGE_VERSION, V531_PACKAGE_VERSION, V532_PACKAGE_VERSION].includes(workflowVersion) ||
    [V511_PACKAGE_VERSION, V52_PACKAGE_VERSION, V521_PACKAGE_VERSION, V53_PACKAGE_VERSION, V531_PACKAGE_VERSION, V532_PACKAGE_VERSION].includes(variant?.pipelineVersion);
}

export function isSupportedV5SitePackageVersion(version) {
  return SUPPORTED_ARTIFACT_CONTRACT_VERSIONS.has(version);
}

export async function validateV511DesignProcess(siteDir, html, expectedKind, packageVersion = null) {
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
  const compactCandidate = expectedKind === "candidate" && [V53_PACKAGE_VERSION, V531_PACKAGE_VERSION, V532_PACKAGE_VERSION].includes(packageVersion);
  if (!Array.isArray(modules) || modules.length < (compactCandidate ? 1 : 2)) {
    errors.push(`design-process.json requires at least ${compactCandidate ? "one" : "two"} meaningful visualization module${compactCandidate ? "" : "s"}`);
  } else {
    const categories = new Set();
    for (const module of modules) {
      if (!module?.id || !module?.title) errors.push("visualization module requires id and title");
      if (!MEANINGFUL_VISUAL_TYPES.has(module?.type)) errors.push(`visualization module ${module?.id ?? "unknown"} uses a non-meaningful type`);
      if (module?.category) categories.add(module.category);
      if (!Array.isArray(module?.sourceRefs) || !module.sourceRefs.length) errors.push(`visualization module ${module?.id ?? "unknown"} requires sourceRefs`);
      if (!module?.selector || !hasSelector(document, module.selector)) errors.push(`visualization module ${module?.id ?? "unknown"} selector is not present in index.html`);
    }
    for (const category of compactCandidate ? ["focus"] : REQUIRED_VISUAL_CATEGORIES) {
      if (!categories.has(category)) errors.push(`design-process.json requires a ${category} visualization module`);
    }
  }
  if (compactCandidate) validateSampleScope(process.sampleScope, document, process, errors);
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
  const compactCandidate = [V53_PACKAGE_VERSION, V531_PACKAGE_VERSION, V532_PACKAGE_VERSION].includes(candidate.packageVersion);
  const [ledger, processResult, desktop] = await Promise.all([
    readJson(path.join(projectDir, "source-pack", "fact-ledger.json")),
    validateV511DesignProcess(candidate.siteDir, html, "candidate", candidate.packageVersion),
    readFile(path.join(candidate.siteDir, "screenshots", "desktop.png"))
  ]);
  const document = parse(html);
  const errors = [];
  const warnings = [];
  const desktopInfo = pngInfo(desktop);
  if (!desktopInfo) errors.push(`${candidate.candidateId} desktop screenshot must be a real PNG`);
  else {
    try {
      const decoded = await loadImage(desktop);
      if (decoded.width !== desktopInfo.width || decoded.height !== desktopInfo.height) errors.push(`${candidate.candidateId} desktop screenshot PNG dimensions are invalid`);
    } catch {
      errors.push(`${candidate.candidateId} desktop screenshot must be a real PNG`);
    }
    if (compactCandidate && (desktopInfo.width !== 1440 || desktopInfo.height !== 900)) {
      errors.push(`${candidate.candidateId} candidate screenshot must be exactly 1440x900`);
    }
    if ([V531_PACKAGE_VERSION, V532_PACKAGE_VERSION].includes(candidate.packageVersion)) {
      errors.push(...await auditPreviewThemeScreenshot(desktop, candidate.previewThemeId, candidate.candidateId));
    }
  }
  let mobile = null;
  let mobileInfo = null;
  if (!compactCandidate) {
    mobile = await readFile(path.join(candidate.siteDir, "screenshots", "mobile.png"));
    mobileInfo = pngInfo(mobile);
    if (!mobileInfo) errors.push(`${candidate.candidateId} mobile screenshot must be a real PNG`);
  }
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
    screenshot: {
        path: path.join(candidate.siteDir, "screenshots", "desktop.png"),
        sha256: sha256(desktop),
        ...(desktopInfo ?? {})
    },
    ...(compactCandidate ? {} : { screenshots: {
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
    } }),
    narrative: processResult.process.narrativeArchitecture.description,
    visualization: processResult.process.visualizationModules.map((module) => `${module.title} (${module.type})`).join("; "),
    interaction: `${processResult.process.coreInteraction.description} (${processResult.process.coreInteraction.type})`,
    rawSourceShare: rawAudit.rawSourceShare,
    warnings,
    errors
  };
}

export async function auditV511FinalSite(projectDir, finalSiteDir, selectedCandidateDir) {
  const [html, selectedHtml, finalManifest, selectedManifest, ledger] = await Promise.all([
    readFile(path.join(finalSiteDir, "index.html"), "utf8"),
    readFile(path.join(selectedCandidateDir, "index.html"), "utf8"),
    readJson(path.join(finalSiteDir, "manifest.json")),
    readJson(path.join(selectedCandidateDir, "manifest.json")),
    readJson(path.join(projectDir, "source-pack", "fact-ledger.json"))
  ]);
  const finalProcess = await validateV511DesignProcess(finalSiteDir, html, "final", finalManifest.packageVersion);
  const selectedProcess = await validateV511DesignProcess(selectedCandidateDir, selectedHtml, "candidate", selectedManifest.packageVersion);
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
  if (finalManifest.packageVersion === V532_PACKAGE_VERSION) {
    errors.push(...await validateSourceAssetDecisions(projectDir, finalSiteDir, html, finalProcess.process));
  }
  if (errors.length) throw new Error(errors.join("; "));
  return { designProcessSha256: finalProcess.designProcessSha256, warnings: rawAudit.warnings };
}

export async function validateSourceAssetDecisions(projectDir, siteDir, html, process) {
  const sourceAssets = await readSourceAssets(projectDir);
  const decisions = process.sourceAssetDecisions;
  const errors = [];
  if (!Array.isArray(decisions)) {
    return ["V5.3.2 final design-process.json requires sourceAssetDecisions, including an empty array when the source has no images"];
  }
  const expected = new Map(sourceAssets.map((asset) => [asset.assetPath, asset]));
  const seen = new Set();
  const document = parse(html);
  for (const decision of decisions) {
    const assetPath = String(decision?.assetPath ?? "").replaceAll("\\", "/");
    const asset = expected.get(assetPath);
    if (!asset) {
      errors.push(`sourceAssetDecisions references unknown source asset ${assetPath || "(missing)"}`);
      continue;
    }
    if (seen.has(assetPath)) {
      errors.push(`sourceAssetDecisions contains duplicate source asset ${assetPath}`);
      continue;
    }
    seen.add(assetPath);
    if (decision.sourceRef !== asset.sourceRef) errors.push(`${assetPath} must use sourceRef ${asset.sourceRef}`);
    if (!["high", "medium", "low"].includes(decision.contentValue)) errors.push(`${assetPath} requires contentValue high, medium, or low`);
    if (!["use-original", "redraw", "reference-only", "omit"].includes(decision.decision)) errors.push(`${assetPath} has invalid source asset decision`);
    if (String(decision.rationale ?? "").trim().length < 8) errors.push(`${assetPath} requires a material-specific rationale`);
    if (decision.contentValue === "high" && !["use-original", "redraw"].includes(decision.decision)) {
      errors.push(`${assetPath} is high-value source evidence and must be used or redrawn`);
    }
    if (["use-original", "redraw"].includes(decision.decision)) {
      const nodes = matchingNodes(document, decision.selector);
      if (nodes.length !== 1) {
        errors.push(`${assetPath} ${decision.decision} selector must match exactly one visible element`);
        continue;
      }
      if (!isStaticallyVisible(nodes[0])) errors.push(`${assetPath} selected source asset treatment must be visible`);
      if (decision.decision === "use-original") {
        const images = [];
        visit(nodes[0], (node) => { if (node.tagName === "img") images.push(node); });
        const sourceHash = await fileSha256(path.join(projectDir, "source-pack", ...assetPath.split("/")));
        let matched = false;
        for (const image of images) {
          const src = attr(image, "src");
          if (!src || /^(?:data:|https?:|#)/i.test(src)) continue;
          try {
            if (await fileSha256(path.resolve(siteDir, ...src.split("/"))) === sourceHash) matched = true;
          } catch {}
        }
        if (!matched) errors.push(`${assetPath} use-original selector must render a byte-identical Source Pack image`);
      } else {
        const module = process.visualizationModules?.find((item) => item.selector === decision.selector);
        if (!module?.sourceRefs?.includes(asset.sourceRef)) {
          errors.push(`${assetPath} redraw must bind its visualization module to ${asset.sourceRef}`);
        }
      }
    } else if (decision.selector) {
      errors.push(`${assetPath} ${decision.decision} must not declare a visible selector`);
    }
  }
  for (const assetPath of expected.keys()) {
    if (!seen.has(assetPath)) errors.push(`sourceAssetDecisions is missing ${assetPath}`);
  }
  return errors;
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
    const shots = audit.screenshots ?? { desktop: audit.screenshot };
    for (const [viewport, shot] of Object.entries(shots)) {
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

function validateSampleScope(scope, document, process, errors) {
  if (!scope || typeof scope !== "object") {
    errors.push("design-process.json requires sampleScope for a V5.3 candidate");
    return;
  }
  const matches = {};
  for (const key of ["firstViewportSelector", "focusModuleSelector", "coreInteractionSelector"]) {
    matches[key] = matchingNodes(document, scope[key]);
    if (!scope[key] || matches[key].length === 0) errors.push(`sampleScope ${key} is not present in index.html`);
    else if (matches[key].length !== 1) errors.push(`sampleScope ${key} must match exactly one element in index.html`);
  }
  if (scope.focusModuleSelector && !process.visualizationModules?.some((module) => module.category === "focus" && module.selector === scope.focusModuleSelector)) {
    errors.push("sampleScope focusModuleSelector must identify the representative focus visualization");
  }
  if (scope.coreInteractionSelector && scope.coreInteractionSelector !== process.coreInteraction?.selector) {
    errors.push("sampleScope coreInteractionSelector must identify the declared core interaction");
  }
  const viewport = matches.firstViewportSelector?.[0];
  if (!viewport) return;
  for (const key of ["focusModuleSelector", "coreInteractionSelector"]) {
    const node = matches[key]?.[0];
    if (node && !isWithin(node, viewport)) errors.push(`sampleScope ${key} must be inside the first viewport`);
  }
  const body = matchingNodes(document, "body")[0];
  for (const root of body?.childNodes ?? []) {
    if (!isSubstantiveVisibleRoot(root)) continue;
    if (!isWithin(root, viewport)) {
      errors.push("compact sample scope has a substantive visible root outside the first viewport");
      break;
    }
  }
  visit(document, (node) => {
    if (!node.tagName || isWithin(node, viewport) || !isStaticallyVisible(node)) return;
    if (attr(node, "data-content-id") !== undefined || attr(node, "data-source-ref") !== undefined) {
      errors.push("source-bound visible content is outside the first viewport compact sample scope");
    }
  });
}

export function assertStandalonePreviewTheme(html, themeId) {
  const theme = getTheme(themeId);
  const escaped = themeId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const style = String(html).match(new RegExp(`<style\\b[^>]*data-preview-theme=["']${escaped}["'][^>]*>([\\s\\S]*?)<\\/style>`, "i"))?.[1] ?? "";
  if (!style) throw new Error(`site must include a standalone preview theme style for ${themeId}`);
  for (const [token, cssName] of [
    ["canvas", "canvas"], ["surface", "surface"], ["text", "text"],
    ["textMuted", "text-muted"], ["border", "border"], ["accent", "accent"]
  ]) {
    const expected = theme.tokens[token];
    const pattern = new RegExp(`--report-${cssName}\\s*:\\s*${expected.replace("#", "#?")}\\b`, "i");
    if (!pattern.test(style)) throw new Error(`standalone preview theme ${themeId} is missing --report-${cssName}: ${expected}`);
  }
  return true;
}

export async function assertFinalFullPageScreenshots(siteDir) {
  for (const [name, width, minHeight] of [["desktop-full.png", 1440, 900], ["mobile-full.png", 390, 844]]) {
    let image;
    try {
      image = await loadImage(await readFile(path.join(siteDir, "screenshots", name)));
    } catch {
      throw new Error(`V5.3.1+ final package requires a decodable screenshots/${name}`);
    }
    if (image.width !== width || image.height < minHeight) {
      throw new Error(`screenshots/${name} must be a full-page PNG with width ${width} and height at least ${minHeight}`);
    }
  }
  return true;
}

async function auditPreviewThemeScreenshot(bytes, themeId, candidateId) {
  const image = await loadImage(bytes);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, image.width, image.height).data;
  const theme = getTheme(themeId);
  const canvasRgb = hexRgb(theme.tokens.canvas);
  const accentRgb = hexRgb(theme.tokens.accent);
  let samples = 0;
  let canvasHits = 0;
  let accentHits = 0;
  for (let y = 0; y < image.height; y += 8) {
    for (let x = 0; x < image.width; x += 8) {
      const offset = (y * image.width + x) * 4;
      const pixel = [pixels[offset], pixels[offset + 1], pixels[offset + 2]];
      samples += 1;
      if (colorDistance(pixel, canvasRgb) <= 12) canvasHits += 1;
      if (colorDistance(pixel, accentRgb) <= 12) accentHits += 1;
    }
  }
  const errors = [];
  if (canvasHits / samples < 0.01) errors.push(`${candidateId} screenshot does not visibly render ${themeId} canvas color`);
  if (accentHits / samples < 0.001) errors.push(`${candidateId} screenshot does not visibly render ${themeId} accent color`);
  return errors;
}

function hexRgb(value) {
  const normalized = value.slice(1);
  return [0, 2, 4].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16));
}

function colorDistance(left, right) {
  return Math.sqrt(left.reduce((sum, value, index) => sum + (value - right[index]) ** 2, 0));
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
  return matchingNodes(document, selector).length > 0;
}

function matchingNodes(document, selector) {
  const matcher = selectorMatcher(selector);
  if (!matcher) return [];
  const found = [];
  visit(document, (node) => {
    if (node.tagName && matcher(node)) found.push(node);
  });
  return found;
}

function isWithin(node, ancestor) {
  for (let current = node; current; current = current.parentNode) if (current === ancestor) return true;
  return false;
}

function isSubstantiveVisibleRoot(node) {
  if (!node?.tagName || ["script", "style", "template"].includes(node.tagName)) return false;
  if (attr(node, "hidden") !== undefined || attr(node, "aria-hidden") === "true") return false;
  return Boolean(visibleText(node).trim() || attr(node, "data-content-id") !== undefined || attr(node, "data-source-ref") !== undefined);
}

function isStaticallyVisible(node) {
  for (let current = node; current; current = current.parentNode) {
    if (attr(current, "hidden") !== undefined || attr(current, "aria-hidden") === "true") return false;
    if (/\b(?:display\s*:\s*none|visibility\s*:\s*hidden)\b/i.test(attr(current, "style") ?? "")) return false;
  }
  return true;
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

async function readSourceAssets(projectDir) {
  const contactSheetPath = path.join(projectDir, "source-pack", "asset-contact-sheet.html");
  let contactSheet;
  try {
    contactSheet = parse(await readFile(contactSheetPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const assets = [];
  visit(contactSheet, (node) => {
    if (node.tagName !== "figure") return;
    const sourceRef = attr(node, "data-source-id");
    let assetPath = null;
    visit(node, (child) => {
      if (!assetPath && child.tagName === "img") assetPath = attr(child, "src") ?? null;
    });
    if (sourceRef && assetPath && !/^(?:data:|https?:|#)/i.test(assetPath)) {
      assets.push({ sourceRef, assetPath: assetPath.replaceAll("\\", "/") });
    }
  });
  return assets;
}

async function fileSha256(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

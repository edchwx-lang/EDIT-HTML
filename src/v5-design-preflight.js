import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parse } from "parse5";

import { validateV5Site } from "./v5-design.js";
import { validateHuashuCandidateIsolation, validateHuashuDesignEvidence } from "./v5-huashu-evidence.js";
import { auditV511CandidateForReview, auditV511CandidateSet } from "./v5-quality-gate.js";

export async function preflightV5CandidateSet(projectDir, variantId, candidateSetDir, options = {}) {
  const errors = [];
  const warnings = [];
  const checks = {};
  const directories = await candidateDirectories(candidateSetDir);
  const evidenceList = [];
  const validations = [];
  const candidates = [];
  if (directories.length !== 3) errors.push(issue("candidate-count", `candidate preflight requires exactly three candidate directories; found ${directories.length}`));
  for (const directory of directories) {
    const candidateId = path.basename(directory);
    const common = await preflightSite(projectDir, variantId, directory, "candidate", options);
    errors.push(...common.errors.map((item) => ({ ...item, candidateId })));
    warnings.push(...common.warnings.map((item) => ({ ...item, candidateId })));
    evidenceList.push(common.evidence);
    if (common.validation) validations.push(common.validation);
    candidates.push({ candidateId, valid: common.valid, sourceImages: common.summary.sourceImageCount });
  }
  if (evidenceList.length === 3 && evidenceList.every(Boolean)) {
    const isolation = validateHuashuCandidateIsolation(evidenceList);
    errors.push(...isolation.errors);
    checks.candidateIsolation = isolation.valid;
  } else {
    checks.candidateIsolation = false;
  }
  checks.candidateCount = directories.length === 3;
  if (!options.siteValidator && validations.length === directories.length && directories.length === 3) {
    try {
      const audits = await Promise.all(validations.map((validation) => auditV511CandidateForReview(projectDir, candidateSummary(validation))));
      const quality = auditV511CandidateSet(audits, { requireThree: true });
      errors.push(...quality.errors.map((message) => issue("candidate-quality", message)));
      warnings.push(...quality.warnings.map((message) => issue("candidate-aesthetic-risk", message)));
      checks.candidateRuntimeDifference = quality.errors.length === 0;
    } catch (error) {
      errors.push(issue("candidate-quality", error.message));
      checks.candidateRuntimeDifference = false;
    }
  }
  return output(errors, warnings, checks, { candidateCount: directories.length, candidates });
}

export async function preflightV5CandidateSite(projectDir, variantId, siteDir, options = {}) {
  const common = await preflightSite(projectDir, variantId, siteDir, "candidate", options);
  return output(common.errors, common.warnings, common.checks, common.summary);
}

export async function preflightV5FinalSite(projectDir, variantId, siteDir, options = {}) {
  const common = await preflightSite(projectDir, variantId, siteDir, "final", options);
  const browserCheck = options.browserCheck ?? checkFinalSiteInBrowser;
  let browser = { errors: [], warnings: [], checks: {} };
  try {
    browser = await browserCheck(siteDir, options);
  } catch (error) {
    browser.errors = [issue("browser-preflight-failed", error.message)];
  }
  return output(
    [...common.errors, ...(browser.errors ?? [])],
    [...common.warnings, ...(browser.warnings ?? [])],
    { ...common.checks, ...(browser.checks ?? {}) },
    common.summary
  );
}

async function preflightSite(projectDir, variantId, siteDir, kind, options) {
  const errors = [];
  const warnings = [];
  const checks = {};
  const siteValidator = options.siteValidator ?? validateV5Site;
  let validation = null;
  try {
    validation = await siteValidator(projectDir, variantId, siteDir, kind);
    checks.staticContract = true;
  } catch (error) {
    errors.push(issue("static-contract", error.message));
    checks.staticContract = false;
  }
  const evidence = await validateHuashuDesignEvidence(projectDir, siteDir, kind, { variantId });
  errors.push(...evidence.errors);
  warnings.push(...evidence.warnings);
  Object.assign(checks, evidence.checks);
  const offline = await inspectOfflineSafety(siteDir);
  errors.push(...offline.errors);
  checks.offlineSafety = offline.errors.length === 0;
  if (offline.systemFontsOnly) warnings.push(issue("system-fonts-only", "design uses only system fonts; Huashu should verify the typography is intentional"));
  if (!options.siteValidator) {
    const factual = await inspectFactualIntegrity(projectDir, siteDir, kind);
    errors.push(...factual.errors);
    checks.factualIntegrity = factual.errors.length === 0;
  }
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    checks,
    evidence: evidence.evidence,
    validation,
    summary: { kind, candidateId: validation?.manifest?.candidateId ?? null, ...evidence.summary }
  };
}

export async function checkFinalSiteInBrowser(siteDir, options = {}) {
  const errors = [];
  const warnings = [];
  const checks = { browserInteraction: false, responsiveOverflow: false };
  const process = await readOptionalJson(path.join(siteDir, "design-process.json"));
  const selector = process?.coreInteraction?.selector;
  if (!selector) {
    errors.push(issue("invalid-interaction-selector", "design-process.json requires coreInteraction.selector"));
    return { errors, warnings, checks };
  }
  const playwright = options.playwright ?? await import("playwright");
  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(pathToFileURL(path.join(siteDir, "index.html")).href, { waitUntil: "load" });
    let count;
    try {
      count = await page.locator(selector).count();
    } catch (error) {
      errors.push(issue("invalid-interaction-selector", `core interaction selector is invalid: ${error.message}`));
      count = 0;
    }
    if (count !== 1) {
      errors.push(issue("invalid-interaction-selector", `core interaction selector must match exactly one element; matched ${count}`));
    } else {
      const before = await page.locator("body").evaluate((element) => element.innerHTML);
      await page.locator(selector).click();
      await page.waitForTimeout(50);
      const after = await page.locator("body").evaluate((element) => element.innerHTML);
      if (before === after) errors.push(issue("interaction-no-state-change", "core interaction click produced no DOM state change"));
      else checks.browserInteraction = true;
    }
    let overflow = false;
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
      if (dimensions.scrollWidth > dimensions.innerWidth + 1) overflow = true;
    }
    if (overflow) errors.push(issue("responsive-overflow", "site has horizontal overflow at a required viewport"));
    else checks.responsiveOverflow = true;
  } finally {
    await browser.close();
  }
  return { errors, warnings, checks };
}

async function candidateDirectories(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const directories = [];
  for (const entry of entries.filter((item) => item.isDirectory()).sort((left, right) => left.name.localeCompare(right.name))) {
    const directory = path.join(root, entry.name);
    try {
      const manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
      if (manifest.kind === "candidate") directories.push(directory);
    } catch {
      // Non-candidate support directories are ignored.
    }
  }
  return directories;
}

async function inspectOfflineSafety(siteDir) {
  const errors = [];
  let combined = "";
  for (const name of await listTextFiles(siteDir)) combined += "\n" + await readFile(path.join(siteDir, ...name.split("/")), "utf8");
  const external = [...combined.matchAll(/(?:src|href)\s*=\s*["'](https?:\/\/[^"']+)|url\(\s*["']?(https?:\/\/[^)'"\s]+)/gi)].map((match) => match[1] ?? match[2]);
  if (external.length) errors.push({ ...issue("offline-external-resource", "site loads external resources and is not offline-safe"), resources: [...new Set(external)] });
  const hasFontFace = /@font-face\b/i.test(combined);
  return { errors, systemFontsOnly: !hasFontFace };
}

export async function inspectFactualIntegrity(projectDir, siteDir, kind) {
  const errors = [];
  const [html, bindings, ledger, sourceMap] = await Promise.all([
    readFile(path.join(siteDir, "index.html"), "utf8"),
    readOptionalJson(path.join(siteDir, "content-bindings.json")),
    readOptionalJson(path.join(projectDir, "source-pack", "fact-ledger.json")),
    readOptionalJson(path.join(projectDir, "source-pack", "source-map.json"))
  ]);
  if (!bindings || !ledger || !sourceMap) return { errors: [issue("source-contract-missing", "factual preflight requires content bindings, fact ledger, and source map")] };
  const facts = new Map((ledger.facts ?? []).map((fact) => [fact.factId, fact]));
  const units = new Map((sourceMap.documents ?? []).flatMap((document) => document.units ?? []).map((unit) => [unit.sourceId, unit]));
  const document = parse(html);
  const covered = new Set();
  for (const binding of bindings.bindings ?? []) {
    const node = findByAttribute(document, "data-content-id", binding.contentId);
    if (!node) continue;
    const boundFacts = [];
    for (const factId of binding.factIds ?? []) {
      const fact = facts.get(factId);
      if (!fact) errors.push(issue("source-missing", `${binding.contentId} references unknown fact ${factId}`));
      else boundFacts.push(fact);
    }
    for (const sourceId of binding.sourceRefs ?? []) {
      if (!units.has(sourceId)) errors.push(issue("source-missing", `${binding.contentId} references unknown source ${sourceId}`));
      else covered.add(sourceId);
    }
    const allowed = new Set(boundFacts.flatMap((fact) => numericTokens(fact.rawText)).map(normalizeNumber));
    const text = visibleText(node);
    for (const token of numericTokens(text)) {
      if (!allowed.has(normalizeNumber(token))) errors.push(issue("fact-distortion", `${binding.contentId} contains unbound numeric token ${token}`));
    }
    for (const fact of boundFacts) {
      const visibleNumbers = numericTokens(text).map(normalizeNumber);
      if (!numericTokens(fact.rawText).some((token) => visibleNumbers.includes(normalizeNumber(token)))) continue;
      for (const qualifier of qualificationTokens(fact.rawText)) {
        if (!text.includes(qualifier)) errors.push(issue("fact-distortion", `${binding.contentId} dropped qualification ${qualifier}`));
      }
    }
  }
  if (kind === "final") {
    const omitted = new Set((bindings.omissions ?? []).filter((item) => item.authorizedBy === "user").map((item) => item.sourceId));
    for (const [sourceId, unit] of units) {
      if (unit.substantive && !covered.has(sourceId) && !omitted.has(sourceId)) errors.push(issue("content-plan-missing", `substantive source ${sourceId} is not accessible in the final site`));
    }
  }
  return { errors };
}

async function listTextFiles(root, prefix = "") {
  const files = [];
  for (const entry of await readdir(path.join(root, ...prefix.split("/").filter(Boolean)), { withFileTypes: true })) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await listTextFiles(root, name));
    else if (/\.(?:html?|css|js|mjs|json|md)$/i.test(entry.name)) files.push(name);
  }
  return files;
}

async function readOptionalJson(file) {
  try { return JSON.parse(await readFile(file, "utf8")); } catch { return null; }
}

function output(errors, warnings, checks, summary) {
  return { valid: errors.length === 0, errors, warnings, checks, summary };
}

function issue(code, message) {
  return { code, message };
}

function candidateSummary(validation) {
  const manifest = validation.manifest;
  return {
    candidateId: manifest.candidateId,
    directionId: manifest.directionId,
    directionLabel: manifest.directionLabel,
    previewThemeId: manifest.previewThemeId,
    packageVersion: manifest.packageVersion,
    sampleScope: manifest.sampleScope ?? null,
    payloadSha256: manifest.payloadSha256,
    screenshotSourceSha256: manifest.screenshotSourceSha256,
    contentPlanSha256: validation.contentPlanSha256,
    designProcessSha256: validation.designProcessSha256 ?? null,
    siteDir: validation.siteDir
  };
}

function findByAttribute(node, name, value) {
  if (node.attrs?.some((item) => item.name === name && item.value === value)) return node;
  for (const child of node.childNodes ?? []) {
    const match = findByAttribute(child, name, value);
    if (match) return match;
  }
  return null;
}

function visibleText(node) {
  if (node.nodeName === "#text") return node.value ?? "";
  if (node.attrs?.some((item) => item.name === "hidden" || (item.name === "aria-hidden" && item.value === "true"))) return "";
  return (node.childNodes ?? []).map(visibleText).join(" ").replace(/\s+/g, " ").trim();
}

function numericTokens(text) {
  return [...String(text ?? "").matchAll(/[-+]?\d[\d,.]*(?:%|亿元|万元|亿美元|万台|台|kW|MW|GW)?/giu)].map((match) => match[0]);
}

function normalizeNumber(value) {
  return String(value).replaceAll(",", "").replace(/(?:亿元|万元|亿美元|万台|台|kW|MW|GW|%)$/iu, "");
}

function qualificationTokens(text) {
  return [...String(text ?? "").matchAll(/预计|约|至少|至多|可能|大约|不超过|不低于|同比|复合增长/gu)].map((match) => match[0]);
}

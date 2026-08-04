import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "parse5";

import { writeJsonAtomic } from "./io.js";
import { hashV5SitePayload } from "./v5-design.js";

export async function auditV5FinalSite(projectDir, variantId) {
  const variantDir = path.join(projectDir, "variants", variantId);
  const siteDir = path.join(variantDir, "design", "package");
  const [html, manifest, bindings, ledger, sourceMap, variant] = await Promise.all([
    readFile(path.join(siteDir, "index.html"), "utf8"),
    readJson(path.join(siteDir, "manifest.json")),
    readJson(path.join(siteDir, "content-bindings.json")),
    readJson(path.join(projectDir, "source-pack", "fact-ledger.json")),
    readJson(path.join(projectDir, "source-pack", "source-map.json")),
    readJson(path.join(variantDir, "variant.json"))
  ]);
  const errors = [];
  const payloadSha256 = await hashV5SitePayload(siteDir);
  if (manifest.kind !== "final") errors.push("design/package must contain a final site");
  if (manifest.payloadSha256 !== payloadSha256 || manifest.outputSha256 !== payloadSha256) errors.push("final site payload hash mismatch");
  if (manifest.parentCandidateId !== variant.designSelection?.candidateId || manifest.parentCandidateSha256 !== variant.designSelection?.candidateSha256) {
    errors.push("final site does not descend from the selected parent candidate");
  }

  const facts = new Map(ledger.facts.map((fact) => [fact.factId, fact]));
  const units = new Map();
  const sourceNames = new Map();
  for (const document of sourceMap.documents) {
    for (const unit of document.units) {
      units.set(unit.sourceId, unit);
      sourceNames.set(unit.sourceId, document.name);
    }
  }
  const document = parse(html);
  const coveredSources = new Set();
  const seenContent = new Set();
  for (const binding of bindings.bindings ?? []) {
    if (seenContent.has(binding.contentId)) errors.push(`duplicate binding ${binding.contentId}`);
    seenContent.add(binding.contentId);
    const node = findByAttribute(document, "data-content-id", binding.contentId);
    if (!node) {
      errors.push(`content binding ${binding.contentId} has no matching DOM element`);
      continue;
    }
    const boundFacts = [];
    for (const factId of binding.factIds ?? []) {
      const fact = facts.get(factId);
      if (!fact) errors.push(`content ${binding.contentId} references unknown fact ${factId}`);
      else boundFacts.push(fact);
    }
    for (const sourceId of binding.sourceRefs ?? []) {
      if (!units.has(sourceId)) errors.push(`content ${binding.contentId} references unknown source ${sourceId}`);
      else coveredSources.add(sourceId);
    }
    const text = visibleText(node);
    const allowed = new Set(boundFacts.flatMap((fact) => numericTokens(fact.rawText)).map(normalizeNumber));
    for (const token of numericTokens(text)) {
      if (!allowed.has(normalizeNumber(token))) errors.push(`content ${binding.contentId} contains unbound numeric token ${token}`);
    }
    for (const fact of boundFacts) {
      const sharedNumber = numericTokens(fact.rawText).some((token) => numericTokens(text).map(normalizeNumber).includes(normalizeNumber(token)));
      if (!sharedNumber) continue;
      for (const qualifier of qualificationTokens(fact.rawText)) {
        if (!text.includes(qualifier)) errors.push(`content ${binding.contentId} dropped qualification ${qualifier}`);
      }
    }
  }

  const omitted = new Set();
  for (const omission of bindings.omissions ?? []) {
    if (!units.has(omission.sourceId)) errors.push(`omission references unknown source ${omission.sourceId}`);
    if (!omission.reason?.trim() || omission.authorizedBy !== "user" || !Number.isFinite(Date.parse(omission.authorizedAt))) {
      errors.push(`omission ${omission.sourceId} requires reason and explicit user authorization`);
    } else omitted.add(omission.sourceId);
  }
  for (const [sourceId, unit] of units) {
    if (unit.substantive && !coveredSources.has(sourceId) && !omitted.has(sourceId)) errors.push(`substantive source ${sourceId} is not accessible in main, detail, or appendix`);
  }

  errors.push(...await runtimeErrors(siteDir));
  const report = {
    schemaVersion: 1,
    variantId,
    status: errors.length ? "failed" : "passed",
    checkedAt: new Date().toISOString(),
    payloadSha256,
    coveredSources: coveredSources.size,
    sourceNames: Object.fromEntries(sourceNames),
    errors
  };
  await writeJsonAtomic(path.join(variantDir, "audit-report.json"), report);
  if (errors.length) throw new Error("V5 audit failed: " + errors.join("; "));
  return report;
}

async function runtimeErrors(siteDir) {
  const errors = [];
  for (const name of await listTextFiles(siteDir)) {
    const text = await readFile(path.join(siteDir, ...name.split("/")), "utf8");
    if (/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/.test(text)) errors.push(`${name} contains forbidden network runtime`);
    if (/\beval\s*\(|\bnew\s+Function\s*\(/.test(text)) errors.push(`${name} contains forbidden dynamic code`);
    if (/\bimport\s*\(\s*["']https?:\/\//i.test(text)) errors.push(`${name} contains remote dynamic import`);
    if (name.endsWith(".css") && /(?:@import\s+|url\(\s*["']?)https?:\/\//i.test(text)) errors.push(`${name} contains remote CSS dependency`);
    if (name.endsWith(".html") && /<(?:script|img|source|video|audio|link)\b[^>]*\b(?:src|href|poster)\s*=\s*["']https?:\/\//i.test(text)) {
      errors.push(`${name} contains remote runtime resource`);
    }
  }
  return errors;
}

async function listTextFiles(root, prefix = "") {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(path.join(root, ...prefix.split("/").filter(Boolean)), { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) result.push(...await listTextFiles(root, name));
    else if (/\.(?:html|css|js|mjs)$/i.test(name)) result.push(name);
  }
  return result;
}

function findByAttribute(node, name, value) {
  if (node.attrs?.some((attribute) => attribute.name === name && attribute.value === value)) return node;
  for (const child of node.childNodes ?? []) {
    const found = findByAttribute(child, name, value);
    if (found) return found;
  }
  return null;
}

function visibleText(node) {
  if (node.nodeName === "#text") return node.value ?? "";
  if (node.tagName === "script" || node.tagName === "style") return "";
  return (node.childNodes ?? []).map(visibleText).join(" ").replace(/\s+/g, " ").trim();
}

function numericTokens(text) {
  return [...String(text).matchAll(/[-+]?\d[\d,.]*(?:%|亿元|万元|元|万台|台|kW|MW|GW)?/giu)].map((match) => match[0]);
}

function normalizeNumber(value) {
  return value.replaceAll(",", "").toLowerCase();
}

function qualificationTokens(text) {
  return [...String(text).matchAll(/预计|约|至少|至多|可能|大约|不超过|不低于|同比|复合增速/gu)].map((match) => match[0]);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

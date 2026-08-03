import { readFile, rm } from "node:fs/promises";
import path from "node:path";

import { writeJsonAtomic } from "./io.js";
import { validateCoverage, walkNodes } from "./report-model.js";
import { prepareHuashuInput } from "./design-package.js";

const TRANSFORMATIONS = new Set([
  "preserve", "merge", "split", "summarize", "visualize", "fold", "appendix"
]);

export function validateEditorialModel(sourceModel, report, coverage, { allowUserOverrides = false } = {}) {
  if (report?.sourcePolicy !== "closed" || report?.expressionPolicy !== "free") {
    throw new Error("editorial model requires sourcePolicy closed and expressionPolicy free");
  }
  if (!new Set(["data-first", "evidence-first"]).has(report.mode)) {
    throw new Error("editorial model contains an invalid legacy compatibility mode");
  }
  if (report.editorialStatus !== "confirmed") {
    throw new Error("editorial model must be confirmed before design");
  }
  const sourceUnits = new Map();
  if (!allowUserOverrides && (report.overrides ?? []).length) {
    throw new Error("editorial import cannot contain user overrides");
  }
  const validOverrides = validateOverrides(report.overrides ?? [], allowUserOverrides);
  for (const document of sourceModel.documents ?? []) {
    for (const unit of document.units ?? []) {
      sourceUnits.set(unit.sourceId, { ...unit, documentName: document.name });
    }
  }
  walkNodes(report.nodes ?? [], (node) => {
    if (node.type === "legacyHtml") return;
    const substantive = substantiveText(node);
    if (substantive && !(node.sourceRefs?.length)) {
      throw new Error(`editorial node ${node.nodeId} requires a source reference`);
    }
    if (substantive && !node.transformation) {
      throw new Error(`editorial node ${node.nodeId} requires an explicit transformation`);
    }
    if (node.transformation && !TRANSFORMATIONS.has(node.transformation)) {
      throw new Error(`editorial node ${node.nodeId} has unsupported transformation ${node.transformation}`);
    }
    const referenced = [];
    for (const ref of node.sourceRefs ?? []) {
      const unit = sourceUnits.get(ref.sourceId);
      if (!unit) throw new Error(`editorial node ${node.nodeId} references unknown source ${ref.sourceId}`);
      referenced.push(unitText(unit));
    }
    if (substantive) {
      const source = referenced.join("\n");
      assertNumericFidelity(node.nodeId, substantive, source, validOverrides);
      assertProtectedLanguage(node.nodeId, substantive, source);
      if (!["section", "entityGroup", "image"].includes(node.type) &&
          !validOverrides.has(`${node.nodeId}:text`) && !validOverrides.has(`${node.nodeId}:title`)) {
        assertSourceSupport(node.nodeId, substantive, source);
      }
    }
  });
  validateSourceDerivedCollections(report, sourceUnits, validOverrides);
  validateCoverage(coverage, report);
  return true;
}

export async function importEditorialModel(projectDir, variantId, { reportPath, coveragePath }) {
  const variantDir = path.join(projectDir, "variants", variantId);
  const [sourceModel, report, coverage] = await Promise.all([
    readJson(path.join(projectDir, "source-model.json")),
    readJson(reportPath),
    readJson(coveragePath)
  ]);
  if (report.variantId !== variantId || coverage.variantId !== variantId) {
    throw new Error("editorial model and coverage must target the selected variant");
  }
  validateEditorialModel(sourceModel, report, coverage, { allowUserOverrides: false });
  await writeJsonAtomic(path.join(variantDir, "report-model.json"), report);
  await writeJsonAtomic(path.join(projectDir, "coverage-map.json"), coverage);
  await rm(path.join(variantDir, "design", "candidates"), { recursive: true, force: true });
  await rm(path.join(variantDir, "design", "package"), { recursive: true, force: true });
  const prepared = await prepareHuashuInput(projectDir, variantId);
  return { variantId, editorialStatus: report.editorialStatus, sourcePolicy: report.sourcePolicy, inputSha256: prepared.inputSha256 };
}

function assertNumericFidelity(nodeId, output, source, validOverrides) {
  if (validOverrides.has(`${nodeId}:text`) || validOverrides.has(`${nodeId}:title`) ||
      [...validOverrides].some((key) => key.startsWith(`${nodeId}:datasets.`))) return;
  const available = multiset(numericTokens(source));
  for (const token of numericTokens(output)) {
    const remaining = available.get(token) ?? 0;
    if (!remaining) throw new Error(`editorial node ${nodeId} contains numeric token ${token} absent from its sources`);
    available.set(token, remaining - 1);
  }
}

function assertProtectedLanguage(nodeId, output, source) {
  const protectedTokens = /(?:亿元|万元|千元|百万元|美元|人民币|元|%|％|nm|GB\/s|TB\/s|kW|MW|GW|不受|取决于|依赖|受限|限制|不足|短板|瓶颈|缺口|预计|可能|至少|至多|以上|以下)/gi;
  for (const token of output.match(protectedTokens) ?? []) {
    if (!source.toLowerCase().includes(token.toLowerCase())) {
      throw new Error(`editorial node ${nodeId} contains unsupported unit or qualifier ${token}`);
    }
  }
}

function assertSourceSupport(nodeId, output, source) {
  const outputTerms = lexicalTerms(output);
  if (!outputTerms.size) return;
  const sourceTerms = lexicalTerms(source);
  let shared = 0;
  for (const term of outputTerms) if (sourceTerms.has(term)) shared += 1;
  if (shared < Math.max(1, Math.ceil(outputTerms.size * 0.15))) {
    throw new Error(`editorial node ${nodeId} is not lexically supported by its closed sources`);
  }
}

function lexicalTerms(value) {
  const text = String(value ?? "").toLowerCase();
  const terms = new Set(text.match(/[a-z0-9]{3,}/g) ?? []);
  for (const run of text.match(/[\u3400-\u9fff]{2,}/g) ?? []) {
    for (let index = 0; index < run.length - 1; index += 1) terms.add(run.slice(index, index + 2));
  }
  return terms;
}

function validateOverrides(overrides, allowed) {
  const result = new Set();
  if (!allowed && overrides.length) throw new Error("editorial import cannot contain user overrides");
  for (const item of overrides) {
    const validField = ["text", "title", "assetPath", "structure"].includes(item?.field) || /^datasets\.\d+\.rows\.\d+\.\d+$/.test(item?.field ?? "");
    if (item?.provenance !== "user-override" || !item.nodeId || !validField ||
        !item.changedAt || Number.isNaN(Date.parse(item.changedAt))) {
      throw new Error("invalid user override provenance");
    }
    result.add(`${item.nodeId}:${item.field}`);
  }
  return result;
}

function validateSourceDerivedCollections(report, sourceUnits, validOverrides) {
  for (const dataset of report.datasets ?? []) {
    if ([...validOverrides].some((key) => key.startsWith(`${dataset.nodeId}:datasets.`))) continue;
    const refs = dataset.sourceRefs ?? findNodeSourceRefs(report, dataset.nodeId);
    if (!refs.length) throw new Error(`dataset is not source-derived: ${dataset.datasetId ?? "unknown"}`);
    const source = refs.map((ref) => sourceUnits.get(ref.sourceId)).filter(Boolean).map(unitText).join("\n");
    const values = collectNumbers(dataset);
    const available = multiset(numericTokens(source));
    for (const token of values) {
      const remaining = available.get(token) ?? 0;
      if (!remaining) throw new Error(`dataset is not source-derived: ${dataset.datasetId ?? "unknown"}`);
      available.set(token, remaining - 1);
    }
  }
  for (const fact of report.facts ?? []) {
    const refs = fact.sourceRefs ?? [];
    if (!refs.length) throw new Error(`fact is not source-derived: ${fact.factId ?? "unknown"}`);
    const source = refs.map((ref) => sourceUnits.get(ref.sourceId)).filter(Boolean).map(unitText).join("\n");
    if (fact.value !== undefined) {
      assertNumericFidelity(fact.factId ?? "fact", JSON.stringify(fact.value), source, new Set());
      if (fact.unit) assertProtectedLanguage(fact.factId ?? "fact", String(fact.unit), source);
    }
  }
}

function findNodeSourceRefs(report, nodeId) {
  let refs = [];
  walkNodes(report.nodes ?? [], (node) => {
    if (node.nodeId === nodeId) refs = node.sourceRefs ?? [];
  });
  return refs;
}

function collectNumbers(value) {
  if (typeof value === "number") return numericTokens(value);
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) =>
    ["order", "revision", "schemaVersion"].includes(key) ? [] : collectNumbers(child)
  );
}

function numericTokens(value) {
  return String(value ?? "").match(/\d+(?:[,.]\d+)*/g)?.map((token) => token.replaceAll(",", "")) ?? [];
}

function multiset(values) {
  const result = new Map();
  for (const value of values) result.set(value, (result.get(value) ?? 0) + 1);
  return result;
}

function substantiveText(node) {
  const values = [node.title, node.text, node.caption, ...(node.items ?? [])];
  for (const row of node.rows ?? []) values.push(...row);
  return values.filter((value) => typeof value === "string" && value.trim()).join("\n");
}

function unitText(unit) {
  if (unit.text) return unit.text;
  if (unit.caption || unit.alt) return [unit.caption, unit.alt].filter(Boolean).join("\n");
  if (unit.rows) return unit.rows.flat().join("\n");
  if (unit.items) return unit.items.join("\n");
  return "";
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

import { createHash } from "node:crypto";

export const PROJECT_SCHEMA_VERSION = 4;

export function buildSourceModel(name, extracted, sha256) {
  const units = (extracted.units ?? plainTextUnits(extracted.text)).map((unit, order) => ({
    ...unit,
    sourceId: stableId("src", name + "\0" + order + "\0" + unit.type + "\0" + unitText(unit)),
    order,
    substantive: unit.substantive ?? isSubstantive(unit)
  }));
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    documents: [{
      documentId: stableId("doc", name + "\0" + sha256),
      name,
      sha256,
      mediaType: extracted.mediaType,
      pageCount: extracted.pageCount ?? null,
      slideCount: extracted.slideCount ?? null,
      text: extracted.text,
      warnings: extracted.warnings ?? [],
      units
    }]
  };
}

export function createInitialCoverageMap(sourceModel) {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    entries: sourceModel.documents.flatMap((document) => document.units.map((unit) => ({
      sourceId: unit.sourceId,
      documentId: document.documentId,
      order: unit.order,
      type: unit.type,
      substantive: unit.substantive,
      status: "pending",
      reportNodeIds: []
    })))
  };
}

export function scaffoldReportModel(sourceModel, { variantId, mode }) {
  const nodes = [];
  const nodeBySource = new Map();
  let activeSection = null;
  const ensureSection = (document, unit = null) => {
    if (activeSection) return activeSection;
    activeSection = {
      nodeId: stableId("node", variantId + "\0section\0" + (unit?.sourceId ?? document.documentId)),
      type: "section",
      title: unit?.text || document.name,
      level: unit?.level ?? 1,
      sourceRefs: unit ? [sourceRef(document, unit)] : [],
      children: []
    };
    nodes.push(activeSection);
    if (unit) nodeBySource.set(unit.sourceId, activeSection.nodeId);
    return activeSection;
  };

  for (const document of sourceModel.documents) {
    activeSection = null;
    for (const unit of document.units) {
      if (unit.type === "heading") {
        activeSection = null;
        ensureSection(document, unit);
        continue;
      }
      const section = ensureSection(document);
      const node = sourceUnitToReportNode(document, unit, variantId);
      section.children.push(node);
      nodeBySource.set(unit.sourceId, node.nodeId);
    }
  }

  const datasets = collectDatasets(nodes);
  const report = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    variantId,
    mode,
    revision: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nodes,
    datasets,
    overrides: []
  };
  const coverage = createInitialCoverageMap(sourceModel);
  for (const entry of coverage.entries) {
    const reportNodeId = nodeBySource.get(entry.sourceId);
    if (reportNodeId) {
      entry.status = "preserved";
      entry.reportNodeIds = [reportNodeId];
    }
  }
  const presentation = createPresentationPlan(report);
  return { report, coverage, presentation };
}

export function createPresentationPlan(report) {
  const bindings = [];
  for (const section of report.nodes) {
    bindings.push({
      nodeId: section.nodeId,
      component: "report-section",
      layout: report.mode === "data-first" ? "wide-grid" : "reading-column",
      interaction: "anchor-navigation"
    });
    for (const node of section.children ?? []) {
      bindings.push({
        nodeId: node.nodeId,
        component: componentFor(node, report.mode),
        layout: layoutFor(node, report.mode),
        interaction: interactionFor(node, report.mode)
      });
    }
  }
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    variantId: report.variantId,
    mode: report.mode,
    generatedBy: "huashu-presentation-mapper",
    contentMutationAllowed: false,
    bindings
  };
}

export function validateCoverage(coverage, report) {
  if (coverage?.schemaVersion !== PROJECT_SCHEMA_VERSION) throw new Error("coverage map requires schema version 4");
  const references = new Set();
  walkNodes(report.nodes ?? [], (node) => {
    for (const ref of node.sourceRefs ?? []) references.add(ref.sourceId);
  });
  for (const entry of coverage.entries ?? []) {
    if (entry.substantive && entry.status === "pending") throw new Error('unmapped substantive source unit "' + entry.sourceId + '"');
    if (entry.status === "omitted" && !entry.reason) throw new Error('omitted source unit "' + entry.sourceId + '" requires a reason');
    if ((entry.status === "preserved" || entry.status === "merged") && !references.has(entry.sourceId)) {
      throw new Error('coverage source unit "' + entry.sourceId + '" is not referenced by report model');
    }
  }
  return true;
}

export function findReportNode(report, nodeId) {
  let found = null;
  walkNodes(report.nodes ?? [], (node, parent) => {
    if (node.nodeId === nodeId) found = { node, parent };
  });
  return found;
}

export function walkNodes(nodes, visitor, parent = null) {
  for (const node of nodes) {
    visitor(node, parent);
    if (node.children) walkNodes(node.children, visitor, node);
  }
}

function sourceUnitToReportNode(document, unit, variantId) {
  const base = {
    nodeId: stableId("node", variantId + "\0" + unit.sourceId),
    type: unit.type,
    sourceRefs: [sourceRef(document, unit)]
  };
  if (unit.type === "table") return { ...base, rows: unit.rows, caption: unit.caption ?? "" };
  if (unit.type === "image") return { ...base, assetPath: unit.assetPath, alt: unit.alt ?? "", caption: unit.caption ?? "" };
  if (unit.type === "list") return { ...base, items: unit.items ?? [unit.text], ordered: unit.ordered ?? false };
  return { ...base, text: unit.text ?? "", page: unit.page ?? null, slide: unit.slide ?? null };
}

function sourceRef(document, unit) {
  return {
    sourceId: unit.sourceId,
    documentId: document.documentId,
    documentName: document.name,
    order: unit.order,
    ...(unit.page ? { page: unit.page } : {}),
    ...(unit.slide ? { slide: unit.slide } : {})
  };
}

function collectDatasets(nodes) {
  const datasets = [];
  walkNodes(nodes, (node) => {
    if (node.type === "table" && node.rows?.length > 1) {
      datasets.push({
        datasetId: "dataset-" + node.nodeId,
        nodeId: node.nodeId,
        kind: "table",
        columns: node.rows[0],
        rows: node.rows.slice(1),
        sourceRefs: node.sourceRefs
      });
      return;
    }
    if (node.type === "paragraph" || node.type === "text") {
      const values = numericTokens(node.text);
      if (values.length) datasets.push({
        datasetId: "dataset-" + node.nodeId,
        nodeId: node.nodeId,
        kind: values.length === 1 ? "metric" : "numeric-text",
        label: node.text,
        values: values.map((item) => ({ label: item.raw, value: item.value, unit: item.unit })),
        sourceRefs: node.sourceRefs
      });
    }
  });
  return datasets;
}

function numericTokens(text = "") {
  return [...text.matchAll(/[-+]?\d+(?:[.,]\d+)*(?:%|‰|亿元|万元|美元|GB\/s|Gbps|kW)?/gu)].map((match) => {
    const raw = match[0];
    const numeric = raw.match(/[-+]?\d+(?:[.,]\d+)*/)?.[0] ?? "0";
    return { raw, value: Number(numeric.replaceAll(",", "")), unit: raw.slice(numeric.length) };
  });
}

function componentFor(node, mode) {
  if (node.type === "table") return mode === "data-first" ? "layered-data-table" : "source-table";
  if (node.type === "image") return "source-figure";
  if (node.type === "list") return "structured-list";
  if (mode === "data-first" && numericTokens(node.text).length) return "metric-evidence";
  return mode === "evidence-first" ? "claim-evidence" : "narrative-block";
}

function layoutFor(node, mode) {
  if (node.type === "table") return "full-width";
  if (node.type === "image") return "figure-with-caption";
  return mode === "data-first" ? "dense-grid" : "reading-measure";
}

function interactionFor(node, mode) {
  if (node.type === "table") return "row-highlight";
  if (node.type === "image") return "lightbox";
  if (mode === "data-first" && numericTokens(node.text).length) return "focus-tooltip";
  return "none";
}

function plainTextUnits(text = "") {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => ({ type: "paragraph", text: line }));
}

function unitText(unit) {
  if (unit.text) return unit.text;
  if (unit.rows) return JSON.stringify(unit.rows);
  return unit.alt ?? unit.assetPath ?? "";
}

function isSubstantive(unit) {
  return Boolean(unitText(unit).trim()) || unit.type === "image" || unit.type === "table";
}

function stableId(prefix, value) {
  return prefix + "-" + createHash("sha256").update(value, "utf8").digest("hex").slice(0, 16);
}

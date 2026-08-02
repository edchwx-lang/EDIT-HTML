import { createHash } from "node:crypto";

export const PROJECT_SCHEMA_VERSION = 4;

export function buildSourceModel(name, extracted, sha256) {
  const rawUnits = extracted.units ?? plainTextUnits(extracted.text);
  const units = rawUnits.map((rawUnit, order) => {
    const unit = normalizeStructuralUnit(rawUnit, order, rawUnits.length);
    return {
    ...unit,
    sourceId: stableId("src", name + "\0" + order + "\0" + unit.type + "\0" + unitText(unit)),
    order,
    substantive: unit.substantive ?? isSubstantive(unit)
  };});
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
  let nodes = [];
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
    }
  }

  if (mode === "data-first") nodes = groupRepeatedEntities(nodes, variantId);

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
  const nodeBySource = indexSourcesByNode(nodes);
  const coverage = createInitialCoverageMap(sourceModel);
  for (const entry of coverage.entries) {
    const reportNodeIds = [...(nodeBySource.get(entry.sourceId) ?? [])];
    if (reportNodeIds.length) {
      entry.status = "preserved";
      entry.reportNodeIds = reportNodeIds;
    }
  }
  const presentation = createPresentationPlan(report);
  return { report, coverage, presentation };
}

export function createPresentationPlan(report) {
  const bindings = [];
  walkNodes(report.nodes, (section) => {
    bindings.push({
      nodeId: section.nodeId,
      component: section.type === "entityGroup" ? "master-detail" : componentFor(section, report.mode),
      layout: section.type === "entityGroup" ? "split-pane" : layoutFor(section, report.mode),
      interaction: section.type === "entityGroup" ? "entity-and-dimension-tabs" : interactionFor(section, report.mode)
    });
  });
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
    for (const entity of node.entities ?? []) {
      for (const dimension of entity.dimensions ?? []) {
        if (dimension.nodes) walkNodes(dimension.nodes, visitor, node);
      }
    }
  }
}

function normalizeStructuralUnit(unit, order, total) {
  if (unit.type !== "paragraph") return unit;
  const text = unit.text?.trim() ?? "";
  if (/^[一二三四五六七八九十百]+、\S/.test(text)) return { ...unit, type: "heading", level: 1 };
  if (/^（[一二三四五六七八九十百]+）\S/.test(text)) return { ...unit, type: "heading", level: 2 };
  if (order === 0 && total > 1 && text.length <= 80 && /(?:报告|方案|研究|白皮书)$/.test(text)) {
    return { ...unit, type: "heading", level: 0 };
  }
  return unit;
}

function groupRepeatedEntities(nodes, variantId) {
  const markerIndex = nodes.findIndex((node) => node.type === "section" && node.level === 1 && /材料.*分析/.test(node.title));
  if (markerIndex === -1) return nodes;
  const candidates = [];
  for (let index = markerIndex + 1; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node.type !== "section" || node.level !== 2 || !/^（[一二三四五六七八九十百]+）/.test(node.title)) break;
    candidates.push(node);
  }
  if (candidates.length < 4) return nodes;
  const entities = candidates.map((section, index) => ({
    entityId: stableId("entity", variantId + "\0" + section.nodeId),
    title: section.title.replace(/^（[一二三四五六七八九十百]+）\s*/, ""),
    order: index,
    sourceRefs: section.sourceRefs,
    dimensions: buildEntityDimensions(section.children ?? [])
  }));
  if (entities.some((entity) => entity.dimensions.length < 3)) return nodes;
  const group = {
    nodeId: stableId("node", variantId + "\0entity-group\0" + candidates.map((node) => node.nodeId).join("\0")),
    type: "entityGroup",
    title: "核心材料分层分析",
    sourceRefs: candidates.flatMap((section) => section.sourceRefs ?? []),
    entities
  };
  return [...nodes.slice(0, markerIndex + 1), group, ...nodes.slice(markerIndex + 1 + candidates.length)];
}

function buildEntityDimensions(children) {
  const buckets = new Map();
  let current = "材料概览";
  const add = (label, node) => {
    if (!buckets.has(label)) buckets.set(label, []);
    buckets.get(label).push(node);
  };
  for (const node of children) {
    if (node.type === "table") {
      let split = false;
      for (const [rowIndex, row] of (node.rows ?? []).entries()) {
        const label = tableDimension(row[0]);
        if (!label) continue;
        split = true;
        add(label, {
          ...node,
          nodeId: node.nodeId + "-dimension-" + rowIndex,
          rows: [["维度", "原文"], row]
        });
      }
      if (!split) add(current, node);
      continue;
    }
    const dimensionalSegments = splitDimensionalNode(node, current);
    if (dimensionalSegments) {
      for (const segment of dimensionalSegments) {
        current = segment.label ?? current;
        add(current, segment.node);
      }
      continue;
    }
    const detected = textDimension(node.text ?? node.caption ?? node.alt ?? "");
    if (detected) current = detected;
    add(current, node);
  }
  const preferred = ["材料概览", "全球", "国内", "深圳", "技术现状", "技术难点", "价值链分析", "行动建议", "其他"];
  return preferred.filter((label) => buckets.has(label)).map((label) => {
    const dimensionNodes = buckets.get(label);
    return {
      label,
      nodes: dimensionNodes,
      text: dimensionNodes.filter((node) => node.text).map((node) => node.text).join("\n"),
      sourceRefs: uniqueSourceRefs(dimensionNodes.flatMap((node) => node.sourceRefs ?? []))
    };
  });
}

function textDimension(text) {
  const value = text.trim();
  const opening = value.slice(0, 48);
  if (/(?:深圳|深汕)/.test(opening)) return "深圳";
  if (/^(?:国内|我国|中国)/.test(value) || /(?:国内|国产)/.test(opening)) return "国内";
  if (/^(?:全球|海外)/.test(value) || /(?:全球.*(?:市场|规模|份额)|市场集中|企业集中|供应商|美日.*(?:主导|垄断)|由.*(?:美|日).*(?:主导|垄断)|G4、G5级别.*垄断|目前.*(?:美|日|韩|企业).*(?:主导|垄断))/.test(opening)) return "全球";
  if (/^建议/.test(value)) return "行动建议";
  if (/^表\s*\d+.*(?:技术现状|关键核心技术)/.test(value)) return "技术现状";
  return null;
}

function splitDimensionalNode(node, initialLabel) {
  if (!node.text) return null;
  const sentences = node.text.match(/[^。！？]+[。！？]?/g)?.filter(Boolean) ?? [];
  if (sentences.length < 2) return null;
  let activeLabel = initialLabel;
  const segments = sentences.map((text, index) => {
    activeLabel = textDimension(text) ?? activeLabel;
    return {
      label: activeLabel,
      node: { ...node, nodeId: node.nodeId + "-segment-" + index, text }
    };
  });
  return new Set(segments.map((segment) => segment.label)).size > 1 ? segments : null;
}

function tableDimension(label = "") {
  const value = String(label);
  if (/技术现状|关键核心技术|技术卡点/.test(value)) return "技术现状";
  if (/技术难点|卡脖子|原因分析/.test(value)) return "技术难点";
  if (/价值链/.test(value)) return "价值链分析";
  return null;
}

function uniqueSourceRefs(refs) {
  const seen = new Set();
  return refs.filter((ref) => !seen.has(ref.sourceId) && seen.add(ref.sourceId));
}

function indexSourcesByNode(nodes) {
  const index = new Map();
  walkNodes(nodes, (node) => {
    for (const ref of node.sourceRefs ?? []) {
      if (!index.has(ref.sourceId)) index.set(ref.sourceId, new Set());
      index.get(ref.sourceId).add(node.nodeId);
    }
  });
  return index;
}

function sourceUnitToReportNode(document, unit, variantId) {
  const base = {
    nodeId: stableId("node", variantId + "\0" + unit.sourceId),
    type: unit.type,
    sourceRefs: [sourceRef(document, unit)]
  };
  if (unit.type === "table") return { ...base, rows: unit.rows, caption: unit.caption ?? "" };
  if (unit.type === "chart") return { ...base, type: "table", originalType: "chart", rows: unit.rows ?? [], caption: unit.caption ?? "原始图表缓存数据", sourceStatus: unit.sourceStatus ?? "unavailable" };
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
        columns: ["指标", "数值", "单位"],
        rows: values.map((item) => [item.contextLabel, item.value, item.unit]),
        values: values.map((item) => ({ label: item.raw, contextLabel: item.contextLabel, value: item.value, unit: item.unit })),
        sourceRefs: node.sourceRefs
      });
    }
  });
  return datasets;
}

function numericTokens(text = "") {
  const number = "[-+]?\\d+(?:,\\d{3})*(?:\\.\\d+)?";
  const rangeNumber = "\\d+(?:,\\d{3})*(?:\\.\\d+)?";
  const unit = "(?:亿美元|亿元|万元|美元|GB\\/s|Gbps|Tbps|GB|kW|MW|W|nm|μm|mm|cm|平方米|万吨|吨\\/年|吨|%|‰|倍|层|颗|家|个月|年|月|日|天)";
  const pattern = new RegExp(
    `(?<![A-Za-z0-9./-])(${number})\\s*(${unit})?(?:\\s*[-–—~至到]\\s*(${rangeNumber})\\s*(${unit})?)?(?![A-Za-z0-9])`,
    "gu"
  );
  const values = [];
  for (const match of text.matchAll(pattern)) {
    const firstUnit = match[2] ?? match[4] ?? "";
    values.push(metricToken(text, match[1], firstUnit, match.index, match.index + match[0].length, values.length));
    if (match[3]) {
      const secondUnit = match[4] ?? match[2] ?? "";
      values.push(metricToken(text, match[3], secondUnit, match.index, match.index + match[0].length, values.length));
    }
  }
  return values;
}

function metricToken(text, numeric, unit, start, end, index) {
  return {
    raw: numeric + unit,
    value: Number(numeric.replaceAll(",", "")),
    unit,
    contextLabel: metricContextLabel(text, start, end, index),
    start,
    end
  };
}

function metricContextLabel(text, start, end, index) {
  const beforeBoundary = Math.max(
    text.lastIndexOf("。", start - 1), text.lastIndexOf("；", start - 1),
    text.lastIndexOf("！", start - 1), text.lastIndexOf("？", start - 1),
    text.lastIndexOf("\n", start - 1)
  );
  const afterCandidates = ["。", "；", "！", "？", "\n"]
    .map((separator) => text.indexOf(separator, end))
    .filter((position) => position >= 0);
  const afterBoundary = afterCandidates.length ? Math.min(...afterCandidates) : text.length;
  const before = text.slice(beforeBoundary + 1, start).replace(/\s+/gu, " ").trim().slice(-14);
  const after = text.slice(end, afterBoundary).replace(/\s+/gu, " ").trim().slice(0, 8);
  const label = (before + text.slice(start, end).trim() + after).trim();
  return label || `指标 ${index + 1}`;
}

function componentFor(node, mode) {
  if (node.type === "section") return "report-section";
  if (node.type === "entityGroup") return "master-detail";
  if (node.type === "table") return mode === "data-first" ? "layered-data-table" : "source-table";
  if (node.type === "image") return "source-figure";
  if (node.type === "list") return "structured-list";
  if (mode === "data-first" && numericTokens(node.text).length) return "metric-evidence";
  return mode === "evidence-first" ? "claim-evidence" : "narrative-block";
}

function layoutFor(node, mode) {
  if (node.type === "section") return mode === "data-first" ? "wide-grid" : "reading-column";
  if (node.type === "entityGroup") return "split-pane";
  if (node.type === "table") return "full-width";
  if (node.type === "image") return "figure-with-caption";
  return mode === "data-first" ? "dense-grid" : "reading-measure";
}

function interactionFor(node, mode) {
  if (node.type === "section") return "anchor-navigation";
  if (node.type === "entityGroup") return "entity-and-dimension-tabs";
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

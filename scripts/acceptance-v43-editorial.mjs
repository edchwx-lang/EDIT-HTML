import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const [projectDir, variantId, outputDir] = process.argv.slice(2);
if (!projectDir || !variantId || !outputDir) {
  throw new Error("usage: node scripts/acceptance-v43-editorial.mjs <project> <variant> <output-dir>");
}

const variantDir = path.join(projectDir, "variants", variantId);
const report = JSON.parse(await readFile(path.join(variantDir, "report-model.json"), "utf8"));
const coverage = JSON.parse(await readFile(path.join(projectDir, "coverage-map.json"), "utf8"));
const sourceModel = JSON.parse(await readFile(path.join(projectDir, "source-model.json"), "utf8"));
const sourceUnits = sourceModel.documents[0].units;
const sourceDocument = sourceModel.documents[0];

walk(report.nodes, (node) => {
  if (node.type !== "evidenceWarning" || !node.text) return;
  const captionUnit = sourceUnits.find((unit) => unit.text === node.text);
  if (captionUnit && !node.sourceRefs?.some((ref) => ref.sourceId === captionUnit.sourceId)) {
    node.sourceRefs.push({
      sourceId: captionUnit.sourceId,
      documentId: sourceDocument.documentId,
      documentName: sourceDocument.name,
      order: captionUnit.order
    });
  }
});

const titleMap = new Map([
  ["AI服务器核心材料专题研究报告", "AI服务器核心材料：技术门槛、供给格局与深圳机会"],
  ["一、AI服务器核心材料发展情况", "从算力跃迁到材料约束"],
  ["（一）AI服务器材料技术发展情况", "技术跃迁：高带宽、高功耗与先进封装"],
  ["（二）AI服务器核心材料产业链情况", "价值链：从芯片材料到散热系统"],
  ["（三）AI服务器核心材料市场情况", "市场三层图景：全球、中国与深圳"],
  ["二、AI服务器核心材料分析", "十二类关键材料的供给地图"],
  ["核心材料分层分析", "十二类关键材料：技术、市场与本地能力"]
]);

for (const node of report.nodes) {
  if (titleMap.has(node.title)) {
    node.sourceTitle = node.title;
    node.title = titleMap.get(node.title);
    node.transformation = node.type === "entityGroup" ? "merge" : "summarize";
    node.sourceRefs = uniqueRefs([...(node.sourceRefs ?? []), ...descendantRefs(node)]);
  }
}

report.nodes = restructureNodes(report.nodes);
report.sourcePolicy = "closed";
report.expressionPolicy = "free";
report.editorialStatus = "confirmed";
report.editorialProvenance = {
  producer: "codex-source-closed-editorial-pass",
  policy: "retitle-and-layer-without-external-content",
  producedAt: new Date().toISOString()
};

const nodeIdsBySource = new Map();
walk(report.nodes, (node) => {
  for (const ref of node.sourceRefs ?? []) {
    if (!nodeIdsBySource.has(ref.sourceId)) nodeIdsBySource.set(ref.sourceId, new Set());
    nodeIdsBySource.get(ref.sourceId).add(node.nodeId);
  }
});
for (const entry of coverage.entries) {
  const nodeIds = [...(nodeIdsBySource.get(entry.sourceId) ?? [])];
  if (!nodeIds.length) continue;
  entry.reportNodeIds = nodeIds;
  entry.status = "preserved";
  entry.coverageStatus = "covered";
  entry.transformation = nodeIds.length > 1 ? "split" : (entry.transformation ?? "preserve");
}
coverage.updatedAt = new Date().toISOString();

await writeFile(path.join(outputDir, "report-model.json"), JSON.stringify(report, null, 2), "utf8");
await writeFile(path.join(outputDir, "coverage-map.json"), JSON.stringify(coverage, null, 2), "utf8");

function restructureNodes(nodes) {
  return nodes.map((node) => {
    if (node.children) node.children = node.children.flatMap(layerNode);
    for (const entity of node.entities ?? []) {
      for (const dimension of entity.dimensions ?? []) {
        if (dimension.nodes) dimension.nodes = dimension.nodes.flatMap(layerNode);
      }
    }
    return node;
  });
}

function layerNode(node) {
  if (node.children) node.children = node.children.flatMap(layerNode);
  if (node.type !== "paragraph" || typeof node.text !== "string" || node.text.length < 150) {
    node.role ??= roleFor(node.text ?? "", 0);
    node.transformation ??= "preserve";
    return [node];
  }
  const sentences = node.text.match(/[^。！？；]+[。！？；]?/g)?.map((item) => item.trim()).filter(Boolean) ?? [node.text];
  const chunks = [];
  let current = "";
  for (const sentence of sentences) {
    if (current && current.length + sentence.length > 135) {
      chunks.push(current);
      current = sentence;
    } else current += sentence;
  }
  if (current) chunks.push(current);
  if (chunks.length < 2) return [{ ...node, role: roleFor(node.text, 0), transformation: "preserve" }];
  return chunks.map((text, index) => ({
    ...node,
    nodeId: index === 0 ? node.nodeId : `${node.nodeId}-layer-${index + 1}`,
    text,
    role: roleFor(text, index),
    displayIntent: roleFor(text, index) === "qualification" ? "warning" : roleFor(text, index) === "evidence" ? "evidence" : "narrative",
    transformation: "split"
  }));
}

function roleFor(text, index) {
  if (/(?:但|仍|依赖|短板|瓶颈|难点|受限|不足|缺口)/.test(text)) return "qualification";
  if (/(?:根据|数据显示|市场规模|占比|份额|增长率|亿元|亿美元|%)/.test(text)) return "evidence";
  return index === 0 ? "finding" : "explanation";
}

function descendantRefs(root) {
  const refs = [];
  walk([root], (node) => refs.push(...(node.sourceRefs ?? [])));
  return refs;
}

function uniqueRefs(refs) {
  return [...new Map(refs.map((ref) => [ref.sourceId, ref])).values()];
}

function walk(nodes, visitor) {
  for (const node of nodes ?? []) {
    visitor(node);
    walk(node.children, visitor);
    for (const entity of node.entities ?? []) for (const dimension of entity.dimensions ?? []) walk(dimension.nodes, visitor);
  }
}

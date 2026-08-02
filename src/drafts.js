import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { writeJsonAtomic, writeTextAtomic } from "./io.js";
import { findReportNode, walkNodes } from "./report-model.js";
import { renderVariant } from "./renderer.js";

const MODEL_PATCH_TYPES = new Set([
  "setText", "setDataCell", "moveNode", "cloneNode", "deleteNode", "replaceAsset"
]);

export async function applyDraftPatch(projectDir, variantId, patch) {
  const paths = draftPaths(projectDir, variantId);
  const state = await readDraftState(paths);
  const patches = state.patches.slice(0, state.cursor);
  if (MODEL_PATCH_TYPES.has(patch.type)) {
    const report = JSON.parse(await readFile(paths.model, "utf8"));
    if (patch.baseRevision !== report.revision) {
      const error = new Error("draft revision conflict");
      error.code = "REVISION_CONFLICT";
      error.currentRevision = report.revision;
      throw error;
    }
    const updated = applyModelOperation(report, patch);
    updated.revision = report.revision + 1;
    updated.updatedAt = new Date().toISOString();
    patches.push({ kind: "model", forward: patch, before: report, after: updated });
    await writeJsonAtomic(paths.model, updated);
    await writeDraftState(paths, { patches, cursor: patches.length });
    await renderVariant(projectDir, variantId);
    return { revision: updated.revision };
  }
  const html = await readFile(paths.artifact, "utf8");
  const result = applyHtmlOperation(html, patch);
  patches.push({
    kind: "html",
    forward: patch,
    inverse: result.inverse
  });
  await writeTextAtomic(paths.artifact, result.html);
  await writeDraftState(paths, { patches, cursor: patches.length });
  return { ok: true };
}

export async function undoDraft(projectDir, variantId) {
  const paths = draftPaths(projectDir, variantId);
  const state = await readDraftState(paths);
  if (state.cursor === 0) return false;
  const patch = state.patches[state.cursor - 1];
  if (patch.kind === "model") {
    const current = JSON.parse(await readFile(paths.model, "utf8"));
    const restored = structuredClone(patch.before);
    restored.revision = current.revision + 1;
    restored.updatedAt = new Date().toISOString();
    await writeJsonAtomic(paths.model, restored);
    await writeDraftCursor(paths, state.cursor - 1);
    await renderVariant(projectDir, variantId);
    return true;
  }
  const html = await readFile(paths.artifact, "utf8");
  const updated = applyHtmlOperation(html, patch.inverse).html;
  await writeTextAtomic(paths.artifact, updated);
  await writeDraftCursor(paths, state.cursor - 1);
  return true;
}

export async function redoDraft(projectDir, variantId) {
  const paths = draftPaths(projectDir, variantId);
  const state = await readDraftState(paths);
  if (state.cursor === state.patches.length) return false;
  const patch = state.patches[state.cursor];
  if (patch.kind === "model") {
    const current = JSON.parse(await readFile(paths.model, "utf8"));
    const restored = structuredClone(patch.after);
    restored.revision = current.revision + 1;
    restored.updatedAt = new Date().toISOString();
    await writeJsonAtomic(paths.model, restored);
    await writeDraftCursor(paths, state.cursor + 1);
    await renderVariant(projectDir, variantId);
    return true;
  }
  const html = await readFile(paths.artifact, "utf8");
  const updated = applyHtmlOperation(html, patch.forward).html;
  await writeTextAtomic(paths.artifact, updated);
  await writeDraftCursor(paths, state.cursor + 1);
  return true;
}

function draftPaths(projectDir, variantId) {
  const variantDir = path.join(projectDir, "variants", variantId);
  return {
    artifact: path.join(variantDir, "artifact.html"),
    model: path.join(variantDir, "report-model.json"),
    patches: path.join(variantDir, "draft-patches.jsonl"),
    cursor: path.join(variantDir, "draft-cursor.json")
  };
}

async function readDraftState(paths) {
  let patches = [];
  let cursor = 0;
  try {
    const text = await readFile(paths.patches, "utf8");
    patches = text
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    cursor = patches.length;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  try {
    cursor = JSON.parse(await readFile(paths.cursor, "utf8")).cursor;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return { patches, cursor };
}

async function writeDraftState(paths, state) {
  const lines = state.patches.map((patch) => JSON.stringify(patch)).join("\n");
  await writeTextAtomic(paths.patches, lines ? lines + "\n" : "");
  await writeDraftCursor(paths, state.cursor);
}

async function writeDraftCursor(paths, cursor) {
  await writeJsonAtomic(paths.cursor, { schemaVersion: 4, cursor });
}

function applyModelOperation(report, patch) {
  const updated = structuredClone(report);
  if (patch.type === "setText") {
    const found = findReportNode(updated, patch.nodeId);
    if (!found) throw new Error('unknown node "' + patch.nodeId + '"');
    const field = found.node.type === "section" ? "title" : "text";
    if (typeof found.node[field] !== "string") throw new Error('node "' + patch.nodeId + '" is not text editable');
    const originalValue = found.node[field];
    found.node[field] = String(patch.value);
    recordOverride(updated, {
      nodeId: patch.nodeId,
      field,
      originalValue,
      value: found.node[field],
      sourceRefs: found.node.sourceRefs ?? []
    });
    return updated;
  }
  if (patch.type === "setDataCell") {
    const datasetIndex = updated.datasets.findIndex((item) => item.datasetId === patch.datasetId);
    if (datasetIndex === -1) throw new Error('unknown dataset "' + patch.datasetId + '"');
    const dataset = updated.datasets[datasetIndex];
    if (!dataset.rows?.[patch.row] || patch.column < 0 || patch.column >= dataset.rows[patch.row].length) throw new Error("unknown dataset cell");
    const originalValue = dataset.rows[patch.row][patch.column];
    dataset.rows[patch.row][patch.column] = patch.value;
    const table = findReportNode(updated, dataset.nodeId)?.node;
    if (table?.type === "table" && table.rows?.[patch.row + 1]) table.rows[patch.row + 1][patch.column] = patch.value;
    recordOverride(updated, {
      nodeId: dataset.nodeId,
      field: "datasets." + datasetIndex + ".rows." + patch.row + "." + patch.column,
      originalValue,
      value: patch.value,
      sourceRefs: dataset.sourceRefs ?? []
    });
    return updated;
  }
  if (patch.type === "replaceAsset") {
    const found = findReportNode(updated, patch.nodeId);
    if (!found || found.node.type !== "image") throw new Error('unknown image node "' + patch.nodeId + '"');
    if (!/^data:image\/(?:png|jpeg|gif|webp|svg\+xml);base64,/i.test(patch.value)) throw new Error("replacement image must be an embedded data URL");
    const originalValue = found.node.assetData ?? found.node.assetPath;
    found.node.assetData = patch.value;
    recordOverride(updated, { nodeId: patch.nodeId, field: "assetData", originalValue, value: patch.value, sourceRefs: found.node.sourceRefs ?? [] });
    return updated;
  }
  const location = locateNode(updated.nodes, patch.nodeId);
  if (!location) throw new Error('unknown node "' + patch.nodeId + '"');
  if (patch.type === "moveNode") {
    const offset = patch.direction === "up" || patch.direction === "left" ? -1 : patch.direction === "down" || patch.direction === "right" ? 1 : 0;
    if (!offset) throw new Error('invalid node direction "' + patch.direction + '"');
    const target = location.index + offset;
    if (target < 0 || target >= location.container.length) throw new Error('node "' + patch.nodeId + '" cannot move ' + patch.direction);
    [location.container[location.index], location.container[target]] = [location.container[target], location.container[location.index]];
    return updated;
  }
  if (patch.type === "deleteNode") {
    location.container.splice(location.index, 1);
    return updated;
  }
  if (patch.type === "cloneNode") {
    const clone = structuredClone(location.node);
    rewriteNodeIds(clone, patch.newNodeId ?? "node-" + randomUUID());
    location.container.splice(location.index + 1, 0, clone);
    return updated;
  }
  throw new Error('unsupported patch type "' + patch.type + '"');
}

function recordOverride(report, change) {
  report.overrides ??= [];
  report.overrides.push({
    ...change,
    changedAt: new Date().toISOString(),
    provenance: "user-override"
  });
}

function locateNode(nodes, nodeId) {
  for (let index = 0; index < (nodes ?? []).length; index += 1) {
    const node = nodes[index];
    if (node.nodeId === nodeId) return { node, container: nodes, index };
    const child = locateNode(node.children, nodeId);
    if (child) return child;
  }
  return null;
}

function rewriteNodeIds(node, rootId) {
  const oldRoot = node.nodeId;
  walkNodes([node], (child) => {
    child.nodeId = child.nodeId === oldRoot ? rootId : rootId + "-" + randomUUID().slice(0, 8);
  });
}

function applyHtmlOperation(html, patch) {
  if (patch.type === "replaceText") {
    const replacement = escapeHtml(patch.value);
    const result = replaceEditableInnerHtml(html, patch.editId, replacement);
    return {
      html: result.html,
      inverse: {
        type: "replaceInnerHtml",
        editId: patch.editId,
        value: result.previous
      }
    };
  }
  if (patch.type === "replaceInnerHtml") {
    const result = replaceEditableInnerHtml(html, patch.editId, patch.value);
    return { html: result.html, inverse: null };
  }
  if (patch.type === "replaceImage") {
    if (!/^data:image\/(?:png|jpeg|gif|webp|svg\+xml);base64,[a-z0-9+/=]+$/i.test(patch.value)) {
      throw new Error("replacement image must be an embedded data URL");
    }
    const result = replaceTaggedAttribute(
      html,
      "data-image-id",
      patch.imageId,
      "src",
      patch.value
    );
    return {
      html: result.html,
      inverse: {
        type: "replaceImage",
        imageId: patch.imageId,
        value: result.previous
      }
    };
  }
  if (patch.type === "replaceChartData") {
    const replacement = JSON.stringify(patch.value)
      .replaceAll("&", "\\u0026")
      .replaceAll("<", "\\u003c")
      .replaceAll(">", "\\u003e");
    const result = replaceChartJson(html, patch.chartId, replacement);
    return {
      html: result.html,
      inverse: {
        type: "replaceChartJson",
        chartId: patch.chartId,
        value: result.previous
      }
    };
  }
  if (patch.type === "replaceChartJson") {
    const result = replaceChartJson(html, patch.chartId, patch.value);
    return { html: result.html, inverse: null };
  }
  if (patch.type === "moveBlock") {
    const result = moveBlock(html, patch.blockId, patch.direction);
    return {
      html: result,
      inverse: {
        type: "moveBlock",
        blockId: patch.blockId,
        direction: patch.direction === "up" ? "down" : "up"
      }
    };
  }
  if (patch.type === "deleteBlock") {
    const block = findBlocks(html).find((item) => item.id === patch.blockId);
    if (!block) {
      throw new Error('unknown data-block-id "' + patch.blockId + '"');
    }
    return {
      html: html.slice(0, block.index) + html.slice(block.end),
      inverse: {
        type: "restoreBlock",
        index: block.index,
        value: block.value
      }
    };
  }
  if (patch.type === "restoreBlock") {
    return {
      html:
        html.slice(0, patch.index) +
        patch.value +
        html.slice(patch.index),
      inverse: null
    };
  }
  if (patch.type === "duplicateBlock") {
    if (
      !/^[a-z0-9._:-]+$/i.test(patch.newBlockId) ||
      !/^[a-z0-9._:-]+$/i.test(patch.idSuffix)
    ) {
      throw new Error("duplicate block identities contain invalid characters");
    }
    const blocks = findBlocks(html);
    const block = blocks.find((item) => item.id === patch.blockId);
    if (!block) {
      throw new Error('unknown data-block-id "' + patch.blockId + '"');
    }
    if (blocks.some((item) => item.id === patch.newBlockId)) {
      throw new Error('duplicate data-block-id "' + patch.newBlockId + '"');
    }
    let clone = block.value.replace(
      /\bdata-block-id\s*=\s*(["'])([^"']+)\1/gi,
      (_, quote, value) =>
        'data-block-id=' +
        quote +
        (value === patch.blockId
          ? patch.newBlockId
          : value + patch.idSuffix) +
        quote
    );
    clone = clone.replace(
      /\b(data-edit-id|data-image-id|data-chart-id|data-chart-data-for)\s*=\s*(["'])([^"']+)\2/gi,
      (_, attribute, quote, value) =>
        attribute + "=" + quote + value + patch.idSuffix + quote
    );
    return {
      html: html.slice(0, block.end) + clone + html.slice(block.end),
      inverse: {
        type: "deleteBlock",
        blockId: patch.newBlockId
      }
    };
  }
  throw new Error('unsupported patch type "' + patch.type + '"');
}

function moveBlock(html, blockId, direction) {
  if (direction !== "up" && direction !== "down") {
    throw new Error('invalid block direction "' + direction + '"');
  }
  const blocks = findBlocks(html);
  const index = blocks.findIndex((block) => block.id === blockId);
  if (index === -1) throw new Error('unknown data-block-id "' + blockId + '"');
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= blocks.length) {
    throw new Error('block "' + blockId + '" cannot move ' + direction);
  }
  const first = blocks[Math.min(index, swapIndex)];
  const second = blocks[Math.max(index, swapIndex)];
  const between = html.slice(first.end, second.index);
  return (
    html.slice(0, first.index) +
    second.value +
    between +
    first.value +
    html.slice(second.end)
  );
}

function findBlocks(html) {
  const pattern =
    /<(section|article)\b[^>]*\bdata-block-id\s*=\s*["']([^"']+)["'][^>]*>[\s\S]*?<\/\1>/gi;
  return [...html.matchAll(pattern)].map((match) => ({
    id: match[2],
    index: match.index,
    end: match.index + match[0].length,
    value: match[0]
  }));
}

function replaceChartJson(html, chartId, replacement) {
  const escapedId = escapeRegex(chartId);
  const pattern = new RegExp(
    "(<script\\b[^>]*\\bdata-chart-data-for\\s*=\\s*[\"']" +
      escapedId +
      "[\"'][^>]*>)([\\s\\S]*?)(<\\/script>)",
    "i"
  );
  const match = html.match(pattern);
  if (!match) throw new Error('unknown chart data "' + chartId + '"');
  return {
    previous: match[2],
    html: html.replace(pattern, "$1" + replacement + "$3")
  };
}

function replaceTaggedAttribute(html, idAttribute, id, attribute, value) {
  const escapedId = escapeRegex(id);
  const tagPattern = new RegExp(
    "<[a-z][^>]*\\b" +
      idAttribute +
      "\\s*=\\s*[\"']" +
      escapedId +
      "[\"'][^>]*>",
    "i"
  );
  const tag = html.match(tagPattern)?.[0];
  if (!tag) throw new Error('unknown ' + idAttribute + ' "' + id + '"');
  const attributePattern = new RegExp(
    "(\\b" + attribute + "\\s*=\\s*[\"'])([^\"']*)([\"'])",
    "i"
  );
  const attributeMatch = tag.match(attributePattern);
  if (!attributeMatch) {
    throw new Error('missing ' + attribute + ' on "' + id + '"');
  }
  const updatedTag = tag.replace(
    attributePattern,
    "$1" + value + "$3"
  );
  return {
    previous: attributeMatch[2],
    html: html.replace(tag, updatedTag)
  };
}

function replaceEditableInnerHtml(html, editId, replacement) {
  const escapedId = escapeRegex(editId);
  const pattern = new RegExp(
    "(<([a-z][\\w-]*)\\b[^>]*\\bdata-edit-id\\s*=\\s*[\"']" +
      escapedId +
      "[\"'][^>]*>)([\\s\\S]*?)(<\\/\\2>)",
    "i"
  );
  const match = html.match(pattern);
  if (!match) throw new Error('unknown edit id "' + editId + '"');
  return {
    previous: match[3],
    html: html.replace(pattern, "$1" + replacement + "$4")
  };
}

function escapeRegex(value) {
  return value.replace(/[\^$.*+?()[\]{}|]/g, "\\$&");
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

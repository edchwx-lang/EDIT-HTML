import { readFile } from "node:fs/promises";
import path from "node:path";

import { writeJsonAtomic, writeTextAtomic } from "./project.js";

export async function applyDraftPatch(projectDir, variantId, patch) {
  const paths = draftPaths(projectDir, variantId);
  const html = await readFile(paths.artifact, "utf8");
  const result = applyOperation(html, patch);
  const state = await readDraftState(paths);
  const patches = state.patches.slice(0, state.cursor);
  patches.push({
    forward: patch,
    inverse: result.inverse
  });
  await writeTextAtomic(paths.artifact, result.html);
  await writeDraftState(paths, { patches, cursor: patches.length });
}

export async function undoDraft(projectDir, variantId) {
  const paths = draftPaths(projectDir, variantId);
  const state = await readDraftState(paths);
  if (state.cursor === 0) return false;
  const patch = state.patches[state.cursor - 1];
  const html = await readFile(paths.artifact, "utf8");
  const updated = applyOperation(html, patch.inverse).html;
  await writeTextAtomic(paths.artifact, updated);
  await writeDraftCursor(paths, state.cursor - 1);
  return true;
}

export async function redoDraft(projectDir, variantId) {
  const paths = draftPaths(projectDir, variantId);
  const state = await readDraftState(paths);
  if (state.cursor === state.patches.length) return false;
  const patch = state.patches[state.cursor];
  const html = await readFile(paths.artifact, "utf8");
  const updated = applyOperation(html, patch.forward).html;
  await writeTextAtomic(paths.artifact, updated);
  await writeDraftCursor(paths, state.cursor + 1);
  return true;
}

function draftPaths(projectDir, variantId) {
  const variantDir = path.join(projectDir, "variants", variantId);
  return {
    artifact: path.join(variantDir, "artifact.html"),
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
  await writeJsonAtomic(paths.cursor, { schemaVersion: 1, cursor });
}

function applyOperation(html, patch) {
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

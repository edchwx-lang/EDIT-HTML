import { readFile } from "node:fs/promises";
import path from "node:path";

import { writeJsonAtomic, writeTextAtomic } from "./project.js";

export async function applyDraftPatch(projectDir, variantId, patch) {
  if (patch.type !== "replaceText") {
    throw new Error('unsupported patch type "' + patch.type + '"');
  }
  const paths = draftPaths(projectDir, variantId);
  const html = await readFile(paths.artifact, "utf8");
  const replacement = escapeHtml(patch.value);
  const result = replaceEditableInnerHtml(html, patch.editId, replacement);
  const state = await readDraftState(paths);
  const patches = state.patches.slice(0, state.cursor);
  patches.push({
    type: patch.type,
    editId: patch.editId,
    before: result.previous,
    after: replacement
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
  const updated = replaceEditableInnerHtml(
    html,
    patch.editId,
    patch.before
  ).html;
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
  const updated = replaceEditableInnerHtml(
    html,
    patch.editId,
    patch.after
  ).html;
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

function replaceEditableInnerHtml(html, editId, replacement) {
  const escapedId = editId.replace(/[\^$.*+?()[\]{}|]/g, "\\$&");
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

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

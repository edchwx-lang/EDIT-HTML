import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ARTIFACT_CONTRACT_VERSION,
  EDITOR_RUNTIME_VERSION,
  PIPELINE_VERSION,
  SUPPORTED_ARTIFACT_CONTRACT_VERSIONS,
  TOOL_VERSION
} from "../src/version-manifest.js";
import { renderEditorShell } from "../src/editor-shell.js";
import { listThemes } from "../src/themes.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("V5.4.0 keeps V5.3.2 behavior and hardens cross-agent and cross-OS compatibility", async () => {
  assert.equal(TOOL_VERSION, "5.4.0");
  assert.equal(PIPELINE_VERSION, "5.4.0");
  assert.equal(ARTIFACT_CONTRACT_VERSION, "5.4.0");
  assert.equal(EDITOR_RUNTIME_VERSION, "5.4.0");
  assert.equal(SUPPORTED_ARTIFACT_CONTRACT_VERSIONS.has("5.4.0"), true);
  assert.equal(SUPPORTED_ARTIFACT_CONTRACT_VERSIONS.has("5.3.2"), true);
  assert.equal(SUPPORTED_ARTIFACT_CONTRACT_VERSIONS.has("5.3.0"), true);
  assert.equal(SUPPORTED_ARTIFACT_CONTRACT_VERSIONS.has("5.2.1"), true);
  assert.equal(JSON.parse(await readFile(path.join(root, "package.json"), "utf8")).version, TOOL_VERSION);
});

test("editor shell displays the authoritative tool version", () => {
  const html = renderEditorShell({
    variant: { themeId: "precision-blueprint" },
    themes: listThemes({ locale: "zh-CN" })
  });

  assert.match(html, new RegExp(`<title>Edit HTML Report V${TOOL_VERSION.replaceAll(".", "\\.")}</title>`));
});

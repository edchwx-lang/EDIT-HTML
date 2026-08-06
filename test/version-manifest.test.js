import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ARTIFACT_CONTRACT_VERSION,
  EDITOR_RUNTIME_VERSION,
  PIPELINE_VERSION,
  TOOL_VERSION
} from "../src/version-manifest.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("V5.3 version fields come from one authority", async () => {
  assert.equal(TOOL_VERSION, "5.3.0");
  assert.equal(PIPELINE_VERSION, "5.3.0");
  assert.equal(ARTIFACT_CONTRACT_VERSION, "5.3.0");
  assert.equal(EDITOR_RUNTIME_VERSION, "5.3.0");
  assert.equal(JSON.parse(await readFile(path.join(root, "package.json"), "utf8")).version, TOOL_VERSION);
});

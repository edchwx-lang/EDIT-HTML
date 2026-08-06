import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { verifyEditorBoundary } from "../scripts/check-editor-boundary.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("V5.3 keeps the verified editor and post-artifact implementation byte-for-byte locked", async () => {
  const result = await verifyEditorBoundary(root);
  assert.equal(result.ok, true, result.mismatches.join("\n"));
  const lock = JSON.parse(await readFile(path.join(root, "editor-boundary.lock.json"), "utf8"));
  const manifestHash = createHash("sha256").update(await readFile(path.join(root, "src", "version-manifest.js"))).digest("hex");
  assert.equal(lock.files["src/version-manifest.js"], manifestHash);
  assert.ok(result.checked >= 15);
});

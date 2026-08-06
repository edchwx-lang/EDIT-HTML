import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { verifyEditorBoundary } from "../scripts/check-editor-boundary.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("V5.2.3 keeps the verified editor and post-artifact implementation byte-for-byte locked", async () => {
  const result = await verifyEditorBoundary(root);
  assert.equal(result.ok, true, result.mismatches.join("\n"));
  assert.ok(result.checked >= 12);
});

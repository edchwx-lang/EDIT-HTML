import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  confirmEditorReview,
  getEditorReviewState
} from "../src/editor-review.js";
import { finalizeVariant } from "../src/finalize.js";
import { createProject } from "../src/project.js";
import { renderVariant } from "../src/renderer.js";
import { updateVariantTheme } from "../src/variants.js";
import { createVariant } from "../src/variants.js";
import { completeTestHuashuDesign } from "./helpers/huashu.js";
import { applyDraftPatch, undoDraft } from "../src/drafts.js";

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "edit-html-review-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, "source.md");
  const project = path.join(root, "project");
  await writeFile(source, "# 判断\n2025年收入为42亿元。", "utf8");
  await createProject(source, project);
  const variant = await createVariant(project, { mode: "data-first" });
  await completeTestHuashuDesign(project, variant.variantId, { review: false });
  return { project, variant };
}

test("legacy review metadata remains readable but no longer gates finalize", async (t) => {
  const { project, variant } = await fixture(t);
  const awaiting = await getEditorReviewState(project, variant.variantId);
  assert.equal(awaiting.status, "awaiting-editor-review");
  const directVersion = await finalizeVariant(project, variant.variantId);
  assert.equal("reviewConfirmation" in directVersion, false);
  const confirmed = await confirmEditorReview(project, variant.variantId, {
    sessionId: "visible-editor-session"
  });
  assert.equal(confirmed.status, "confirmed");
  assert.match(confirmed.artifactSha256, /^[0-9a-f]{64}$/);
  assert.match(confirmed.designPackageSha256, /^[0-9a-f]{64}$/);
  assert.equal(confirmed.themeId, "deep-data-blue");
  assert.equal(confirmed.sessionId, "visible-editor-session");
  const version = await finalizeVariant(project, variant.variantId);
  assert.equal("reviewConfirmation" in version, false);
});

test("theme changes and rerenders keep legacy review metadata informational", async (t) => {
  const { project, variant } = await fixture(t);
  await confirmEditorReview(project, variant.variantId, { sessionId: "session-one" });
  await updateVariantTheme(project, variant.variantId, "signal-orange", { source: "editor" });
  assert.equal((await getEditorReviewState(project, variant.variantId)).status, "awaiting-editor-review");
  assert.equal((await finalizeVariant(project, variant.variantId)).themeId, "signal-orange");

  await confirmEditorReview(project, variant.variantId, { sessionId: "session-two" });
  await renderVariant(project, variant.variantId);
  assert.equal((await getEditorReviewState(project, variant.variantId)).status, "awaiting-editor-review");
  assert.equal((await finalizeVariant(project, variant.variantId)).variantId, variant.variantId);
});

test("artifact drift does not create a second save authorization gate", async (t) => {
  const { project, variant } = await fixture(t);
  await confirmEditorReview(project, variant.variantId, { sessionId: "session-three" });
  const artifactPath = path.join(project, "variants", variant.variantId, "artifact.html");
  await writeFile(artifactPath, (await readFile(artifactPath, "utf8")).replace("</body>", "<!-- drift --></body>"), "utf8");
  assert.equal((await finalizeVariant(project, variant.variantId)).variantId, variant.variantId);
});

test("legacy HTML draft edits and undo also invalidate confirmation", async (t) => {
  const { project, variant } = await fixture(t);
  await confirmEditorReview(project, variant.variantId, { sessionId: "session-html" });
  const artifact = await readFile(path.join(project, "variants", variant.variantId, "artifact.html"), "utf8");
  const editId = artifact.match(/data-edit-id="([^"]+)"/)[1];
  await applyDraftPatch(project, variant.variantId, {
    type: "replaceText",
    editId,
    value: "changed title"
  });
  assert.equal((await getEditorReviewState(project, variant.variantId)).status, "awaiting-editor-review");
  await confirmEditorReview(project, variant.variantId, { sessionId: "session-html-two" });
  await undoDraft(project, variant.variantId);
  assert.equal((await getEditorReviewState(project, variant.variantId)).status, "awaiting-editor-review");
});

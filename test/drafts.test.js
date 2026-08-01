import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { applyDraftPatch, redoDraft, undoDraft } from "../src/drafts.js";
import { createProject } from "../src/project.js";
import { createVariant } from "../src/variants.js";

async function editableVariant(t) {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-report-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const source = path.join(sandbox, "brief.txt");
  const projectDir = path.join(sandbox, "report");
  await writeFile(source, "Evidence.", "utf8");
  await createProject(source, projectDir);
  const variant = await createVariant(projectDir, {
    mode: "evidence-first",
    theme: "editorial-light"
  });
  const artifactPath = path.join(
    projectDir,
    "variants",
    variant.variantId,
    "artifact.html"
  );
  await writeFile(
    artifactPath,
    '<!doctype html><h1 data-edit-id="title">Old &amp; clear</h1>',
    "utf8"
  );
  return { projectDir, variant, artifactPath };
}

test("draft text patches escape HTML and support undo and redo", async (t) => {
  const { projectDir, variant, artifactPath } = await editableVariant(t);

  await applyDraftPatch(projectDir, variant.variantId, {
    type: "replaceText",
    editId: "title",
    value: "New <evidence>"
  });
  assert.equal(
    await readFile(artifactPath, "utf8"),
    '<!doctype html><h1 data-edit-id="title">New &lt;evidence&gt;</h1>'
  );

  await undoDraft(projectDir, variant.variantId);
  assert.equal(
    await readFile(artifactPath, "utf8"),
    '<!doctype html><h1 data-edit-id="title">Old &amp; clear</h1>'
  );

  await redoDraft(projectDir, variant.variantId);
  assert.equal(
    await readFile(artifactPath, "utf8"),
    '<!doctype html><h1 data-edit-id="title">New &lt;evidence&gt;</h1>'
  );
});

test("draft image patches accept embedded images and remain undoable", async (t) => {
  const { projectDir, variant, artifactPath } = await editableVariant(t);
  await writeFile(
    artifactPath,
    '<!doctype html><img data-image-id="hero" src="data:image/png;base64,b2xk">',
    "utf8"
  );

  await applyDraftPatch(projectDir, variant.variantId, {
    type: "replaceImage",
    imageId: "hero",
    value: "data:image/jpeg;base64,bmV3"
  });
  assert.match(
    await readFile(artifactPath, "utf8"),
    /src="data:image\/jpeg;base64,bmV3"/
  );
  await undoDraft(projectDir, variant.variantId);
  assert.match(
    await readFile(artifactPath, "utf8"),
    /src="data:image\/png;base64,b2xk"/
  );
});

test("draft chart patches replace embedded JSON data and remain undoable", async (t) => {
  const { projectDir, variant, artifactPath } = await editableVariant(t);
  await writeFile(
    artifactPath,
    '<!doctype html><div data-chart-id="sales"></div>' +
      '<script type="application/json" data-chart-data-for="sales">{"labels":["A"],"values":[1]}</script>',
    "utf8"
  );

  await applyDraftPatch(projectDir, variant.variantId, {
    type: "replaceChartData",
    chartId: "sales",
    value: { labels: ["B"], values: [42] }
  });
  assert.match(
    await readFile(artifactPath, "utf8"),
    />\{"labels":\["B"\],"values":\[42\]\}<\/script>/
  );
  await undoDraft(projectDir, variant.variantId);
  assert.match(
    await readFile(artifactPath, "utf8"),
    />\{"labels":\["A"\],"values":\[1\]\}<\/script>/
  );
});

test("draft block patches reorder sections and remain undoable", async (t) => {
  const { projectDir, variant, artifactPath } = await editableVariant(t);
  await writeFile(
    artifactPath,
    '<!doctype html><main><section data-block-id="first">First</section>' +
      '<section data-block-id="second">Second</section></main>',
    "utf8"
  );

  await applyDraftPatch(projectDir, variant.variantId, {
    type: "moveBlock",
    blockId: "second",
    direction: "up"
  });
  assert.match(
    await readFile(artifactPath, "utf8"),
    /data-block-id="second">Second<\/section><section data-block-id="first"/
  );
  await undoDraft(projectDir, variant.variantId);
  assert.match(
    await readFile(artifactPath, "utf8"),
    /data-block-id="first">First<\/section><section data-block-id="second"/
  );
});

test("draft block patches delete and restore sections", async (t) => {
  const { projectDir, variant, artifactPath } = await editableVariant(t);
  await writeFile(
    artifactPath,
    '<!doctype html><main><section data-block-id="first">First</section>' +
      '<section data-block-id="second">Second</section></main>',
    "utf8"
  );

  await applyDraftPatch(projectDir, variant.variantId, {
    type: "deleteBlock",
    blockId: "first"
  });
  assert.doesNotMatch(await readFile(artifactPath, "utf8"), /First/);
  await undoDraft(projectDir, variant.variantId);
  assert.match(
    await readFile(artifactPath, "utf8"),
    /data-block-id="first">First<\/section>/
  );
});

test("draft block patches duplicate sections with unique nested identities", async (t) => {
  const { projectDir, variant, artifactPath } = await editableVariant(t);
  await writeFile(
    artifactPath,
    '<!doctype html><main><section data-block-id="first">' +
      '<h2 data-edit-id="heading">First</h2></section></main>',
    "utf8"
  );

  await applyDraftPatch(projectDir, variant.variantId, {
    type: "duplicateBlock",
    blockId: "first",
    newBlockId: "first-copy",
    idSuffix: "-copy"
  });
  const duplicated = await readFile(artifactPath, "utf8");
  assert.match(duplicated, /data-block-id="first-copy"/);
  assert.match(duplicated, /data-edit-id="heading-copy"/);
  await undoDraft(projectDir, variant.variantId);
  assert.doesNotMatch(await readFile(artifactPath, "utf8"), /first-copy/);
});

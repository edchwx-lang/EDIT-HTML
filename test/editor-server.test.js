import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { startEditorServer } from "../src/editor-server.js";
import { createProject } from "../src/project.js";
import { createVariant } from "../src/variants.js";

async function editorFixture(t) {
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
    '<!doctype html><h1 data-edit-id="title">Old</h1>',
    "utf8"
  );
  return { projectDir, variant, artifactPath };
}

test("editor server binds to loopback and rejects requests without its token", async (t) => {
  const { projectDir, variant } = await editorFixture(t);
  const editor = await startEditorServer({
    projectDir,
    variantId: variant.variantId
  });
  t.after(() => editor.close());

  assert.equal(editor.host, "127.0.0.1");
  assert.equal((await fetch(editor.url + "/api/artifact")).status, 401);
  assert.equal(
    (
      await fetch(editor.url + "/api/artifact", {
        headers: { authorization: "Bearer " + editor.token }
      })
    ).status,
    200
  );
});

test("editor server applies an authenticated text patch", async (t) => {
  const { projectDir, variant, artifactPath } = await editorFixture(t);
  const editor = await startEditorServer({
    projectDir,
    variantId: variant.variantId
  });
  t.after(() => editor.close());

  const response = await fetch(editor.url + "/api/draft", {
    method: "PATCH",
    headers: {
      authorization: "Bearer " + editor.token,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      type: "replaceText",
      editId: "title",
      value: "New"
    })
  });

  assert.equal(response.status, 200);
  assert.equal(
    await readFile(artifactPath, "utf8"),
    '<!doctype html><h1 data-edit-id="title">New</h1>'
  );
});

test("editor root renders a full-viewport toolbar without a sidebar", async (t) => {
  const { projectDir, variant } = await editorFixture(t);
  const editor = await startEditorServer({
    projectDir,
    variantId: variant.variantId
  });
  t.after(() => editor.close());

  const response = await fetch(editor.url + "/?token=" + editor.token);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /data-action="undo">Undo<\/button>/);
  assert.match(html, /data-action="redo">Redo<\/button>/);
  assert.match(html, /data-action="save">Save version<\/button>/);
  assert.match(html, /data-action="theme"[^>]*>Theme<\/button>/);
  assert.match(html, /data-action="publish">Publish<\/button>/);
  assert.doesNotMatch(html, /sidebar/i);
});

test("editor API exposes undo, redo, and saved-version actions", async (t) => {
  const { projectDir, variant, artifactPath } = await editorFixture(t);
  const editor = await startEditorServer({
    projectDir,
    variantId: variant.variantId
  });
  t.after(() => editor.close());
  const headers = {
    authorization: "Bearer " + editor.token,
    "content-type": "application/json"
  };
  await fetch(editor.url + "/api/draft", {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      type: "replaceText",
      editId: "title",
      value: "New"
    })
  });

  assert.equal(
    (
      await fetch(editor.url + "/api/undo", {
        method: "POST",
        headers,
        body: "{}"
      })
    ).status,
    200
  );
  assert.match(await readFile(artifactPath, "utf8"), />Old<\/h1>/);
  await fetch(editor.url + "/api/redo", {
    method: "POST",
    headers,
    body: "{}"
  });
  assert.match(await readFile(artifactPath, "utf8"), />New<\/h1>/);

  const saved = await fetch(editor.url + "/api/versions", {
    method: "POST",
    headers,
    body: JSON.stringify({ message: "Editor save" })
  });
  assert.equal(saved.status, 201);
  assert.equal((await saved.json()).message, "Editor save");
});

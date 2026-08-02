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
    '<!doctype html><body data-report-mode="evidence-first"><h1 data-edit-id="title">Old</h1></body>',
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
    '<!doctype html><body data-report-mode="evidence-first"><h1 data-edit-id="title">New</h1></body>'
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
  assert.match(html, /data-action="undo">撤销<\/button>/);
  assert.match(html, /data-action="redo">重做<\/button>/);
  assert.match(html, /data-action="save">保存版本<\/button>/);
  assert.match(html, /data-theme-id="warm-paper-terracotta"/);
  assert.match(html, /data-theme-id="signal-orange"/);
  assert.match(html, /浅色配色/);
  assert.match(html, /深色配色/);
  assert.match(html, /data-action="publish"[^>]*disabled[^>]*>发布<\/button>/);
  assert.match(html, /data-action="image">替换图片<\/button>/);
  assert.match(html, /data-action="chart">编辑图表数据<\/button>/);
  assert.match(html, /data-action="block-up">上移<\/button>/);
  assert.match(html, /data-action="block-down">下移<\/button>/);
  assert.match(html, /data-action="block-copy">复制<\/button>/);
  assert.match(html, /data-action="block-delete">删除<\/button>/);
  assert.match(html, /node\.addEventListener\('blur',async\(\)=>/);
  assert.doesNotMatch(html, /status\('Draft saved'\);\s*},\{once:true\}/);
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
  const version = await saved.json();
  assert.equal(version.message, "Editor save");

  const history = await fetch(editor.url + "/api/versions", { headers });
  assert.equal(history.status, 200);
  assert.equal((await history.json())[0].versionId, version.versionId);

  const published = await fetch(
    editor.url + "/api/publish?version=" + version.versionId,
    { headers }
  );
  assert.equal(published.status, 200);
  assert.match(
    published.headers.get("content-disposition"),
    /attachment; filename="report-/
  );
  assert.match(await published.text(), />New<\/h1>/);
});

test("editor API lists six themes and compiles preview without changing draft HTML", async (t) => {
  const { projectDir, variant, artifactPath } = await editorFixture(t);
  await writeFile(
    artifactPath,
    '<!doctype html><html><body data-report-mode="evidence-first"><h1 data-edit-id="title">Old</h1></body></html>',
    "utf8"
  );
  const before = await readFile(artifactPath, "utf8");
  const editor = await startEditorServer({
    projectDir,
    variantId: variant.variantId
  });
  t.after(() => editor.close());

  const headers = {
    authorization: "Bearer " + editor.token,
    "content-type": "application/json"
  };
  const themesResponse = await fetch(editor.url + "/api/themes", { headers });
  assert.equal(themesResponse.status, 200);
  const themes = await themesResponse.json();
  assert.equal(themes.length, 6);
  assert.deepEqual(
    themes.map((theme) => theme.label),
    ["暖纸赤陶", "研究钴蓝", "砂岩档案", "线性靛蓝", "海军蓝金", "黑场信号橙"]
  );

  const response = await fetch(editor.url + "/api/theme", {
    method: "POST",
    headers,
    body: JSON.stringify({ themeId: "signal-orange" })
  });

  assert.equal(response.status, 200);
  assert.equal((await response.json()).themeId, "signal-orange");
  assert.equal(await readFile(artifactPath, "utf8"), before);
  const preview = await (
    await fetch(editor.url + "/api/artifact", { headers })
  ).text();
  assert.match(preview, /data-theme="signal-orange"/);
  assert.match(preview, /--report-accent:#FF6900/);
});

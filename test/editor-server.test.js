import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { startEditorServer } from "../src/editor-server.js";
import { createProject } from "../src/project.js";
import { createVariant } from "../src/variants.js";
import { completeTestHuashuDesign } from "./helpers/huashu.js";

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
  await completeTestHuashuDesign(projectDir, variant.variantId, { render: false });
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

async function confirmReview(editor, headers) {
  const response = await fetch(editor.url + "/api/review", {
    method: "POST",
    headers,
    body: "{}"
  });
  assert.equal(response.status, 200);
  return response.json();
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

test("editor root renders mode-aware controls, contextual actions, and history drawers", async (t) => {
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
  assert.doesNotMatch(html, /data-action="redo"/);
  assert.match(html, /data-action="save"[^>]*>保存版本<\/button>/);
  assert.match(html, /data-theme-id="warm-paper-terracotta"/);
  assert.match(html, /data-theme-id="signal-orange"/);
  assert.match(html, /浅色配色/);
  assert.match(html, /深色配色/);
  assert.match(html, /data-action="publish"[^>]*disabled[^>]*>发布<\/button>/);
  assert.doesNotMatch(html, /data-action="publications"/);
  assert.match(html, /data-context-action="replace-image">替换图片<\/button>/);
  assert.match(html, /data-context-action="edit-chart">编辑数据<\/button>/);
  assert.match(html, /data-context-action="move-up">上移<\/button>/);
  assert.match(html, /data-context-action="move-down">下移<\/button>/);
  assert.match(html, /data-context-action="clone">复制<\/button>/);
  assert.match(html, /data-context-action="delete">删除<\/button>/);
  assert.match(html, /editButton\.textContent=editing\?'完成':'编辑'/);
  assert.match(html, /class="drawer" data-drawer="versions"/);
  assert.match(html, /class="drawer" data-drawer="publish"/);
  assert.match(html, /data-version-local-publish=/);
  assert.match(html, /data-version-domain-publish=/);
  assert.match(html, /data-version-reveal-local=/);
  assert.match(html, /data-version-delete=/);
  assert.doesNotMatch(html, /data-version-open=/);
  assert.doesNotMatch(html, /data-version-copy=/);
  assert.doesNotMatch(html, /data-publish-target="local"/);
  assert.doesNotMatch(html, /data-publish-target="vercel"/);
  assert.doesNotMatch(html, /data-publish-target="netlify"/);
  assert.match(html, /applyPatchToLiveDocument/);
  assert.match(html, /preserveViewport/);
  assert.doesNotMatch(html, /Promise\.all\(\[loadArtifact\(\),syncState\(\)\]\)/);
  assert.match(html, /class="dialog" data-dialog="chart"/);
  assert.doesNotMatch(html, /prompt\('编辑图表 JSON'/);
  assert.doesNotMatch(html, /status\('Draft saved'\);\s*},\{once:true\}/);
  assert.doesNotMatch(html, /sidebar/i);
});

test("editor omits the redundant confirmation control and enables direct version saving", async (t) => {
  const { projectDir, variant } = await editorFixture(t);
  const editor = await startEditorServer({ projectDir, variantId: variant.variantId });
  t.after(() => editor.close());
  const root = await (await fetch(editor.url + "/?token=" + encodeURIComponent(editor.token))).text();
  assert.doesNotMatch(root, /data-action="confirm-review"/);
  assert.doesNotMatch(root, /确认设计与配色/);
  assert.doesNotMatch(root, /data-action="save" disabled/);
});

test("editor API exposes saved version artifact path and deletes saved version files", async (t) => {
  const { projectDir, variant } = await editorFixture(t);
  const editor = await startEditorServer({
    projectDir,
    variantId: variant.variantId
  });
  t.after(() => editor.close());
  const headers = { authorization: "Bearer " + editor.token, "content-type": "application/json" };
  await confirmReview(editor, headers);
  const saved = await fetch(editor.url + "/api/versions", {
    method: "POST",
    headers,
    body: JSON.stringify({ message: "Version path" })
  });
  assert.equal(saved.status, 201);
  const version = await saved.json();

  const artifact = await fetch(editor.url + "/api/versions/" + version.versionId + "/artifact", { headers });
  const artifactBody = await artifact.text();
  assert.equal(artifact.status, 200, artifactBody);
  assert.match(artifactBody, />Old<\/h1>/);

  const pathResponse = await fetch(editor.url + "/api/versions/" + version.versionId + "/path", { headers });
  const pathBodyText = await pathResponse.text();
  assert.equal(pathResponse.status, 200, pathBodyText);
  const pathBody = JSON.parse(pathBodyText);
  assert.equal(pathBody.versionId, version.versionId);
  assert.match(pathBody.artifactPath, new RegExp("versions[\\\\/]" + version.versionId + "[\\\\/]artifact\\.html$"));

  const deleted = await fetch(editor.url + "/api/versions/" + version.versionId, {
    method: "DELETE",
    headers
  });
  assert.equal(deleted.status, 200, await deleted.text());
  await assert.rejects(readFile(pathBody.artifactPath, "utf8"), /ENOENT/);
  const versions = await (await fetch(editor.url + "/api/versions", { headers })).json();
  assert.equal(versions.some((item) => item.versionId === version.versionId), false);
});

test("editor API reveals the latest local publication for a saved version", async (t) => {
  const { projectDir, variant } = await editorFixture(t);
  const revealed = [];
  const editor = await startEditorServer({
    projectDir,
    variantId: variant.variantId,
    onReveal: async (targetPath) => revealed.push(targetPath)
  });
  t.after(() => editor.close());
  const headers = { authorization: "Bearer " + editor.token, "content-type": "application/json" };
  await confirmReview(editor, headers);
  const version = await (await fetch(editor.url + "/api/versions", {
    method: "POST",
    headers,
    body: JSON.stringify({ message: "Local publish" })
  })).json();

  const missing = await fetch(editor.url + "/api/versions/" + version.versionId + "/reveal-local", {
    method: "POST",
    headers,
    body: "{}"
  });
  assert.equal(missing.status, 400);
  assert.match(await missing.text(), /local publication/);

  const published = await fetch(editor.url + "/api/publish", {
    method: "POST",
    headers,
    body: JSON.stringify({ versionId: version.versionId, target: "local" })
  });
  const publishedBody = await published.text();
  assert.equal(published.status, 201, publishedBody);
  const publication = JSON.parse(publishedBody);

  const reveal = await fetch(editor.url + "/api/versions/" + version.versionId + "/reveal-local", {
    method: "POST",
    headers,
    body: "{}"
  });
  const revealText = await reveal.text();
  assert.equal(reveal.status, 200, revealText);
  assert.equal(revealed.length, 1);
  assert.match(revealed[0], new RegExp("publications[\\\\/]" + publication.publicationId + "[\\\\/]report\\.html$"));
  const revealBody = JSON.parse(revealText);
  assert.match(revealBody.targetPath, new RegExp("publications[\\\\/]" + publication.publicationId + "[\\\\/]report\\.html$"));
  assert.match(revealBody.directoryPath, new RegExp("publications[\\\\/]" + publication.publicationId + "$"));
});

test("editor reveal endpoint rejects a missing report without invoking the OS runner", async (t) => {
  const { projectDir, variant } = await editorFixture(t);
  const revealed = [];
  const editor = await startEditorServer({
    projectDir,
    variantId: variant.variantId,
    onReveal: async (targetPath) => revealed.push(targetPath)
  });
  t.after(() => editor.close());
  const headers = { authorization: "Bearer " + editor.token, "content-type": "application/json" };
  await confirmReview(editor, headers);
  const version = await (await fetch(editor.url + "/api/versions", {
    method: "POST", headers, body: JSON.stringify({ message: "Missing report" })
  })).json();
  const publication = await (await fetch(editor.url + "/api/publish", {
    method: "POST", headers, body: JSON.stringify({ versionId: version.versionId, target: "local" })
  })).json();
  await rm(path.join(projectDir, "publications", publication.publicationId, "report.html"));

  const response = await fetch(editor.url + "/api/publications/" + publication.publicationId + "/reveal", {
    method: "POST", headers, body: "{}"
  });
  const body = await response.text();
  assert.equal(response.status, 400, body);
  assert.match(body, /ENOENT/);
  assert.deepEqual(revealed, []);
});

test("editor reveal endpoint returns an error when the OS runner fails", async (t) => {
  const { projectDir, variant } = await editorFixture(t);
  const editor = await startEditorServer({
    projectDir,
    variantId: variant.variantId,
    onReveal: async () => { throw new Error("Explorer unavailable"); }
  });
  t.after(() => editor.close());
  const headers = { authorization: "Bearer " + editor.token, "content-type": "application/json" };
  await confirmReview(editor, headers);
  const version = await (await fetch(editor.url + "/api/versions", {
    method: "POST", headers, body: JSON.stringify({ message: "Runner error" })
  })).json();
  const publication = await (await fetch(editor.url + "/api/publish", {
    method: "POST", headers, body: JSON.stringify({ versionId: version.versionId, target: "local" })
  })).json();

  const response = await fetch(editor.url + "/api/publications/" + publication.publicationId + "/reveal", {
    method: "POST", headers, body: "{}"
  });
  const body = await response.text();
  assert.equal(response.status, 400, body);
  assert.match(body, /Explorer unavailable/);
});

test("editor API exposes health, canonical draft, revision conflict, preview, and restore", async (t) => {
  const { projectDir, variant } = await editorFixture(t);
  const editor = await startEditorServer({ projectDir, variantId: variant.variantId });
  t.after(() => editor.close());
  assert.equal((await fetch(editor.url + "/api/health")).status, 200);
  const headers = { authorization: "Bearer " + editor.token, "content-type": "application/json" };
  const draft = await (await fetch(editor.url + "/api/draft", { headers })).json();
  const nodeId = draft.nodes[0].children[0].nodeId;
  const changed = await fetch(editor.url + "/api/draft", {
    method: "PATCH", headers,
    body: JSON.stringify({ type: "setText", nodeId, value: "Model edit", baseRevision: draft.revision })
  });
  assert.equal(changed.status, 200);
  assert.equal((await changed.json()).revision, draft.revision + 1);
  const stale = await fetch(editor.url + "/api/draft", {
    method: "PATCH", headers,
    body: JSON.stringify({ type: "setText", nodeId, value: "Stale", baseRevision: draft.revision })
  });
  assert.equal(stale.status, 409);
  await confirmReview(editor, headers);
  const saved = await fetch(editor.url + "/api/versions", { method: "POST", headers, body: JSON.stringify({ message: "V4" }) });
  const version = await saved.json();
  const preview = await fetch(editor.url + "/api/versions/" + version.versionId + "/preview", { headers });
  assert.equal(preview.status, 200);
  assert.match(await preview.text(), /Model edit/);
  const restored = await fetch(editor.url + "/api/versions/" + version.versionId + "/restore", { method: "POST", headers, body: "{}" });
  assert.equal(restored.status, 201);
  assert.equal((await restored.json()).restoredFromVersionId, version.versionId);
});

test("editor API records, reveals, and republishes canonical publications", async (t) => {
  const { projectDir, variant } = await editorFixture(t);
  const revealed = [];
  const editor = await startEditorServer({
    projectDir,
    variantId: variant.variantId,
    onReveal: async (targetPath) => revealed.push(targetPath)
  });
  t.after(() => editor.close());
  const headers = { authorization: "Bearer " + editor.token, "content-type": "application/json" };
  await confirmReview(editor, headers);
  const saved = await fetch(editor.url + "/api/versions", { method: "POST", headers, body: JSON.stringify({ message: "Publish" }) });
  const version = await saved.json();
  const published = await fetch(editor.url + "/api/publish", {
    method: "POST", headers,
    body: JSON.stringify({ versionId: version.versionId, target: "local" })
  });
  assert.equal(published.status, 201);
  const publication = await published.json();
  assert.equal(publication.status, "published");
  const history = await (await fetch(editor.url + "/api/publications", { headers })).json();
  assert.equal(history[0].publicationId, publication.publicationId);
  const reveal = await fetch(editor.url + "/api/publications/" + publication.publicationId + "/reveal", {
    method: "POST", headers, body: "{}"
  });
  assert.equal(reveal.status, 200, await reveal.text());
  assert.equal(revealed.length, 1);
  assert.match(revealed[0], /publications[\\/][^\\/]+[\\/]report\.html$/);

  const republished = await fetch(editor.url + "/api/publications/" + publication.publicationId + "/republish", {
    method: "POST", headers, body: "{}"
  });
  const republishedBody = await republished.text();
  assert.equal(republished.status, 201, republishedBody);
  const republishedRecord = JSON.parse(republishedBody);
  assert.notEqual(republishedRecord.publicationId, publication.publicationId);
  assert.equal(republishedRecord.versionId, publication.versionId);
  const updatedHistory = await (await fetch(editor.url + "/api/publications", { headers })).json();
  assert.equal(updatedHistory.length, 2);
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
  const initialDraft = await (await fetch(editor.url + "/api/draft", { headers })).json();
  assert.equal(initialDraft.historyCursor, 0);
  assert.equal(initialDraft.historyLength, 0);
  await fetch(editor.url + "/api/draft", {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      type: "replaceText",
      editId: "title",
      value: "New"
    })
  });
  const changedDraft = await (await fetch(editor.url + "/api/draft", { headers })).json();
  assert.equal(changedDraft.historyCursor, 1);
  assert.equal(changedDraft.historyLength, 1);

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
  const undoneDraft = await (await fetch(editor.url + "/api/draft", { headers })).json();
  assert.equal(undoneDraft.historyCursor, 0);
  assert.equal(undoneDraft.historyLength, 1);
  await fetch(editor.url + "/api/redo", {
    method: "POST",
    headers,
    body: "{}"
  });
  assert.match(await readFile(artifactPath, "utf8"), />New<\/h1>/);

  await confirmReview(editor, headers);
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
    ["暖纸赤陶", "精密蓝图", "砂岩档案", "深海数据蓝", "海军蓝金", "黑场信号橙"]
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

test("saving a model-backed draft clears dirty state so the saved version can publish", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-report-model-save-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const source = path.join(sandbox, "brief.md");
  const projectDir = path.join(sandbox, "report");
  await writeFile(source, "# 市场\n规模 42 亿元\n\n| 地区 | 数值 |\n| --- | ---: |\n| 全球 | 10 |", "utf8");
  await createProject(source, projectDir);
  const variant = await createVariant(projectDir, { mode: "data-first" });
  await completeTestHuashuDesign(projectDir, variant.variantId);
  const editor = await startEditorServer({ projectDir, variantId: variant.variantId });
  t.after(() => editor.close());
  const headers = { authorization: "Bearer " + editor.token, "content-type": "application/json" };
  const draft = await (await fetch(editor.url + "/api/draft", { headers })).json();
  const dataset = draft.datasets.find((item) => item.kind === "table");
  const patched = await fetch(editor.url + "/api/draft", {
    method: "PATCH", headers,
    body: JSON.stringify({ type: "setDataCell", datasetId: dataset.datasetId, row: 0, column: 1, value: "99", baseRevision: draft.revision })
  });
  assert.equal(patched.status, 200, await patched.text());

  await confirmReview(editor, headers);
  const saved = await fetch(editor.url + "/api/versions", { method: "POST", headers, body: JSON.stringify({ message: "checkpoint" }) });
  assert.equal(saved.status, 201, await saved.text());
  const state = await (await fetch(editor.url + "/api/project", { headers })).json();
  assert.equal(state.dirty, false);
  assert.ok(state.latestVersionId);
});

import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { chromium } from "playwright";

import { startEditorServer } from "../src/editor-server.js";
import { createProject } from "../src/project.js";
import { createVariant } from "../src/variants.js";
import { completeTestHuashuDesign } from "./helpers/huashu.js";

async function editorFixture(t) {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-report-ui-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const source = path.join(sandbox, "brief.txt");
  const projectDir = path.join(sandbox, "report");
  await writeFile(source, "Evidence.", "utf8");
  await createProject(source, projectDir);
  const variant = await createVariant(projectDir, {
    mode: "evidence-first",
    theme: "precision-blueprint"
  });
  await completeTestHuashuDesign(projectDir, variant.variantId, { render: false });
  await writeFile(
    path.join(projectDir, "variants", variant.variantId, "artifact.html"),
    '<!doctype html><body data-report-mode="evidence-first"><h1 data-edit-id="title">Old</h1></body>',
    "utf8"
  );
  return { projectDir, variant };
}

test("publish center keeps domain provider choices hidden until domain publish is expanded", async (t) => {
  const { projectDir, variant } = await editorFixture(t);
  const editor = await startEditorServer({ projectDir, variantId: variant.variantId });
  t.after(() => editor.close());
  const headers = {
    authorization: "Bearer " + editor.token,
    "content-type": "application/json"
  };
  assert.equal(
    (await fetch(editor.url + "/api/review", { method: "POST", headers, body: "{}" })).status,
    200
  );
  assert.equal(
    (
      await fetch(editor.url + "/api/versions", {
        method: "POST",
        headers,
        body: JSON.stringify({ message: "Editor save" })
      })
    ).status,
    201
  );

  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  t.after(() => page.close());
  await page.goto(editor.url + "/?token=" + encodeURIComponent(editor.token));
  await page.locator('[data-action="publish"]').click();
  await page.locator("[data-domain-provider]").first().waitFor({ state: "attached" });

  assert.equal(await page.locator("[data-version-reveal-local]").first().textContent(), "本地文件夹打开");
  assert.equal(await page.getByText("资源管理器打开").count(), 0);
  assert.equal(await page.locator("[data-domain-provider]").count(), 3);
  assert.equal(await page.locator("[data-domain-provider]:visible").count(), 0);

  await page.locator("[data-version-domain-publish]").first().click();

  assert.equal(await page.locator("[data-domain-provider]:visible").count(), 3);
});

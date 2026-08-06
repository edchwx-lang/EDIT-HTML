import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertAuditPreservedHuashuOutput,
  freezeHuashuOutput,
  snapshotHuashuOutput,
  writeHuashuInputManifest
} from "../src/v5-stage-boundary.js";

async function boundaryFixture(t) {
  const projectDir = await mkdtemp(path.join(os.tmpdir(), "edit-html-v5-boundary-"));
  t.after(() => rm(projectDir, { recursive: true, force: true }));
  const variantId = "variant-one";
  const variantDir = path.join(projectDir, "variants", variantId);
  const inputDir = path.join(variantDir, "design", "huashu-input");
  const packageDir = path.join(variantDir, "design", "package");
  await Promise.all([
    mkdir(path.join(inputDir, "assets"), { recursive: true }),
    mkdir(path.join(packageDir, "styles"), { recursive: true }),
    mkdir(path.join(packageDir, "scripts"), { recursive: true }),
    mkdir(path.join(projectDir, ".runtime"), { recursive: true }),
    mkdir(path.join(projectDir, "publications"), { recursive: true })
  ]);
  await Promise.all([
    writeFile(path.join(inputDir, "readable-source.md"), "source", "utf8"),
    writeFile(path.join(inputDir, "fact-ledger.json"), "{}", "utf8"),
    writeFile(path.join(inputDir, "source-map.json"), "{}", "utf8"),
    writeFile(path.join(inputDir, "tables-and-datasets.json"), "{}", "utf8"),
    writeFile(path.join(inputDir, "asset-contact-sheet.html"), "<p>assets</p>", "utf8"),
    writeFile(path.join(inputDir, "extraction-warnings.json"), "{}", "utf8"),
    writeFile(path.join(inputDir, "assets", "reference.png"), "image", "utf8"),
    writeFile(path.join(inputDir, "interview.json"), JSON.stringify({ references: [{ kind: "file", value: "reference.png" }] }), "utf8"),
    writeFile(path.join(inputDir, "content-brief.json"), "{}", "utf8"),
    writeFile(path.join(projectDir, ".runtime", "editor.js"), "editor", "utf8"),
    writeFile(path.join(projectDir, "publications", "state.json"), "{}", "utf8"),
    writeFile(path.join(variantDir, "renderer-model.json"), "{}", "utf8"),
    writeFile(path.join(variantDir, "theme-output.css"), "body{}", "utf8")
  ]);
  const html = '<!doctype html><html><head><link rel="stylesheet" href="styles/site.css"></head><body><main class="grid"><h1>Evidence</h1><canvas id="chart"></canvas><script type="application/json" id="series">{"series":[1,2]}</script><button>Filter</button><script src="scripts/site.js"></script></main></body></html>';
  await Promise.all([
    writeFile(path.join(packageDir, "index.html"), html, "utf8"),
    writeFile(path.join(packageDir, "styles", "site.css"), ".grid{display:grid;font-family:serif}", "utf8"),
    writeFile(path.join(packageDir, "scripts", "site.js"), "document.querySelector('button').onclick=()=>1", "utf8"),
    writeFile(path.join(packageDir, "manifest.json"), JSON.stringify({ kind: "final" }), "utf8")
  ]);
  return { projectDir, variantId, inputDir, packageDir, html };
}

test("Huashu input receipt hashes only declared source, interview, brief, and visual-reference inputs", async (t) => {
  const { projectDir, variantId } = await boundaryFixture(t);
  const receipt = await writeHuashuInputManifest(projectDir, variantId);
  const paths = receipt.allowedInputs.map((item) => item.path);
  assert.ok(paths.includes("readable-source.md"));
  assert.ok(paths.includes("interview.json"));
  assert.ok(paths.includes("content-brief.json"));
  assert.ok(paths.includes("assets/reference.png"));
  assert.ok(paths.every((name) => !/renderer|editor|theme|publication/i.test(name)));
  assert.ok(receipt.allowedInputs.every((item) => /^[a-f0-9]{64}$/.test(item.sha256)));
  assert.deepEqual(receipt.allowedInputSha256, receipt.allowedInputs.map((item) => item.sha256));
  assert.equal(receipt.owner, "huashu-design");
  assert.equal(receipt.command, "design prepare");
  assert.ok(Number.isFinite(Date.parse(receipt.createdAt)));

  assert.deepEqual(await writeHuashuInputManifest(projectDir, variantId), receipt, "receipt is immutable and idempotent");
});

test("freezing final Huashu output persists a verifiable immutable receipt", async (t) => {
  const { projectDir, variantId, packageDir } = await boundaryFixture(t);
  const input = await writeHuashuInputManifest(projectDir, variantId);
  const receipt = await freezeHuashuOutput(projectDir, variantId, "final");
  assert.equal(receipt.stage, "huashu-final");
  assert.equal(receipt.owner, "huashu-design");
  assert.equal(receipt.command, "design final import");
  assert.deepEqual(receipt.allowedInputSha256, input.allowedInputSha256);
  assert.match(receipt.outputSha256, /^[a-f0-9]{64}$/);
  const { receiptPath, receiptSha256, ...persistedReceipt } = receipt;
  assert.deepEqual(JSON.parse(await readFile(receiptPath, "utf8")), persistedReceipt);
  assert.match(receiptSha256, /^[a-f0-9]{64}$/);

  await writeFile(path.join(packageDir, "index.html"), "<h1>changed</h1>", "utf8");
  await assert.rejects(() => freezeHuashuOutput(projectDir, variantId, "final"), /immutable|changed/i);
});

test("audit preservation reports heading, class, grid, typography, chart, and interaction mutations", async (t) => {
  const { packageDir, html } = await boundaryFixture(t);
  const before = await snapshotHuashuOutput(html, { siteDir: packageDir });
  const changedHtml = html
    .replace("Evidence", "Rewritten evidence")
    .replace('class="grid"', 'class="cards"')
    .replace('{"series":[1,2]}', '{"series":[9,9]}');
  await writeFile(path.join(packageDir, "styles", "site.css"), ".grid{display:flex;font-family:sans-serif}", "utf8");
  await writeFile(path.join(packageDir, "scripts", "site.js"), "document.querySelector('button').onclick=()=>2", "utf8");
  const after = await snapshotHuashuOutput(changedHtml, { siteDir: packageDir });
  assert.throws(
    () => assertAuditPreservedHuashuOutput(before, after),
    /text content.*class names.*geometry.*typography.*chart definitions.*interaction code/is
  );
});

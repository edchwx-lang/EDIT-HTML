import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createCanvas } from "@napi-rs/canvas";

import { hashV5SitePayload } from "../src/v5-design.js";
import { requireV5FinalVerification, verifyV5FinalSite } from "../src/v5-final-verification.js";
import { freezeHuashuOutput, writeHuashuInputManifest } from "../src/v5-stage-boundary.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(packageRoot, "bin", "edit-html-report.js");

test("production final verification persists recomputable browser and screenshot evidence", async (t) => {
  const { projectDir, variantId, siteDir } = await verificationFixture(t);
  const receipt = await verifyV5FinalSite(projectDir, variantId, { page: new FakePage() });

  assert.equal(receipt.payloadSha256, await hashV5SitePayload(siteDir));
  assert.deepEqual(receipt.screenshots.desktop.viewport, { width: 1440, height: 900 });
  assert.deepEqual(receipt.screenshots.mobile.viewport, { width: 390, height: 844 });
  assert.equal(receipt.checks.desktop.noHorizontalOverflow, true);
  assert.equal(receipt.checks.mobile.noHorizontalOverflow, true);
  assert.equal(receipt.checks.coreInteraction.domChanged, true);
  assert.match(receipt.receiptSha256, /^[a-f0-9]{64}$/);
  assert.equal((await requireV5FinalVerification(projectDir, variantId)).receiptSha256, receipt.receiptSha256);

  await writeFile(path.join(siteDir, "screenshots", "mobile.png"), png(390, 844, "changed"));
  await assert.rejects(() => requireV5FinalVerification(projectDir, variantId), /changed|screenshot|receipt/i);
});

test("design final verify CLI invokes the production Playwright verifier", async (t) => {
  const { projectDir, variantId } = await verificationFixture(t);
  const result = spawnSync(process.execPath, [cli, "design", "final", "verify", projectDir, "--variant", variantId], {
    cwd: packageRoot,
    encoding: "utf8",
    timeout: 120_000
  });
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.checks.desktop.noHorizontalOverflow, true);
  assert.equal(receipt.checks.mobile.noHorizontalOverflow, true);
  assert.equal(receipt.checks.coreInteraction.exercised, true);
});

test("final verification rejects a decodable screenshot with the wrong fixed viewport", async (t) => {
  const { projectDir, variantId } = await verificationFixture(t, { mobileViewport: { width: 391, height: 844 } });
  await assert.rejects(() => verifyV5FinalSite(projectDir, variantId, { page: new FakePage() }), /390x844 PNG/i);
});

async function verificationFixture(t, { mobileViewport = { width: 390, height: 844 } } = {}) {
  const projectDir = await mkdtemp(path.join(os.tmpdir(), "edit-html-final-verify-"));
  t.after(() => rm(projectDir, { recursive: true, force: true }));
  const variantId = "variant-final";
  const variantDir = path.join(projectDir, "variants", variantId);
  const inputDir = path.join(variantDir, "design", "huashu-input");
  const siteDir = path.join(variantDir, "design", "package");
  await Promise.all([
    mkdir(path.join(inputDir, "assets"), { recursive: true }),
    mkdir(path.join(siteDir, "styles"), { recursive: true }),
    mkdir(path.join(siteDir, "scripts"), { recursive: true }),
    mkdir(path.join(siteDir, "assets"), { recursive: true }),
    mkdir(path.join(siteDir, "screenshots"), { recursive: true })
  ]);
  for (const [name, contents] of Object.entries({
    "readable-source.md": "source",
    "fact-ledger.json": "{}",
    "source-map.json": "{}",
    "tables-and-datasets.json": "{}",
    "asset-contact-sheet.html": "<p>none</p>",
    "extraction-warnings.json": "{}",
    "interview.json": "{}",
    "content-brief.json": "{}"
  })) await writeFile(path.join(inputDir, name), contents, "utf8");
  await writeHuashuInputManifest(projectDir, variantId);

  const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="styles/site.css"></head><body><main><button data-core>Toggle</button><section data-state="idle">Evidence</section></main><script src="scripts/site.js"></script></body></html>';
  const processText = JSON.stringify({ schemaVersion: 1, owner: "huashu-design", coreInteraction: { type: "toggle", selector: "[data-core]", event: "click" } });
  await Promise.all([
    writeFile(path.join(siteDir, "index.html"), html, "utf8"),
    writeFile(path.join(siteDir, "styles", "site.css"), "html,body{margin:0;max-width:100%;overflow-x:hidden}", "utf8"),
    writeFile(path.join(siteDir, "scripts", "site.js"), "document.querySelector('[data-core]').onclick=()=>document.querySelector('section').dataset.state='selected'", "utf8"),
    writeFile(path.join(siteDir, "design-process.json"), processText, "utf8"),
    writeFile(path.join(siteDir, "content-bindings.json"), "{}", "utf8"),
    writeFile(path.join(siteDir, "design-rationale.md"), "# Final", "utf8"),
    writeFile(path.join(siteDir, "screenshots", "desktop.png"), png(1440, 900, "desktop")),
    writeFile(path.join(siteDir, "screenshots", "mobile.png"), png(mobileViewport.width, mobileViewport.height, "mobile"))
  ]);
  const payloadSha256 = await hashV5SitePayload(siteDir);
  const manifest = { schemaVersion: 1, packageVersion: "5.3.0", kind: "final", payloadSha256, outputSha256: payloadSha256 };
  const variant = { schemaVersion: 5, packageVersion: "5.3.0", variantId, finalSiteSha256: payloadSha256 };
  await Promise.all([
    writeFile(path.join(siteDir, "manifest.json"), JSON.stringify(manifest), "utf8"),
    writeFile(path.join(variantDir, "variant.json"), JSON.stringify(variant), "utf8"),
    writeFile(path.join(projectDir, "project.json"), JSON.stringify({ schemaVersion: 5, packageVersion: "5.3.0", variants: [variant] }), "utf8")
  ]);
  await freezeHuashuOutput(projectDir, variantId, "final");
  return { projectDir, variantId, siteDir };
}

function png(width, height, label) {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.fillStyle = label === "mobile" ? "#406080" : "#204060";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#fff";
  context.fillText(label, 12, 24);
  return canvas.toBuffer("image/png");
}

class FakePage {
  changed = false;
  async setViewportSize() {}
  async goto() { this.changed = false; }
  async evaluate() { return true; }
  locator() { return { count: async () => 1, click: async () => { this.changed = true; } }; }
  async content() { return this.changed ? "<html data-state=changed>" : "<html>"; }
}

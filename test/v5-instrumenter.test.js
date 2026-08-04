import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createV5Project, createV5Variant } from "../src/v5-project.js";
import { auditV5FinalSite } from "../src/v5-audit.js";
import { instrumentV5Variant } from "../src/v5-instrumenter.js";
import { validateV5Variant } from "../src/v5-validate.js";
import { applyDraftPatch, redoDraft, undoDraft } from "../src/drafts.js";
import { confirmEditorReview } from "../src/editor-review.js";
import { finalizeVariant } from "../src/finalize.js";
import { updateVariantTheme } from "../src/variants.js";

async function fixture(t, { number = "189", includeRemote = false, rawAppendix = false, authorizeRawAppendix = false } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "edit-html-v5-instrument-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, "brief.md");
  const projectDir = path.join(root, "project");
  await writeFile(source, "# 市场判断\n2028年市场规模预计达到189亿元。", "utf8");
  await createV5Project(source, projectDir);
  const variant = await createV5Variant(projectDir, {});
  const variantDir = path.join(projectDir, "variants", variant.variantId);
  const packageDir = path.join(variantDir, "design", "package");
  await mkdir(path.join(packageDir, "styles"), { recursive: true });
  await mkdir(path.join(packageDir, "scripts"), { recursive: true });
  await mkdir(path.join(packageDir, "assets"), { recursive: true });
  const ledger = JSON.parse(await readFile(path.join(projectDir, "source-pack", "fact-ledger.json"), "utf8"));
  const sourceMap = JSON.parse(await readFile(path.join(projectDir, "source-pack", "source-map.json"), "utf8"));
  if (rawAppendix) {
    const seed = sourceMap.documents[0].units.find((unit) => unit.substantive);
    sourceMap.documents[0].units = Array.from({ length: 12 }, (_, index) => ({
      ...seed,
      sourceId: `${seed.sourceId}-raw-${index + 1}`,
      text: `${seed.text} raw section ${index + 1}`
    }));
    await writeFile(path.join(projectDir, "source-pack", "source-map.json"), JSON.stringify(sourceMap), "utf8");
  }
  const facts = ledger.facts;
  const sourceRefs = sourceMap.documents.flatMap((document) => document.units.filter((unit) => unit.substantive).map((unit) => unit.sourceId));
  const bindings = {
    schemaVersion: 1,
    bindings: [
      { contentId: "hero", factIds: facts.map((item) => item.factId), sourceRefs, tier: rawAppendix ? "appendix" : "main", editableKind: "block" },
      { contentId: "claim", factIds: facts.filter((item) => item.rawText.includes("189亿元")).map((item) => item.factId), sourceRefs: sourceRefs.slice(-1), tier: "main", editableKind: "text" },
      { contentId: "visual", factIds: [], sourceRefs: [], tier: "main", editableKind: "image" }
    ],
    coverage: {
      kind: "complete-site",
      overviewContentIds: ["hero"],
      overviewSourceRefs: [sourceRefs[0]],
      focusEntities: [{
        entityId: "market-focus",
        label: "Market focus",
        sourceRefs: [sourceRefs.at(-1)],
        contentIds: ["claim"],
        facets: [{ facetId: "market-status", label: "Market status", sourceRefs: [sourceRefs.at(-1)], contentIds: ["claim"] }]
      }],
      representedFocusEntityIds: ["market-focus"]
    },
    omissions: [],
    ...(authorizeRawAppendix ? { rawAppendixAuthorization: { authorizedBy: "user", reason: "Show the complete source appendix", authorizedAt: new Date().toISOString() } } : {})
  };
  const bindingText = JSON.stringify(bindings);
  await writeFile(path.join(packageDir, "content-bindings.json"), bindingText, "utf8");
  await writeFile(path.join(packageDir, "styles", "site.css"), ".hero{color:var(--report-text);background:var(--report-canvas)}", "utf8");
  await writeFile(path.join(packageDir, "scripts", "site.js"), includeRemote ? "fetch('https://example.com/data')" : "document.documentElement.dataset.siteReady='true'", "utf8");
  await writeFile(path.join(packageDir, "assets", "pixel.png"), Buffer.from([137,80,78,71]));
  await writeFile(path.join(packageDir, "index.html"), `<!doctype html><html><head><link rel="stylesheet" href="styles/site.css"></head><body><main class="hero" data-content-id="hero"><h1>市场判断</h1><p data-content-id="claim">2028年市场规模预计达到${number}亿元。</p><img data-content-id="visual" src="assets/pixel.png" alt="材料图"></main><script src="scripts/site.js"></script></body></html>`, "utf8");
  const payloadSha256 = await hashPayload(packageDir);
  await writeFile(path.join(packageDir, "manifest.json"), JSON.stringify({
    schemaVersion: 1,
    packageVersion: "5.1.0",
    kind: "final",
    candidateId: "selected",
    directionId: "selected",
    directionLabel: "Selected",
    previewThemeId: "precision-blueprint",
    entrypoint: "index.html",
    sourcePackSha256: JSON.parse(await readFile(path.join(projectDir, "project.json"), "utf8")).sourcePackSha256,
    interviewSha256: "a".repeat(64),
    contentBindingsSha256: createHash("sha256").update(bindingText).digest("hex"),
    payloadSha256,
    outputSha256: payloadSha256,
    screenshotSourceSha256: payloadSha256,
    parentCandidateId: "selected",
    parentCandidateSha256: "b".repeat(64)
  }), "utf8");
  const variantJson = JSON.parse(await readFile(path.join(variantDir, "variant.json"), "utf8"));
  variantJson.interviewSha256 = "a".repeat(64);
  variantJson.designSelection = { candidateId: "selected", candidateSha256: "b".repeat(64) };
  variantJson.pipelineState = "final-site-ready";
  variantJson.finalSiteSha256 = payloadSha256;
  await writeFile(path.join(variantDir, "variant.json"), JSON.stringify(variantJson), "utf8");
  const project = JSON.parse(await readFile(path.join(projectDir, "project.json"), "utf8"));
  project.variants[0] = variantJson;
  await writeFile(path.join(projectDir, "project.json"), JSON.stringify(project), "utf8");
  return { projectDir, variantId: variant.variantId, packageDir };
}

test("V5 audit rejects changed source numbers and unsafe Huashu runtime without patching HTML", async (t) => {
  const changed = await fixture(t, { number: "198" });
  const before = await readFile(path.join(changed.packageDir, "index.html"), "utf8");
  await assert.rejects(() => auditV5FinalSite(changed.projectDir, changed.variantId), /198/);
  assert.equal(await readFile(path.join(changed.packageDir, "index.html"), "utf8"), before);

  const remote = await fixture(t, { includeRemote: true });
  await assert.rejects(() => auditV5FinalSite(remote.projectDir, remote.variantId), /fetch|network/i);
});

test("V5.1 audit rejects a bulk visible raw appendix unless the user explicitly authorizes it", async (t) => {
  const rejected = await fixture(t, { rawAppendix: true });
  await assert.rejects(() => auditV5FinalSite(rejected.projectDir, rejected.variantId), /raw source appendix requires explicit user authorization/i);

  const allowed = await fixture(t, { rawAppendix: true, authorizeRawAppendix: true });
  const report = await auditV5FinalSite(allowed.projectDir, allowed.variantId);
  assert.equal(report.status, "passed");
});

test("V5 Instrumenter preserves Huashu DOM classes and only adds editor/offline contracts", async (t) => {
  const { projectDir, variantId } = await fixture(t);
  const artifactPath = await instrumentV5Variant(projectDir, variantId);
  const html = await readFile(artifactPath, "utf8");

  assert.match(html, /<main[^>]*class="hero"[^>]*data-content-id="hero"/);
  assert.match(html, /data-block-id="block-/);
  assert.match(html, /data-edit-id="edit-/);
  assert.match(html, /data-image-id="image-/);
  assert.match(html, /data-source-ref="brief\.md#src-/);
  assert.match(html, /data-report-mode="data-first"/);
  assert.match(html, /data-edit-html-report-theme/);
  assert.match(html, /document\.documentElement\.dataset\.siteReady/);
  assert.match(html, /data:image\/png;base64,/);
  assert.doesNotMatch(html, /<link[^>]+stylesheet/);
  assert.doesNotMatch(html, /src="(?:styles|scripts|assets)\//);
  assert.doesNotMatch(html, /data-node-id=/);
  assert.doesNotMatch(html, /report-section|metric-values|master-detail/);
  const compatibility = JSON.parse(await readFile(path.join(projectDir, "variants", variantId, "report-model.json"), "utf8"));
  assert.equal(compatibility.schemaVersion, 4);
  assert.deepEqual(compatibility.nodes, []);
  assert.deepEqual(compatibility.datasets, []);
  await assert.rejects(access(path.join(projectDir, "variants", variantId, "presentation-plan.json")));
  const variant = JSON.parse(await readFile(path.join(projectDir, "variants", variantId, "variant.json"), "utf8"));
  assert.equal(variant.reviewState.status, "awaiting-editor-review");
  const instrumentation = JSON.parse(await readFile(path.join(projectDir, "variants", variantId, "instrumentation-report.json"), "utf8"));
  assert.equal(instrumentation.bodyStructureBeforeSha256, instrumentation.bodyStructureAfterSha256);
  const validation = await validateV5Variant(projectDir, variantId);
  assert.equal(validation.valid, true);
  assert.equal(validation.designOwner, "huashu-design");
});

test("a V5 artifact uses the frozen HTML editor, theme, review, and version path", async (t) => {
  const { projectDir, variantId } = await fixture(t);
  await instrumentV5Variant(projectDir, variantId);
  const artifactPath = path.join(projectDir, "variants", variantId, "artifact.html");
  const html = await readFile(artifactPath, "utf8");
  const editId = html.match(/data-edit-id="([^"]+)"/)[1];
  await applyDraftPatch(projectDir, variantId, { type: "replaceText", editId, value: "市场更新" });
  assert.match(await readFile(artifactPath, "utf8"), />市场更新<\/p>/);
  assert.equal(await undoDraft(projectDir, variantId), true);
  assert.match(await readFile(artifactPath, "utf8"), /189亿元/);
  assert.equal(await redoDraft(projectDir, variantId), true);
  assert.match(await readFile(artifactPath, "utf8"), />市场更新<\/p>/);
  assert.equal(await undoDraft(projectDir, variantId), true);
  await updateVariantTheme(projectDir, variantId, "warm-paper-terracotta", { source: "editor" });
  await confirmEditorReview(projectDir, variantId, { sessionId: "v5-visible-editor" });
  const version = await finalizeVariant(projectDir, variantId, { message: "V5 editor compatibility" });
  assert.equal(version.modelBacked, false);
  assert.equal(version.themeId, "warm-paper-terracotta");
});

async function hashPayload(root) {
  const files = ["assets/pixel.png", "content-bindings.json", "index.html", "scripts/site.js", "styles/site.css"];
  const hash = createHash("sha256");
  for (const name of files) hash.update(name).update("\0").update(await readFile(path.join(root, ...name.split("/")))).update("\0");
  return hash.digest("hex");
}

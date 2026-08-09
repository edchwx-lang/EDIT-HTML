import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
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
import { freezeHuashuOutput, writeHuashuInputManifest } from "../src/v5-stage-boundary.js";

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
  await writeFile(path.join(packageDir, "index.html"), `<!doctype html><html><head><link rel="stylesheet" href="styles/site.css"></head><body><nav><strong>研究框架</strong><button><span>材料图谱</span><b>189</b></button></nav><h2>未绑定章节标题</h2><main class="hero" data-content-id="hero"><h1>市场判断</h1><p data-content-id="claim">2028年市场规模预计达到${number}亿元。</p><img data-content-id="visual" src="assets/pixel.png" alt="材料图"></main><img src="assets/pixel.png" alt="未绑定材料图"><script src="scripts/site.js"></script></body></html>`, "utf8");
  const payloadSha256 = await hashPayload(packageDir);
  await writeFile(path.join(packageDir, "manifest.json"), JSON.stringify({
    schemaVersion: 1,
    packageVersion: "5.2.1",
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
  assert.match(html, /<h1[^>]*data-edit-id="edit-/);
  assert.match(html, /<h2[^>]*data-edit-id="edit-/);
  assert.match(html, /<strong[^>]*data-edit-id="edit-/);
  assert.match(html, /<span[^>]*data-edit-id="edit-/);
  assert.match(html, /<b[^>]*data-edit-id="edit-/);
  assert.match(html, /data-image-id="image-/);
  assert.equal(new Set([...html.matchAll(/data-image-id="([^"]+)"/g)].map((match) => match[1])).size, 2);
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
  assert.equal(await readFile(path.join(projectDir, "variants", variantId, "draft-patches.jsonl"), "utf8"), "");
  assert.equal(JSON.parse(await readFile(path.join(projectDir, "variants", variantId, "draft-cursor.json"), "utf8")).cursor, 0);
  const validation = await validateV5Variant(projectDir, variantId);
  assert.equal(validation.valid, true);
  assert.equal(validation.designOwner, "huashu-design");
  assert.deepEqual(validation.editorBoundary, {
    kind: "html-backed",
    contractVersion: "5.4.0",
    runtimeVersion: "5.4.0"
  });
});

test("V5.3 audit instrumentation requires immutable Huashu and browser verification receipts", async (t) => {
  const { projectDir, variantId, packageDir } = await fixture(t);
  const manifestPath = path.join(packageDir, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.packageVersion = "5.3.0";
  await writeFile(manifestPath, JSON.stringify(manifest), "utf8");
  await assert.rejects(() => instrumentV5Variant(projectDir, variantId), /receipt is required before audit/i);

  const inputDir = path.join(projectDir, "variants", variantId, "design", "huashu-input");
  await mkdir(path.join(inputDir, "assets"), { recursive: true });
  for (const name of [
    "readable-source.md", "fact-ledger.json", "source-map.json", "tables-and-datasets.json",
    "asset-contact-sheet.html", "extraction-warnings.json"
  ]) await cp(path.join(projectDir, "source-pack", name), path.join(inputDir, name));
  await writeFile(path.join(inputDir, "interview.json"), "{}", "utf8");
  await writeFile(path.join(inputDir, "content-brief.json"), "{}", "utf8");
  await writeHuashuInputManifest(projectDir, variantId);
  await freezeHuashuOutput(projectDir, variantId, "final");
  await assert.rejects(() => instrumentV5Variant(projectDir, variantId), /browser verification receipt is required/i);
});

test("V5 validation reads a persisted legacy 5.2.1 project without rewriting its records", async (t) => {
  const { projectDir, variantId } = await legacyV521Fixture(t);
  const beforeValidation = await hashProjectFiles(projectDir);
  const [project, variant] = await Promise.all([
    readFile(path.join(projectDir, "project.json"), "utf8").then(JSON.parse),
    readFile(path.join(projectDir, "variants", variantId, "variant.json"), "utf8").then(JSON.parse)
  ]);

  const validation = await validateV5Variant(projectDir, variantId);

  assert.equal(validation.valid, true);
  assert.equal(project.packageVersion, "5.2.1");
  assert.equal(variant.packageVersion, "5.2.1");
  assert.equal("artifactContractVersion" in project, false);
  assert.equal("artifactContractVersion" in variant, false);
  assert.deepEqual(await hashProjectFiles(projectDir), beforeValidation);
});

test("a V5 artifact uses the HTML-backed editor, theme, and version path", async (t) => {
  const { projectDir, variantId } = await fixture(t);
  await instrumentV5Variant(projectDir, variantId);
  const artifactPath = path.join(projectDir, "variants", variantId, "artifact.html");
  const html = await readFile(artifactPath, "utf8");
  const editId = html.match(/<p[^>]*data-edit-id="([^"]+)"/)[1];
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

test("a V5 artifact can be saved without a separate editor confirmation", async (t) => {
  const { projectDir, variantId } = await fixture(t);
  await instrumentV5Variant(projectDir, variantId);

  const version = await finalizeVariant(projectDir, variantId, { message: "V5.2.1 direct save" });

  assert.equal(version.variantId, variantId);
  assert.equal("reviewConfirmation" in version, false);
});

test("a V5 HTML-backed serializable chart saves without the legacy chart-mark contract", async (t) => {
  const { projectDir, variantId } = await fixture(t);
  await instrumentV5Variant(projectDir, variantId);
  const artifactPath = path.join(projectDir, "variants", variantId, "artifact.html");
  const artifact = await readFile(artifactPath, "utf8");
  const sourceRef = artifact.match(/data-source-ref="([^"]+)"/)[1];
  const withChart = artifact.replace("</body>",
    `<section data-chart-id="decision-bars" data-source-ref="${sourceRef}"><div style="background:var(--report-accent)">189</div></section>` +
    '<script type="application/json" data-chart-data-for="decision-bars">{"labels":["市场"],"values":[189]}</script></body>');
  assert.doesNotMatch(withChart, /data-chart-mark/);
  await writeFile(artifactPath, withChart, "utf8");

  const version = await finalizeVariant(projectDir, variantId, { message: "V5.4.0 serializable chart" });

  assert.equal(version.variantId, variantId);
  assert.match(await readFile(path.join(projectDir, "versions", version.versionId, "artifact.html"), "utf8"), /data-chart-id="decision-bars"/);
});

async function hashPayload(root) {
  const files = ["assets/pixel.png", "content-bindings.json", "index.html", "scripts/site.js", "styles/site.css"];
  const hash = createHash("sha256");
  for (const name of files) hash.update(name).update("\0").update(await readFile(path.join(root, ...name.split("/")))).update("\0");
  return hash.digest("hex");
}

async function legacyV521Fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "edit-html-v5-legacy-521-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const projectDir = path.join(root, "project");
  const variantId = "legacy-variant";
  const variantDir = path.join(projectDir, "variants", variantId);
  const packageDir = path.join(variantDir, "design", "package");
  const sourcePackDir = path.join(projectDir, "source-pack");
  const sourcePackSha256 = "c".repeat(64);
  const interviewSha256 = "a".repeat(64);
  const candidateSha256 = "b".repeat(64);
  const sourceId = "src-legacy-1";
  const factId = "fact-legacy-1";
  await Promise.all([
    mkdir(sourcePackDir, { recursive: true }),
    mkdir(path.join(packageDir, "assets"), { recursive: true }),
    mkdir(path.join(packageDir, "scripts"), { recursive: true }),
    mkdir(path.join(packageDir, "styles"), { recursive: true }),
    mkdir(path.join(projectDir, "versions", "legacy-version"), { recursive: true }),
    mkdir(path.join(projectDir, "publications", "legacy-publication"), { recursive: true })
  ]);
  const bindings = {
    schemaVersion: 1,
    bindings: [{ contentId: "hero", factIds: [factId], sourceRefs: [sourceId], tier: "main", editableKind: "text" }],
    coverage: {
      kind: "complete-site",
      overviewContentIds: ["hero"],
      overviewSourceRefs: [sourceId],
      focusEntities: [{ entityId: "legacy-focus", label: "Legacy focus", sourceRefs: [sourceId], contentIds: ["hero"], facets: [{ facetId: "legacy-facet", label: "Legacy facet", sourceRefs: [sourceId], contentIds: ["hero"] }] }],
      representedFocusEntityIds: ["legacy-focus"]
    },
    omissions: []
  };
  const bindingText = JSON.stringify(bindings);
  const siteHtml = '<!doctype html><html><body><main data-content-id="hero"><p>Legacy market reaches 189.</p></main></body></html>';
  await Promise.all([
    writeFile(path.join(sourcePackDir, "readable-source.md"), "Legacy market reaches 189.", "utf8"),
    writeFile(path.join(sourcePackDir, "fact-ledger.json"), JSON.stringify({ schemaVersion: 1, facts: [{ factId, sourceId, documentName: "legacy.md", order: 1, kind: "paragraph", rawText: "Legacy market reaches 189.", numericTokens: ["189"], qualifications: [] }] }), "utf8"),
    writeFile(path.join(sourcePackDir, "source-map.json"), JSON.stringify({ schemaVersion: 1, documents: [{ documentId: "legacy-document", name: "legacy.md", sha256: "d".repeat(64), units: [{ sourceId, order: 1, type: "paragraph", substantive: true, page: null, slide: null }] }] }), "utf8"),
    writeFile(path.join(sourcePackDir, "tables-and-datasets.json"), JSON.stringify({ schemaVersion: 1, datasets: [] }), "utf8"),
    writeFile(path.join(sourcePackDir, "extraction-warnings.json"), JSON.stringify({ schemaVersion: 1, warnings: [] }), "utf8"),
    writeFile(path.join(sourcePackDir, "asset-contact-sheet.html"), "<!doctype html><p>No extracted visual assets.</p>", "utf8"),
    writeFile(path.join(packageDir, "content-bindings.json"), bindingText, "utf8"),
    writeFile(path.join(packageDir, "index.html"), siteHtml, "utf8"),
    writeFile(path.join(packageDir, "styles", "site.css"), "main{color:#111}", "utf8"),
    writeFile(path.join(packageDir, "scripts", "site.js"), "document.documentElement.dataset.siteReady='true'", "utf8"),
    writeFile(path.join(packageDir, "assets", "pixel.png"), Buffer.from([137, 80, 78, 71])),
    writeFile(path.join(projectDir, "versions", "legacy-version", "artifact.html"), "<!doctype html><p>Saved legacy artifact</p>", "utf8"),
    writeFile(path.join(projectDir, "publications", "legacy-publication", "receipt.json"), JSON.stringify({ publicationId: "legacy-publication", versionId: "legacy-version" }), "utf8")
  ]);
  const payloadSha256 = await hashPayload(packageDir);
  const artifact = `<!doctype html><html data-report-mode="data-first" data-design-package-sha="${payloadSha256}"><head><style>main{color:#111}</style></head><body><main data-content-id="hero" data-block-id="block-legacy"><p data-edit-id="edit-legacy" data-source-ref="legacy.md#${sourceId}">Legacy market reaches 189.</p></main></body></html>`;
  const instrumentation = {
    schemaVersion: 1,
    variantId,
    designOwner: "huashu-design",
    bodyStructureBeforeSha256: "e".repeat(64),
    bodyStructureAfterSha256: "e".repeat(64),
    artifactSha256: createHash("sha256").update(artifact).digest("hex"),
    injectedContracts: ["offline-resources", "editor-identities", "source-bindings", "theme-variables"],
    generatedDesign: false
  };
  const variant = {
    schemaVersion: 5,
    packageVersion: "5.2.1",
    pipelineVersion: "5.2.1",
    variantId,
    pipelineState: "final-site-ready",
    interviewStatus: "confirmed",
    interviewSha256,
    themeId: "precision-blueprint",
    themeSchemaVersion: 2,
    designSelection: { candidateId: "legacy-candidate", candidateSha256 },
    finalSiteSha256: payloadSha256
  };
  const project = {
    schemaVersion: 5,
    packageVersion: "5.2.1",
    pipelineVersion: "5.2.1",
    projectId: "legacy-project",
    activeVariantId: variantId,
    variants: [variant],
    versions: [{ versionId: "legacy-version", artifactPath: "versions/legacy-version/artifact.html" }],
    publications: [{ publicationId: "legacy-publication", versionId: "legacy-version", receiptPath: "publications/legacy-publication/receipt.json" }],
    sourcePackSha256,
    sourceFiles: [{ name: "legacy.md", sha256: "d".repeat(64) }]
  };
  await Promise.all([
    writeFile(path.join(sourcePackDir, "manifest.json"), JSON.stringify({ schemaVersion: 1, packageVersion: "5.2.1", sourcePackSha256, sourceSha256: "d".repeat(64), files: ["asset-contact-sheet.html", "extraction-warnings.json", "fact-ledger.json", "readable-source.md", "source-map.json", "tables-and-datasets.json"], contentPolicy: "source-closed", designDecisions: false }), "utf8"),
    writeFile(path.join(packageDir, "manifest.json"), JSON.stringify({ schemaVersion: 1, packageVersion: "5.2.1", kind: "final", candidateId: "legacy-candidate", directionId: "legacy-direction", directionLabel: "Legacy direction", previewThemeId: "precision-blueprint", entrypoint: "index.html", sourcePackSha256, interviewSha256, contentBindingsSha256: createHash("sha256").update(bindingText).digest("hex"), payloadSha256, outputSha256: payloadSha256, screenshotSourceSha256: payloadSha256, parentCandidateId: "legacy-candidate", parentCandidateSha256: candidateSha256 }), "utf8"),
    writeFile(path.join(variantDir, "variant.json"), JSON.stringify(variant), "utf8"),
    writeFile(path.join(variantDir, "artifact.html"), artifact, "utf8"),
    writeFile(path.join(variantDir, "instrumentation-report.json"), JSON.stringify(instrumentation), "utf8"),
    writeFile(path.join(projectDir, "project.json"), JSON.stringify(project), "utf8")
  ]);
  return { projectDir, variantId };
}

async function hashProjectFiles(root, prefix = "") {
  const entries = await readdir(path.join(root, ...prefix.split("/").filter(Boolean)), { withFileTypes: true });
  const hashes = {};
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) Object.assign(hashes, await hashProjectFiles(root, relative));
    else if (relative !== "variants/legacy-variant/audit-report.json") {
      hashes[relative] = createHash("sha256").update(await readFile(path.join(root, ...relative.split("/")))).digest("hex");
    }
  }
  return hashes;
}

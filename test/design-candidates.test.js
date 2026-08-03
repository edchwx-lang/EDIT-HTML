import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  confirmHuashuDesignCandidate,
  getHuashuDesignCandidateStatus,
  hashDesignPackagePayload,
  hashHuashuProvenance,
  importHuashuDesignCandidate,
  listHuashuDesignCandidates
  , prepareHuashuInput
} from "../src/design-package.js";
import { createProject } from "../src/project.js";
import { renderVariant } from "../src/renderer.js";
import { createVariant } from "../src/variants.js";
import { validateVariant } from "../src/validate.js";
import { writeTestHuashuCandidate } from "./helpers/huashu.js";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

async function fixture({ threeStrategies = false } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "edit-html-v42-candidate-"));
  const source = path.join(root, "source.txt");
  const project = path.join(root, "project");
  await writeFile(source, "Market report\nRevenue reached 12 billion yuan in 2025.", "utf8");
  await createProject(source, project);
  const variant = await createVariant(project, { mode: "data-first" });
  const reportPath = path.join(project, "variants", variant.variantId, "report-model.json");
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  report.editorialStatus = "confirmed";
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  await prepareHuashuInput(project, variant.variantId, threeStrategies ? {} : { references: ["test://reference"] });
  return { root, project, variant };
}

async function hashFiles(root) {
  const names = ["desktop.png", "manifest.json", "mobile.png"];
  const hash = createHash("sha256");
  for (const name of names) {
    hash.update(name, "utf8");
    hash.update("\0");
    hash.update(await readFile(path.join(root, name)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

async function writeCandidate(project, variantId, root, options = {}) {
  const candidateId = options.candidateId ?? "candidate-blueprint";
  const input = JSON.parse(await readFile(
    path.join(project, "variants", variantId, "design", "huashu-input", "manifest.json"),
    "utf8"
  ));
  const candidateDir = path.join(root, options.directory ?? "candidate-blueprint");
  await mkdir(path.join(candidateDir, "components"), { recursive: true });
  await mkdir(path.join(candidateDir, "styles"), { recursive: true });
  await mkdir(path.join(candidateDir, "showcases"), { recursive: true });
  const files = {
    "composition-plan.json": { schemaVersion: 1, strategyId: candidateId, rootOrder: [], groups: [], informationPriority: ["finding", "evidence"] },
    "component-tree.json": { schemaVersion: 1, nodes: {} },
    "chart-specs.json": { schemaVersion: 1, charts: {} },
    "tokens.json": { tokenPolicy: "semantic-only" },
    "layout-grammar.json": {
      nodeLayouts: { section: "stack", content: "flow" },
      layouts: {
        stack: { className: "blueprint-stack" },
        flow: { className: "blueprint-flow" }
      }
    },
    "component-grammar.json": {
      bindings: {
        section: "section-basic",
        metric: "metric-basic",
        paragraph: "narrative-basic",
        text: "narrative-basic",
        table: "table-basic",
        image: "figure-basic",
        list: "narrative-basic",
        entityGroup: "master-detail-basic",
        evidenceWarning: "warning-basic"
      }
    },
    "chart-grammar.json": { bindings: { chart: "chart-basic" } },
    "table-grammar.json": { componentId: "table-basic" },
    "interaction-grammar.json": {
      bindings: {
        section: ["anchor-navigation"],
        table: ["row-highlight"],
        entityGroup: ["entity-tabs"],
        chart: ["chart-tooltip"]
      },
      interactions: {
        "anchor-navigation": { runtime: "anchor-navigation" },
        "row-highlight": { runtime: "row-highlight" },
        "entity-tabs": { runtime: "entity-tabs" },
        "chart-tooltip": { runtime: "chart-tooltip" }
      }
    },
    "responsive-grammar.json": { breakpoints: { mobile: 390, desktop: 1280 } },
    "components/registry.json": {
      schemaVersion: 1,
      components: {
        "section-basic": { primitive: "section", className: "cmp-section" },
        "narrative-basic": { primitive: "narrative", className: "cmp-narrative" },
        "metric-basic": { primitive: "metric", className: "cmp-metric" },
        "table-basic": { primitive: "table", className: "cmp-table" },
        "chart-basic": { primitive: "chart", className: "cmp-chart" },
        "figure-basic": { primitive: "figure", className: "cmp-figure" },
        "master-detail-basic": { primitive: "masterDetail", className: "cmp-master-detail" },
        "warning-basic": { primitive: "evidenceWarning", className: "cmp-warning" }
      }
    },
    "styles/report.css": [
      ".blueprint-stack{display:grid;gap:var(--report-space-section,2rem)}",
      ".cmp-section{border-block-start:1px solid var(--report-border)}",
      ".cmp-narrative{color:var(--report-text)}"
    ].join("\n")
  };
  for (const [name, value] of Object.entries(files)) {
    const filePath = path.join(candidateDir, name);
    if (typeof value === "string") await writeFile(filePath, value, "utf8");
    else await writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
  }
  await writeFile(path.join(candidateDir, "showcases", "desktop.png"), TINY_PNG);
  await writeFile(path.join(candidateDir, "showcases", "mobile.png"), TINY_PNG);
  await writeFile(path.join(candidateDir, "showcases", "manifest.json"), JSON.stringify({
    schemaVersion: 1,
    scenarios: ["hero", "data-table", "master-detail"],
    desktop: "desktop.png",
    mobile: "mobile.png"
  }, null, 2), "utf8");
  const showcaseSha256 = await hashFiles(path.join(candidateDir, "showcases"));
  const outputSha256 = await hashDesignPackagePayload(candidateDir);
  const compositionSha256 = createHash("sha256").update(await readFile(path.join(candidateDir, "composition-plan.json"))).digest("hex");
  const componentTreeSha256 = createHash("sha256").update(await readFile(path.join(candidateDir, "component-tree.json"))).digest("hex");
  const huashuRunId = "test-huashu-run";
  const huashuInvokedAt = new Date().toISOString();
  const manifest = {
    schemaVersion: 3,
    packageVersion: "4.3.0",
    skill: "huashu-design",
    candidateId,
    designDirectionId: options.designDirectionId ?? "technical-blueprint",
    designDirectionLabel: options.designDirectionLabel ?? "技术蓝图",
    strategyThesis: "Material-driven test strategy",
    selectionContext: "vague",
    previewThemeId: "precision-blueprint",
    showcaseSha256,
    inputSha256: input.inputSha256,
    outputSha256,
    compositionSha256,
    componentTreeSha256,
    huashuRunId,
    huashuInvokedAt,
    provenanceSha256: hashHuashuProvenance({ huashuRunId, huashuInvokedAt }),
    confirmation: { status: "pending", confirmedAt: null, confirmedBy: null },
    ...options.manifest
  };
  await writeFile(path.join(candidateDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  return candidateDir;
}

test("candidate import, list, status, and confirmation promote the exact executable package", async () => {
  const { root, project, variant } = await fixture();
  const candidateDir = await writeCandidate(project, variant.variantId, root);
  const imported = await importHuashuDesignCandidate(project, variant.variantId, candidateDir);
  assert.equal(imported.manifest.schemaVersion, 3);
  assert.equal(imported.manifest.candidateId, "candidate-blueprint");
  const listed = await listHuashuDesignCandidates(project, variant.variantId);
  assert.deepEqual(listed.map((item) => item.candidateId), ["candidate-blueprint"]);
  const before = await getHuashuDesignCandidateStatus(project, variant.variantId);
  assert.equal(before.state, "awaiting-candidate-confirmation");

  const confirmed = await confirmHuashuDesignCandidate(
    project,
    variant.variantId,
    "candidate-blueprint",
    { confirmedBy: "user" }
  );
  assert.equal(confirmed.designSelection.candidateId, "candidate-blueprint");
  assert.equal(confirmed.designSelection.previewThemeId, "precision-blueprint");
  assert.equal(confirmed.designSelection.showcaseSha256, imported.manifest.showcaseSha256);
  const promotedDir = path.join(project, "variants", variant.variantId, "design", "package");
  assert.equal(await hashDesignPackagePayload(promotedDir), imported.outputSha256);
  const variantRecord = JSON.parse(await readFile(
    path.join(project, "variants", variant.variantId, "variant.json"),
    "utf8"
  ));
  assert.deepEqual(variantRecord.designSelection, confirmed.designSelection);
});

test("candidate validation fails for missing executable files and unregistered components", async () => {
  const { root, project, variant } = await fixture();
  const missingCss = await writeCandidate(project, variant.variantId, root, { directory: "missing-css" });
  await rm(path.join(missingCss, "styles", "report.css"));
  await assert.rejects(
    () => importHuashuDesignCandidate(project, variant.variantId, missingCss),
    /missing styles\/report\.css/
  );

  const missingComponent = await writeCandidate(project, variant.variantId, root, { directory: "missing-component" });
  const grammarPath = path.join(missingComponent, "component-grammar.json");
  const grammar = JSON.parse(await readFile(grammarPath, "utf8"));
  grammar.bindings.paragraph = "component-that-does-not-exist";
  await writeFile(grammarPath, JSON.stringify(grammar, null, 2), "utf8");
  const manifestPath = path.join(missingComponent, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.outputSha256 = await hashDesignPackagePayload(missingComponent);
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  await assert.rejects(
    () => importHuashuDesignCandidate(project, variant.variantId, missingComponent),
    /unregistered componentId/
  );
});

test("candidate validation rejects literal colors, remote CSS, and showcase hash drift", async () => {
  const { root, project, variant } = await fixture();
  const colored = await writeCandidate(project, variant.variantId, root, { directory: "colored" });
  await writeFile(path.join(colored, "styles", "report.css"), ".cmp-section{color:#075F9B}", "utf8");
  let manifest = JSON.parse(await readFile(path.join(colored, "manifest.json"), "utf8"));
  manifest.outputSha256 = await hashDesignPackagePayload(colored);
  await writeFile(path.join(colored, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  await assert.rejects(
    () => importHuashuDesignCandidate(project, variant.variantId, colored),
    /semantic theme tokens/
  );

  const remote = await writeCandidate(project, variant.variantId, root, { directory: "remote" });
  await writeFile(path.join(remote, "styles", "report.css"), "@import url('https://example.com/report.css');", "utf8");
  manifest = JSON.parse(await readFile(path.join(remote, "manifest.json"), "utf8"));
  manifest.outputSha256 = await hashDesignPackagePayload(remote);
  await writeFile(path.join(remote, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  await assert.rejects(
    () => importHuashuDesignCandidate(project, variant.variantId, remote),
    /remote runtime dependency/
  );

  const injected = await writeCandidate(project, variant.variantId, root, { directory: "injected" });
  await writeFile(path.join(injected, "styles", "report.css"), ".cmp-section{display:block}</style><script>globalThis.injected=true</script><style>", "utf8");
  manifest = JSON.parse(await readFile(path.join(injected, "manifest.json"), "utf8"));
  manifest.outputSha256 = await hashDesignPackagePayload(injected);
  await writeFile(path.join(injected, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  await assert.rejects(
    () => importHuashuDesignCandidate(project, variant.variantId, injected),
    /unsafe stylesheet syntax/
  );

  const drifted = await writeCandidate(project, variant.variantId, root, { directory: "drifted" });
  await writeFile(path.join(drifted, "showcases", "desktop.png"), Buffer.from("changed"));
  manifest = JSON.parse(await readFile(path.join(drifted, "manifest.json"), "utf8"));
  manifest.outputSha256 = await hashDesignPackagePayload(drifted);
  await writeFile(path.join(drifted, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  await assert.rejects(
    () => importHuashuDesignCandidate(project, variant.variantId, drifted),
    /showcase SHA-256/
  );
});

test("vague three-strategy candidates use distinct light preview themes", async () => {
  const { root, project, variant } = await fixture({ threeStrategies: true });
  const first = await writeCandidate(project, variant.variantId, root, {
    directory: "candidate-one",
    candidateId: "candidate-one"
  });
  await importHuashuDesignCandidate(project, variant.variantId, first);
  const second = await writeCandidate(project, variant.variantId, root, {
    directory: "candidate-two",
    candidateId: "candidate-two",
    manifest: { previewThemeId: "precision-blueprint" }
  });
  await assert.rejects(
    () => importHuashuDesignCandidate(project, variant.variantId, second),
    /distinct light themes/
  );
  const third = await writeCandidate(project, variant.variantId, root, {
    directory: "candidate-three",
    candidateId: "candidate-three",
    manifest: { previewThemeId: "warm-paper-terracotta" }
  });
  const thirdCompositionPath = path.join(third, "composition-plan.json");
  const thirdComposition = JSON.parse(await readFile(thirdCompositionPath, "utf8"));
  thirdComposition.groups = [{ groupId: "alternate-flow", nodeIds: [] }];
  await writeFile(thirdCompositionPath, JSON.stringify(thirdComposition, null, 2), "utf8");
  const thirdManifestPath = path.join(third, "manifest.json");
  const thirdManifest = JSON.parse(await readFile(thirdManifestPath, "utf8"));
  thirdManifest.compositionSha256 = createHash("sha256").update(await readFile(thirdCompositionPath)).digest("hex");
  thirdManifest.outputSha256 = await hashDesignPackagePayload(third);
  await writeFile(thirdManifestPath, JSON.stringify(thirdManifest, null, 2), "utf8");
  await assert.doesNotReject(() => importHuashuDesignCandidate(project, variant.variantId, third));
});

test("a three-strategy input cannot confirm until all three light-theme candidates exist", async () => {
  const { root, project, variant } = await fixture({ threeStrategies: true });
  const first = await writeCandidate(project, variant.variantId, root, { candidateId: "only-one" });
  await importHuashuDesignCandidate(project, variant.variantId, first);
  await assert.rejects(
    () => confirmHuashuDesignCandidate(project, variant.variantId, "only-one"),
    /requires all three light-theme candidates/
  );
});

test("two confirmed executable candidates produce different package-driven DOM and CSS", async () => {
  const { root, project, variant: first } = await fixture();
  const second = await createVariant(project, { mode: "data-first" });
  const secondReportPath = path.join(project, "variants", second.variantId, "report-model.json");
  const secondReport = JSON.parse(await readFile(secondReportPath, "utf8"));
  secondReport.editorialStatus = "confirmed";
  await writeFile(secondReportPath, JSON.stringify(secondReport, null, 2), "utf8");
  await prepareHuashuInput(project, second.variantId, { references: ["test://reference"] });
  for (const [variant, suffix] of [[first, "atlas"], [second, "ledger"]]) {
    const candidateDir = path.join(root, `candidate-${suffix}`);
    await writeTestHuashuCandidate(project, variant.variantId, candidateDir, {
      candidateId: `candidate-${suffix}`,
      designDirectionId: `direction-${suffix}`,
      designDirectionLabel: suffix,
      classPrefix: suffix
    });
    await importHuashuDesignCandidate(project, variant.variantId, candidateDir);
    await confirmHuashuDesignCandidate(project, variant.variantId, `candidate-${suffix}`);
    await renderVariant(project, variant.variantId);
  }
  const firstHtml = await readFile(
    path.join(project, "variants", first.variantId, "artifact.html"),
    "utf8"
  );
  const secondHtml = await readFile(
    path.join(project, "variants", second.variantId, "artifact.html"),
    "utf8"
  );
  assert.match(firstHtml, /data-design-direction="direction-atlas"/);
  assert.match(firstHtml, /data-design-package-sha="[0-9a-f]{64}"/);
  assert.match(firstHtml, /data-preview-theme="deep-data-blue"/);
  assert.match(firstHtml, /class="[^"]*atlas-section[^"]*atlas-section-layout/);
  assert.match(firstHtml, /\.atlas-section-layout\{display:grid/);
  assert.doesNotMatch(firstHtml, /ledger-section/);
  assert.match(secondHtml, /ledger-section/);
  assert.doesNotMatch(secondHtml, /atlas-section/);
  assert.notEqual(firstHtml, secondHtml);
  const plan = JSON.parse(await readFile(
    path.join(project, "variants", first.variantId, "presentation-plan.json"),
    "utf8"
  ));
  assert.ok(plan.bindings.every((binding) => binding.componentId && binding.layoutId));
  assert.ok(plan.bindings.every((binding) => Array.isArray(binding.interactionIds)));
  assert.ok(plan.bindings.every((binding) => binding.packageClass));
});

test("variant validation proves the confirmed package affected DOM, CSS, and interactions", async () => {
  const { root, project, variant } = await fixture();
  const candidateDir = path.join(root, "candidate-validation");
  await writeTestHuashuCandidate(project, variant.variantId, candidateDir, {
    candidateId: "candidate-validation",
    designDirectionId: "direction-validation",
    classPrefix: "validation"
  });
  await importHuashuDesignCandidate(project, variant.variantId, candidateDir);
  await confirmHuashuDesignCandidate(project, variant.variantId, "candidate-validation");
  const artifactPath = await renderVariant(project, variant.variantId);
  const validated = await validateVariant(project, variant.variantId);
  assert.equal(validated.designCandidateId, "candidate-validation");
  assert.equal(validated.designDirectionId, "direction-validation");

  const validHtml = await readFile(artifactPath, "utf8");
  await writeFile(
    artifactPath,
    validHtml.replace(/data-design-package-sha="[0-9a-f]{64}"/, 'data-design-package-sha="tampered"'),
    "utf8"
  );
  await assert.rejects(() => validateVariant(project, variant.variantId), /design package SHA/);

  await writeFile(artifactPath, validHtml.replace(".validation-section-layout{", ".removed-layout{"), "utf8");
  await assert.rejects(() => validateVariant(project, variant.variantId), /package stylesheet/);
});

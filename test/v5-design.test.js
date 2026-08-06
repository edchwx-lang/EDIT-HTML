import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createCanvas } from "@napi-rs/canvas";

import { createV5Project, createV5Variant } from "../src/v5-project.js";
import { importV5Interview, prepareV5HuashuInput } from "../src/v5-interview.js";
import {
  confirmV5DesignCandidate,
  getV5FinalStatus,
  hashV5SitePayload,
  importV5DesignCandidate,
  importV5FinalSite,
  listV5DesignCandidates,
  prepareV5CandidateReviewSet
} from "../src/v5-design.js";

async function setProjectVersion(project, variantId, version) {
  const projectPath = path.join(project, "project.json");
  const variantPath = path.join(project, "variants", variantId, "variant.json");
  const projectJson = JSON.parse(await readFile(projectPath, "utf8"));
  const variantJson = JSON.parse(await readFile(variantPath, "utf8"));
  projectJson.packageVersion = version;
  projectJson.pipelineVersion = version;
  projectJson.artifactContractVersion = version;
  variantJson.packageVersion = version;
  variantJson.pipelineVersion = version;
  variantJson.artifactContractVersion = version;
  projectJson.variants = projectJson.variants.map((item) => item.variantId === variantId ? variantJson : item);
  await writeFile(projectPath, JSON.stringify(projectJson, null, 2), "utf8");
  await writeFile(variantPath, JSON.stringify(variantJson, null, 2), "utf8");
}

async function fixture(t, { reference = false, version = "5.1.0" } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "edit-html-v5-design-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, "brief.md");
  const project = path.join(root, "project");
  await writeFile(source, "# 市场\n2028年市场规模预计达到189亿元。", "utf8");
  await createV5Project(source, project);
  const variant = await createV5Variant(project, {});
  if (version !== "5.2.1") await setProjectVersion(project, variant.variantId, version);
  const receiptGated = ["5.1.1", "5.2.0", "5.2.1", "5.3.0"].includes(version);
  const interview = {
    schemaVersion: receiptGated ? 3 : 2,
    variantId: variant.variantId,
    answers: Object.fromEntries(["purpose", "contentWeight"].map((key) => [key, {
      question: key,
      response: "用户回答 " + key,
      origin: "user-provided",
      recordedAt: "2026-08-04T10:00:00.000Z"
    }])),
    ...(receiptGated ? {
      decisionEvidence: {
        evidenceType: "direct-user-answer",
        verbatimUserQuote: "Purpose and emphasis provided for design gate testing.",
        recordedAt: "2026-08-04T10:00:00.000Z",
        topicsCovered: ["purpose", "contentWeight"]
      }
    } : {}),
    references: reference ? [{ kind: "url", value: "https://example.com", suppliedAtStart: true }] : []
  };
  const interviewPath = path.join(root, "interview.json");
  await writeFile(interviewPath, JSON.stringify(interview), "utf8");
  await importV5Interview(project, variant.variantId, interviewPath);
  await prepareV5HuashuInput(project, variant.variantId);
  return { root, project, variant };
}

async function writeSite(root, project, variantId, {
  candidateId = "candidate-one",
  directionId = candidateId,
  previewThemeId = "precision-blueprint",
  marker = candidateId,
  kind = "candidate",
  parent = null,
  includeCoverage = true,
  coverageOverride = null
} = {}) {
  const directory = path.join(root, marker + "-site");
  await mkdir(path.join(directory, "styles"), { recursive: true });
  await mkdir(path.join(directory, "scripts"), { recursive: true });
  await mkdir(path.join(directory, "assets"), { recursive: true });
  await mkdir(path.join(directory, "screenshots"), { recursive: true });
  await writeFile(path.join(directory, "index.html"), `<!doctype html><html><head><link rel="stylesheet" href="styles/site.css"></head><body class="${marker}"><main data-content-id="market"><h1>${marker}</h1><p>2028年市场规模预计达到189亿元。</p></main><script src="scripts/site.js"></script></body></html>`, "utf8");
  await writeFile(path.join(directory, "styles", "site.css"), `.${marker}{color:var(--report-text);background:var(--report-canvas)}`, "utf8");
  await writeFile(path.join(directory, "scripts", "site.js"), "document.documentElement.dataset.ready='true'", "utf8");
  const facts = JSON.parse(await readFile(path.join(project, "source-pack", "fact-ledger.json"), "utf8"));
  const fact = facts.facts.find((item) => item.rawText.includes("189亿元"));
  const bindings = {
    schemaVersion: 1,
    bindings: [{ contentId: "market", factIds: [fact.factId], sourceRefs: [fact.sourceId], tier: "main", editableKind: "block" }],
    omissions: [],
    ...(includeCoverage ? { coverage: coverageOverride ?? {
      kind: kind === "candidate" ? "vertical-slice" : "complete-site",
      overviewContentIds: ["market"],
      overviewSourceRefs: [fact.sourceId],
      focusEntities: [{
        entityId: "market-focus",
        label: "Market focus",
        sourceRefs: [fact.sourceId],
        contentIds: ["market"],
        facets: [{ facetId: "market-status", label: "Market status", sourceRefs: [fact.sourceId], contentIds: ["market"] }]
      }],
      representedFocusEntityIds: ["market-focus"]
    } } : {})
  };
  const bindingText = JSON.stringify(bindings);
  await writeFile(path.join(directory, "content-bindings.json"), bindingText, "utf8");
  await writeFile(path.join(directory, "design-rationale.md"), `# ${marker}\nMaterial-driven executable direction.`, "utf8");
  await writeFile(path.join(directory, "screenshots", "desktop.png"), Buffer.from("desktop-" + marker));
  await writeFile(path.join(directory, "screenshots", "mobile.png"), Buffer.from("mobile-" + marker));
  const projectJson = JSON.parse(await readFile(path.join(project, "project.json"), "utf8"));
  const variant = JSON.parse(await readFile(path.join(project, "variants", variantId, "variant.json"), "utf8"));
  const payloadSha256 = await hashV5SitePayload(directory);
  const manifest = {
    schemaVersion: 1,
    packageVersion: "5.1.0",
    kind,
    candidateId,
    directionId,
    directionLabel: marker,
    previewThemeId,
    entrypoint: "index.html",
    sourcePackSha256: projectJson.sourcePackSha256,
    interviewSha256: variant.interviewSha256,
    contentBindingsSha256: createHash("sha256").update(bindingText).digest("hex"),
    payloadSha256,
    outputSha256: payloadSha256,
    screenshotSourceSha256: payloadSha256,
    ...(parent ? { parentCandidateId: parent.candidateId, parentCandidateSha256: parent.payloadSha256 } : {})
  };
  await writeFile(path.join(directory, "manifest.json"), JSON.stringify(manifest), "utf8");
  return { directory, manifest };
}

async function refreshManifest(directory) {
  const manifestPath = path.join(directory, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const payloadSha256 = await hashV5SitePayload(directory);
  manifest.payloadSha256 = payloadSha256;
  manifest.outputSha256 = payloadSha256;
  manifest.screenshotSourceSha256 = payloadSha256;
  await writeFile(manifestPath, JSON.stringify(manifest), "utf8");
}

function tinyPng(marker) {
  const base = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64"
  );
  return Buffer.concat([base, Buffer.from(String(marker))]);
}

function reviewPng(marker) {
  const canvas = createCanvas(1440, 900);
  const context = canvas.getContext("2d");
  context.fillStyle = marker.length % 2 ? "#204060" : "#806040";
  context.fillRect(0, 0, 1440, 900);
  context.fillStyle = "#ffffff";
  context.font = "48px sans-serif";
  context.fillText(marker, 80, 120);
  return canvas.toBuffer("image/png");
}

async function writeV511Site(root, project, variantId, {
  candidateId,
  marker = candidateId,
  directionId = candidateId,
  previewThemeId = "precision-blueprint",
  narrativeId = candidateId,
  overviewType = "chart",
  focusType = "matrix",
  interactionType = "filter",
  structure = "radar",
  kind = "candidate",
  parent = null,
  rawDump = false
}) {
  const directory = path.join(root, marker + "-v511-site");
  const variant = JSON.parse(await readFile(path.join(project, "variants", variantId, "variant.json"), "utf8"));
  await mkdir(path.join(directory, "styles"), { recursive: true });
  await mkdir(path.join(directory, "scripts"), { recursive: true });
  await mkdir(path.join(directory, "assets"), { recursive: true });
  await mkdir(path.join(directory, "screenshots"), { recursive: true });
  const facts = JSON.parse(await readFile(path.join(project, "source-pack", "fact-ledger.json"), "utf8"));
  const fact = facts.facts.find((item) => item.rawText.includes("189浜垮厓")) ?? facts.facts[0];
  const sourceId = fact.sourceId;
  const longRaw = "材料原文".repeat(180);
  const bodyByStructure = {
    radar: `<section data-role="radar" data-content-id="market"><header><h1>${marker}</h1></header><div class="overview-${marker}">Market reaches 189 units.</div><button class="interact-${marker}" type="button">Focus</button><figure class="focus-${marker}">Representative focus matrix</figure><p>${rawDump ? longRaw : "Compressed source-grounded summary."}</p></section>`,
    briefing: `<article data-role="briefing"><h1>${marker}</h1><aside data-content-id="market"><table class="overview-${marker}"><tr><td>189</td><td>market</td></tr></table><details class="focus-${marker}" open><summary>Focus</summary><p>Representative material facet.</p></details><button class="interact-${marker}" type="button">Switch</button></aside></article>`,
    lab: `<main data-role="lab"><nav><button class="interact-${marker}" type="button">Inspect</button></nav><section data-content-id="market"><ul class="overview-${marker}"><li>189 market signal</li></ul><div class="focus-${marker}"><span>Focus entity</span><span>Facet evidence</span></div></section></main>`
  };
  await writeFile(path.join(directory, "index.html"), `<!doctype html><html><head><link rel="stylesheet" href="styles/site.css"></head><body>${bodyByStructure[structure]}</body><script src="scripts/site.js"></script></html>`, "utf8");
  await writeFile(path.join(directory, "styles", "site.css"), `body{color:var(--report-text);background:var(--report-canvas)}.${marker}{border-color:var(--report-border)}`, "utf8");
  await writeFile(path.join(directory, "scripts", "site.js"), "document.documentElement.dataset.ready='true'", "utf8");
  const bindings = {
    schemaVersion: 1,
    bindings: [{ contentId: "market", factIds: [fact.factId], sourceRefs: [sourceId], tier: "main", editableKind: "block" }],
    omissions: [],
    coverage: {
      kind: kind === "candidate" ? "vertical-slice" : "complete-site",
      overviewContentIds: ["market"],
      overviewSourceRefs: [sourceId],
      focusEntities: [{
        entityId: "market-focus",
        label: "Market focus",
        sourceRefs: [sourceId],
        contentIds: ["market"],
        facets: [{ facetId: "market-status", label: "Market status", sourceRefs: [sourceId], contentIds: ["market"] }]
      }],
      representedFocusEntityIds: ["market-focus"]
    }
  };
  const bindingText = JSON.stringify(bindings);
  await writeFile(path.join(directory, "content-bindings.json"), bindingText, "utf8");
  await writeFile(path.join(directory, "design-rationale.md"), `# ${marker}\nMaterial-driven executable direction.`, "utf8");
  const designProcess = {
    schemaVersion: 1,
    owner: "huashu-design",
    candidateId,
    ...(parent ? { parentCandidateId: parent.candidateId } : {}),
    narrativeArchitecture: { id: narrativeId, description: `${narrativeId} narrative architecture` },
    visualizationModules: [
      { id: "overview", title: "Overview signal", category: "overview", type: overviewType, selector: `.overview-${marker}`, sourceRefs: [sourceId] },
      { id: "focus", title: "Focus evidence", category: "focus", type: focusType, selector: `.focus-${marker}`, sourceRefs: [sourceId] }
    ],
    coreInteraction: { type: interactionType, selector: `.interact-${marker}`, event: "click", description: "Switches the representative focus state" }
    ,...(variant.packageVersion === "5.3.0" && kind === "candidate" ? {
      sampleScope: {
        firstViewportSelector: "body",
        focusModuleSelector: `.focus-${marker}`,
        coreInteractionSelector: `.interact-${marker}`
      }
    } : {})
  };
  const designProcessText = JSON.stringify(designProcess);
  await writeFile(path.join(directory, "design-process.json"), designProcessText, "utf8");
  await writeFile(path.join(directory, "screenshots", "desktop.png"), tinyPng("desktop-" + marker));
  await writeFile(path.join(directory, "screenshots", "mobile.png"), tinyPng("mobile-" + marker));
  const projectJson = JSON.parse(await readFile(path.join(project, "project.json"), "utf8"));
  if (variant.packageVersion === "5.3.0" && kind === "candidate") {
    await writeFile(path.join(directory, "screenshots", "desktop.png"), reviewPng(marker));
    await rm(path.join(directory, "screenshots", "mobile.png"));
  }
  const payloadSha256 = await hashV5SitePayload(directory);
  const manifest = {
    schemaVersion: 1,
    packageVersion: variant.packageVersion,
    kind,
    candidateId,
    directionId,
    directionLabel: marker,
    previewThemeId,
    entrypoint: "index.html",
    sourcePackSha256: projectJson.sourcePackSha256,
    interviewSha256: variant.interviewSha256,
    contentBindingsSha256: createHash("sha256").update(bindingText).digest("hex"),
    payloadSha256,
    outputSha256: payloadSha256,
    screenshotSourceSha256: payloadSha256,
    designProcessSha256: createHash("sha256").update(designProcessText).digest("hex"),
    ...(variant.packageVersion === "5.3.0" && kind === "candidate" ? {
      sampleScope: {
        firstViewportSelector: "body",
        focusModuleSelector: `.focus-${marker}`,
        coreInteractionSelector: `.interact-${marker}`
      }
    } : {}),
    ...(parent ? { parentCandidateId: parent.candidateId, parentCandidateSha256: parent.payloadSha256 } : {})
  };
  await writeFile(path.join(directory, "manifest.json"), JSON.stringify(manifest), "utf8");
  return { directory, manifest };
}

test("V5.1 rejects an executable candidate without a content-complete vertical slice", async (t) => {
  const { root, project, variant } = await fixture(t, { reference: true });
  const shallow = await writeSite(root, project, variant.variantId, {
    candidateId: "shallow",
    marker: "shallow",
    includeCoverage: false
  });
  await assert.rejects(
    () => importV5DesignCandidate(project, variant.variantId, shallow.directory),
    /coverage.+vertical-slice/i
  );
});

test("V5.1 candidate coverage requires an overview and a complete representative focus entity", async (t) => {
  const { root, project, variant } = await fixture(t, { reference: true });
  const sourceMap = JSON.parse(await readFile(path.join(project, "source-pack", "source-map.json"), "utf8"));
  const sourceId = sourceMap.documents.flatMap((document) => document.units).find((unit) => unit.substantive).sourceId;
  const invalid = await writeSite(root, project, variant.variantId, {
    candidateId: "incomplete-slice",
    marker: "incomplete-slice",
    coverageOverride: {
      kind: "vertical-slice",
      overviewContentIds: [],
      overviewSourceRefs: [sourceId],
      focusEntities: [{ entityId: "material", label: "Material", sourceRefs: [sourceId], contentIds: ["market"], facets: [] }],
      representedFocusEntityIds: ["material"]
    }
  });
  await assert.rejects(
    () => importV5DesignCandidate(project, variant.variantId, invalid.directory),
    /overview.+representative.+facet/i
  );
});

test("V5.1 three design candidates must share one content plan", async (t) => {
  const { root, project, variant } = await fixture(t);
  const first = await writeSite(root, project, variant.variantId, {
    candidateId: "same-content-one",
    marker: "same-content-one",
    previewThemeId: "precision-blueprint"
  });
  const firstBindings = JSON.parse(await readFile(path.join(first.directory, "content-bindings.json"), "utf8"));
  const sourceId = firstBindings.coverage.overviewSourceRefs[0];
  await importV5DesignCandidate(project, variant.variantId, first.directory);
  const changedPlan = await writeSite(root, project, variant.variantId, {
    candidateId: "changed-content-two",
    marker: "changed-content-two",
    previewThemeId: "warm-paper-terracotta",
    coverageOverride: {
      kind: "vertical-slice",
      overviewContentIds: ["market"],
      overviewSourceRefs: [sourceId],
      focusEntities: [{
        entityId: "different-focus",
        label: "Different focus",
        sourceRefs: [sourceId],
        contentIds: ["market"],
        facets: [{ facetId: "different-status", label: "Different status", sourceRefs: [sourceId], contentIds: ["market"] }]
      }],
      representedFocusEntityIds: ["different-focus"]
    }
  });
  await assert.rejects(
    () => importV5DesignCandidate(project, variant.variantId, changedPlan.directory),
    /same content plan/i
  );
});

test("V5.1 final site must expand every declared focus entity", async (t) => {
  const { root, project, variant } = await fixture(t, { reference: true });
  const seed = await writeSite(root, project, variant.variantId, { candidateId: "seed", marker: "seed" });
  const seedBindings = JSON.parse(await readFile(path.join(seed.directory, "content-bindings.json"), "utf8"));
  const sourceId = seedBindings.coverage.overviewSourceRefs[0];
  const focusEntities = [
    { entityId: "one", label: "One", sourceRefs: [sourceId], contentIds: ["market"], facets: [{ facetId: "one-status", label: "Status", sourceRefs: [sourceId], contentIds: ["market"] }] },
    { entityId: "two", label: "Two", sourceRefs: [sourceId], contentIds: ["market"], facets: [{ facetId: "two-status", label: "Status", sourceRefs: [sourceId], contentIds: ["market"] }] }
  ];
  const candidate = await writeSite(root, project, variant.variantId, {
    candidateId: "focus-plan",
    marker: "focus-plan",
    coverageOverride: {
      kind: "vertical-slice",
      overviewContentIds: ["market"],
      overviewSourceRefs: [sourceId],
      focusEntities,
      representedFocusEntityIds: ["one"]
    }
  });
  await importV5DesignCandidate(project, variant.variantId, candidate.directory);
  await confirmV5DesignCandidate(project, variant.variantId, "focus-plan");
  const final = await writeSite(root, project, variant.variantId, {
    candidateId: "focus-plan",
    marker: "incomplete-final-focus",
    kind: "final",
    parent: candidate.manifest,
    coverageOverride: {
      kind: "complete-site",
      overviewContentIds: ["market"],
      overviewSourceRefs: [sourceId],
      focusEntities,
      representedFocusEntityIds: ["one"]
    }
  });
  await assert.rejects(() => importV5FinalSite(project, variant.variantId, final.directory), /missing focus entity two/i);
});

test("V5 imports three distinct real HTML samples and confirms only after the set is complete", async (t) => {
  const { root, project, variant } = await fixture(t);
  const first = await writeSite(root, project, variant.variantId, { candidateId: "one", marker: "dashboard", previewThemeId: "precision-blueprint" });
  await importV5DesignCandidate(project, variant.variantId, first.directory);
  await assert.rejects(() => confirmV5DesignCandidate(project, variant.variantId, "one"), /three executable samples/);
  for (const item of [
    { candidateId: "two", marker: "editorial", previewThemeId: "warm-paper-terracotta" },
    { candidateId: "three", marker: "explorer", previewThemeId: "sandstone-archive" }
  ]) {
    const site = await writeSite(root, project, variant.variantId, item);
    await importV5DesignCandidate(project, variant.variantId, site.directory);
  }
  const candidates = await listV5DesignCandidates(project, variant.variantId);
  assert.equal(candidates.length, 3);
  assert.equal(new Set(candidates.map((item) => item.payloadSha256)).size, 3);

  const selection = await confirmV5DesignCandidate(project, variant.variantId, "one");
  assert.equal(selection.candidateId, "one");
  assert.equal(selection.candidateSha256, first.manifest.payloadSha256);
  await assert.rejects(readFile(path.join(project, "variants", variant.variantId, "design", "package", "index.html")));
});

test("V5 final site must descend from the selected candidate and is promoted unchanged", async (t) => {
  const { root, project, variant } = await fixture(t, { reference: true });
  const candidate = await writeSite(root, project, variant.variantId, { candidateId: "reference", marker: "reference" });
  await importV5DesignCandidate(project, variant.variantId, candidate.directory);
  await confirmV5DesignCandidate(project, variant.variantId, "reference");

  const wrong = await writeSite(root, project, variant.variantId, {
    candidateId: "reference", marker: "wrong-final", kind: "final",
    parent: { candidateId: "reference", payloadSha256: "f".repeat(64) }
  });
  await assert.rejects(() => importV5FinalSite(project, variant.variantId, wrong.directory), /parent candidate/);

  const final = await writeSite(root, project, variant.variantId, {
    candidateId: "reference", marker: "complete-final", kind: "final", parent: candidate.manifest
  });
  const imported = await importV5FinalSite(project, variant.variantId, final.directory);
  assert.equal(imported.outputSha256, final.manifest.payloadSha256);
  const stored = await readFile(path.join(project, "variants", variant.variantId, "design", "package", "index.html"), "utf8");
  assert.match(stored, /complete-final/);
  assert.equal((await getV5FinalStatus(project, variant.variantId)).state, "final-site-ready");
});

test("V5 allows ordinary reference links but rejects network code in local Huashu scripts", async (t) => {
  const { root, project, variant } = await fixture(t, { reference: true });
  const linked = await writeSite(root, project, variant.variantId, { candidateId: "linked", marker: "linked" });
  const indexPath = path.join(linked.directory, "index.html");
  await writeFile(indexPath, (await readFile(indexPath, "utf8")).replace("</main>", '<a href="https://example.com/source">来源</a></main>'), "utf8");
  await refreshManifest(linked.directory);
  await importV5DesignCandidate(project, variant.variantId, linked.directory);

  const unsafe = await writeSite(root, project, variant.variantId, { candidateId: "unsafe", marker: "unsafe" });
  await writeFile(path.join(unsafe.directory, "scripts", "site.js"), "fetch('https://example.com/data')", "utf8");
  await refreshManifest(unsafe.directory);
  await assert.rejects(() => importV5DesignCandidate(project, variant.variantId, unsafe.directory), /network runtime/);
});

test("V5.1.1 requires a prepared review set and user selection receipt before candidate confirmation", async (t) => {
  const { root, project, variant } = await fixture(t, { version: "5.1.1" });
  const sites = [
    await writeV511Site(root, project, variant.variantId, {
      candidateId: "one",
      marker: "radar",
      previewThemeId: "precision-blueprint",
      narrativeId: "radar-map",
      overviewType: "chart",
      focusType: "matrix",
      interactionType: "filter",
      structure: "radar"
    }),
    await writeV511Site(root, project, variant.variantId, {
      candidateId: "two",
      marker: "briefing",
      previewThemeId: "warm-paper-terracotta",
      narrativeId: "briefing-stack",
      overviewType: "data-table",
      focusType: "timeline",
      interactionType: "disclose",
      structure: "briefing"
    }),
    await writeV511Site(root, project, variant.variantId, {
      candidateId: "three",
      marker: "lab",
      previewThemeId: "sandstone-archive",
      narrativeId: "inspection-lab",
      overviewType: "flow",
      focusType: "comparison",
      interactionType: "inspect",
      structure: "lab"
    })
  ];
  for (const site of sites) await importV5DesignCandidate(project, variant.variantId, site.directory);

  await assert.rejects(() => confirmV5DesignCandidate(project, variant.variantId, "one"), /prepared review set/i);

  const review = await prepareV5CandidateReviewSet(project, variant.variantId);
  assert.equal(review.candidates.length, 3);
  assert.match(review.reviewSetSha256, /^[a-f0-9]{64}$/);
  assert.ok(review.candidates.every((item) => item.screenshots.desktop.path.endsWith("desktop.png")));

  await assert.rejects(() => confirmV5DesignCandidate(project, variant.variantId, "one", {
    receipt: {
      schemaVersion: 1,
      reviewSetSha256: review.reviewSetSha256,
      candidateId: "one",
      selectedBy: "agent",
      verbatimUserSelection: "I choose one.",
      recordedAt: "2026-08-04T10:05:00.000Z"
    }
  }), /selectedBy user/i);

  const selection = await confirmV5DesignCandidate(project, variant.variantId, "one", {
    receipt: {
      schemaVersion: 1,
      reviewSetSha256: review.reviewSetSha256,
      candidateId: "one",
      selectedBy: "user",
      verbatimUserSelection: "I choose candidate one.",
      recordedAt: "2026-08-04T10:06:00.000Z"
    }
  });
  assert.equal(selection.candidateId, "one");
  assert.equal(selection.reviewSetSha256, review.reviewSetSha256);
  assert.match(selection.selectionReceiptSha256, /^[a-f0-9]{64}$/);
});

test("V5.1.1 review audit rejects converged templates and raw source dumps", async (t) => {
  const { root, project, variant } = await fixture(t, { version: "5.1.1" });
  for (const item of [
    { candidateId: "one", marker: "clone-one", previewThemeId: "precision-blueprint", rawDump: true },
    { candidateId: "two", marker: "clone-two", previewThemeId: "warm-paper-terracotta", rawDump: true },
    { candidateId: "three", marker: "clone-three", previewThemeId: "sandstone-archive", rawDump: true }
  ]) {
    const site = await writeV511Site(root, project, variant.variantId, {
      ...item,
      narrativeId: "same-narrative",
      overviewType: "chart",
      focusType: "matrix",
      interactionType: "filter",
      structure: "radar"
    });
    await importV5DesignCandidate(project, variant.variantId, site.directory);
  }
  await assert.rejects(() => prepareV5CandidateReviewSet(project, variant.variantId), /candidate review audit failed.+raw source block|template-convergence|distinct narrative/is);
});

test("V5.3 candidate review exposes one compact executable 1440x900 sample per candidate", async (t) => {
  const { root, project, variant } = await fixture(t, { reference: true, version: "5.3.0" });
  const site = await writeV511Site(root, project, variant.variantId, {
    candidateId: "network-atlas",
    marker: "network-atlas",
    narrativeId: "network-evidence",
    overviewType: "flow",
    focusType: "matrix",
    interactionType: "filter",
    structure: "lab"
  });
  await importV5DesignCandidate(project, variant.variantId, site.directory);
  const review = await prepareV5CandidateReviewSet(project, variant.variantId);
  assert.equal(review.candidates.length, 1);
  assert.deepEqual(Object.keys(review.candidates[0]).sort(), ["candidateId", "interaction", "narrative", "screenshot", "visualization"]);
  assert.equal(path.isAbsolute(review.candidates[0].screenshot), true);
  assert.match(review.candidates[0].screenshot, /desktop\.png$/);
  assert.match(review.candidates[0].narrative, /network-evidence/i);
  assert.match(review.candidates[0].visualization, /matrix|flow/i);
  assert.match(review.candidates[0].interaction, /filter/i);
  assert.deepEqual((await readdir(path.join(site.directory, "screenshots"))).sort(), ["desktop.png"]);
});

test("V5.3 rejects missing sample selectors, fake screenshots, and full candidate packages mislabeled as samples", async (t) => {
  const missing = await fixture(t, { reference: true, version: "5.3.0" });
  const missingSite = await writeV511Site(missing.root, missing.project, missing.variant.variantId, {
    candidateId: "missing", marker: "missing", structure: "radar"
  });
  const missingManifestPath = path.join(missingSite.directory, "manifest.json");
  const missingManifest = JSON.parse(await readFile(missingManifestPath, "utf8"));
  missingManifest.sampleScope.focusModuleSelector = ".not-present";
  await writeFile(missingManifestPath, JSON.stringify(missingManifest), "utf8");
  const missingProcessPath = path.join(missingSite.directory, "design-process.json");
  const missingProcess = JSON.parse(await readFile(missingProcessPath, "utf8"));
  missingProcess.sampleScope.focusModuleSelector = ".not-present";
  const missingProcessText = JSON.stringify(missingProcess);
  await writeFile(missingProcessPath, missingProcessText, "utf8");
  missingManifest.designProcessSha256 = createHash("sha256").update(missingProcessText).digest("hex");
  await writeFile(missingManifestPath, JSON.stringify(missingManifest), "utf8");
  await refreshManifest(missingSite.directory);
  await assert.rejects(() => importV5DesignCandidate(missing.project, missing.variant.variantId, missingSite.directory), /focusModuleSelector.*index\.html/i);

  const fake = await fixture(t, { reference: true, version: "5.3.0" });
  const fakeSite = await writeV511Site(fake.root, fake.project, fake.variant.variantId, {
    candidateId: "fake", marker: "fake", structure: "briefing"
  });
  await writeFile(path.join(fakeSite.directory, "screenshots", "desktop.png"), "not a png", "utf8");
  await refreshManifest(fakeSite.directory);
  await importV5DesignCandidate(fake.project, fake.variant.variantId, fakeSite.directory);
  await assert.rejects(() => prepareV5CandidateReviewSet(fake.project, fake.variant.variantId), /real PNG/i);

  const full = await fixture(t, { reference: true, version: "5.3.0" });
  const fullSite = await writeV511Site(full.root, full.project, full.variant.variantId, {
    candidateId: "full", marker: "full", structure: "lab"
  });
  await writeFile(path.join(fullSite.directory, "screenshots", "mobile.png"), reviewPng("mobile"));
  await refreshManifest(fullSite.directory);
  await assert.rejects(() => importV5DesignCandidate(full.project, full.variant.variantId, fullSite.directory), /exactly one desktop screenshot/i);
});

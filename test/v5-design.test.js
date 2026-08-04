import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createV5Project, createV5Variant } from "../src/v5-project.js";
import { importV5Interview, prepareV5HuashuInput } from "../src/v5-interview.js";
import {
  confirmV5DesignCandidate,
  getV5FinalStatus,
  hashV5SitePayload,
  importV5DesignCandidate,
  importV5FinalSite,
  listV5DesignCandidates
} from "../src/v5-design.js";

async function fixture(t, { reference = false } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "edit-html-v5-design-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, "brief.md");
  const project = path.join(root, "project");
  await writeFile(source, "# 市场\n2028年市场规模预计达到189亿元。", "utf8");
  await createV5Project(source, project);
  const variant = await createV5Variant(project, {});
  const interview = {
    schemaVersion: 2,
    variantId: variant.variantId,
    answers: Object.fromEntries(["purpose", "contentWeight"].map((key) => [key, {
      question: key,
      response: "用户回答 " + key,
      origin: "user-provided",
      recordedAt: "2026-08-04T10:00:00.000Z"
    }])),
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

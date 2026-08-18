import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { checkFinalSiteInBrowser, inspectFactualIntegrity, preflightV5CandidateSet, preflightV5FinalSite } from "../src/v5-design-preflight.js";
import { attestHuashuDesignOutput } from "../src/v5-huashu-attestation.js";

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "edit-html-preflight-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const project = path.join(root, "project");
  const candidates = path.join(root, "candidates");
  await mkdir(path.join(project, "variants", "variant-one"), { recursive: true });
  await mkdir(candidates, { recursive: true });
  await writeFile(path.join(project, "source-model.json"), JSON.stringify({ documents: [{ units: [] }] }));
  await writeFile(path.join(project, "variants", "variant-one", "variant.json"), JSON.stringify({ releaseVersion: "5.4.1", pipelineVersion: "5.4.1" }));
  return { root, project, candidates };
}

function evidence(id) {
  return {
    schemaVersion: 1, contentAuthority: "user", designAuthority: "huashu-design", interviewSha256: "a".repeat(64),
    strategy: {
      id,
      rationale: `Independent rationale for ${id}`,
      domApproach: `Independent DOM for ${id}`,
      visualizationApproach: `Independent visualization for ${id}`,
      interactionApproach: `Independent interaction for ${id}`
    },
    sourceImages: [], selfCritique: { score: 80, strengths: ["Clear"], risks: ["Density"] }
  };
}

async function candidate(root, name, strategy) {
  const directory = path.join(root, name);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "manifest.json"), JSON.stringify({ kind: "candidate", candidateId: name }));
  await writeFile(path.join(directory, "index.html"), "<!doctype html><body><button id='toggle'>Toggle</button></body>");
  await writeFile(path.join(directory, "huashu-design-evidence.json"), JSON.stringify(evidence(strategy)));
  return directory;
}

test("candidate preflight is read-only and aggregates static, evidence, and convergence errors", async (t) => {
  const { project, candidates } = await fixture(t);
  await candidate(candidates, "a", "systematic-analysis");
  await candidate(candidates, "b", "real-world-benchmark");
  await candidate(candidates, "c", "authorial");
  const before = await treeSnapshot(candidates);
  const result = await preflightV5CandidateSet(project, "variant-one", candidates, {
    siteValidator: async (_project, _variant, directory) => {
      if (path.basename(directory) === "a") throw new Error("fact distortion");
      return { manifest: { candidateId: path.basename(directory) } };
    }
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((item) => item.code === "static-contract"));
  assert.equal(result.summary.candidateCount, 3);
  assert.deepEqual(await treeSnapshot(candidates), before);
  assert.equal((await readdir(candidates)).some((name) => /receipt|preflight/i.test(name)), false);
});

test("warning-only final preflight succeeds", async (t) => {
  const { project, root } = await fixture(t);
  const site = await candidate(root, "final", "authorial");
  const value = evidence("authorial");
  value.selfCritique.score = 60;
  await writeFile(path.join(site, "huashu-design-evidence.json"), JSON.stringify(value));
  const result = await preflightV5FinalSite(project, "variant-one", site, {
    siteValidator: async () => ({ manifest: { candidateId: "final" } }),
    browserCheck: async () => ({ errors: [], warnings: [], checks: { browserInteraction: true, responsiveOverflow: true } })
  });
  assert.equal(result.valid, true);
  assert.ok(result.warnings.some((item) => item.code === "low-huashu-self-score"));
});

test("final preflight reports invalid selector and click without state change", async (t) => {
  const { project, root } = await fixture(t);
  const site = await candidate(root, "final", "authorial");
  const result = await preflightV5FinalSite(project, "variant-one", site, {
    siteValidator: async () => ({ manifest: { candidateId: "final" } }),
    browserCheck: async () => ({
      errors: [
        { code: "invalid-interaction-selector", message: "selector matches no element" },
        { code: "interaction-no-state-change", message: "click produced no DOM state change" }
      ], warnings: [], checks: { browserInteraction: false, responsiveOverflow: true }
    })
  });
  assert.equal(result.valid, false);
  assert.equal(result.errors.length, 2);
});

test("V5.4.1 attestation refuses output before a successful sibling-set preflight", async (t) => {
  const { project, candidates } = await fixture(t);
  const site = await candidate(candidates, "a", "systematic-analysis");
  const receiptDir = path.join(project, "variants", "variant-one", "design", "stage-receipts");
  await mkdir(receiptDir, { recursive: true });
  await writeFile(path.join(receiptDir, "huashu-candidate-invocation.json"), JSON.stringify({
    owner: "huashu-design", skillName: "huashu-design", skillSha256: "b".repeat(64),
    challenge: "challenge", inputReceiptSha256: "c".repeat(64)
  }));
  await assert.rejects(
    () => attestHuashuDesignOutput(project, "variant-one", "candidate", site),
    /successful V5\.4\.1 preflight.+exactly three candidate/i
  );
});

test("real browser preflight proves a unique click state change and responsive width", async (t) => {
  const { root } = await fixture(t);
  const site = path.join(root, "browser-site");
  await mkdir(site, { recursive: true });
  await writeFile(path.join(site, "index.html"), `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;max-width:100%;overflow-x:hidden}</style><button id="toggle">Toggle</button><section id="panel" hidden>Evidence</section><script>document.querySelector('#toggle').addEventListener('click',()=>{document.querySelector('#panel').hidden=false})</script>`);
  await writeFile(path.join(site, "design-process.json"), JSON.stringify({ coreInteraction: { selector: "#toggle" } }));
  const result = await checkFinalSiteInBrowser(site);
  assert.deepEqual(result.errors, []);
  assert.equal(result.checks.browserInteraction, true);
  assert.equal(result.checks.responsiveOverflow, true);
});

test("factual preflight aggregates distorted numbers and missing final coverage", async (t) => {
  const { project, root } = await fixture(t);
  const site = path.join(root, "fact-site");
  await mkdir(path.join(project, "source-pack"), { recursive: true });
  await mkdir(site, { recursive: true });
  await writeFile(path.join(project, "source-pack", "fact-ledger.json"), JSON.stringify({ facts: [{ factId: "fact-one", rawText: "预计达到 189 亿元" }] }));
  await writeFile(path.join(project, "source-pack", "source-map.json"), JSON.stringify({ documents: [{ units: [{ sourceId: "src-one", substantive: true }, { sourceId: "src-two", substantive: true }] }] }));
  await writeFile(path.join(site, "content-bindings.json"), JSON.stringify({ bindings: [{ contentId: "claim", factIds: ["fact-one"], sourceRefs: ["src-one"] }], omissions: [] }));
  await writeFile(path.join(site, "index.html"), "<!doctype html><main data-content-id='claim'>预计达到 198 亿元</main>");
  const result = await inspectFactualIntegrity(project, site, "final");
  assert.ok(result.errors.some((item) => item.code === "fact-distortion"));
  assert.ok(result.errors.some((item) => item.code === "content-plan-missing" && item.message.includes("src-two")));
});

async function treeSnapshot(root) {
  const entries = [];
  async function visit(directory, prefix = "") {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.isDirectory()) await visit(path.join(directory, item.name), relative);
      else entries.push([relative, await readFile(path.join(directory, item.name), "utf8")]);
    }
  }
  await visit(root);
  return entries;
}

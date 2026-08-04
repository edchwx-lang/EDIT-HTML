import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createV5Project, createV5Variant } from "../src/v5-project.js";
import {
  getV5InterviewStatus,
  importV5Interview,
  prepareV5HuashuInput
} from "../src/v5-interview.js";

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "edit-html-v5-interview-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, "brief.md");
  const project = path.join(root, "project");
  await writeFile(source, "# AI服务器\n市场增长带动材料机会。", "utf8");
  await createV5Project(source, project);
  const variant = await createV5Variant(project, {});
  return { root, project, variant };
}

function interview(variantId, overrides = {}) {
  const recordedAt = "2026-08-04T10:00:00.000Z";
  return {
    schemaVersion: 1,
    variantId,
    answers: {
      purpose: { question: "网页用于什么？", response: "内部研究和投资判断", origin: "user-provided", recordedAt },
      contentWeight: { question: "重点突出什么？", response: "市场增长和12种材料", origin: "user-provided", recordedAt },
      structurePreference: { question: "如何阅读？", response: "结论先行，再交互探索", origin: "user-provided", recordedAt }
    },
    references: [],
    ...overrides
  };
}

test("V5 design preparation is blocked until all three Huashu interview answers exist", async (t) => {
  const { root, project, variant } = await fixture(t);
  await assert.rejects(() => prepareV5HuashuInput(project, variant.variantId), /confirmed interview/);

  const incompletePath = path.join(root, "incomplete.json");
  const incomplete = interview(variant.variantId);
  delete incomplete.answers.contentWeight;
  await writeFile(incompletePath, JSON.stringify(incomplete), "utf8");
  await assert.rejects(() => importV5Interview(project, variant.variantId, incompletePath), /contentWeight/);
});

test("V5 records the three answers and prepares a decision-free Huashu handoff", async (t) => {
  const { root, project, variant } = await fixture(t);
  const interviewPath = path.join(root, "interview.json");
  await writeFile(interviewPath, JSON.stringify(interview(variant.variantId)), "utf8");

  const imported = await importV5Interview(project, variant.variantId, interviewPath);
  assert.equal(imported.status, "confirmed");
  assert.equal(imported.referenceMode, "none");
  assert.match(imported.interviewSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual((await getV5InterviewStatus(project, variant.variantId)).requiredTopics, [
    "purpose", "contentWeight", "structurePreference"
  ]);

  const prepared = await prepareV5HuashuInput(project, variant.variantId);
  assert.equal(prepared.strategySelection, "three-executable-samples");
  const names = await Promise.all([
    "readable-source.md", "fact-ledger.json", "source-map.json", "tables-and-datasets.json",
    "asset-contact-sheet.html", "interview.json", "manifest.json"
  ].map(async (name) => {
    await access(path.join(prepared.inputDir, name));
    return name;
  }));
  assert.equal(names.length, 7);
  for (const forbidden of ["report-model.snapshot.json", "component-contract.schema.json", "presentation-plan.json"]) {
    await assert.rejects(access(path.join(prepared.inputDir, forbidden)));
  }
});

test("an initial visual reference changes Huashu preparation to one executable sample", async (t) => {
  const { root, project, variant } = await fixture(t);
  const interviewPath = path.join(root, "interview.json");
  await writeFile(interviewPath, JSON.stringify(interview(variant.variantId, {
    references: [{ kind: "screenshot", value: "reference.png", suppliedAtStart: true }]
  })), "utf8");
  await importV5Interview(project, variant.variantId, interviewPath);
  const prepared = await prepareV5HuashuInput(project, variant.variantId);
  assert.equal(prepared.strategySelection, "one-reference-guided-sample");
});

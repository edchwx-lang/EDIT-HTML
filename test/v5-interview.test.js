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

async function downgradeToV510(project, variantId) {
  const projectPath = path.join(project, "project.json");
  const variantPath = path.join(project, "variants", variantId, "variant.json");
  const projectJson = JSON.parse(await readFile(projectPath, "utf8"));
  const variantJson = JSON.parse(await readFile(variantPath, "utf8"));
  projectJson.packageVersion = "5.1.0";
  projectJson.pipelineVersion = "5.1.0";
  variantJson.packageVersion = "5.1.0";
  variantJson.pipelineVersion = "5.1.0";
  projectJson.variants = projectJson.variants.map((item) => item.variantId === variantId ? variantJson : item);
  await writeFile(projectPath, JSON.stringify(projectJson, null, 2), "utf8");
  await writeFile(variantPath, JSON.stringify(variantJson, null, 2), "utf8");
}

async function useLegacyV511Metadata(project, variantId) {
  const projectPath = path.join(project, "project.json");
  const variantPath = path.join(project, "variants", variantId, "variant.json");
  const projectJson = JSON.parse(await readFile(projectPath, "utf8"));
  const variantJson = JSON.parse(await readFile(variantPath, "utf8"));
  for (const record of [projectJson, variantJson]) {
    record.packageVersion = "5.1.1";
    record.pipelineVersion = "5.1.1";
    delete record.toolVersion;
    delete record.artifactContractVersion;
    delete record.editorRuntimeVersion;
  }
  projectJson.variants = projectJson.variants.map((item) => item.variantId === variantId ? variantJson : item);
  await writeFile(projectPath, JSON.stringify(projectJson, null, 2), "utf8");
  await writeFile(variantPath, JSON.stringify(variantJson, null, 2), "utf8");
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

function v51Interview(variantId, overrides = {}) {
  const recordedAt = "2026-08-04T10:00:00.000Z";
  return {
    schemaVersion: 3,
    variantId,
    answers: {
      purpose: { question: "What is the use case and audience?", response: "Executive presentation", origin: "user-provided", recordedAt },
      contentWeight: { question: "Which source content deserves emphasis?", response: "Emphasize the twelve materials without dropping the overview", origin: "user-provided", recordedAt }
    },
    decisionEvidence: {
      evidenceType: "direct-user-answer",
      verbatimUserQuote: "Purpose: Executive presentation. Emphasis: twelve materials without dropping overview.",
      recordedAt,
      topicsCovered: ["purpose", "contentWeight"]
    },
    references: [],
    ...overrides
  };
}

test("V5.1 confirms the two required content questions without forcing a third", async (t) => {
  const { root, project, variant } = await fixture(t);
  const interviewPath = path.join(root, "interview-v51.json");
  await writeFile(interviewPath, JSON.stringify(v51Interview(variant.variantId)), "utf8");

  const imported = await importV5Interview(project, variant.variantId, interviewPath);
  assert.equal(imported.status, "confirmed");
  const status = await getV5InterviewStatus(project, variant.variantId);
  assert.deepEqual(status.requiredTopics, ["purpose", "contentWeight"]);
  assert.equal(status.questionCount, 2);
  assert.equal(status.maximumQuestions, 3);
  assert.equal(status.hasMaterialClarification, false);
});

test("V5.1.1 rejects interviews without user decision evidence", async (t) => {
  const { root, project, variant } = await fixture(t);
  await useLegacyV511Metadata(project, variant.variantId);
  const value = v51Interview(variant.variantId);
  delete value.decisionEvidence;
  const interviewPath = path.join(root, "interview-v511-no-evidence.json");
  await writeFile(interviewPath, JSON.stringify(value), "utf8");
  await assert.rejects(() => importV5Interview(project, variant.variantId, interviewPath), /decisionEvidence/i);
});

test("V5.1.1 user-delegated answers require an explicit delegation quote", async (t) => {
  const { root, project, variant } = await fixture(t);
  await useLegacyV511Metadata(project, variant.variantId);
  const value = v51Interview(variant.variantId, {
    answers: Object.fromEntries(["purpose", "contentWeight"].map((key) => [key, {
      question: key,
      response: "Huashu decides from the source material",
      origin: "user-delegated",
      recordedAt: "2026-08-04T10:00:00.000Z"
    }])),
    decisionEvidence: {
      evidenceType: "explicit-user-delegation",
      verbatimUserQuote: "Make a report from this document.",
      recordedAt: "2026-08-04T10:00:00.000Z",
      topicsCovered: ["purpose", "contentWeight"]
    }
  });
  const interviewPath = path.join(root, "interview-v511-bad-delegation.json");
  await writeFile(interviewPath, JSON.stringify(value), "utf8");
  await assert.rejects(() => importV5Interview(project, variant.variantId, interviewPath), /explicit user delegation quote/i);
});

test("V5.1 accepts one source-anchored material clarification", async (t) => {
  const { root, project, variant } = await fixture(t);
  const interviewPath = path.join(root, "interview-v51-clarified.json");
  const recordedAt = "2026-08-04T10:00:00.000Z";
  const sourceMap = JSON.parse(await readFile(path.join(project, "source-pack", "source-map.json"), "utf8"));
  const sourceId = sourceMap.documents.flatMap((document) => document.units).find((unit) => unit.substantive).sourceId;
  await writeFile(interviewPath, JSON.stringify(v51Interview(variant.variantId, {
    answers: {
      ...v51Interview(variant.variantId).answers,
      contentClarification: {
        question: "Should the policy recommendations receive the same depth as the industry diagnosis?",
        response: "Keep recommendations concise but accessible",
        origin: "user-provided",
        reasonCode: "comparative-focus",
        sourceRefs: [sourceId],
        rationale: "The source contains two competing content goals.",
        recordedAt
      }
    },
    decisionEvidence: {
      evidenceType: "direct-user-answer",
      verbatimUserQuote: "Purpose: Executive presentation. Emphasis: twelve materials. Clarification: keep recommendations concise but accessible.",
      recordedAt,
      topicsCovered: ["purpose", "contentWeight", "contentClarification"]
    }
  })), "utf8");

  await importV5Interview(project, variant.variantId, interviewPath);
  const status = await getV5InterviewStatus(project, variant.variantId);
  assert.equal(status.questionCount, 3);
  assert.equal(status.hasMaterialClarification, true);
});

test("V5.1 rejects structure or design questions in the content interview", async (t) => {
  const { root, project, variant } = await fixture(t);
  for (const [name, answers, expected] of [
    ["structure", { ...v51Interview(variant.variantId).answers, structurePreference: { question: "Which layout?", response: "Map", origin: "user-provided", recordedAt: "2026-08-04T10:00:00.000Z" } }, /structurePreference.+not allowed/i],
    ["design", { ...v51Interview(variant.variantId).answers, contentClarification: { question: "Would you prefer cards or a dashboard interaction?", response: "Cards", origin: "user-provided", reasonCode: "comparative-focus", sourceRefs: ["src-one"], rationale: "Choose a format", recordedAt: "2026-08-04T10:00:00.000Z" } }, /content clarification.+design/i],
    ["takeaway", { ...v51Interview(variant.variantId).answers, contentClarification: { question: "What should the audience remember?", response: "Growth", origin: "user-provided", reasonCode: "comparative-focus", sourceRefs: ["src-one"], rationale: "Choose a takeaway", recordedAt: "2026-08-04T10:00:00.000Z" } }, /audience takeaway/i]
  ]) {
    const interviewPath = path.join(root, `interview-v51-${name}.json`);
    await writeFile(interviewPath, JSON.stringify(v51Interview(variant.variantId, { answers })), "utf8");
    await assert.rejects(() => importV5Interview(project, variant.variantId, interviewPath), expected);
  }
});

test("V5.1 requires the optional clarification to be material-driven", async (t) => {
  const { root, project, variant } = await fixture(t);
  const interviewPath = path.join(root, "interview-v51-unanchored.json");
  await writeFile(interviewPath, JSON.stringify(v51Interview(variant.variantId, {
    answers: {
      ...v51Interview(variant.variantId).answers,
      contentClarification: {
        question: "Which content scope should lead?",
        response: "Industry diagnosis",
        origin: "user-provided",
        recordedAt: "2026-08-04T10:00:00.000Z"
      }
    }
  })), "utf8");
  await assert.rejects(() => importV5Interview(project, variant.variantId, interviewPath), /reasonCode.+sourceRefs.+rationale/i);
});

test("V5.1 design preparation emits a content-only Huashu brief", async (t) => {
  const { root, project, variant } = await fixture(t);
  const interviewPath = path.join(root, "interview-v51-brief.json");
  await writeFile(interviewPath, JSON.stringify(v51Interview(variant.variantId)), "utf8");
  await importV5Interview(project, variant.variantId, interviewPath);

  const prepared = await prepareV5HuashuInput(project, variant.variantId);
  const brief = JSON.parse(await readFile(path.join(prepared.inputDir, "content-brief.json"), "utf8"));
  assert.equal(brief.schemaVersion, 1);
  assert.equal(brief.owner, "huashu-design");
  assert.equal(brief.purpose.response, "Executive presentation");
  assert.match(brief.contentWeight.response, /twelve materials/);
  assert.equal(brief.maximumInterviewQuestions, 3);
  assert.equal(brief.coveragePolicy, "focus-controls-depth-not-presence");
  assert.equal(brief.visibleRawSourceAppendix, "explicit-user-request-only");
  for (const forbidden of ["structurePreference", "pageOrder", "layout", "componentId", "chartType", "interactionType", "theme"] ) {
    assert.doesNotMatch(JSON.stringify(brief), new RegExp(forbidden, "i"));
  }
});

test("V5.1 rejects a material clarification that is not anchored in the Source Pack", async (t) => {
  const { root, project, variant } = await fixture(t);
  const interviewPath = path.join(root, "interview-v51-stale-source.json");
  await writeFile(interviewPath, JSON.stringify(v51Interview(variant.variantId, {
    answers: {
      ...v51Interview(variant.variantId).answers,
      contentClarification: {
        question: "Which source scope should receive more depth?",
        response: "The industry section",
        origin: "user-provided",
        reasonCode: "scope",
        sourceRefs: ["src-not-in-this-pack"],
        rationale: "The source contains multiple scopes.",
        recordedAt: "2026-08-04T10:00:00.000Z"
      }
    },
    decisionEvidence: {
      evidenceType: "direct-user-answer",
      verbatimUserQuote: "Purpose: Executive presentation. Emphasis: twelve materials. Clarification: industry section.",
      recordedAt: "2026-08-04T10:00:00.000Z",
      topicsCovered: ["purpose", "contentWeight", "contentClarification"]
    }
  })), "utf8");
  await assert.rejects(() => importV5Interview(project, variant.variantId, interviewPath), /unknown Source Pack reference/i);
});

test("V5 design preparation is blocked until both required Huashu interview answers exist", async (t) => {
  const { root, project, variant } = await fixture(t);
  await assert.rejects(() => prepareV5HuashuInput(project, variant.variantId), /confirmed interview/);

  const incompletePath = path.join(root, "incomplete.json");
  const incomplete = v51Interview(variant.variantId);
  delete incomplete.answers.contentWeight;
  await writeFile(incompletePath, JSON.stringify(incomplete), "utf8");
  await assert.rejects(() => importV5Interview(project, variant.variantId, incompletePath), /contentWeight/);
});

test("V5.1 reads a legacy interview but exposes the current two-question contract", async (t) => {
  const { root, project, variant } = await fixture(t);
  await downgradeToV510(project, variant.variantId);
  const interviewPath = path.join(root, "interview.json");
  await writeFile(interviewPath, JSON.stringify(interview(variant.variantId)), "utf8");

  const imported = await importV5Interview(project, variant.variantId, interviewPath);
  assert.equal(imported.status, "confirmed");
  assert.equal(imported.referenceMode, "none");
  assert.match(imported.interviewSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual((await getV5InterviewStatus(project, variant.variantId)).requiredTopics, ["purpose", "contentWeight"]);

  const prepared = await prepareV5HuashuInput(project, variant.variantId);
  assert.equal(prepared.strategySelection, "three-executable-samples");
  const names = await Promise.all([
    "readable-source.md", "fact-ledger.json", "source-map.json", "tables-and-datasets.json",
    "asset-contact-sheet.html", "interview.json", "content-brief.json", "manifest.json"
  ].map(async (name) => {
    await access(path.join(prepared.inputDir, name));
    return name;
  }));
  assert.equal(names.length, 8);
  for (const forbidden of ["report-model.snapshot.json", "component-contract.schema.json", "presentation-plan.json"]) {
    await assert.rejects(access(path.join(prepared.inputDir, forbidden)));
  }
});

test("an initial visual reference changes Huashu preparation to one executable sample", async (t) => {
  const { root, project, variant } = await fixture(t);
  const interviewPath = path.join(root, "interview.json");
  await writeFile(interviewPath, JSON.stringify(v51Interview(variant.variantId, {
    references: [{ kind: "screenshot", value: "reference.png", suppliedAtStart: true }]
  })), "utf8");
  await importV5Interview(project, variant.variantId, interviewPath);
  const prepared = await prepareV5HuashuInput(project, variant.variantId);
  assert.equal(prepared.strategySelection, "one-reference-guided-sample");
});

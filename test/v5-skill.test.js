import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("published skill documents the V5.3.0 Huashu-owned production boundary", async () => {
  const skill = await readFile(new URL("skills/edit-html-report/SKILL.md", root), "utf8");
  const agent = await readFile(new URL("skills/edit-html-report/agents/openai.yaml", root), "utf8");

  assert.match(skill, /Edit HTML Report V5\.3\.0/);
  assert.match(skill, /purpose/);
  assert.match(skill, /contentWeight/);
  assert.match(skill, /at most three|最多三问/i);
  assert.match(skill, /contentClarification/);
  assert.match(skill, /Never ask about structure/i);
  assert.match(skill, /Source Pack/i);
  assert.match(skill, /three executable samples|三套真实可执行样稿/i);
  assert.match(skill, /Instrumenter/);
  assert.match(skill, /clickable editor URL/i);
  assert.match(skill, /raw-source appendix/i);
  assert.match(skill, /audit.+must not.+modify|审计.+不得.+修改/is);
  assert.doesNotMatch(skill, /content import/);
  assert.doesNotMatch(skill, /presentation-plan/);
  assert.doesNotMatch(skill, /data-first.*evidence-first|evidence-first.*data-first/is);
  assert.doesNotMatch(skill, /confirm the design and theme|确认设计与配色/i);

  assert.match(agent, /V5\.3\.0/);
  assert.match(agent, /Huashu/i);
  assert.doesNotMatch(agent, /V4\.[0-9]/);
});

test("V5 references expose source, interview, actual-site and migration contracts", async () => {
  const files = [
    "content-pipeline.md",
    "design-selection.md",
    "huashu-design-package.md",
    "artifact-contract.md",
    "migration.md",
  ];
  const documents = await Promise.all(
    files.map((file) => readFile(new URL(`skills/edit-html-report/references/${file}`, root), "utf8")),
  );
  const combined = documents.join("\n");

  assert.match(combined, /Source Pack/);
  assert.match(combined, /user-delegated/);
  assert.match(combined, /parentCandidateSha256/);
  assert.match(combined, /content-bindings\.json/);
  assert.match(combined, /V4\.x.+不得.+重新生成|V4\.x.+must not.+regenerat/is);
  assert.doesNotMatch(combined, /presentation-plan\.json/);
});

import assert from "node:assert/strict";
import test from "node:test";

import { recommendMode } from "../src/analysis.js";
import { getModeProfile, listModeProfiles } from "../src/modes/index.js";

test("mode profiles describe both choices in the requested locale", () => {
  const choices = listModeProfiles({ locale: "zh-CN" });
  assert.deepEqual(
    choices.map((choice) => choice.mode),
    ["data-first", "evidence-first"]
  );
  assert.equal(choices[0].label, "数据优先");
  assert.equal(choices[1].label, "证据优先");
  assert.match(choices[0].description, /高密度/);
  assert.match(choices[1].description, /文字说明/);
  assert.match(choices[1].description, /原文图表/);
});

test("mode profiles keep structure defaults separate from theme colors", () => {
  assert.equal(getModeProfile("data-first").defaultThemeId, "deep-data-blue");
  assert.equal(
    getModeProfile("evidence-first").defaultThemeId,
    "warm-paper-terracotta"
  );
  assert.equal(getModeProfile("data-first").minKpiCount, 4);
  assert.equal(getModeProfile("evidence-first").allowOriginalCharts, true);
  assert.throws(() => getModeProfile("unknown"), /unknown mode "unknown"/);
});

test("mode recommendation exposes evidence rather than English presentation copy", () => {
  assert.deepEqual(recommendMode([{ numericTokenCount: 9 }]), {
    mode: "data-first",
    numericTokenCount: 9,
    quantitativeThreshold: 8,
    reasonCode: "quantitative-evidence"
  });
  assert.deepEqual(recommendMode([{ numericTokenCount: 2 }]), {
    mode: "evidence-first",
    numericTokenCount: 2,
    quantitativeThreshold: 8,
    reasonCode: "narrative-evidence"
  });
});

import assert from "node:assert/strict";
import test from "node:test";

import { visualizationForDataset } from "../src/chart-data.js";

test("numeric-text visualization does not turn a repeated fact into a comparison", () => {
  const visualization = visualizationForDataset({
    kind: "numeric-text",
    rows: [
      ["2025 年市场规模预计", 465, "亿美元"],
      ["2025 年全球市场规模预计", 465, "亿美元"]
    ]
  });
  assert.equal(visualization, null);
});

test("table visualization uses the semantic row label for shifted summary rows", () => {
  const visualization = visualizationForDataset({
    kind: "table",
    columns: ["序号", "材料名称", "2024 年", "2025 年"],
    rows: [
      ["1", "掩膜版", "73.6", "77.6"],
      ["2", "光刻胶", "29.9", "31.9"],
      ["合计", "103.5", "109.5"]
    ]
  });
  assert.deepEqual(visualization.rows.map((row) => row.label), ["掩膜版", "光刻胶", "合计"]);
});

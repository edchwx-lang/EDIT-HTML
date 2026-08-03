import assert from "node:assert/strict";
import test from "node:test";

import {
  auditThemeAccessibility,
  getTheme,
  getLegacyTheme,
  listThemes,
  migrateLegacyThemeId,
  normalizeThemeId,
  validateTheme
} from "../src/themes.js";

test("theme registry exposes the six approved palettes in stable order", () => {
  const themes = listThemes({ locale: "zh-CN" });
  assert.deepEqual(
    themes.map((theme) => theme.themeId),
    [
      "warm-paper-terracotta",
      "research-cobalt",
      "sandstone-archive",
      "deep-data-blue",
      "institutional-navy-gold",
      "signal-orange"
    ]
  );
  assert.deepEqual(
    themes.map((theme) => theme.appearance),
    ["light", "light", "light", "dark", "dark", "dark"]
  );
  assert.deepEqual(
    themes.map((theme) => theme.label),
    ["暖纸赤陶", "研究钴蓝", "砂岩档案", "深海数据蓝", "海军蓝金", "黑场信号橙"]
  );
  assert.equal(themes.every((theme) => theme.schemaVersion === 2), true);
  assert.equal(themes.every((theme) => theme.chart.categorical.length === 8), true);
  assert.equal(getTheme("institutional-navy-gold").labels["zh-CN"], "海军蓝金");
});

test("legacy theme ids remain readable but migrate explicitly", () => {
  assert.equal(normalizeThemeId("editorial-light"), "warm-paper-terracotta");
  assert.equal(normalizeThemeId("editorial-dark"), "ink-teal");
  assert.equal(normalizeThemeId("tech-dark"), "ink-teal");
  assert.equal(normalizeThemeId("consulting-light"), "research-cobalt");
  assert.equal(normalizeThemeId("signal-orange"), "signal-orange");
  assert.equal(migrateLegacyThemeId("swiss-monochrome"), "sandstone-archive");
  assert.equal(migrateLegacyThemeId("ink-teal"), "institutional-navy-gold");
  assert.equal(migrateLegacyThemeId("linear-indigo"), "deep-data-blue");
  assert.equal(getLegacyTheme("ink-teal").themeId, "ink-teal");
  assert.equal(listThemes().some((theme) => theme.themeId === "ink-teal"), false);
  assert.equal(listThemes().some((theme) => theme.themeId === "linear-indigo"), false);
  assert.equal(getLegacyTheme("linear-indigo").themeId, "linear-indigo");
});

test("theme validation rejects incomplete semantic and chart colors", () => {
  assert.throws(
    () => validateTheme({ schemaVersion: 2, themeId: "broken" }),
    /theme "broken" requires labels/
  );
  assert.throws(() => getTheme("unknown"), /unknown theme "unknown"/);
});

test("all six themes pass text, focus, tooltip, legend, and color-vision audits", () => {
  for (const theme of listThemes()) {
    const audit = auditThemeAccessibility(theme);
    assert.equal(audit.bodyContrast >= 4.5, true, theme.themeId + " body contrast");
    assert.equal(audit.focusContrast >= 3, true, theme.themeId + " focus contrast");
    assert.equal(audit.tooltipContrast >= 4.5, true, theme.themeId + " tooltip contrast");
    assert.equal(audit.uniqueSeries, 8);
    assert.deepEqual(Object.keys(audit.colorVision), ["protanopia", "deuteranopia", "tritanopia"]);
    assert.equal(audit.redundantLegendEncoding, true);
    assert.equal(audit.passes, true);
  }
});

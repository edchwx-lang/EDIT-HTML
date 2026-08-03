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
      "precision-blueprint",
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
    ["暖纸赤陶", "精密蓝图", "砂岩档案", "深海数据蓝", "海军蓝金", "黑场信号橙"]
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
  assert.equal(migrateLegacyThemeId("research-cobalt"), "precision-blueprint");
  assert.equal(getLegacyTheme("research-cobalt").themeId, "research-cobalt");
  assert.equal(listThemes().some((theme) => theme.themeId === "research-cobalt"), false);
  assert.equal(getLegacyTheme("ink-teal").themeId, "ink-teal");
  assert.equal(listThemes().some((theme) => theme.themeId === "ink-teal"), false);
  assert.equal(listThemes().some((theme) => theme.themeId === "linear-indigo"), false);
  assert.equal(getLegacyTheme("linear-indigo").themeId, "linear-indigo");
});

test("precision blueprint uses the approved immutable semantic and series tokens", () => {
  const theme = getTheme("precision-blueprint");
  assert.equal(theme.appearance, "light");
  assert.deepEqual(
    Object.fromEntries([
      "canvas", "surface", "surfaceAlt", "text", "textMuted", "border", "accent",
      "focus", "crosshair", "positive", "warning", "negative", "tableHeader",
      "tableStripe", "evidenceHighlight"
    ].map((key) => [key, theme.tokens[key]])),
    {
      canvas: "#F2F5F7", surface: "#FFFFFF", surfaceAlt: "#D9EAF4",
      text: "#10283F", textMuted: "#526678", border: "#B8C6D1",
      accent: "#075F9B", focus: "#D75B32", crosshair: "#D75B32",
      positive: "#267A5E", warning: "#8A5A00", negative: "#B33A35",
      tableHeader: "#073B61", tableStripe: "#F2F5F7", evidenceHighlight: "#F7E4DB"
    }
  );
  assert.deepEqual(theme.chart.categorical, [
    "#075F9B", "#D75B32", "#1F7A74", "#7C5AA6",
    "#A46812", "#3E6F8E", "#8A4C6F", "#527A3B"
  ]);
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

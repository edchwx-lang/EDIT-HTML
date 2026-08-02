import assert from "node:assert/strict";
import test from "node:test";

import {
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
      "linear-indigo",
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
    ["暖纸赤陶", "研究钴蓝", "砂岩档案", "线性靛蓝", "海军蓝金", "黑场信号橙"]
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
  assert.equal(getLegacyTheme("ink-teal").themeId, "ink-teal");
  assert.equal(listThemes().some((theme) => theme.themeId === "ink-teal"), false);
});

test("theme validation rejects incomplete semantic and chart colors", () => {
  assert.throws(
    () => validateTheme({ schemaVersion: 2, themeId: "broken" }),
    /theme "broken" requires labels/
  );
  assert.throws(() => getTheme("unknown"), /unknown theme "unknown"/);
});

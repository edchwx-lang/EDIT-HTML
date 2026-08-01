import assert from "node:assert/strict";
import test from "node:test";

import {
  getTheme,
  listThemes,
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
      "swiss-monochrome",
      "ink-teal",
      "linear-indigo",
      "signal-orange"
    ]
  );
  assert.deepEqual(
    themes.map((theme) => theme.appearance),
    ["light", "light", "light", "dark", "dark", "dark"]
  );
  assert.deepEqual(
    themes.map((theme) => theme.label),
    ["暖纸赤陶", "研究钴蓝", "瑞士黑白", "墨海荧青", "线性靛蓝", "黑场信号橙"]
  );
  assert.equal(getTheme("ink-teal").labels["zh-CN"], "墨海荧青");
});

test("legacy theme ids migrate to approved palettes", () => {
  assert.equal(normalizeThemeId("editorial-light"), "warm-paper-terracotta");
  assert.equal(normalizeThemeId("editorial-dark"), "ink-teal");
  assert.equal(normalizeThemeId("tech-dark"), "ink-teal");
  assert.equal(normalizeThemeId("consulting-light"), "research-cobalt");
  assert.equal(normalizeThemeId("signal-orange"), "signal-orange");
});

test("theme validation rejects incomplete semantic and chart colors", () => {
  assert.throws(
    () => validateTheme({ schemaVersion: 1, themeId: "broken" }),
    /theme "broken" requires labels/
  );
  assert.throws(() => getTheme("unknown"), /unknown theme "unknown"/);
});

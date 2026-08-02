export const THEME_SCHEMA_VERSION = 2;

const REQUIRED_TOKENS = [
  "canvas", "surface", "surfaceAlt", "text", "textMuted", "border",
  "accent", "focus", "positive", "warning", "negative", "hover",
  "selection", "crosshair", "tableHeader", "tableStripe", "evidenceHighlight"
];

const REQUIRED_CHART_TOKENS = [
  "grid", "axis", "tooltipBackground", "tooltipText"
];

const LEGACY_ALIASES = new Map([
  ["editorial-light", "warm-paper-terracotta"],
  ["editorial-dark", "ink-teal"],
  ["tech-dark", "ink-teal"],
  ["consulting-light", "research-cobalt"]
]);

const MIGRATION_MAP = new Map([
  ["swiss-monochrome", "sandstone-archive"],
  ["ink-teal", "institutional-navy-gold"]
]);

const THEMES = [
  theme("warm-paper-terracotta", "暖纸赤陶", "Warm Paper Terracotta", "light", {
    canvas: "#F5F0E8", surface: "#FFFDFC", surfaceAlt: "#E8DED0",
    text: "#191919", textMuted: "#6F675F", border: "#D8CEC1",
    accent: "#CC785C", focus: "#CC785C", positive: "#2F7D63",
    warning: "#A56A23", negative: "#A63E32"
  }, ["#CC785C", "#4F7C82", "#D39B45", "#75639A", "#69935B", "#B65D73", "#3F6FA6", "#8B6655"]),
  theme("research-cobalt", "研究钴蓝", "Research Cobalt", "light", {
    canvas: "#F8FAFC", surface: "#FFFFFF", surfaceAlt: "#E7EEF7",
    text: "#0F172A", textMuted: "#64748B", border: "#D7E0EA",
    accent: "#0066FF", focus: "#0066FF", positive: "#087F5B",
    warning: "#9A6700", negative: "#B42318"
  }, ["#0066FF", "#00A6A6", "#7C3AED", "#E87900", "#D63384", "#16A34A", "#64748B", "#B38A00"]),
  theme("sandstone-archive", "砂岩档案", "Sandstone Archive", "light", {
    canvas: "#EDE8E0", surface: "#F7F3ED", surfaceAlt: "#E2DBD1",
    text: "#1A1A1A", textMuted: "#5A5A5A", border: "#B8B0A4",
    accent: "#8A8178", focus: "#756B61", positive: "#52735F",
    warning: "#956D32", negative: "#9A4F4A"
  }, ["#8A8178", "#566D73", "#A66F4D", "#75677F", "#7C8056", "#4E6A82", "#91646B", "#5D5A55"]),
  theme("linear-indigo", "线性靛蓝", "Linear Indigo", "dark", {
    canvas: "#08090A", surface: "#13151A", surfaceAlt: "#1B1E26",
    text: "#F5F5F7", textMuted: "#9DA4B0", border: "#2A2D35",
    accent: "#5E6AD2", focus: "#7C85E8", positive: "#4CC9A7",
    warning: "#D6A756", negative: "#EF6A73"
  }, ["#5E6AD2", "#4EA7FC", "#B59AFF", "#34C3B3", "#F0A35B", "#E879A9", "#8BCF65", "#AAB2C0"]),
  theme("institutional-navy-gold", "海军蓝金", "Institutional Navy Gold", "dark", {
    canvas: "#1C2644", surface: "#232F55", surfaceAlt: "#2D3A60",
    text: "#E2DCD0", textMuted: "#9AA5B8", border: "#4E5A6E",
    accent: "#C8A870", focus: "#E0C58B", positive: "#5FB58B",
    warning: "#D6A756", negative: "#E07A76"
  }, ["#C8A870", "#5B8DEF", "#55B3A4", "#A886D9", "#D8786F", "#87A65A", "#D3944B", "#8FA5BC"]),
  theme("signal-orange", "黑场信号橙", "Signal Orange", "dark", {
    canvas: "#000000", surface: "#111111", surfaceAlt: "#1D1D1D",
    text: "#FFFFFF", textMuted: "#A1A1A1", border: "#2B2B2B",
    accent: "#FF6900", focus: "#FF8A3D", positive: "#42C977",
    warning: "#FFB000", negative: "#F04438"
  }, ["#FF6900", "#FFB000", "#3EA6FF", "#32C98D", "#B47CFF", "#FF5F8F", "#84CC16", "#A8B0BC"])
];

const LEGACY_THEMES = [
  legacyTheme("swiss-monochrome", "瑞士黑白", "Swiss Monochrome", "light", {
    canvas: "#FFFFFF", surface: "#FFFFFF", surfaceAlt: "#F2F2F2", text: "#000000",
    textMuted: "#6B6B6B", border: "#D9D9D9", accent: "#000000", focus: "#000000",
    positive: "#2F6B3C", warning: "#806000", negative: "#A12622"
  }, ["#000000", "#777777", "#BDBDBD"]),
  legacyTheme("ink-teal", "墨海荧青", "Ink Teal", "dark", {
    canvas: "#0A192F", surface: "#112240", surfaceAlt: "#172D4D", text: "#CCD6F6",
    textMuted: "#8892B0", border: "#233554", accent: "#64FFDA", focus: "#64FFDA",
    positive: "#64FFDA", warning: "#F4B860", negative: "#FF7B72"
  }, ["#64FFDA", "#4CC9C0", "#5B8DEF"])
];

const THEME_MAP = new Map(THEMES.map((item) => [item.themeId, deepFreeze(validateTheme(item))]));
const LEGACY_THEME_MAP = new Map(LEGACY_THEMES.map((item) => [item.themeId, deepFreeze(item)]));

export function listThemes({ locale = "en" } = {}) {
  return THEMES.map((item) => cloneTheme(item, locale));
}

export function getTheme(themeId) {
  const normalized = normalizeThemeId(themeId);
  const item = THEME_MAP.get(normalized) ?? LEGACY_THEME_MAP.get(normalized);
  if (!item) throw new Error('unknown theme "' + themeId + '"');
  return item;
}

export function getLegacyTheme(themeId) {
  const item = LEGACY_THEME_MAP.get(normalizeThemeId(themeId));
  if (!item) throw new Error('unknown legacy theme "' + themeId + '"');
  return item;
}

export function normalizeThemeId(themeId) {
  return LEGACY_ALIASES.get(themeId) ?? themeId;
}

export function migrateLegacyThemeId(themeId) {
  const normalized = normalizeThemeId(themeId);
  return MIGRATION_MAP.get(normalized) ?? normalized;
}

export function validateTheme(item) {
  const identity = item?.themeId ?? "unknown";
  if (!item?.labels?.["zh-CN"] || !item.labels.en) throw new Error('theme "' + identity + '" requires labels');
  if (item.schemaVersion !== THEME_SCHEMA_VERSION) throw new Error('theme "' + identity + '" has an unsupported schema version');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(identity)) throw new Error('theme "' + identity + '" has an invalid id');
  if (!['light', 'dark'].includes(item.appearance)) throw new Error('theme "' + identity + '" requires light or dark appearance');
  for (const token of REQUIRED_TOKENS) validateColor(item.tokens?.[token], identity, "tokens." + token);
  if (!Array.isArray(item.chart?.categorical) || item.chart.categorical.length !== 8) throw new Error('theme "' + identity + '" requires eight chart colors');
  item.chart.categorical.forEach((color, index) => validateColor(color, identity, "chart.categorical[" + index + "]"));
  for (const token of REQUIRED_CHART_TOKENS) validateColor(item.chart?.[token], identity, "chart." + token);
  for (const background of [item.tokens.canvas, item.tokens.surface]) {
    if (contrastRatio(item.tokens.text, background) < 4.5) throw new Error('theme "' + identity + '" text contrast is below WCAG AA');
  }
  return item;
}

function theme(themeId, zh, en, appearance, base, categorical) {
  return {
    schemaVersion: THEME_SCHEMA_VERSION,
    themeId, labels: { "zh-CN": zh, en }, appearance,
    tokens: {
      ...base,
      hover: mix(base.accent, base.surface, 0.14),
      selection: mix(base.accent, base.surface, 0.24),
      crosshair: base.accent,
      tableHeader: base.surfaceAlt,
      tableStripe: mix(base.surfaceAlt, base.surface, 0.52),
      evidenceHighlight: mix(base.accent, base.surface, 0.12)
    },
    chart: {
      categorical,
      grid: base.border,
      axis: base.textMuted,
      tooltipBackground: base.text,
      tooltipText: base.surface
    }
  };
}

function legacyTheme(themeId, zh, en, appearance, tokens, categorical) {
  return {
    schemaVersion: 1,
    themeId, labels: { "zh-CN": zh, en }, appearance, tokens,
    chart: { categorical, grid: tokens.border, axis: tokens.textMuted, tooltipBackground: tokens.text, tooltipText: tokens.surface }
  };
}

function cloneTheme(item, locale) {
  return {
    ...item,
    label: locale.toLowerCase().startsWith("zh") ? item.labels["zh-CN"] : item.labels.en,
    labels: { ...item.labels }, tokens: { ...item.tokens },
    chart: { ...item.chart, categorical: [...item.chart.categorical] }
  };
}

function mix(foreground, background, amount) {
  const fg = hexChannels(foreground);
  const bg = hexChannels(background);
  return "#" + fg.map((value, index) => Math.round(value * amount + bg[index] * (1 - amount)).toString(16).padStart(2, "0")).join("").toUpperCase();
}

function validateColor(value, themeId, field) {
  if (!/^#[0-9A-F]{6}$/.test(value ?? "")) throw new Error('theme "' + themeId + '" requires valid color ' + field);
}

function contrastRatio(foreground, background) {
  const light = Math.max(luminance(foreground), luminance(background));
  const dark = Math.min(luminance(foreground), luminance(background));
  return (light + 0.05) / (dark + 0.05);
}

function luminance(color) {
  const channels = hexChannels(color).map((channel) => channel / 255).map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function hexChannels(color) {
  return color.slice(1).match(/.{2}/g).map((channel) => Number.parseInt(channel, 16));
}

function deepFreeze(value) {
  Object.freeze(value);
  for (const child of Object.values(value)) if (child && typeof child === "object" && !Object.isFrozen(child)) deepFreeze(child);
  return value;
}

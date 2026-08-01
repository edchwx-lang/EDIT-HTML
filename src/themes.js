export const THEME_SCHEMA_VERSION = 1;

const REQUIRED_TOKENS = [
  "canvas",
  "surface",
  "surfaceAlt",
  "text",
  "textMuted",
  "border",
  "accent",
  "focus",
  "positive",
  "warning",
  "negative"
];

const REQUIRED_CHART_TOKENS = [
  "grid",
  "axis",
  "tooltipBackground",
  "tooltipText"
];

const LEGACY_THEME_IDS = new Map([
  ["editorial-light", "warm-paper-terracotta"],
  ["editorial-dark", "ink-teal"],
  ["tech-dark", "ink-teal"],
  ["consulting-light", "research-cobalt"]
]);

const THEMES = [
  {
    schemaVersion: THEME_SCHEMA_VERSION,
    themeId: "warm-paper-terracotta",
    labels: { "zh-CN": "暖纸赤陶", en: "Warm Paper Terracotta" },
    appearance: "light",
    tokens: {
      canvas: "#F5F0E8",
      surface: "#FFFDFC",
      surfaceAlt: "#E8DED0",
      text: "#191919",
      textMuted: "#6F675F",
      border: "#D8CEC1",
      accent: "#CC785C",
      focus: "#CC785C",
      positive: "#2F7D63",
      warning: "#A56A23",
      negative: "#A63E32"
    },
    chart: {
      categorical: ["#CC785C", "#8B6655", "#D9A36F"],
      grid: "#D8CEC1",
      axis: "#6F675F",
      tooltipBackground: "#191919",
      tooltipText: "#FFFDFC"
    }
  },
  {
    schemaVersion: THEME_SCHEMA_VERSION,
    themeId: "research-cobalt",
    labels: { "zh-CN": "研究钴蓝", en: "Research Cobalt" },
    appearance: "light",
    tokens: {
      canvas: "#F8FAFC",
      surface: "#FFFFFF",
      surfaceAlt: "#E7EEF7",
      text: "#0F172A",
      textMuted: "#64748B",
      border: "#D7E0EA",
      accent: "#0066FF",
      focus: "#0066FF",
      positive: "#087F5B",
      warning: "#9A6700",
      negative: "#B42318"
    },
    chart: {
      categorical: ["#0066FF", "#38BDF8", "#10B981"],
      grid: "#D7E0EA",
      axis: "#64748B",
      tooltipBackground: "#0F172A",
      tooltipText: "#FFFFFF"
    }
  },
  {
    schemaVersion: THEME_SCHEMA_VERSION,
    themeId: "swiss-monochrome",
    labels: { "zh-CN": "瑞士黑白", en: "Swiss Monochrome" },
    appearance: "light",
    tokens: {
      canvas: "#FFFFFF",
      surface: "#FFFFFF",
      surfaceAlt: "#F2F2F2",
      text: "#000000",
      textMuted: "#6B6B6B",
      border: "#D9D9D9",
      accent: "#000000",
      focus: "#000000",
      positive: "#2F6B3C",
      warning: "#806000",
      negative: "#A12622"
    },
    chart: {
      categorical: ["#000000", "#777777", "#BDBDBD"],
      grid: "#D9D9D9",
      axis: "#6B6B6B",
      tooltipBackground: "#000000",
      tooltipText: "#FFFFFF"
    }
  },
  {
    schemaVersion: THEME_SCHEMA_VERSION,
    themeId: "ink-teal",
    labels: { "zh-CN": "墨海荧青", en: "Ink Teal" },
    appearance: "dark",
    tokens: {
      canvas: "#0A192F",
      surface: "#112240",
      surfaceAlt: "#172D4D",
      text: "#CCD6F6",
      textMuted: "#8892B0",
      border: "#233554",
      accent: "#64FFDA",
      focus: "#64FFDA",
      positive: "#64FFDA",
      warning: "#F4B860",
      negative: "#FF7B72"
    },
    chart: {
      categorical: ["#64FFDA", "#4CC9C0", "#5B8DEF"],
      grid: "#233554",
      axis: "#8892B0",
      tooltipBackground: "#CCD6F6",
      tooltipText: "#0A192F"
    }
  },
  {
    schemaVersion: THEME_SCHEMA_VERSION,
    themeId: "linear-indigo",
    labels: { "zh-CN": "线性靛蓝", en: "Linear Indigo" },
    appearance: "dark",
    tokens: {
      canvas: "#08090A",
      surface: "#13151A",
      surfaceAlt: "#1B1E26",
      text: "#F5F5F7",
      textMuted: "#9DA4B0",
      border: "#2A2D35",
      accent: "#5E6AD2",
      focus: "#7C85E8",
      positive: "#4CC9A7",
      warning: "#D6A756",
      negative: "#EF6A73"
    },
    chart: {
      categorical: ["#5E6AD2", "#4EA7FC", "#B59AFF"],
      grid: "#2A2D35",
      axis: "#9DA4B0",
      tooltipBackground: "#F5F5F7",
      tooltipText: "#08090A"
    }
  },
  {
    schemaVersion: THEME_SCHEMA_VERSION,
    themeId: "signal-orange",
    labels: { "zh-CN": "黑场信号橙", en: "Signal Orange" },
    appearance: "dark",
    tokens: {
      canvas: "#000000",
      surface: "#111111",
      surfaceAlt: "#1D1D1D",
      text: "#FFFFFF",
      textMuted: "#A1A1A1",
      border: "#2B2B2B",
      accent: "#FF6900",
      focus: "#FF8A3D",
      positive: "#42C977",
      warning: "#FFB000",
      negative: "#F04438"
    },
    chart: {
      categorical: ["#FF6900", "#FFB000", "#D53A24"],
      grid: "#2B2B2B",
      axis: "#A1A1A1",
      tooltipBackground: "#FFFFFF",
      tooltipText: "#000000"
    }
  }
];

const THEME_MAP = new Map();
for (const theme of THEMES) {
  validateTheme(theme);
  if (THEME_MAP.has(theme.themeId)) {
    throw new Error('duplicate theme "' + theme.themeId + '"');
  }
  THEME_MAP.set(theme.themeId, deepFreeze(theme));
}

export function listThemes({ locale = "en" } = {}) {
  return THEMES.map((theme) => ({
    ...theme,
    label: labelFor(theme, locale),
    labels: { ...theme.labels },
    tokens: { ...theme.tokens },
    chart: {
      ...theme.chart,
      categorical: [...theme.chart.categorical]
    }
  }));
}

export function getTheme(themeId) {
  const normalized = normalizeThemeId(themeId);
  const theme = THEME_MAP.get(normalized);
  if (!theme) throw new Error('unknown theme "' + themeId + '"');
  return theme;
}

export function normalizeThemeId(themeId) {
  return LEGACY_THEME_IDS.get(themeId) ?? themeId;
}

export function validateTheme(theme) {
  const identity = theme?.themeId ?? "unknown";
  if (!theme?.labels || !theme.labels["zh-CN"] || !theme.labels.en) {
    throw new Error('theme "' + identity + '" requires labels');
  }
  if (theme.schemaVersion !== THEME_SCHEMA_VERSION) {
    throw new Error('theme "' + identity + '" has an unsupported schema version');
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(identity)) {
    throw new Error('theme "' + identity + '" has an invalid id');
  }
  if (theme.appearance !== "light" && theme.appearance !== "dark") {
    throw new Error('theme "' + identity + '" requires light or dark appearance');
  }
  for (const token of REQUIRED_TOKENS) {
    validateColor(theme.tokens?.[token], identity, "tokens." + token);
  }
  if (!Array.isArray(theme.chart?.categorical) || theme.chart.categorical.length < 3) {
    throw new Error('theme "' + identity + '" requires three chart colors');
  }
  theme.chart.categorical.forEach((color, index) =>
    validateColor(color, identity, "chart.categorical[" + index + "]")
  );
  for (const token of REQUIRED_CHART_TOKENS) {
    validateColor(theme.chart?.[token], identity, "chart." + token);
  }
  for (const background of [theme.tokens.canvas, theme.tokens.surface]) {
    if (contrastRatio(theme.tokens.text, background) < 4.5) {
      throw new Error('theme "' + identity + '" text contrast is below WCAG AA');
    }
  }
  return theme;
}

function labelFor(theme, locale) {
  return locale.toLowerCase().startsWith("zh")
    ? theme.labels["zh-CN"]
    : theme.labels.en;
}

function validateColor(value, themeId, field) {
  if (!/^#[0-9A-F]{6}$/.test(value ?? "")) {
    throw new Error('theme "' + themeId + '" requires valid color ' + field);
  }
}

function contrastRatio(foreground, background) {
  const light = Math.max(luminance(foreground), luminance(background));
  const dark = Math.min(luminance(foreground), luminance(background));
  return (light + 0.05) / (dark + 0.05);
}

function luminance(color) {
  const channels = color
    .slice(1)
    .match(/.{2}/g)
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4
    );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function deepFreeze(value) {
  Object.freeze(value);
  for (const child of Object.values(value)) {
    if (child && typeof child === "object" && !Object.isFrozen(child)) {
      deepFreeze(child);
    }
  }
  return value;
}

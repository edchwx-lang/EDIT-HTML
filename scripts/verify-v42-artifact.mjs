import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { chromium } from "playwright";

const [
  artifactPath,
  outputDir,
  expectedDesignDirection,
  expectedTheme,
  expectedDesignPackageSha
] = process.argv.slice(2);
if (!artifactPath) {
  throw new Error("usage: node scripts/verify-v42-artifact.mjs <artifact.html> [outputDir] [expectedDesignDirection] [expectedTheme] [expectedDesignPackageSha]");
}
if (outputDir) await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
try {
  for (const viewport of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 390, height: 844 }
  ]) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));
    await page.goto(pathToFileURL(path.resolve(artifactPath)).href, { waitUntil: "load" });

    const state = await page.evaluate(() => ({
      designDirection: document.documentElement.dataset.designDirection,
      designPackageSha: document.documentElement.dataset.designPackageSha,
      previewTheme: document.documentElement.dataset.previewTheme,
      theme: document.documentElement.dataset.theme,
      rootOverflow: document.documentElement.scrollWidth - window.innerWidth,
      tables: document.querySelectorAll("table").length,
      charts: document.querySelectorAll(".interactive-chart").length,
      chartPackageBindings: document.querySelectorAll("[data-chart-component-id]").length,
      materialButtons: document.querySelectorAll(".entity-selector button").length,
      dimensions: document.querySelectorAll(".dimension-tabs button").length,
      figures: document.querySelectorAll(".source-figure img").length,
      metricValues: document.querySelectorAll(".metric-values").length,
      remoteResources: performance.getEntriesByType("resource")
        .map((entry) => entry.name)
        .filter((name) => /^https?:/i.test(name))
    }));

    if (consoleErrors.length) throw new Error(`${viewport.name} console errors: ${consoleErrors.join(" | ")}`);
    if (state.rootOverflow > 1) throw new Error(`${viewport.name} root overflow: ${state.rootOverflow}px`);
    if (expectedDesignDirection && state.designDirection !== expectedDesignDirection) {
      throw new Error("wrong design direction");
    }
    if (expectedTheme && (state.previewTheme !== expectedTheme || state.theme !== expectedTheme)) {
      throw new Error("preview and final theme differ");
    }
    if (expectedDesignPackageSha && state.designPackageSha !== expectedDesignPackageSha) {
      throw new Error("artifact design package SHA differs from confirmed candidate");
    }
    if (state.materialButtons !== 12) throw new Error(`expected 12 material buttons, got ${state.materialButtons}`);
    if (!state.tables || !state.charts || !state.chartPackageBindings || !state.dimensions) {
      throw new Error("table, chart, chart-package binding, or material dimensions are missing");
    }
    if (state.remoteResources.length) throw new Error(`remote resources: ${state.remoteResources.join(", ")}`);

    const materialButtons = page.locator(".entity-selector button");
    await materialButtons.nth(1).click();
    const visiblePanel = page.locator(".entity-panel:not([hidden])");
    const visiblePanelCount = await visiblePanel.count();
    if (visiblePanelCount !== 1) throw new Error(`material selection revealed ${visiblePanelCount} panels`);
    const tabs = visiblePanel.locator(".dimension-tabs button");
    if (await tabs.count() > 1) await tabs.nth(1).click();
    const visibleArticle = visiblePanel.locator(":scope > article[data-dimension-panel]:not([hidden])");
    const visibleArticleCount = await visibleArticle.count();
    if (visibleArticleCount !== 1) throw new Error(`dimension selection revealed ${visibleArticleCount} articles`);
    const chartRow = page.locator(".chart-row").first();
    await chartRow.hover();
    if (!await page.locator(".chart-tooltip").isVisible()) throw new Error("chart tooltip did not become visible");

    if (outputDir) {
      await page.screenshot({
        path: path.join(outputDir, `${viewport.name}.png`),
        animations: "disabled"
      });
    }
    results.push({ viewport, ...state, consoleErrors });
    await page.close();
  }
} finally {
  await browser.close();
}

process.stdout.write(JSON.stringify({ valid: true, results }, null, 2));

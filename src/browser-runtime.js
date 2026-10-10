import { access, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const remedy = "Run edit-html-report setup browser to install Chromium, or set EDIT_HTML_BROWSER=msedge for installed Edge. You can also set EDIT_HTML_BROWSER_EXECUTABLE_PATH to a browser executable.";

// Shared by preflight, frozen-site verification, and doctor. No editor code changes.
export async function launchDesignBrowser({ playwright, env = process.env } = {}) {
  const requested = env.EDIT_HTML_BROWSER || "auto";
  if (!["auto", "chromium", "msedge", "chrome"].includes(requested)) {
    throw new Error("EDIT_HTML_BROWSER must be auto, chromium, msedge, or chrome");
  }
  const executablePath = env.EDIT_HTML_BROWSER_EXECUTABLE_PATH;
  if (executablePath) {
    try {
      await access(executablePath);
      if (!(await stat(executablePath)).isFile()) throw new Error("not a file");
    } catch {
      throw new Error(`EDIT_HTML_BROWSER_EXECUTABLE_PATH is not a readable executable: ${executablePath}`);
    }
  }
  try { playwright ??= await import("playwright"); }
  catch (error) { throw new Error(`Playwright runtime is missing; run npm ci and npm run install:local. ${error.message}`); }
  const selections = executablePath ? ["executable"] : requested === "auto" ? ["chromium", "msedge", "chrome"] : [requested];
  const attempts = [];
  for (const selected of selections) {
    const options = { headless: true, timeout: 10000 };
    if (selected === "executable") options.executablePath = executablePath;
    else if (selected !== "chromium") options.channel = selected;
    try {
      const browser = await playwright.chromium.launch(options);
      attempts.push({ browser: selected, ok: true });
      return { browser, selected, executablePath: executablePath ?? null, attempts };
    } catch (error) {
      attempts.push({ browser: selected, ok: false, error: error.message });
    }
  }
  const error = new Error(`No usable design browser (${requested}). ${remedy}\n${attempts.map((item) => `${item.browser}: ${item.error}`).join("\n")}`);
  error.attempts = attempts;
  throw error;
}

export async function probeDesignBrowser(options = {}) {
  let launch;
  try {
    launch = await launchDesignBrowser(options);
    const page = await launch.browser.newPage();
    await page.setContent('<button id="probe">ready</button>');
    const executed = await page.evaluate(() => document.querySelector("#probe")?.textContent === "ready");
    if (!executed) throw new Error("browser DOM/JavaScript probe failed");
    return { ready: true, selected: launch.selected, executablePath: launch.executablePath, attempts: launch.attempts };
  } catch (error) {
    return { ready: false, error: error.message, attempts: error.attempts ?? launch?.attempts ?? [] };
  } finally { await launch?.browser.close(); }
}

export function installDesignBrowser() {
  const require = createRequire(import.meta.url);
  const cli = require.resolve("playwright/cli");
  const result = spawnSync(process.execPath, [cli, "install", "chromium"], { stdio: "inherit" });
  if (result.error || result.status !== 0) throw new Error(`Chromium installation failed: ${result.error?.message ?? result.status}. Check network access and retry edit-html-report setup browser.`);
}

import { launchDesignBrowser } from "./src/browser-runtime.js";

const { browser, selected, executablePath } = await launchDesignBrowser();
await browser.close();

export default {
  testDir: "./e2e",
  timeout: 30_000,
  use: {
    headless: true,
    ...(selected === "executable" ? { launchOptions: { executablePath } }
      : selected === "chromium" ? {} : { channel: selected })
  }
};

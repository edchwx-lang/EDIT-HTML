import { launchDesignBrowser } from "./browser-runtime.js";
import { verifyV5FinalSite as verifyFrozenSite } from "./v5-final-verification.js";

// Adapt the browser before entering the locked V5.4.0 receipt/runtime code.
export async function verifyV5FinalSite(projectDir, variantId) {
  const { browser } = await launchDesignBrowser();
  try {
    const page = await browser.newPage();
    return await verifyFrozenSite(projectDir, variantId, { page });
  } finally { await browser.close(); }
}

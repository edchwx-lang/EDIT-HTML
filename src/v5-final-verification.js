import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { writeJsonAtomic } from "./io.js";
import { requireFrozenHuashuOutput } from "./v5-stage-boundary.js";

export const FINAL_VIEWPORTS = Object.freeze({
  desktop: Object.freeze({ width: 1440, height: 900 }),
  mobile: Object.freeze({ width: 390, height: 844 })
});

export async function verifyV5FinalSite(projectDir, variantId, { page: suppliedPage } = {}) {
  const variantDir = path.join(projectDir, "variants", variantId);
  const siteDir = path.join(variantDir, "design", "package");
  const [manifest, designProcess] = await Promise.all([
    readJson(path.join(siteDir, "manifest.json")),
    readJson(path.join(siteDir, "design-process.json"))
  ]);
  if (manifest.packageVersion !== "5.3.0" || manifest.kind !== "final") {
    throw new Error("final browser verification requires a V5.3 final package");
  }
  await requireFrozenHuashuOutput(projectDir, variantId, "final");
  const payloadSha256 = await hashSitePayload(siteDir);
  if (payloadSha256 !== manifest.payloadSha256 || payloadSha256 !== manifest.outputSha256) {
    throw new Error("final verification payload does not match the final manifest");
  }
  const screenshots = {};
  for (const [name, viewport] of Object.entries(FINAL_VIEWPORTS)) {
    const bytes = await readFile(path.join(siteDir, "screenshots", `${name}.png`));
    await assertDecodedPng(bytes, viewport, `${name} screenshot`);
    screenshots[name] = {
      path: `screenshots/${name}.png`,
      sha256: sha256(bytes),
      viewport
    };
  }
  const selector = designProcess.coreInteraction?.selector;
  const event = designProcess.coreInteraction?.event;
  if (!selector || event !== "click") throw new Error("final verification requires a declared click core interaction");

  let browser = null;
  let page = suppliedPage;
  try {
    if (!page) {
      let playwright;
      try {
        playwright = await import("playwright");
      } catch (error) {
        throw new Error(`design final verify requires the Playwright dev tool: ${error.message}`);
      }
      try {
        browser = await playwright.chromium.launch({ headless: true, channel: "chrome" });
      } catch {
        browser = await playwright.chromium.launch({ headless: true });
      }
      page = await browser.newPage();
    }
    const url = pathToFileURL(path.join(siteDir, "index.html")).href;
    const desktop = await checkViewport(page, url, FINAL_VIEWPORTS.desktop, selector, true);
    const mobile = await checkViewport(page, url, FINAL_VIEWPORTS.mobile, selector, false);
    const draft = {
      schemaVersion: 1,
      stage: "final-browser-verification",
      variantId,
      packageVersion: manifest.packageVersion,
      payloadSha256,
      screenshots,
      checks: {
        desktop: { viewport: FINAL_VIEWPORTS.desktop, noHorizontalOverflow: desktop.noHorizontalOverflow },
        mobile: { viewport: FINAL_VIEWPORTS.mobile, noHorizontalOverflow: mobile.noHorizontalOverflow },
        coreInteraction: { selector, event, exercised: true, domChanged: desktop.domChanged }
      },
      timestamp: new Date().toISOString()
    };
    const receipt = { ...draft, receiptSha256: hashJson(draft) };
    const receiptPath = verificationReceiptPath(projectDir, variantId);
    const existing = await readJsonMaybe(receiptPath);
    if (existing) {
      const { receiptSha256: existingSha256, ...existingDraft } = existing;
      if (hashJson(existingDraft) !== existingSha256) throw new Error("final verification receipt integrity check failed");
      const oldIdentity = { ...existing, timestamp: undefined, receiptSha256: undefined };
      const newIdentity = { ...receipt, timestamp: undefined, receiptSha256: undefined };
      if (stableStringify(oldIdentity) !== stableStringify(newIdentity)) {
        throw new Error("final verification receipt is immutable and verification evidence changed");
      }
      await bindReceiptToVariant(projectDir, variantId, existing.receiptSha256);
      return { ...existing, receiptPath };
    }
    await writeJsonAtomic(receiptPath, receipt);
    await bindReceiptToVariant(projectDir, variantId, receipt.receiptSha256);
    return { ...receipt, receiptPath };
  } finally {
    if (browser) await browser.close();
  }
}

export async function requireV5FinalVerification(projectDir, variantId) {
  const receiptPath = verificationReceiptPath(projectDir, variantId);
  const receipt = await readJsonMaybe(receiptPath);
  if (!receipt) throw new Error("V5.3 final browser verification receipt is required before render, validation, or editor handoff");
  const { receiptSha256, ...draft } = receipt;
  if (hashJson(draft) !== receiptSha256) throw new Error("final verification receipt integrity check failed");
  const variant = await readJson(path.join(projectDir, "variants", variantId, "variant.json"));
  if (variant.finalVerificationReceiptSha256 !== receiptSha256) throw new Error("variant does not bind the final verification receipt");
  await requireFrozenHuashuOutput(projectDir, variantId, "final");
  const siteDir = path.join(projectDir, "variants", variantId, "design", "package");
  if (await hashSitePayload(siteDir) !== receipt.payloadSha256) throw new Error("final payload changed after browser verification");
  for (const [name, viewport] of Object.entries(FINAL_VIEWPORTS)) {
    const bytes = await readFile(path.join(siteDir, "screenshots", `${name}.png`));
    assertPngHeader(bytes, viewport, `${name} screenshot`);
    if (sha256(bytes) !== receipt.screenshots?.[name]?.sha256 || stableStringify(receipt.screenshots[name].viewport) !== stableStringify(viewport)) {
      throw new Error(`${name} screenshot does not match the final verification receipt`);
    }
  }
  if (receipt.checks?.desktop?.noHorizontalOverflow !== true || receipt.checks?.mobile?.noHorizontalOverflow !== true ||
      receipt.checks?.coreInteraction?.exercised !== true || receipt.checks?.coreInteraction?.domChanged !== true) {
    throw new Error("final verification receipt does not contain the required browser checks");
  }
  return { ...receipt, receiptPath };
}

async function checkViewport(page, url, viewport, selector, exerciseInteraction) {
  await page.setViewportSize(viewport);
  await page.goto(url, { waitUntil: "load" });
  const noHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  if (!noHorizontalOverflow) throw new Error(`${viewport.width}x${viewport.height} final viewport has horizontal overflow`);
  if (!exerciseInteraction) return { noHorizontalOverflow, domChanged: null };
  const locator = page.locator(selector);
  if (await locator.count() !== 1) throw new Error("final core interaction selector must match exactly one element");
  const before = await page.content();
  await locator.click();
  const after = await page.content();
  if (before === after) throw new Error("final core interaction did not produce a verifiable DOM state change");
  return { noHorizontalOverflow, domChanged: true };
}

async function assertDecodedPng(bytes, viewport, label) {
  assertPngHeader(bytes, viewport, label);
  let loadImage;
  try {
    ({ loadImage } = await import("@napi-rs/canvas"));
  } catch (error) {
    throw new Error(`design final verify requires PNG decoding support: ${error.message}`);
  }
  try {
    const image = await loadImage(bytes);
    if (image.width !== viewport.width || image.height !== viewport.height) throw new Error("decoded dimensions differ");
  } catch {
    throw new Error(`${label} must be a decodable ${viewport.width}x${viewport.height} PNG`);
  }
}

function assertPngHeader(bytes, viewport, label) {
  if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
      bytes.readUInt32BE(16) !== viewport.width || bytes.readUInt32BE(20) !== viewport.height) {
    throw new Error(`${label} must be a real ${viewport.width}x${viewport.height} PNG`);
  }
}

async function bindReceiptToVariant(projectDir, variantId, receiptSha256) {
  const variantPath = path.join(projectDir, "variants", variantId, "variant.json");
  const projectPath = path.join(projectDir, "project.json");
  const [variant, project] = await Promise.all([readJson(variantPath), readJson(projectPath)]);
  variant.finalVerificationReceiptSha256 = receiptSha256;
  const index = project.variants.findIndex((item) => item.variantId === variantId);
  if (index === -1) throw new Error(`unknown variant "${variantId}"`);
  project.variants[index] = variant;
  await writeJsonAtomic(variantPath, variant);
  await writeJsonAtomic(projectPath, project);
}

async function hashSitePayload(root) {
  const files = (await listFiles(root)).filter((name) => name !== "manifest.json").sort();
  const hash = createHash("sha256");
  for (const name of files) hash.update(name).update("\0").update(await readFile(path.join(root, ...name.split("/")))).update("\0");
  return hash.digest("hex");
}

async function listFiles(root, prefix = "") {
  const result = [];
  for (const entry of await readdir(path.join(root, ...prefix.split("/").filter(Boolean)), { withFileTypes: true })) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) result.push(...await listFiles(root, name));
    else result.push(name.replaceAll("\\", "/"));
  }
  return result;
}

function verificationReceiptPath(projectDir, variantId) {
  return path.join(projectDir, "variants", variantId, "design", "stage-receipts", "final-verification.json");
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readJsonMaybe(filePath) {
  try { return await readJson(filePath); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function hashJson(value) { return sha256(stableStringify(value)); }
function stableStringify(value) {
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => JSON.stringify(key) + ":" + stableStringify(value[key])).join(",") + "}";
  return JSON.stringify(value);
}

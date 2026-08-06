import { createHash } from "node:crypto";
import { mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { parse } from "parse5";

import { writeJsonAtomic } from "./io.js";

const SOURCE_PACK_FILES = new Set([
  "readable-source.md",
  "fact-ledger.json",
  "source-map.json",
  "tables-and-datasets.json",
  "asset-contact-sheet.html",
  "extraction-warnings.json"
]);
const APPROVED_AUDIT_ATTRIBUTES = new Set([
  "data-edit-id", "data-block-id", "data-image-id", "data-chart-id",
  "data-chart-data-for", "data-source-ref", "data-report-mode",
  "data-design-direction", "data-design-package-sha", "data-huashu-inline",
  "data-huashu-resource", "data-edit-html-report-theme"
]);

export async function writeHuashuInputManifest(projectDir, variantId) {
  const inputDir = path.join(projectDir, "variants", variantId, "design", "huashu-input");
  const names = await listFiles(inputDir);
  const allowedNames = names.filter(isAllowedHuashuInput).sort();
  for (const required of [...SOURCE_PACK_FILES, "interview.json", "content-brief.json"]) {
    if (!allowedNames.includes(required)) throw new Error(`Huashu input is missing required allowed input ${required}`);
  }
  const allowedInputs = await Promise.all(allowedNames.map(async (name) => ({
    kind: inputKind(name),
    path: name,
    sha256: sha256(await readFile(path.join(inputDir, ...name.split("/"))))
  })));
  const allowedInputSha256 = allowedInputs.map((item) => item.sha256);
  const receipt = {
    schemaVersion: 1,
    stage: "huashu-input",
    owner: "huashu-design",
    command: "design prepare",
    variantId,
    allowedInputs,
    allowedInputSha256,
    outputSha256: hashJson(allowedInputs),
    createdAt: new Date().toISOString()
  };
  const receiptPath = receiptFile(projectDir, variantId, "huashu-input");
  const stored = await writeImmutableReceipt(receiptPath, receipt);
  return receiptResult(stored, receiptPath);
}

export async function freezeHuashuOutput(projectDir, variantId, kind) {
  if (!new Set(["candidate", "final"]).has(kind)) throw new Error(`unsupported Huashu output kind ${kind}`);
  const input = await requireHuashuInputManifest(projectDir, variantId);
  const outputDir = kind === "final"
    ? path.join(projectDir, "variants", variantId, "design", "package")
    : path.join(projectDir, "variants", variantId, "design", "candidates");
  const outputSha256 = await hashDirectory(outputDir);
  const stage = `huashu-${kind}`;
  const receipt = {
    schemaVersion: 1,
    stage,
    owner: "huashu-design",
    command: kind === "final" ? "design final import" : "design candidate import",
    variantId,
    allowedInputSha256: input.allowedInputSha256,
    outputSha256,
    createdAt: new Date().toISOString()
  };
  const receiptPath = receiptFile(projectDir, variantId, stage);
  const stored = await writeImmutableReceipt(receiptPath, receipt);
  return receiptResult(stored, receiptPath);
}

export async function requireFrozenHuashuOutput(projectDir, variantId, kind = "final") {
  const stage = `huashu-${kind}`;
  const receiptPath = receiptFile(projectDir, variantId, stage);
  const receipt = await readReceipt(receiptPath, `persisted ${stage}`);
  const outputDir = kind === "final"
    ? path.join(projectDir, "variants", variantId, "design", "package")
    : path.join(projectDir, "variants", variantId, "design", "candidates");
  const actual = await hashDirectory(outputDir);
  if (actual !== receipt.outputSha256) {
    throw new Error(`${stage} output changed after its immutable receipt was written`);
  }
  const input = await requireHuashuInputManifest(projectDir, variantId);
  if (!same(receipt.allowedInputSha256, input.allowedInputSha256)) {
    throw new Error(`${stage} receipt allowed inputs do not match the Huashu input receipt`);
  }
  return receiptResult(receipt, receiptPath);
}

export async function requireHuashuInputManifest(projectDir, variantId) {
  await readReceipt(receiptFile(projectDir, variantId, "huashu-input"), "Huashu input");
  return writeHuashuInputManifest(projectDir, variantId);
}

export async function snapshotHuashuOutput(html, { siteDir } = {}) {
  const document = parse(html);
  const body = findTag(document, "body");
  const styles = [];
  const interactions = [];
  const chartDefinitions = [];
  for (const node of flatten(document)) {
    if (node.tagName === "link" && attribute(node, "rel")?.toLowerCase() === "stylesheet") {
      const href = attribute(node, "href");
      if (href && siteDir && !isExternal(href)) styles.push([href, await readFile(safeLocalPath(siteDir, href), "utf8")]);
    } else if (node.tagName === "style") {
      styles.push([attribute(node, "data-huashu-inline") ?? `inline:${styles.length}`, textContent(node)]);
    } else if (node.tagName === "script") {
      const type = attribute(node, "type")?.toLowerCase();
      let code = textContent(node);
      const source = attribute(node, "src");
      if (source && siteDir && !isExternal(source)) code = await readFile(safeLocalPath(siteDir, source), "utf8");
      const key = source ?? attribute(node, "data-huashu-inline") ?? `inline:${interactions.length + chartDefinitions.length}`;
      if (type === "application/json" || attribute(node, "data-chart-data-for")) chartDefinitions.push([key, code]);
      else interactions.push([key, code]);
    }
  }
  const css = styles.sort(byFirst).map((item) => item[1]).join("\n");
  return {
    textContent: visibleText(body),
    classNames: flatten(body).filter((node) => node.tagName).map((node) => attribute(node, "class") ?? ""),
    bodyStructure: canonicalNode(body),
    geometry: cssDeclarations(css, /^(?:display|grid(?:-.+)?|flex(?:-.+)?|position|inset|top|right|bottom|left|width|height|min-.+|max-.+|margin(?:-.+)?|padding(?:-.+)?|gap|overflow(?:-.+)?|transform)$/i),
    typography: cssDeclarations(css, /^(?:font(?:-.+)?|line-height|letter-spacing|word-spacing|text(?:-.+)?|white-space)$/i),
    visualStyles: cssDeclarations(css, null),
    chartDefinitions: chartDefinitions.sort(byFirst),
    interactionCode: interactions.sort(byFirst)
  };
}

export function assertAuditPreservedHuashuOutput(before, after) {
  const errors = [];
  if (!same(before?.textContent, after?.textContent)) errors.push("text content changed");
  if (!same(before?.classNames, after?.classNames)) errors.push("class names changed");
  if (!same(before?.bodyStructure, after?.bodyStructure)) errors.push("body structure changed");
  if (!same(before?.geometry, after?.geometry)) errors.push("geometry CSS changed");
  if (!same(before?.typography, after?.typography)) errors.push("typography CSS changed");
  if (!same(before?.chartDefinitions, after?.chartDefinitions)) errors.push("chart definitions changed");
  if (!same(before?.interactionCode, after?.interactionCode)) errors.push("interaction code changed");
  if (!same(before?.visualStyles, after?.visualStyles)) errors.push("visual styles changed");
  if (errors.length) throw new Error("audit changed Huashu-owned output: " + errors.join("; "));
  return true;
}

function isAllowedHuashuInput(name) {
  return SOURCE_PACK_FILES.has(name) || name === "interview.json" || name === "content-brief.json" ||
    name === "manifest.json" || name.startsWith("assets/") || name.startsWith("visual-references/");
}

function inputKind(name) {
  if (name === "interview.json") return "interview";
  if (name === "content-brief.json" || name === "manifest.json") return "content-brief";
  if (name.startsWith("assets/") || name.startsWith("visual-references/")) return "visual-reference";
  return "source-pack";
}

async function writeImmutableReceipt(filePath, receipt) {
  let existing = null;
  try {
    existing = JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (existing) {
    const { createdAt: _oldCreatedAt, ...oldIdentity } = existing;
    const { createdAt: _newCreatedAt, ...newIdentity } = receipt;
    if (!same(oldIdentity, newIdentity)) throw new Error(`${receipt.stage} receipt is immutable and the stage inputs or output changed`);
    return existing;
  }
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeJsonAtomic(filePath, receipt);
  return receipt;
}

async function readReceipt(filePath, label) {
  try {
    const receipt = JSON.parse(await readFile(filePath, "utf8"));
    if (!Array.isArray(receipt.allowedInputSha256) || !receipt.allowedInputSha256.every(isHash) || !isHash(receipt.outputSha256)) {
      throw new Error(`${label} receipt contains unverifiable hashes`);
    }
    return receipt;
  } catch (error) {
    if (error.code === "ENOENT") throw new Error(`${label} receipt is required before audit`);
    throw error;
  }
}

function receiptFile(projectDir, variantId, stage) {
  return path.join(projectDir, "variants", variantId, "design", "stage-receipts", `${stage}.json`);
}

function receiptResult(receipt, receiptPath) {
  return {
    ...receipt,
    receiptPath,
    receiptSha256: sha256(JSON.stringify(receipt, null, 2) + "\n")
  };
}

async function hashDirectory(root) {
  const files = (await listFiles(root)).sort();
  const hash = createHash("sha256");
  for (const name of files) hash.update(name).update("\0").update(await readFile(path.join(root, ...name.split("/")))).update("\0");
  return hash.digest("hex");
}

async function listFiles(root, prefix = "") {
  const directory = path.join(root, ...prefix.split("/").filter(Boolean));
  const entries = await readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) result.push(...await listFiles(root, name));
    else result.push(name.replaceAll("\\", "/"));
  }
  return result;
}

function canonicalNode(node) {
  if (!node) return null;
  if (node.nodeName === "#text") return ["#text", (node.value ?? "").replace(/\s+/g, " ").trim()];
  if (node.tagName === "script" || node.tagName === "style") return [node.tagName];
  const attrs = (node.attrs ?? [])
    .filter((item) => !APPROVED_AUDIT_ATTRIBUTES.has(item.name) && item.name !== "class" && !(["src", "poster"].includes(item.name) && ["img", "source", "video", "audio", "script"].includes(node.tagName)))
    .map((item) => [item.name, item.value])
    .sort(byFirst);
  return [node.tagName ?? node.nodeName, attrs, (node.childNodes ?? []).map(canonicalNode)];
}

function cssDeclarations(css, filter) {
  const declarations = [];
  for (const block of String(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const declaration of block[2].split(";")) {
      const split = declaration.indexOf(":");
      if (split === -1) continue;
      const property = declaration.slice(0, split).trim().toLowerCase();
      const value = declaration.slice(split + 1).trim();
      if (!property || !value) continue;
      if (filter ? filter.test(property) : true) declarations.push([block[1].trim(), property, value]);
    }
  }
  return declarations.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function flatten(node, result = []) {
  if (!node) return result;
  result.push(node);
  for (const child of node.childNodes ?? []) flatten(child, result);
  return result;
}

function findTag(node, name) {
  return flatten(node, []).find((item) => item.tagName === name) ?? null;
}

function attribute(node, name) {
  return node?.attrs?.find((item) => item.name === name)?.value;
}

function textContent(node) {
  if (node?.nodeName === "#text") return node.value ?? "";
  return (node?.childNodes ?? []).map(textContent).join("");
}

function visibleText(node) {
  if (node?.nodeName === "#text") return node.value ?? "";
  if (node?.tagName === "script" || node?.tagName === "style") return "";
  return (node?.childNodes ?? []).map(visibleText).join(" ").replace(/\s+/g, " ").trim();
}

function safeLocalPath(root, relative) {
  const target = path.resolve(root, relative.split(/[?#]/, 1)[0]);
  const relation = path.relative(path.resolve(root), target);
  if (relation === ".." || relation.startsWith(".." + path.sep) || path.isAbsolute(relation)) throw new Error(`resource escapes Huashu output: ${relative}`);
  return target;
}

function isExternal(value) {
  return /^(?:[a-z]+:)?\/\//i.test(value) || value.startsWith("data:");
}

function byFirst(left, right) {
  return String(left[0]).localeCompare(String(right[0]));
}

function hashJson(value) {
  return sha256(JSON.stringify(value));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function isHash(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

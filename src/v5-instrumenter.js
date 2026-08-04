import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse, serialize } from "parse5";

import { markAwaitingEditorReview } from "./editor-review.js";
import { writeJsonAtomic, writeTextAtomic } from "./io.js";
import { compileThemeIntoArtifact } from "./theme-artifact.js";
import { auditV5FinalSite } from "./v5-audit.js";

export async function instrumentV5Variant(projectDir, variantId) {
  const variantDir = path.join(projectDir, "variants", variantId);
  const siteDir = path.join(variantDir, "design", "package");
  await auditV5FinalSite(projectDir, variantId);
  const [sourceHtml, bindings, sourceMap, variant] = await Promise.all([
    readFile(path.join(siteDir, "index.html"), "utf8"),
    readJson(path.join(siteDir, "content-bindings.json")),
    readJson(path.join(projectDir, "source-pack", "source-map.json")),
    readJson(path.join(variantDir, "variant.json"))
  ]);
  const document = parse(sourceHtml);
  const bodyStructureBeforeSha256 = bodyStructureSha256(document);
  await inlineResources(document, siteDir);
  removeAttributeEverywhere(document, "data-node-id");
  const htmlNode = findTag(document, "html");
  setAttribute(htmlNode, "data-report-mode", "data-first");
  setAttribute(htmlNode, "data-design-direction", variant.designSelection?.directionId ?? "huashu-v5");
  setAttribute(htmlNode, "data-design-package-sha", variant.finalSiteSha256);
  const sourceNames = new Map();
  for (const sourceDocument of sourceMap.documents) {
    for (const unit of sourceDocument.units) sourceNames.set(unit.sourceId, sourceDocument.name);
  }
  for (const binding of bindings.bindings) {
    const node = findByAttribute(document, "data-content-id", binding.contentId);
    if (!node) throw new Error(`instrumenter cannot find content ${binding.contentId}`);
    const stable = createHash("sha256").update(binding.contentId).digest("hex").slice(0, 16);
    if (binding.editableKind === "text") setAttribute(node, "data-edit-id", "edit-" + stable);
    if (binding.editableKind === "block") setAttribute(node, "data-block-id", "block-" + stable);
    if (binding.editableKind === "image") setAttribute(node, "data-image-id", "image-" + stable);
    if (binding.editableKind === "chart") setAttribute(node, "data-chart-id", "chart-" + stable);
    const sourceId = binding.sourceRefs?.[0];
    if (sourceId) setAttribute(node, "data-source-ref", `${sourceNames.get(sourceId)}#${sourceId}`);
  }
  let artifact = serialize(document);
  const bodyStructureAfterSha256 = bodyStructureSha256(document);
  if (bodyStructureBeforeSha256 !== bodyStructureAfterSha256) {
    throw new Error("instrumenter changed Huashu body structure");
  }
  artifact = compileThemeIntoArtifact(artifact, variant.themeId);
  const artifactPath = path.join(variantDir, "artifact.html");
  await writeTextAtomic(artifactPath, artifact);
  await writeJsonAtomic(path.join(variantDir, "report-model.json"), {
    schemaVersion: 4,
    variantId,
    mode: "data-first",
    revision: 0,
    sourcePolicy: "closed",
    expressionPolicy: "free",
    editorialStatus: "huashu-v5-html",
    nodes: [],
    datasets: [],
    facts: [],
    overrides: []
  });
  await writeJsonAtomic(path.join(variantDir, "instrumentation-report.json"), {
    schemaVersion: 1,
    variantId,
    designOwner: "huashu-design",
    bodyStructureBeforeSha256,
    bodyStructureAfterSha256,
    artifactSha256: createHash("sha256").update(artifact).digest("hex"),
    injectedContracts: ["offline-resources", "editor-identities", "source-bindings", "theme-variables"],
    generatedDesign: false
  });
  await markAwaitingEditorReview(projectDir, variantId, { reason: "v5-instrumented" });
  return artifactPath;
}

async function inlineResources(document, siteDir) {
  const nodes = flatten(document);
  for (const node of nodes) {
    if (node.tagName === "link" && attribute(node, "rel") === "stylesheet") {
      const href = attribute(node, "href");
      if (!href || isExternal(href)) continue;
      const cssPath = safeLocalPath(siteDir, href);
      const css = await inlineCssUrls(await readFile(cssPath, "utf8"), path.dirname(cssPath), siteDir);
      node.nodeName = "style";
      node.tagName = "style";
      node.attrs = [{ name: "data-huashu-inline", value: href }];
      node.childNodes = [{ nodeName: "#text", value: css, parentNode: node }];
      continue;
    }
    if (node.tagName === "script") {
      const src = attribute(node, "src");
      if (!src || isExternal(src)) continue;
      const script = await readFile(safeLocalPath(siteDir, src), "utf8");
      removeAttribute(node, "src");
      node.childNodes = [{ nodeName: "#text", value: script, parentNode: node }];
      setAttribute(node, "data-huashu-inline", src);
      continue;
    }
    if (["img", "source", "video", "audio"].includes(node.tagName)) {
      for (const name of ["src", "poster"]) {
        const value = attribute(node, name);
        if (!value || isExternal(value) || value.startsWith("data:") || value.startsWith("#")) continue;
        const filePath = safeLocalPath(siteDir, value);
        const bytes = await readFile(filePath);
        setAttribute(node, name, `data:${mimeFor(filePath)};base64,${bytes.toString("base64")}`);
      }
    }
  }
}

async function inlineCssUrls(css, cssDir, siteDir) {
  const matches = [...css.matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi)];
  let result = css;
  for (const match of matches.reverse()) {
    const value = match[2];
    if (isExternal(value) || value.startsWith("data:") || value.startsWith("#")) continue;
    const absolute = path.resolve(cssDir, value);
    if (!isInside(siteDir, absolute)) throw new Error(`CSS resource escapes the Huashu site: ${value}`);
    const bytes = await readFile(absolute);
    const replacement = `url("data:${mimeFor(absolute)};base64,${bytes.toString("base64")}")`;
    result = result.slice(0, match.index) + replacement + result.slice(match.index + match[0].length);
  }
  return result;
}

function safeLocalPath(root, relative) {
  const value = relative.split(/[?#]/, 1)[0];
  const absolute = path.resolve(root, value);
  if (!isInside(root, absolute)) throw new Error(`resource escapes the Huashu site: ${relative}`);
  return absolute;
}

function isInside(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative);
}

function flatten(node, result = []) {
  result.push(node);
  for (const child of node.childNodes ?? []) flatten(child, result);
  return result;
}

function findTag(node, tagName) {
  return flatten(node, []).find((item) => item.tagName === tagName) ?? null;
}

function bodyStructureSha256(document) {
  const body = findTag(document, "body");
  const signature = structureSignature(body);
  return createHash("sha256").update(signature).digest("hex");
}

function structureSignature(node) {
  if (!node) return "";
  if (node.nodeName === "#text") return "#text:" + (node.value ?? "").replace(/\s+/g, " ").trim();
  if (node.tagName === "script" || node.tagName === "style") return `<${node.tagName}>`;
  const stableAttrs = (node.attrs ?? [])
    .filter((item) => item.name === "class" || item.name === "id" || item.name === "data-content-id")
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((item) => `${item.name}=${item.value}`).join(";");
  return `<${node.tagName ?? node.nodeName}[${stableAttrs}]>${(node.childNodes ?? []).map(structureSignature).join("")}`;
}

function findByAttribute(node, name, value) {
  return flatten(node, []).find((item) => attribute(item, name) === value) ?? null;
}

function attribute(node, name) {
  return node?.attrs?.find((item) => item.name === name)?.value ?? null;
}

function setAttribute(node, name, value) {
  if (!node) throw new Error(`cannot set ${name} on missing node`);
  node.attrs ??= [];
  const existing = node.attrs.find((item) => item.name === name);
  if (existing) existing.value = String(value);
  else node.attrs.push({ name, value: String(value) });
}

function removeAttribute(node, name) {
  if (node?.attrs) node.attrs = node.attrs.filter((item) => item.name !== name);
}

function removeAttributeEverywhere(document, name) {
  for (const node of flatten(document, [])) removeAttribute(node, name);
}

function isExternal(value) {
  return /^(?:https?:)?\/\//i.test(value);
}

function mimeFor(filePath) {
  return ({
    ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
    ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".mp4": "video/mp4"
  })[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

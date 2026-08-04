import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";

import { writeJsonAtomic } from "./io.js";

const THREE_THEMES = new Set(["precision-blueprint", "warm-paper-terracotta", "sandstone-archive"]);
const REQUIRED_FILES = [
  "index.html", "content-bindings.json", "design-rationale.md", "manifest.json",
  "screenshots/desktop.png", "screenshots/mobile.png"
];

export async function hashV5SitePayload(siteDir) {
  const files = (await listFiles(siteDir))
    .filter((name) => name !== "manifest.json")
    .sort();
  const hash = createHash("sha256");
  for (const name of files) {
    hash.update(name).update("\0").update(await readFile(path.join(siteDir, ...name.split("/")))).update("\0");
  }
  return hash.digest("hex");
}

export async function importV5DesignCandidate(projectDir, variantId, sourceDir) {
  const validation = await validateV5Site(projectDir, variantId, sourceDir, "candidate");
  const existing = await listV5DesignCandidates(projectDir, variantId);
  const variant = await readVariant(projectDir, variantId);
  if (existing.some((item) => item.candidateId !== validation.manifest.candidateId && item.directionId === validation.manifest.directionId)) {
    throw new Error("V5 candidates require distinct directionId values");
  }
  if (existing.some((item) => item.candidateId !== validation.manifest.candidateId && item.payloadSha256 === validation.payloadSha256)) {
    throw new Error("V5 candidates require distinct executable site payloads");
  }
  if (existing.some((item) => item.candidateId !== validation.manifest.candidateId && item.contentPlanSha256 !== validation.contentPlanSha256)) {
    throw new Error("V5.1 design candidates must share the same content plan");
  }
  if (variant.referenceMode === "none") {
    if (!THREE_THEMES.has(validation.manifest.previewThemeId)) throw new Error("three executable samples require the three approved light themes");
    if (existing.some((item) => item.candidateId !== validation.manifest.candidateId && item.previewThemeId === validation.manifest.previewThemeId)) {
      throw new Error("three executable samples require distinct light preview themes");
    }
  } else if (existing.some((item) => item.candidateId !== validation.manifest.candidateId)) {
    throw new Error("reference-guided design accepts exactly one executable sample");
  }
  const destination = candidatePath(projectDir, variantId, validation.manifest.candidateId);
  await rm(destination, { recursive: true, force: true });
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(sourceDir, destination, { recursive: true });
  await updateVariant(projectDir, variantId, (record) => ({ ...record, pipelineState: "awaiting-candidate-selection" }));
  return validation;
}

export async function listV5DesignCandidates(projectDir, variantId) {
  const root = path.join(projectDir, "variants", variantId, "design", "candidates");
  let entries = [];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const result = [];
  for (const entry of entries.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const validation = await validateV5Site(projectDir, variantId, path.join(root, entry.name), "candidate");
    result.push(candidateSummary(validation));
  }
  return result;
}

export async function confirmV5DesignCandidate(projectDir, variantId, candidateId) {
  assertSafeId(candidateId, "candidateId");
  const variant = await readVariant(projectDir, variantId);
  const candidates = await listV5DesignCandidates(projectDir, variantId);
  if (variant.referenceMode === "none") {
    if (candidates.length !== 3 || new Set(candidates.map((item) => item.previewThemeId)).size !== 3) {
      throw new Error("confirmation requires all three executable samples");
    }
  } else if (candidates.length !== 1) {
    throw new Error("reference-guided confirmation requires one executable sample");
  }
  const selected = candidates.find((item) => item.candidateId === candidateId);
  if (!selected) throw new Error(`unknown candidate "${candidateId}"`);
  const selection = {
    candidateId,
    directionId: selected.directionId,
    directionLabel: selected.directionLabel,
    candidateSha256: selected.payloadSha256,
    previewThemeId: selected.previewThemeId,
    contentPlanSha256: selected.contentPlanSha256,
    confirmedAt: new Date().toISOString()
  };
  await updateVariant(projectDir, variantId, (record) => ({
    ...record,
    pipelineState: "awaiting-final-site",
    themeId: selected.previewThemeId,
    designSelection: selection
  }));
  return selection;
}

export async function importV5FinalSite(projectDir, variantId, sourceDir) {
  const variant = await readVariant(projectDir, variantId);
  if (!variant.designSelection) throw new Error("final site requires a selected candidate");
  const validation = await validateV5Site(projectDir, variantId, sourceDir, "final");
  if (
    validation.manifest.parentCandidateId !== variant.designSelection.candidateId ||
    validation.manifest.parentCandidateSha256 !== variant.designSelection.candidateSha256
  ) {
    throw new Error("final site parent candidate does not match the selected candidate");
  }
  if (validation.contentPlanSha256 !== variant.designSelection.contentPlanSha256) {
    throw new Error("final site content plan does not match the selected candidate");
  }
  const destination = path.join(projectDir, "variants", variantId, "design", "package");
  const staging = destination + ".staging";
  await rm(staging, { recursive: true, force: true });
  await cp(sourceDir, staging, { recursive: true });
  const storedManifestPath = path.join(staging, "manifest.json");
  const storedManifest = JSON.parse(await readFile(storedManifestPath, "utf8"));
  storedManifest.outputSha256 = validation.payloadSha256;
  await writeJsonAtomic(storedManifestPath, storedManifest);
  await rm(destination, { recursive: true, force: true });
  await rename(staging, destination);
  await updateVariant(projectDir, variantId, (record) => ({
    ...record,
    pipelineState: "final-site-ready",
    finalSiteSha256: validation.payloadSha256
  }));
  return { ...validation, outputSha256: validation.payloadSha256 };
}

export async function getV5FinalStatus(projectDir, variantId) {
  const variant = await readVariant(projectDir, variantId);
  return {
    variantId,
    state: variant.pipelineState,
    designSelection: variant.designSelection ?? null,
    finalSiteSha256: variant.finalSiteSha256 ?? null
  };
}

async function validateV5Site(projectDir, variantId, siteDir, expectedKind) {
  for (const name of REQUIRED_FILES) await readFile(path.join(siteDir, ...name.split("/")));
  for (const directory of ["styles", "scripts", "assets", "screenshots"]) {
    const stat = await readdir(path.join(siteDir, directory));
    if (directory === "screenshots" && stat.length < 2) throw new Error("site requires desktop and mobile screenshots");
  }
  const [manifest, bindings, html, project, variant, sourceMap] = await Promise.all([
    readJson(path.join(siteDir, "manifest.json")),
    readJson(path.join(siteDir, "content-bindings.json")),
    readFile(path.join(siteDir, "index.html"), "utf8"),
    readJson(path.join(projectDir, "project.json")),
    readVariant(projectDir, variantId),
    readJson(path.join(projectDir, "source-pack", "source-map.json"))
  ]);
  if (manifest.schemaVersion !== 1 || manifest.packageVersion !== "5.1.0") throw new Error("V5.1 site manifest requires schema 1 and package 5.1.0");
  if (manifest.kind !== expectedKind) throw new Error(`expected ${expectedKind} site manifest`);
  assertSafeId(manifest.candidateId, "candidateId");
  assertSafeId(manifest.directionId, "directionId");
  if (!manifest.directionLabel?.trim()) throw new Error("site requires directionLabel");
  if (manifest.entrypoint !== "index.html") throw new Error("V5 site entrypoint must be index.html");
  if (manifest.sourcePackSha256 !== project.sourcePackSha256) throw new Error("site source pack hash is stale");
  if (manifest.interviewSha256 !== variant.interviewSha256) throw new Error("site interview hash is stale");
  const knownSourceRefs = new Set(sourceMap.documents.flatMap((document) => document.units.map((unit) => unit.sourceId)));
  validateBindings(bindings, html, expectedKind, knownSourceRefs);
  const bindingText = await readFile(path.join(siteDir, "content-bindings.json"), "utf8");
  if (manifest.contentBindingsSha256 !== sha256(bindingText)) throw new Error("content bindings SHA-256 mismatch");
  const payloadSha256 = await hashV5SitePayload(siteDir);
  if (manifest.payloadSha256 !== payloadSha256 || manifest.outputSha256 !== payloadSha256) throw new Error("site payload SHA-256 mismatch");
  if (manifest.screenshotSourceSha256 !== payloadSha256) throw new Error("screenshots must declare the executable site payload they render");
  await validateLocalRuntime(html, siteDir);
  return {
    manifest,
    bindings,
    payloadSha256,
    contentPlanSha256: hashContentPlan(bindings.coverage),
    siteDir
  };
}

function validateBindings(bindings, html, expectedKind, knownSourceRefs) {
  if (bindings.schemaVersion !== 1 || !Array.isArray(bindings.bindings) || !Array.isArray(bindings.omissions)) {
    throw new Error("content-bindings.json requires bindings and omissions arrays");
  }
  const expectedCoverageKind = expectedKind === "candidate" ? "vertical-slice" : "complete-site";
  if (bindings.coverage?.kind !== expectedCoverageKind) {
    throw new Error(`content coverage requires ${expectedCoverageKind}`);
  }
  const ids = new Set();
  const bindingsById = new Map();
  for (const binding of bindings.bindings) {
    assertSafeId(binding.contentId, "contentId");
    if (ids.has(binding.contentId)) throw new Error(`duplicate contentId "${binding.contentId}"`);
    ids.add(binding.contentId);
    bindingsById.set(binding.contentId, binding);
    if (!Array.isArray(binding.factIds) || !Array.isArray(binding.sourceRefs)) throw new Error(`binding "${binding.contentId}" requires factIds and sourceRefs`);
    if (!new Set(["main", "detail", "appendix"]).has(binding.tier)) throw new Error(`binding "${binding.contentId}" has invalid tier`);
    if (!new Set(["text", "block", "image", "chart"]).has(binding.editableKind)) throw new Error(`binding "${binding.contentId}" has invalid editableKind`);
    const pattern = new RegExp(`\\bdata-content-id\\s*=\\s*["']${escapeRegExp(binding.contentId)}["']`, "i");
    if (!pattern.test(html)) throw new Error(`binding "${binding.contentId}" is not present in index.html`);
  }
  validateContentCoverage(bindings.coverage, expectedKind, bindingsById, knownSourceRefs);
}

function validateContentCoverage(coverage, expectedKind, bindingsById, knownSourceRefs) {
  const errors = [];
  const requireContentIds = (contentIds, label) => {
    if (!Array.isArray(contentIds) || !contentIds.length) {
      errors.push(`${label} requires contentIds`);
      return [];
    }
    const found = [];
    for (const contentId of contentIds) {
      const binding = bindingsById.get(contentId);
      if (!binding) errors.push(`${label} references unknown contentId ${contentId}`);
      else if (binding.tier === "appendix") errors.push(`${label} cannot be covered only by appendix content`);
      else found.push(binding);
    }
    return found;
  };
  const requireSourceRefs = (sourceRefs, label) => {
    if (!Array.isArray(sourceRefs) || !sourceRefs.length) {
      errors.push(`${label} requires sourceRefs`);
      return [];
    }
    for (const sourceId of sourceRefs) {
      if (!knownSourceRefs.has(sourceId)) errors.push(`${label} references unknown Source Pack source ${sourceId}`);
    }
    return sourceRefs;
  };

  const overviewBindings = requireContentIds(coverage.overviewContentIds, "overview coverage");
  const overviewSourceRefs = requireSourceRefs(coverage.overviewSourceRefs, "overview coverage");
  const boundOverviewRefs = new Set(overviewBindings.flatMap((binding) => binding.sourceRefs));
  for (const sourceId of overviewSourceRefs) {
    if (!boundOverviewRefs.has(sourceId)) errors.push(`overview coverage source ${sourceId} is not bound to overview content`);
  }

  if (!Array.isArray(coverage.focusEntities) || !coverage.focusEntities.length) {
    errors.push("representative focus coverage requires focusEntities");
  }
  if (!Array.isArray(coverage.representedFocusEntityIds) || !coverage.representedFocusEntityIds.length) {
    errors.push("representative focus coverage requires at least one represented entity");
  }
  const entities = new Map((coverage.focusEntities ?? []).map((entity) => [entity.entityId, entity]));
  for (const entityId of coverage.representedFocusEntityIds ?? []) {
    const entity = entities.get(entityId);
    if (!entity) {
      errors.push(`representative focus entity ${entityId} is not declared`);
      continue;
    }
    requireSourceRefs(entity.sourceRefs, `representative focus entity ${entityId}`);
    const entityBindings = requireContentIds(entity.contentIds, `representative focus entity ${entityId}`);
    if (!Array.isArray(entity.facets) || !entity.facets.length) {
      errors.push(`representative focus entity ${entityId} requires at least one facet`);
      continue;
    }
    const entityBoundRefs = new Set(entityBindings.flatMap((binding) => binding.sourceRefs));
    for (const facet of entity.facets) {
      const facetRefs = requireSourceRefs(facet.sourceRefs, `representative facet ${facet.facetId ?? "unknown"}`);
      const facetBindings = requireContentIds(facet.contentIds, `representative facet ${facet.facetId ?? "unknown"}`);
      const boundFacetRefs = new Set([...entityBoundRefs, ...facetBindings.flatMap((binding) => binding.sourceRefs)]);
      for (const sourceId of facetRefs) {
        if (!boundFacetRefs.has(sourceId)) errors.push(`representative facet ${facet.facetId} source ${sourceId} is not bound to its content`);
      }
    }
  }
  if (expectedKind === "final") {
    const represented = new Set(coverage.representedFocusEntityIds ?? []);
    for (const entityId of entities.keys()) {
      if (!represented.has(entityId)) errors.push(`complete-site coverage is missing focus entity ${entityId}`);
    }
  }
  if (errors.length) throw new Error(errors.join("; "));
}

async function validateLocalRuntime(html, siteDir) {
  if (/<(?:script|img|source|video|audio|link)\b[^>]*\b(?:src|href|poster)\s*=\s*["']https?:\/\//i.test(html)) {
    throw new Error("remote runtime dependencies are forbidden");
  }
  for (const name of await listFiles(siteDir)) {
    if (!/\.(?:html|css|js|mjs)$/i.test(name)) continue;
    const text = await readFile(path.join(siteDir, ...name.split("/")), "utf8");
    if (/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/.test(text)) throw new Error(`${name} contains forbidden network runtime`);
    if (/\beval\s*\(|\bnew\s+Function\s*\(/.test(text)) throw new Error(`${name} contains forbidden dynamic-code runtime`);
    if (/\bimport\s*\(\s*["']https?:\/\//i.test(text)) throw new Error(`${name} contains remote dynamic import`);
    if (name.endsWith(".css")) {
      if (/(?:@import\s+|url\(\s*["']?)https?:\/\//i.test(text)) throw new Error(`${name} contains remote CSS dependency`);
      if (/(?:#[0-9a-f]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\()/i.test(text)) throw new Error(`${name} must use semantic theme variables instead of literal colors`);
    }
  }
}

function candidateSummary(validation) {
  const { manifest } = validation;
  return {
    candidateId: manifest.candidateId,
    directionId: manifest.directionId,
    directionLabel: manifest.directionLabel,
    previewThemeId: manifest.previewThemeId,
    payloadSha256: manifest.payloadSha256,
    screenshotSourceSha256: manifest.screenshotSourceSha256,
    contentPlanSha256: validation.contentPlanSha256
  };
}

function hashContentPlan(coverage) {
  const plan = {
    overviewSourceRefs: [...coverage.overviewSourceRefs].sort(),
    focusEntities: [...coverage.focusEntities]
      .map((entity) => ({
        entityId: entity.entityId,
        label: entity.label,
        sourceRefs: [...entity.sourceRefs].sort(),
        facets: [...entity.facets]
          .map((facet) => ({ facetId: facet.facetId, label: facet.label, sourceRefs: [...facet.sourceRefs].sort() }))
          .sort((left, right) => left.facetId.localeCompare(right.facetId))
      }))
      .sort((left, right) => left.entityId.localeCompare(right.entityId))
  };
  return sha256(JSON.stringify(plan));
}

async function updateVariant(projectDir, variantId, update) {
  const variantPath = path.join(projectDir, "variants", variantId, "variant.json");
  const projectPath = path.join(projectDir, "project.json");
  const [variant, project] = await Promise.all([readVariant(projectDir, variantId), readJson(projectPath)]);
  const updated = update(variant);
  const index = project.variants.findIndex((item) => item.variantId === variantId);
  if (index === -1) throw new Error(`unknown variant "${variantId}"`);
  project.variants[index] = updated;
  await writeJsonAtomic(variantPath, updated);
  await writeJsonAtomic(projectPath, project);
  return updated;
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

function candidatePath(projectDir, variantId, candidateId) {
  return path.join(projectDir, "variants", variantId, "design", "candidates", candidateId);
}

async function readVariant(projectDir, variantId) {
  return readJson(path.join(projectDir, "variants", variantId, "variant.json"));
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function assertSafeId(value, name) {
  if (typeof value !== "string" || !/^[a-z0-9._:-]+$/i.test(value)) throw new Error(`${name} contains unsafe characters`);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function escapeRegExp(value) {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

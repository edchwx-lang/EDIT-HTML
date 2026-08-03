import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { writeJsonAtomic } from "./io.js";
import { walkNodes } from "./report-model.js";

const INPUT_FILES = [
  "design-brief.json",
  "content-slices.json",
  "report-model.snapshot.json",
  "component-contract.schema.json",
  "theme-tokens.schema.json",
  "asset-inventory.json",
  "forbidden-mutations.json"
];

const PACKAGE_FILES = [
  "tokens.json",
  "layout-grammar.json",
  "component-grammar.json",
  "chart-grammar.json",
  "table-grammar.json",
  "interaction-grammar.json",
  "responsive-grammar.json"
];

export async function prepareHuashuInput(projectDir, variantId, options = {}) {
  const variantDir = path.join(projectDir, "variants", variantId);
  const inputDir = path.join(variantDir, "design", "huashu-input");
  const [variant, report, coverage, sourceModel] = await Promise.all([
    readJson(path.join(variantDir, "variant.json")),
    readJson(path.join(variantDir, "report-model.json")),
    readJson(path.join(projectDir, "coverage-map.json")),
    readJson(path.join(projectDir, "source-model.json"))
  ]);
  await mkdir(inputDir, { recursive: true });
  const files = {
    "design-brief.json": {
      schemaVersion: 1,
      variantId,
      mode: variant.mode,
      audience: options.audience ?? "research-report reader",
      readingContext: ["desktop", "mobile"],
      density: variant.mode === "data-first" ? "high" : "reading-led",
      references: options.references ?? [],
      designConstraints: [
        "preserve source facts and hierarchy",
        "use semantic theme tokens only",
        "avoid generic card-grid UI and decorative metrics"
      ]
    },
    "content-slices.json": buildContentSlices(report),
    "report-model.snapshot.json": report,
    "component-contract.schema.json": componentContract(),
    "theme-tokens.schema.json": themeTokenContract(),
    "asset-inventory.json": buildAssetInventory(sourceModel),
    "forbidden-mutations.json": {
      schemaVersion: 1,
      forbidden: [
        "rewrite-copy",
        "change-number",
        "invent-fact",
        "delete-source-id",
        "hard-code-report-content",
        "hard-code-theme-color",
        "change-editor-dom-contract",
        "remote-runtime-dependency"
      ],
      coverageSnapshot: coverage.entries.map((entry) => ({
        sourceId: entry.sourceId,
        status: entry.status,
        reportNodeIds: entry.reportNodeIds
      }))
    }
  };
  for (const [name, value] of Object.entries(files)) {
    await writeJsonAtomic(path.join(inputDir, name), value);
  }
  const inputSha256 = await hashDirectory(inputDir, { exclude: new Set(["manifest.json"]) });
  const manifest = {
    schemaVersion: 1,
    skill: "huashu-design",
    variantId,
    mode: variant.mode,
    requiredFiles: INPUT_FILES,
    inputSha256,
    preparedAt: new Date().toISOString(),
    instructions: "Invoke $huashu-design with these real content slices. Produce showcases first, obtain user confirmation, then import a content-free design package."
  };
  await writeJsonAtomic(path.join(inputDir, "manifest.json"), manifest);
  return { inputDir, inputSha256, manifest };
}

export async function hashDesignPackagePayload(packageDir) {
  return hashDirectory(packageDir, { exclude: new Set(["manifest.json"]) });
}

export async function importHuashuDesignPackage(projectDir, variantId, sourceDir) {
  await validatePackageAt(projectDir, variantId, sourceDir, { requireConfirmation: false });
  const destination = path.join(projectDir, "variants", variantId, "design", "package");
  await rm(destination, { recursive: true, force: true });
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(sourceDir, destination, { recursive: true, force: true });
  return validatePackageAt(projectDir, variantId, destination, { requireConfirmation: false });
}

export async function confirmHuashuDesign(projectDir, variantId, { confirmedBy = "user" } = {}) {
  const packageDir = path.join(projectDir, "variants", variantId, "design", "package");
  await validatePackageAt(projectDir, variantId, packageDir, { requireConfirmation: false });
  const manifestPath = path.join(packageDir, "manifest.json");
  const manifest = await readJson(manifestPath);
  manifest.confirmation = {
    status: "confirmed",
    confirmedAt: new Date().toISOString(),
    confirmedBy
  };
  await writeJsonAtomic(manifestPath, manifest);
  return manifest.confirmation;
}

export async function validateHuashuDesignPackage(projectDir, variantId) {
  const packageDir = path.join(projectDir, "variants", variantId, "design", "package");
  return validatePackageAt(projectDir, variantId, packageDir, { requireConfirmation: true });
}

export async function getHuashuDesignStatus(projectDir, variantId) {
  const variantDir = path.join(projectDir, "variants", variantId);
  let input;
  try {
    input = await readJson(path.join(variantDir, "design", "huashu-input", "manifest.json"));
  } catch {
    return { variantId, state: "missing-input", inputReady: false, packageReady: false };
  }
  try {
    const validation = await validatePackageAt(
      projectDir,
      variantId,
      path.join(variantDir, "design", "package"),
      { requireConfirmation: false }
    );
    const confirmed = validation.manifest.confirmation?.status === "confirmed";
    return {
      variantId,
      state: confirmed ? "confirmed" : "awaiting-confirmation",
      inputReady: true,
      packageReady: true,
      inputSha256: input.inputSha256,
      outputSha256: validation.outputSha256,
      runId: validation.manifest.runId
    };
  } catch (error) {
    if (/design package is required/.test(error.message)) {
      return {
        variantId,
        state: "awaiting-package",
        inputReady: true,
        packageReady: false,
        inputSha256: input.inputSha256
      };
    }
    return {
      variantId,
      state: "invalid-package",
      inputReady: true,
      packageReady: false,
      inputSha256: input.inputSha256,
      error: error.message
    };
  }
}

export async function loadConfirmedHuashuDesignPackage(projectDir, variantId) {
  const validation = await validateHuashuDesignPackage(projectDir, variantId);
  const packageDir = validation.packageDir;
  const entries = await Promise.all(PACKAGE_FILES.map(async (name) => [
    name.replace(".json", ""),
    await readJson(path.join(packageDir, name))
  ]));
  return { ...validation, grammars: Object.fromEntries(entries) };
}

export function compilePresentationPlan(report, designPackage) {
  const components = designPackage.grammars["component-grammar"];
  const layouts = designPackage.grammars["layout-grammar"];
  const bindings = [];
  walkNodes(report.nodes ?? [], (node) => {
    const kind = node.type === "paragraph" ? "text" : node.type;
    bindings.push({
      nodeId: node.nodeId,
      component: components[kind] ?? components.text,
      layout: node.type === "section" ? layouts.section : layouts.content,
      interaction: interactionFor(node, report.mode)
    });
  });
  return {
    schemaVersion: 4,
    variantId: report.variantId,
    mode: report.mode,
    generatedBy: "huashu-design-package-compiler",
    huashuRunId: designPackage.manifest.runId,
    designInputSha256: designPackage.manifest.inputSha256,
    designOutputSha256: designPackage.manifest.outputSha256,
    contentMutationAllowed: false,
    bindings
  };
}

async function validatePackageAt(projectDir, variantId, packageDir, { requireConfirmation }) {
  let manifest;
  try {
    manifest = await readJson(path.join(packageDir, "manifest.json"));
  } catch {
    throw new Error("a confirmed Huashu design package is required before render");
  }
  if (manifest.skill !== "huashu-design" || !manifest.runId || !manifest.invokedAt) {
    throw new Error("Huashu manifest requires a real skill invocation record");
  }
  const inputManifest = await readJson(path.join(
    projectDir, "variants", variantId, "design", "huashu-input", "manifest.json"
  ));
  if (manifest.inputSha256 !== inputManifest.inputSha256) {
    throw new Error("Huashu package input SHA-256 does not match the current report input");
  }
  for (const name of PACKAGE_FILES) {
    try {
      await readFile(path.join(packageDir, name));
    } catch {
      throw new Error(`Huashu package is missing ${name}`);
    }
  }
  const outputSha256 = await hashDesignPackagePayload(packageDir);
  if (manifest.outputSha256 !== outputSha256) {
    throw new Error("Huashu package output SHA-256 is invalid");
  }
  await validatePackagePurity(projectDir, variantId, packageDir);
  if (requireConfirmation && manifest.confirmation?.status !== "confirmed") {
    throw new Error("Huashu showcase confirmation is required before render");
  }
  return { valid: true, packageDir, manifest, inputSha256: manifest.inputSha256, outputSha256 };
}

async function validatePackagePurity(projectDir, variantId, packageDir) {
  const files = await listFiles(packageDir);
  const payloadFiles = files.filter((file) => path.basename(file) !== "manifest.json");
  const payload = (await Promise.all(payloadFiles.map((file) => readFile(file, "utf8")))).join("\n");
  if (/https?:\/\/|\bfetch\s*\(|\bimport\s*\(\s*["']https?:/i.test(payload)) {
    throw new Error("Huashu package contains a remote runtime dependency");
  }
  if (/#[0-9a-f]{3,8}\b|\b(?:rgb|hsl|oklch)\s*\(/i.test(payload)) {
    throw new Error("Huashu package must use semantic theme tokens instead of hard-coded colors");
  }
  const report = await readJson(path.join(projectDir, "variants", variantId, "report-model.json"));
  const protectedFragments = [];
  walkNodes(report.nodes ?? [], (node) => {
    for (const value of [node.text, node.title, node.caption]) {
      if (typeof value === "string" && value.trim().length >= 16) protectedFragments.push(value.trim());
    }
  });
  for (const fragment of protectedFragments) {
    if (payload.includes(fragment)) throw new Error("Huashu package must not hard-code report content");
  }
}

function buildContentSlices(report) {
  const nodes = [];
  walkNodes(report.nodes ?? [], (node) => {
    if (nodes.length < 20) nodes.push(node);
  });
  return {
    schemaVersion: 1,
    mode: report.mode,
    scenarios: {
      overview: nodes.slice(0, 4),
      dataAndTables: report.datasets.slice(0, 4),
      complexSection: nodes.find((node) => node.children?.length > 2) ?? nodes[0] ?? null,
      masterDetail: nodes.find((node) => node.type === "entityGroup") ?? null,
      evidenceAndSources: nodes.filter((node) => node.sourceRefs?.length).slice(0, 6)
    }
  };
}

function buildAssetInventory(sourceModel) {
  const assets = [];
  for (const document of sourceModel.documents ?? []) {
    for (const unit of document.units ?? []) {
      if (unit.type === "image") assets.push({
        sourceId: unit.sourceId,
        assetPath: unit.assetPath,
        alt: unit.alt ?? "",
        caption: unit.caption ?? ""
      });
    }
  }
  return { schemaVersion: 1, assets };
}

function componentContract() {
  return {
    schemaVersion: 1,
    requiredEditableAttributes: [
      "data-node-id", "data-edit-id", "data-block-id", "data-chart-id", "data-image-id"
    ],
    contentBinding: "stable-node-id-only",
    chartDataMutationApi: "setDataCell"
  };
}

function themeTokenContract() {
  return {
    schemaVersion: 1,
    policy: "semantic-only",
    requiredPrefixes: ["--report-", "--report-chart-"],
    hardCodedColorsAllowed: false
  };
}

function interactionFor(node, mode) {
  if (node.type === "section") return "anchor-navigation";
  if (node.type === "entityGroup") return "entity-and-dimension-tabs";
  if (node.type === "table") return "row-highlight";
  if (node.type === "image") return "lightbox";
  return mode === "data-first" ? "focus-tooltip" : "none";
}

async function hashDirectory(root, { exclude = new Set() } = {}) {
  const files = (await listFiles(root)).filter((file) => !exclude.has(path.basename(file)));
  const hash = createHash("sha256");
  for (const file of files) {
    const relative = path.relative(root, file).split(path.sep).join("/");
    hash.update(relative, "utf8");
    hash.update("\0");
    hash.update(await readFile(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

async function listFiles(root) {
  const output = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) output.push(...await listFiles(fullPath));
    else if (entry.isFile()) output.push(fullPath);
  }
  return output.sort((left, right) => left.localeCompare(right));
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

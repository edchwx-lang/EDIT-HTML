import { createHash, randomUUID } from "node:crypto";
import { cp, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { isVisualizationEligible } from "./chart-data.js";
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

const EXECUTABLE_PACKAGE_FILES = [
  ...PACKAGE_FILES,
  "components/registry.json",
  "styles/report.css",
  "showcases/manifest.json",
  "showcases/desktop.png",
  "showcases/mobile.png"
];

const STRATEGY_FILES = [
  ...EXECUTABLE_PACKAGE_FILES,
  "composition-plan.json",
  "component-tree.json",
  "chart-specs.json"
];

const LIGHT_PREVIEW_THEMES = new Set([
  "precision-blueprint", "warm-paper-terracotta", "sandstone-archive"
]);

const SAFE_PRIMITIVES = new Set([
  "hero", "section", "metric", "narrative", "table", "chart", "figure",
  "masterDetail", "evidenceWarning"
]);

const SAFE_INTERACTION_RUNTIMES = new Set([
  "none", "anchor-navigation", "row-highlight", "entity-tabs", "chart-tooltip",
  "selection-band", "lightbox"
]);

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
      strategySelection: options.references?.length ? "single-strategy-three-scenes" : "three-material-driven-strategies",
      audience: options.audience ?? "research-report reader",
      readingContext: ["desktop", "mobile"],
      editorialPolicy: { source: "closed", expression: "free" },
      references: options.references ?? [],
      designConstraints: [
        "preserve source facts, numbers, qualifications, and provenance",
        "choose information priority and composition as part of the complete strategy",
        "use semantic theme tokens only",
        "avoid generic card-grid UI and decorative metrics",
        "compile showcases and final report from the same executable candidate",
        "use precision-blueprint, warm-paper-terracotta, and sandstone-archive for three-strategy previews"
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
    strategySelection: files["design-brief.json"].strategySelection,
    requiredFiles: INPUT_FILES,
    inputSha256,
    preparedAt: new Date().toISOString(),
    instructions: "Invoke $huashu-design with this source-closed editorial model. With references produce one complete strategy and three representative scenes; without references produce three materially different complete strategies using the three light preview themes. Each strategy owns composition and design. Import, select, and promote the exact payload."
  };
  await writeJsonAtomic(path.join(inputDir, "manifest.json"), manifest);
  return { inputDir, inputSha256, manifest };
}

export async function hashDesignPackagePayload(packageDir) {
  return hashDirectory(packageDir, { exclude: new Set(["manifest.json"]) });
}

export async function hashShowcasePayload(packageDir) {
  return hashDirectory(path.join(packageDir, "showcases"));
}

export async function importHuashuDesignCandidate(projectDir, variantId, sourceDir) {
  const validation = await validateExecutablePackageAt(projectDir, variantId, sourceDir, {
    requireConfirmation: false
  });
  const existing = (await listHuashuDesignCandidates(projectDir, variantId))
    .filter((item) => !item.invalid && item.candidateId !== validation.manifest.candidateId);
  if (validation.manifest.schemaVersion === 2 && existing.some((item) => item.previewThemeId !== validation.manifest.previewThemeId)) {
    throw new Error("all design candidates for one variant must use the same previewThemeId");
  }
  const inputManifest = await readJson(path.join(
    projectDir, "variants", variantId, "design", "huashu-input", "manifest.json"
  ));
  if (validation.manifest.schemaVersion === 3 && inputManifest.strategySelection === "three-material-driven-strategies") {
    if (!LIGHT_PREVIEW_THEMES.has(validation.manifest.previewThemeId)) {
      throw new Error("V4.3 strategy previews must use one of the three light themes");
    }
    if (existing.some((item) => item.previewThemeId === validation.manifest.previewThemeId)) {
      throw new Error("V4.3 three-strategy previews must use distinct light themes");
    }
    if (existing.some((item) => item.structuralSha256 === validation.structuralSha256)) {
      throw new Error("V4.3 strategy candidates must differ in effective compiled structure");
    }
  }
  const candidateId = validation.manifest.candidateId;
  assertSafeId(candidateId, "candidateId");
  const destination = path.join(
    projectDir, "variants", variantId, "design", "candidates", candidateId
  );
  await rm(destination, { recursive: true, force: true });
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(sourceDir, destination, { recursive: true, force: true });
  return validateExecutablePackageAt(projectDir, variantId, destination, {
    requireConfirmation: false
  });
}

export async function listHuashuDesignCandidates(projectDir, variantId) {
  const candidatesDir = path.join(projectDir, "variants", variantId, "design", "candidates");
  let entries;
  try {
    entries = await readdir(candidatesDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const candidates = [];
  for (const entry of entries.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    try {
      const validation = await validateExecutablePackageAt(
        projectDir,
        variantId,
        path.join(candidatesDir, entry.name),
        { requireConfirmation: false }
      );
      candidates.push({
        candidateId: validation.manifest.candidateId,
        designDirectionId: validation.manifest.designDirectionId,
        designDirectionLabel: validation.manifest.designDirectionLabel,
        strategyThesis: validation.manifest.strategyThesis,
        previewThemeId: validation.manifest.previewThemeId,
        showcaseSha256: validation.manifest.showcaseSha256,
        compositionSha256: validation.manifest.compositionSha256,
        componentTreeSha256: validation.manifest.componentTreeSha256,
        structuralSha256: validation.structuralSha256,
        outputSha256: validation.outputSha256,
        confirmation: validation.manifest.confirmation
      });
    } catch (error) {
      candidates.push({ candidateId: entry.name, invalid: true, error: error.message });
    }
  }
  return candidates;
}

export async function confirmHuashuDesignCandidate(
  projectDir,
  variantId,
  candidateId,
  { confirmedBy = "user" } = {}
) {
  assertSafeId(candidateId, "candidateId");
  const variantDir = path.join(projectDir, "variants", variantId);
  const candidateDir = path.join(variantDir, "design", "candidates", candidateId);
  const validation = await validateExecutablePackageAt(projectDir, variantId, candidateDir, {
    requireConfirmation: false
  });
  if (validation.manifest.candidateId !== candidateId) {
    throw new Error("candidate directory and manifest candidateId do not match");
  }
  const inputManifest = await readJson(path.join(variantDir, "design", "huashu-input", "manifest.json"));
  if (validation.manifest.schemaVersion === 3 && inputManifest.strategySelection === "three-material-driven-strategies") {
    const candidates = (await listHuashuDesignCandidates(projectDir, variantId)).filter((item) => !item.invalid);
    const themes = new Set(candidates.map((item) => item.previewThemeId));
    if (candidates.length < 3 || [...LIGHT_PREVIEW_THEMES].some((theme) => !themes.has(theme))) {
      throw new Error("three-strategy selection requires all three light-theme candidates before confirmation");
    }
  }
  const variantPath = path.join(variantDir, "variant.json");
  const variant = await readJson(variantPath);
  const previousVariant = structuredClone(variant);
  if (validation.manifest.schemaVersion === 2 && variant.themeId !== validation.manifest.previewThemeId) {
    throw new Error("variant theme must match the candidate previewThemeId before confirmation");
  }
  const confirmedAt = new Date().toISOString();
  const confirmation = { status: "confirmed", confirmedAt, confirmedBy };
  const designSelection = {
    candidateId,
    designDirectionId: validation.manifest.designDirectionId,
    previewThemeId: validation.manifest.previewThemeId,
    showcaseSha256: validation.manifest.showcaseSha256,
    confirmedAt
  };
  if (validation.manifest.schemaVersion === 3) {
    designSelection.compositionSha256 = validation.manifest.compositionSha256;
    designSelection.componentTreeSha256 = validation.manifest.componentTreeSha256;
  }
  const staging = path.join(variantDir, "design", `.package-${candidateId}-${randomUUID()}`);
  const destination = path.join(variantDir, "design", "package");
  const backup = path.join(variantDir, "design", `.package-backup-${randomUUID()}`);
  await rm(staging, { recursive: true, force: true });
  await cp(candidateDir, staging, { recursive: true, force: true });
  const manifestPath = path.join(staging, "manifest.json");
  const manifest = await readJson(manifestPath);
  manifest.confirmation = confirmation;
  await writeJsonAtomic(manifestPath, manifest);
  const promoted = await validateExecutablePackageAt(projectDir, variantId, staging, {
    requireConfirmation: true
  });
  if (promoted.outputSha256 !== validation.outputSha256) {
    throw new Error("confirmed package payload differs from the selected candidate");
  }
  variant.designSelection = designSelection;
  if (validation.manifest.schemaVersion === 3) variant.themeId = validation.manifest.previewThemeId;
  const projectPath = path.join(projectDir, "project.json");
  const project = await readJson(projectPath);
  const previousProject = structuredClone(project);
  const projectVariant = project.variants.find((item) => item.variantId === variantId);
  if (projectVariant) {
    projectVariant.designSelection = designSelection;
    if (validation.manifest.schemaVersion === 3) projectVariant.themeId = validation.manifest.previewThemeId;
  }
  let backedUp = false;
  try {
    try {
      await rename(destination, backup);
      backedUp = true;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    await rename(staging, destination);
    await writeJsonAtomic(variantPath, variant);
    await writeJsonAtomic(projectPath, project);
    if (backedUp) await rm(backup, { recursive: true, force: true });
  } catch (error) {
    await rm(destination, { recursive: true, force: true });
    if (backedUp) await rename(backup, destination);
    await rm(staging, { recursive: true, force: true });
    await writeJsonAtomic(variantPath, previousVariant);
    await writeJsonAtomic(projectPath, previousProject);
    throw error;
  }
  return { confirmation, designSelection, outputSha256: promoted.outputSha256 };
}

export async function getHuashuDesignCandidateStatus(projectDir, variantId) {
  const candidates = await listHuashuDesignCandidates(projectDir, variantId);
  const variant = await readJson(path.join(projectDir, "variants", variantId, "variant.json"));
  if (variant.designSelection) {
    return {
      variantId,
      state: "candidate-confirmed",
      designSelection: variant.designSelection,
      candidates
    };
  }
  return {
    variantId,
    state: candidates.length ? "awaiting-candidate-confirmation" : "awaiting-candidate",
    candidates
  };
}

export async function importHuashuDesignPackage(projectDir, variantId, sourceDir) {
  await assertLegacyDesignCommandAllowed(projectDir, variantId);
  await validatePackageAt(projectDir, variantId, sourceDir, { requireConfirmation: false });
  const destination = path.join(projectDir, "variants", variantId, "design", "package");
  await rm(destination, { recursive: true, force: true });
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(sourceDir, destination, { recursive: true, force: true });
  return validatePackageAt(projectDir, variantId, destination, { requireConfirmation: false });
}

export async function confirmHuashuDesign(projectDir, variantId, { confirmedBy = "user" } = {}) {
  await assertLegacyDesignCommandAllowed(projectDir, variantId);
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
  let manifest;
  try {
    manifest = await readJson(path.join(packageDir, "manifest.json"));
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
    // Preserve the legacy validator's stable missing-package error below.
  }
  if (manifest?.schemaVersion === 2 || manifest?.schemaVersion === 3) {
    return validateExecutablePackageAt(projectDir, variantId, packageDir, {
      requireConfirmation: true
    });
  }
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
  const packageDir = path.join(projectDir, "variants", variantId, "design", "package");
  const variant = await readJson(path.join(projectDir, "variants", variantId, "variant.json"));
  let manifest;
  try {
    manifest = await readJson(path.join(packageDir, "manifest.json"));
  } catch {
    throw new Error("a confirmed executable Huashu design candidate is required before render");
  }
  if (variant.packageVersion === "4.3.0" && manifest.schemaVersion !== 3) {
    throw new Error("V4.2 design candidates cannot render in V4.3; confirm a complete strategy candidate");
  }
  const validation = manifest.schemaVersion === 2 || manifest.schemaVersion === 3
    ? await validateExecutablePackageAt(projectDir, variantId, packageDir, { requireConfirmation: true })
    : await validateHuashuDesignPackage(projectDir, variantId);
  const entries = await Promise.all(PACKAGE_FILES.map(async (name) => [
    name.replace(".json", ""),
    await readJson(path.join(packageDir, name))
  ]));
  if (manifest.schemaVersion !== 2 && manifest.schemaVersion !== 3) {
    return { ...validation, grammars: Object.fromEntries(entries), executable: false };
  }
  const [registry, stylesheet, composition, componentTree, chartSpecs] = await Promise.all([
    readJson(path.join(packageDir, "components", "registry.json")),
    readFile(path.join(packageDir, "styles", "report.css"), "utf8"),
    manifest.schemaVersion === 3 ? readJson(path.join(packageDir, "composition-plan.json")) : null,
    manifest.schemaVersion === 3 ? readJson(path.join(packageDir, "component-tree.json")) : null,
    manifest.schemaVersion === 3 ? readJson(path.join(packageDir, "chart-specs.json")) : null
  ]);
  return {
    ...validation,
    grammars: Object.fromEntries(entries),
    registry,
    stylesheet,
    composition,
    componentTree,
    chartSpecs,
    executable: true
  };
}

export function compilePresentationPlan(report, designPackage) {
  if (designPackage.manifest.schemaVersion === 2 || designPackage.manifest.schemaVersion === 3) {
    return compileExecutablePresentationPlan(report, designPackage);
  }
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

function compileExecutablePresentationPlan(report, designPackage) {
  const componentBindings = designPackage.grammars["component-grammar"].bindings ?? {};
  const chartBindings = designPackage.grammars["chart-grammar"].bindings ?? {};
  const layoutGrammar = designPackage.grammars["layout-grammar"];
  const interactionGrammar = designPackage.grammars["interaction-grammar"];
  const registry = designPackage.registry.components ?? {};
  const datasetNodeIds = new Set((report.datasets ?? []).map((dataset) => dataset.nodeId));
  const bindings = [];
  const explicitNodes = designPackage.componentTree?.nodes ?? {};
  const groupByNode = new Map();
  for (const group of designPackage.composition?.groups ?? []) {
    for (const nodeId of group.nodeIds ?? group.rootNodeIds ?? []) groupByNode.set(nodeId, group.groupId);
  }
  const rootIds = (report.nodes ?? []).map((node) => node.nodeId);
  const requestedRootOrder = designPackage.composition?.rootOrder ?? [];
  if (requestedRootOrder.length) {
    if (new Set(requestedRootOrder).size !== requestedRootOrder.length ||
        requestedRootOrder.length !== rootIds.length ||
        requestedRootOrder.some((id) => !rootIds.includes(id))) {
      throw new Error("strategy composition rootOrder must contain every report root exactly once");
    }
    const structural = (report.nodes ?? []).filter((node) => (node.level ?? 99) <= 1).map((node) => node.nodeId);
    const requestedStructural = requestedRootOrder.filter((id) => structural.includes(id));
    if (requestedStructural.some((id, index) => id !== structural[index])) {
      throw new Error("strategy composition must preserve first-level research logic");
    }
  }
  const knownNodeIds = new Set();
  walkNodes(report.nodes ?? [], (node) => knownNodeIds.add(node.nodeId));
  for (const nodeId of Object.keys(explicitNodes)) {
    if (!knownNodeIds.has(nodeId)) throw new Error(`strategy component tree references unknown node ${nodeId}`);
  }
  walkNodes(report.nodes ?? [], (node) => {
    const kind = node.type === "paragraph" && node.displayIntent === "metric"
      ? "metric"
      : node.type;
    const explicit = explicitNodes[node.nodeId] ?? {};
    const componentId = explicit.componentId ?? componentBindings[kind] ?? componentBindings[node.type];
    if (!componentId || !registry[componentId]) {
      throw new Error(`design candidate has no implemented componentId for ${kind}`);
    }
    const layoutId = explicit.layoutId ?? (node.type === "section"
      ? layoutGrammar.nodeLayouts?.section
      : layoutGrammar.nodeLayouts?.content);
    const layout = layoutGrammar.layouts?.[layoutId];
    if (!layoutId || !layout) throw new Error(`design candidate has no implemented layoutId for ${kind}`);
    const interactionIds = explicit.interactionIds ?? [
      ...(interactionGrammar.bindings?.[node.type] ?? []),
      ...(node.displayIntent === "chart-support" && datasetNodeIds.has(node.nodeId)
        ? interactionGrammar.bindings?.chart ?? []
        : [])
    ];
    const component = registry[componentId];
    const dataset = (report.datasets ?? []).find(
      (item) => item.nodeId === node.nodeId && isVisualizationEligible(item)
    );
    const chartComponentId = dataset ? (chartBindings.chart ?? componentBindings.chart) : null;
    const chartComponent = chartComponentId ? registry[chartComponentId] : null;
    const chartSpec = designPackage.chartSpecs?.charts?.[node.nodeId];
    if (dataset && (!chartComponentId || !chartComponent)) {
      throw new Error("design candidate has no implemented chart componentId");
    }
    bindings.push({
      nodeId: node.nodeId,
      componentId,
      layoutId,
      interactionIds: [...new Set(interactionIds)],
      packageClass: [component.className, layout.className].filter(Boolean).join(" "),
      primitive: component.primitive,
      ...(groupByNode.has(node.nodeId) ? { compositionGroupId: groupByNode.get(node.nodeId) } : {}),
      ...(chartComponent ? {
        chartComponentId,
        chartPackageClass: [chartComponent.className, layout.className].filter(Boolean).join(" "),
        chartLayoutId: layoutId,
        chartInteractionIds: [...new Set(interactionGrammar.bindings?.chart ?? [])],
        chartPrimitive: chartComponent.primitive,
        ...(chartSpec ? { chartSpec: safeChartSpec(chartSpec) } : {})
      } : {})
    });
  });
  return {
    schemaVersion: 4,
    variantId: report.variantId,
    mode: report.mode,
    generatedBy: "huashu-design-package-compiler",
    candidateId: designPackage.manifest.candidateId,
    designDirectionId: designPackage.manifest.designDirectionId,
    designDirectionLabel: designPackage.manifest.designDirectionLabel,
    strategyThesis: designPackage.manifest.strategyThesis,
    previewThemeId: designPackage.manifest.previewThemeId,
    showcaseSha256: designPackage.manifest.showcaseSha256,
    designInputSha256: designPackage.manifest.inputSha256,
    designOutputSha256: designPackage.manifest.outputSha256,
    contentMutationAllowed: false,
    rootOrder: designPackage.composition?.rootOrder ?? (report.nodes ?? []).map((node) => node.nodeId),
    compositionGroups: designPackage.composition?.groups ?? [],
    chartSpecs: designPackage.chartSpecs?.charts ?? {},
    bindings
  };
}

function safeChartSpec(spec) {
  const allowed = {};
  for (const field of ["chartType", "interaction", "xField", "relation"]) {
    if (typeof spec[field] === "string") allowed[field] = spec[field];
  }
  if (Array.isArray(spec.yFields)) allowed.yFields = spec.yFields.filter((value) => typeof value === "string");
  return allowed;
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

async function validateExecutablePackageAt(projectDir, variantId, packageDir, { requireConfirmation }) {
  let manifest;
  try {
    manifest = await readJson(path.join(packageDir, "manifest.json"));
  } catch {
    throw new Error("an executable Huashu design candidate is required");
  }
  const isV42 = manifest.schemaVersion === 2 && manifest.packageVersion === "4.2.0";
  const isV43 = manifest.schemaVersion === 3 && manifest.packageVersion === "4.3.0";
  if (!isV42 && !isV43) {
    throw new Error("design candidates require schemaVersion 2/packageVersion 4.2.0 or schemaVersion 3/packageVersion 4.3.0");
  }
  for (const field of [
    "candidateId", "designDirectionId", "designDirectionLabel", "previewThemeId",
    "showcaseSha256", "inputSha256", "outputSha256"
  ]) {
    if (typeof manifest[field] !== "string" || !manifest[field]) {
      throw new Error(`V4.2 design candidate manifest requires ${field}`);
    }
  }
  assertSafeId(manifest.candidateId, "candidateId");
  assertSafeId(manifest.designDirectionId, "designDirectionId");
  if (isV43) {
    for (const field of ["strategyThesis", "compositionSha256", "componentTreeSha256", "huashuRunId", "huashuInvokedAt", "provenanceSha256"]) {
      if (typeof manifest[field] !== "string" || !manifest[field]) throw new Error(`V4.3 strategy manifest requires ${field}`);
    }
    const expectedProvenance = hashProvenance(manifest);
    if (manifest.provenanceSha256 !== expectedProvenance) throw new Error("V4.3 Huashu provenance SHA-256 is invalid");
  }
  const structuralSha256 = isV43 ? await hashEffectiveStructure(packageDir) : null;
  const inputManifest = await readJson(path.join(
    projectDir, "variants", variantId, "design", "huashu-input", "manifest.json"
  ));
  if (isV43) {
    const report = await readJson(path.join(projectDir, "variants", variantId, "report-model.json"));
    if (report.editorialStatus !== "confirmed") {
      throw new Error("V4.3 requires a confirmed source-closed editorial model before strategy import");
    }
  }
  if (manifest.inputSha256 !== inputManifest.inputSha256) {
    throw new Error("Huashu candidate input SHA-256 does not match the current report input");
  }
  for (const name of (isV43 ? STRATEGY_FILES : EXECUTABLE_PACKAGE_FILES)) {
    try {
      await readFile(path.join(packageDir, name));
    } catch {
      throw new Error(`Huashu candidate is missing ${name}`);
    }
  }
  const outputSha256 = await hashDesignPackagePayload(packageDir);
  if (manifest.outputSha256 !== outputSha256) {
    throw new Error("Huashu candidate output SHA-256 is invalid");
  }
  const showcaseSha256 = await hashShowcasePayload(packageDir);
  if (manifest.showcaseSha256 !== showcaseSha256) {
    throw new Error("Huashu candidate showcase SHA-256 is invalid");
  }
  await validatePackagePurity(projectDir, variantId, packageDir);
  await validateExecutableBindings(packageDir);
  if (isV43) {
    const compositionSha256 = await hashFile(path.join(packageDir, "composition-plan.json"));
    const componentTreeSha256 = await hashFile(path.join(packageDir, "component-tree.json"));
    if (manifest.compositionSha256 !== compositionSha256) throw new Error("V4.3 composition SHA-256 is invalid");
    if (manifest.componentTreeSha256 !== componentTreeSha256) throw new Error("V4.3 component tree SHA-256 is invalid");
  }
  if (requireConfirmation && manifest.confirmation?.status !== "confirmed") {
    throw new Error("Huashu candidate confirmation is required before render");
  }
  return {
    valid: true,
    packageDir,
    manifest,
    inputSha256: manifest.inputSha256,
    outputSha256,
    showcaseSha256,
    structuralSha256
  };
}

async function hashEffectiveStructure(packageDir) {
  const names = [
    "composition-plan.json", "component-tree.json", "chart-specs.json",
    "component-grammar.json", "layout-grammar.json", "interaction-grammar.json",
    "responsive-grammar.json", "components/registry.json"
  ];
  const values = await Promise.all(names.map((name) => readJson(path.join(packageDir, name))));
  const composition = values[0];
  const effective = {
    rootOrder: composition.rootOrder ?? [],
    groups: (composition.groups ?? []).map((group) => ({
      groupId: group.groupId,
      nodeIds: group.nodeIds ?? group.rootNodeIds ?? []
    })),
    componentTree: values[1]?.nodes ?? {},
    chartSpecs: values[2]?.charts ?? {},
    componentBindings: values[3]?.bindings ?? {},
    layouts: values[4],
    interactions: values[5],
    responsive: values[6],
    registry: values[7]?.components ?? {}
  };
  return createHash("sha256").update(JSON.stringify(effective), "utf8").digest("hex");
}

async function validateExecutableBindings(packageDir) {
  const [components, charts, layouts, interactions, registry, showcases] = await Promise.all([
    readJson(path.join(packageDir, "component-grammar.json")),
    readJson(path.join(packageDir, "chart-grammar.json")),
    readJson(path.join(packageDir, "layout-grammar.json")),
    readJson(path.join(packageDir, "interaction-grammar.json")),
    readJson(path.join(packageDir, "components", "registry.json")),
    readJson(path.join(packageDir, "showcases", "manifest.json"))
  ]);
  const registered = registry.components ?? {};
  for (const [componentId, component] of Object.entries(registered)) {
    if (!SAFE_PRIMITIVES.has(component.primitive)) {
      throw new Error(`componentId ${componentId} uses unsupported primitive ${component.primitive}`);
    }
    if (typeof component.className !== "string" || !component.className.trim()) {
      throw new Error(`componentId ${componentId} requires a package class`);
    }
  }
  for (const componentId of Object.values(components.bindings ?? {})) {
    if (!registered[componentId]) throw new Error(`unregistered componentId ${componentId}`);
  }
  for (const componentId of Object.values(charts.bindings ?? {})) {
    if (!registered[componentId]) throw new Error(`unregistered chart componentId ${componentId}`);
    if (registered[componentId].primitive !== "chart") {
      throw new Error(`chart componentId ${componentId} must use chart primitive`);
    }
  }
  const definedLayouts = layouts.layouts ?? {};
  for (const layoutId of Object.values(layouts.nodeLayouts ?? {})) {
    if (!definedLayouts[layoutId]) throw new Error(`unregistered layoutId ${layoutId}`);
    if (!definedLayouts[layoutId].className) throw new Error(`layoutId ${layoutId} requires a package class`);
  }
  const definedInteractions = interactions.interactions ?? {};
  for (const interactionIds of Object.values(interactions.bindings ?? {})) {
    for (const interactionId of interactionIds ?? []) {
      const interaction = definedInteractions[interactionId];
      if (!interaction) throw new Error(`unregistered interactionId ${interactionId}`);
      if (!SAFE_INTERACTION_RUNTIMES.has(interaction.runtime)) {
        throw new Error(`interactionId ${interactionId} uses an unsupported runtime`);
      }
    }
  }
  const scenarios = new Set(showcases.scenarios ?? []);
  for (const required of ["hero", "data-table", "master-detail"]) {
    if (!scenarios.has(required)) throw new Error(`showcase manifest is missing ${required}`);
  }
}

function assertSafeId(value, label) {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(value)) {
    throw new Error(`${label} must be a safe project-local id`);
  }
}

async function assertLegacyDesignCommandAllowed(projectDir, variantId) {
  const variant = await readJson(path.join(projectDir, "variants", variantId, "variant.json"));
  if (variant.packageVersion === "4.2.0" || variant.packageVersion === "4.3.0") {
    throw new Error("legacy design import/confirm is read-only in V4.3; use design candidate import/confirm");
  }
}

async function validatePackagePurity(projectDir, variantId, packageDir) {
  const files = await listFiles(packageDir);
  const payloadFiles = files.filter((file) => path.basename(file) !== "manifest.json");
  const textualFiles = payloadFiles.filter((file) =>
    [".css", ".html", ".js", ".json", ".md", ".mjs", ".txt"].includes(
      path.extname(file).toLowerCase()
    )
  );
  const payload = (await Promise.all(textualFiles.map((file) => readFile(file, "utf8")))).join("\n");
  const stylesheet = await readFile(path.join(packageDir, "styles", "report.css"), "utf8").catch(() => "");
  if (/<|<\/style|<script/i.test(stylesheet)) {
    throw new Error("Huashu package contains unsafe stylesheet syntax");
  }
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

async function hashFile(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

export function hashHuashuProvenance({ skill = "huashu-design", huashuRunId, huashuInvokedAt }) {
  return createHash("sha256").update(JSON.stringify({ skill, huashuRunId, huashuInvokedAt }), "utf8").digest("hex");
}

function hashProvenance(manifest) {
  return hashHuashuProvenance(manifest);
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

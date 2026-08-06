import { expect, test } from "playwright/test";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  access,
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createV5Project, createV5Variant } from "../src/v5-project.js";
import {
  getV5InterviewStatus,
  importV5Interview,
  prepareV5HuashuInput
} from "../src/v5-interview.js";
import {
  confirmV5DesignCandidate,
  hashV5SitePayload,
  importV5DesignCandidate,
  importV5FinalSite,
  prepareV5CandidateReviewSet
} from "../src/v5-design.js";
import { instrumentV5Variant } from "../src/v5-instrumenter.js";
import { validateV5Variant } from "../src/v5-validate.js";
import { requireFrozenHuashuOutput } from "../src/v5-stage-boundary.js";
import { startEditorServer } from "../src/editor-server.js";

const execFileAsync = promisify(execFile);
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(packageRoot, "bin", "edit-html-report.js");
const acceptanceSource = "C:\\Users\\edchw\\Documents\\edit-ppt\\AI服务器报告-v520-verify-20260805\\source\\AI服务器报告.docx";
const versionFields = ["toolVersion", "pipelineVersion", "artifactContractVersion", "editorRuntimeVersion"];

test("V5.3 accepts the AI server report through design, audit, editor, and local publication", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const acceptanceRoot = path.join(os.tmpdir(), "edit-html-v53-ai-server-acceptance");
  const sourceCopy = path.join(acceptanceRoot, "source", "AI服务器报告.docx");
  const projectDir = path.join(acceptanceRoot, "project");
  const packageSources = path.join(acceptanceRoot, "huashu-output");
  const evidencePath = testInfo.outputPath("evidence.json");
  const timings = {};
  const evidence = {
    schemaVersion: 1,
    source: acceptanceSource,
    sourceCopy,
    projectDir,
    commands: [],
    timings,
    explorerVisualConfirmation: false
  };
  let editor;

  await rm(acceptanceRoot, { recursive: true, force: true });
  await mkdir(path.dirname(sourceCopy), { recursive: true });
  await mkdir(packageSources, { recursive: true });
  await copyFile(acceptanceSource, sourceCopy);
  evidence.sourceSha256 = sha256(await readFile(sourceCopy));

  try {
    const project = await timed(timings, "createProjectMs", () => createV5Project(sourceCopy, projectDir));
    const variant = await timed(timings, "createVariantMs", () => createV5Variant(projectDir, { themeId: "precision-blueprint" }));
    evidence.sourcePackSha256 = project.sourcePackSha256;
    evidence.variantId = variant.variantId;

    const doctorCommand = `node ${path.relative(packageRoot, cliPath)} doctor --project ${projectDir} --json`;
    evidence.commands.push(doctorCommand);
    const doctor = await timed(timings, "doctorMs", async () => {
      const { stdout } = await execFileAsync(process.execPath, [cliPath, "doctor", "--project", projectDir, "--json"], {
        cwd: packageRoot,
        windowsHide: true
      });
      return JSON.parse(stdout);
    });
    expect(doctor.ok, doctor.warnings.join("; ")).toBe(true);
    expect(doctor.runtimeStatus).toBe("current");
    for (const field of versionFields) expect(doctor[field]).toBe("5.3.0");
    expect(JSON.stringify(doctor)).not.toContain("4.0.0");
    evidence.versions = Object.fromEntries(versionFields.map((field) => [field, doctor[field]]));
    evidence.runtimeStatus = doctor.runtimeStatus;
    evidence.executablePath = doctor.executablePath;
    evidence.packageRoot = doctor.packageRoot;

    const interviewPath = path.join(acceptanceRoot, "interview.json");
    await writeJson(interviewPath, {
      schemaVersion: 3,
      variantId: variant.variantId,
      answers: {
        purpose: answer("这份报告用于什么决策？", "用于评估 AI 服务器产业链与关键材料机会。"),
        contentWeight: answer("内容重点应放在哪里？", "重点呈现产业链、关键材料和核心证据，同时保留其余材料。")
      },
      decisionEvidence: {
        evidenceType: "direct-user-answer",
        verbatimUserQuote: "用于评估 AI 服务器产业链与关键材料机会，重点呈现产业链、关键材料和核心证据。",
        recordedAt: "2026-08-05T10:00:00.000Z",
        topicsCovered: ["purpose", "contentWeight"]
      },
      references: []
    });
    await timed(timings, "interviewImportMs", () => importV5Interview(projectDir, variant.variantId, interviewPath));
    const interviewStatus = await getV5InterviewStatus(projectDir, variant.variantId);
    expect(interviewStatus.requiredTopics).toEqual(["purpose", "contentWeight"]);
    expect(interviewStatus.maximumQuestions).toBe(3);
    expect(interviewStatus.questionCount).toBe(2);
    expect(interviewStatus.hasMaterialClarification).toBe(false);
    evidence.interview = {
      questionCount: interviewStatus.questionCount,
      maximumQuestions: interviewStatus.maximumQuestions,
      requiredTopics: interviewStatus.requiredTopics,
      interviewSha256: interviewStatus.interviewSha256
    };

    const prepared = await timed(timings, "prepareHuashuInputMs", () => prepareV5HuashuInput(projectDir, variant.variantId));
    const inputFiles = await listFiles(prepared.inputDir);
    for (const required of ["readable-source.md", "fact-ledger.json", "source-map.json", "tables-and-datasets.json", "interview.json", "content-brief.json"]) {
      expect(inputFiles).toContain(required);
    }
    expect(inputFiles.some((name) => /editor-runtime|renderer|theme|publication/i.test(name))).toBe(false);
    const allowedInputKinds = new Set(prepared.inputReceipt.allowedInputs.map((item) => item.kind));
    for (const requiredKind of ["source-pack", "interview", "content-brief"]) expect(allowedInputKinds).toContain(requiredKind);
    expect([...allowedInputKinds].every((kind) => ["source-pack", "interview", "content-brief", "visual-reference"].includes(kind))).toBe(true);
    evidence.huashuInput = {
      strategySelection: prepared.strategySelection,
      receiptSha256: prepared.inputReceipt.receiptSha256,
      outputSha256: prepared.inputReceipt.outputSha256,
      files: inputFiles
    };

    const ledger = await readJson(path.join(projectDir, "source-pack", "fact-ledger.json"));
    const sourceMap = await readJson(path.join(projectDir, "source-pack", "source-map.json"));
    const allSources = sourceMap.documents.flatMap((document) => document.units.filter((unit) => unit.substantive).map((unit) => unit.sourceId));
    expect(allSources.length).toBeGreaterThan(0);
    const firstSource = allSources[0];
    const firstFact = ledger.facts.find((fact) => fact.sourceId === firstSource) ?? ledger.facts[0];
    const sharedCoverage = coveragePlan(firstSource, "core");
    const directions = [
      {
        candidateId: "network-atlas",
        directionLabel: "Network Atlas",
        themeId: "precision-blueprint",
        narrativeId: "network-evidence-path",
        narrative: "Trace the AI server system from demand signal to material bottleneck.",
        visualType: "chart",
        interactionType: "filter",
        structure: "network"
      },
      {
        candidateId: "material-ledger",
        directionLabel: "Material Ledger",
        themeId: "warm-paper-terracotta",
        narrativeId: "material-decision-ledger",
        narrative: "Organize the report as a material-by-material decision ledger.",
        visualType: "matrix",
        interactionType: "toggle",
        structure: "ledger"
      },
      {
        candidateId: "capacity-timeline",
        directionLabel: "Capacity Timeline",
        themeId: "sandstone-archive",
        narrativeId: "capacity-evolution-timeline",
        narrative: "Read capacity, technology, and supplier evidence as a staged timeline.",
        visualType: "timeline",
        interactionType: "drilldown",
        structure: "timeline"
      }
    ];

    const candidateEvidence = [];
    for (const direction of directions) {
      const siteDir = await timed(timings, `candidate-${direction.candidateId}Ms`, () => writeCandidateSite({
        page,
        root: packageSources,
        direction,
        project,
        variant,
        firstSource,
        firstFact,
        coverage: sharedCoverage
      }));
      const imported = await importV5DesignCandidate(projectDir, variant.variantId, siteDir);
      candidateEvidence.push({
        candidateId: direction.candidateId,
        payloadSha256: imported.payloadSha256,
        screenshot: path.join(siteDir, "screenshots", "desktop.png")
      });
    }

    const reviewSet = await timed(timings, "prepareCandidateReviewMs", () => prepareV5CandidateReviewSet(projectDir, variant.variantId));
    expect(reviewSet.candidates).toHaveLength(3);
    expect(new Set(reviewSet.candidates.map((item) => item.candidateId)).size).toBe(3);
    for (const item of reviewSet.candidates) {
      expect(Object.keys(item).sort()).toEqual(["candidateId", "interaction", "narrative", "screenshot", "visualization"]);
      expect(path.basename(item.screenshot)).toBe("desktop.png");
      expect(await readdir(path.dirname(item.screenshot))).toEqual(["desktop.png"]);
      await access(item.screenshot);
    }
    evidence.candidates = reviewSet.candidates.map((item) => ({
      ...item,
      payloadSha256: candidateEvidence.find((candidate) => candidate.candidateId === item.candidateId).payloadSha256
    }));
    for (const candidate of evidence.candidates) candidate.screenshotSha256 = sha256(await readFile(candidate.screenshot));

    const selectedCandidateId = "network-atlas";
    const receiptPath = path.join(acceptanceRoot, "selection-receipt.json");
    await writeJson(receiptPath, {
      schemaVersion: 1,
      selectedBy: "user",
      candidateId: selectedCandidateId,
      reviewSetSha256: reviewSet.reviewSetSha256,
      verbatimUserSelection: "选择 Network Atlas，并沿这个方向扩展完整站点。",
      recordedAt: "2026-08-05T10:10:00.000Z"
    });
    const selection = await confirmV5DesignCandidate(projectDir, variant.variantId, selectedCandidateId, { receiptPath });
    expect(selection.candidateId).toBe(selectedCandidateId);
    evidence.selection = selection;

    const finalSourceDir = await timed(timings, "finalSiteAuthoringMs", () => writeFinalSite({
      page,
      root: packageSources,
      project,
      variant,
      selection,
      allSources,
      allFacts: ledger.facts,
      firstSource,
      coverage: coveragePlan(firstSource, "hero", "material-detail")
    }));
    const finalImport = await timed(timings, "finalSiteImportMs", () => importV5FinalSite(projectDir, variant.variantId, finalSourceDir));
    expect(finalImport.manifest.parentCandidateId).toBe(selectedCandidateId);
    expect(finalImport.manifest.parentCandidateSha256).toBe(selection.candidateSha256);
    const storedSiteDir = path.join(projectDir, "variants", variant.variantId, "design", "package");
    const storedHashBeforeInstrumentation = await hashV5SitePayload(storedSiteDir);
    const huashuReceipt = await requireFrozenHuashuOutput(projectDir, variant.variantId, "final");
    expect(huashuReceipt.outputSha256).toMatch(/^[a-f0-9]{64}$/);

    const artifactPath = await timed(timings, "instrumentationMs", () => instrumentV5Variant(projectDir, variant.variantId));
    const storedHashAfterInstrumentation = await hashV5SitePayload(storedSiteDir);
    expect(storedHashAfterInstrumentation).toBe(storedHashBeforeInstrumentation);
    const instrumentation = await readJson(path.join(projectDir, "variants", variant.variantId, "instrumentation-report.json"));
    expect(instrumentation.bodyStructureAfterSha256).toBe(instrumentation.bodyStructureBeforeSha256);
    expect(instrumentation.huashuReceiptOutputSha256).toBe(huashuReceipt.outputSha256);
    expect(instrumentation.injectedContracts).toEqual(["offline-resources", "editor-identities", "source-bindings", "theme-variables"]);
    expect(instrumentation.generatedDesign).toBe(false);
    const validation = await timed(timings, "validationMs", () => validateV5Variant(projectDir, variant.variantId));
    expect(validation.valid).toBe(true);
    expect(validation.coveredSources).toBe(allSources.length);
    evidence.finalSite = {
      selectedCandidateId,
      finalSiteSha256: finalImport.payloadSha256,
      storedPayloadSha256: storedHashBeforeInstrumentation,
      huashuReceiptSha256: huashuReceipt.receiptSha256,
      huashuReceiptOutputSha256: huashuReceipt.outputSha256,
      bodyStructureBeforeSha256: instrumentation.bodyStructureBeforeSha256,
      bodyStructureAfterSha256: instrumentation.bodyStructureAfterSha256,
      artifactSha256: validation.artifactSha256,
      coveredSources: validation.coveredSources,
      desktopScreenshot: path.join(finalSourceDir, "screenshots", "desktop.png"),
      mobileScreenshot: path.join(finalSourceDir, "screenshots", "mobile.png")
    };

    await timed(timings, "responsiveChecksMs", async () => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(pathToFileURL(artifactPath).href);
      await expect(page.locator(".focus-network")).toBeVisible();
      await page.locator("[data-core-interaction]").click();
      await expect(page.locator(".focus-network")).toHaveAttribute("data-state", "selected");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.reload();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await expect(page.locator(".material-detail")).toBeVisible();
    });

    const revealed = [];
    editor = await startEditorServer({
      projectDir,
      variantId: variant.variantId,
      onReveal: async (targetPath) => {
        await access(targetPath);
        revealed.push(targetPath);
        return { requested: true, targetPath };
      }
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(editor.url + "/?token=" + encodeURIComponent(editor.token));
    const frame = page.frameLocator('iframe[title="报告画布"]');
    await expect(frame.locator("h1[data-edit-id]")).toBeVisible();
    await page.locator('[data-action="edit"]').click();
    await expect(frame.locator("h1[data-edit-id]")).toHaveAttribute("contenteditable", "true");

    await editTextWithoutViewportReset(frame.locator("h1[data-edit-id]"), "AI 服务器产业链：编辑器验收", frame);
    await editTextWithoutViewportReset(frame.locator(".report-summary[data-edit-id]"), "正文编辑已通过，并保持当前浏览位置。", frame);
    await editTextWithoutViewportReset(frame.locator(".material-detail p[data-edit-id]"), "关键材料详情已通过可追溯编辑接口更新。", frame);

    const image = frame.locator("img[data-image-id]");
    await image.scrollIntoViewIfNeeded();
    await image.click();
    const imageScroll = await frame.locator("html").evaluate(() => window.scrollY);
    await frame.locator('[data-context-action="replace-image"]').click();
    await page.locator("[data-image-input]").setInputFiles({
      name: "replacement.png",
      mimeType: "image/png",
      buffer: tinyPng()
    });
    await expect(image).toHaveAttribute("src", /^data:image\/png;base64,/);
    await expect.poll(() => frame.locator("html").evaluate(() => window.scrollY)).toBe(imageScroll);

    const chart = frame.locator("[data-chart-id]");
    await chart.scrollIntoViewIfNeeded();
    await chart.click();
    const chartScroll = await frame.locator("html").evaluate(() => window.scrollY);
    await frame.locator('[data-context-action="edit-chart"]').click();
    await page.locator('[data-chart-grid] input[data-row="0"][data-column="1"]').fill("88");
    await page.locator("[data-chart-save]").click();
    await expect.poll(() => frame.locator("script[data-chart-data-for]").textContent()).toContain("88");
    await expect.poll(() => frame.locator("html").evaluate(() => window.scrollY)).toBe(chartScroll);

    const block = frame.locator(".material-detail[data-block-id]");
    await block.dispatchEvent("click");
    await expect(frame.locator('[data-context-action="clone"]')).toBeVisible();
    const blockCountBeforeClone = await frame.locator("[data-block-id]").count();
    await frame.locator('[data-context-action="clone"]').click();
    await expect(frame.locator("[data-block-id]")).toHaveCount(blockCountBeforeClone + 1);
    await page.locator('[data-action="undo"]').click();
    await expect(frame.locator("[data-block-id]")).toHaveCount(blockCountBeforeClone);

    const themeScroll = await frame.locator("html").evaluate(() => window.scrollY);
    await page.locator(".theme-picker summary").click();
    await page.locator('[data-theme-id="signal-orange"]').click();
    await expect(frame.locator("html")).toHaveAttribute("data-theme", "signal-orange");
    await expect.poll(() => frame.locator("html").evaluate(() => window.scrollY)).toBe(themeScroll);

    await page.locator('[data-action="edit"]').click();
    const saveScroll = await frame.locator("html").evaluate(() => window.scrollY);
    const saveResponse = page.waitForResponse((response) => response.url().endsWith("/api/versions") && response.request().method() === "POST");
    await page.locator('[data-action="save"]').click();
    expect((await saveResponse).status()).toBe(201);
    await expect.poll(() => frame.locator("html").evaluate(() => window.scrollY)).toBe(saveScroll);

    const versionsAfterSave = await apiJson(editor, "/api/versions");
    expect(versionsAfterSave).toHaveLength(1);
    const savedVersion = versionsAfterSave[0];
    await page.locator('[data-action="edit"]').click();
    await expect(frame.locator("h1[data-edit-id]")).toHaveAttribute("contenteditable", "true");
    await frame.locator("h1[data-edit-id]").fill("临时未保存标题");
    await frame.locator("h1[data-edit-id]").blur();
    await page.locator('[data-action="edit"]').click();
    await expect(frame.locator("h1[data-edit-id]")).not.toHaveAttribute("contenteditable", "true");
    await page.locator('[data-action="versions"]').click();
    const restoreScroll = await frame.locator("html").evaluate(() => window.scrollY);
    await page.locator(`[data-restore="${savedVersion.versionId}"]`).click();
    await expect(frame.locator("h1[data-edit-id]")).toHaveText("AI 服务器产业链：编辑器验收");
    await expect.poll(() => frame.locator("html").evaluate(() => window.scrollY)).toBe(restoreScroll);

    await page.locator('[data-action="publish"]').click();
    const publicationItem = page.locator("[data-publish-list] .history-item").first();
    const primaryActions = publicationItem.locator(":scope > .history-actions").first().locator("button");
    await expect(primaryActions).toHaveCount(4);
    await expect(primaryActions.nth(0)).toHaveAttribute("data-version-local-publish");
    await expect(primaryActions.nth(1)).toHaveAttribute("data-version-domain-publish");
    await expect(primaryActions.nth(2)).toHaveAttribute("data-version-reveal-local");
    await expect(primaryActions.nth(3)).toHaveAttribute("data-version-delete");
    const latestVersionId = await primaryActions.nth(0).getAttribute("data-version-local-publish");
    const publishResponse = page.waitForResponse((response) => response.url().endsWith("/api/publish") && response.request().method() === "POST");
    await primaryActions.nth(0).click();
    expect((await publishResponse).status()).toBe(201);

    const publications = await apiJson(editor, "/api/publications");
    expect(publications).toHaveLength(1);
    const publication = publications[0];
    expect(publication.versionId).toBe(latestVersionId);
    const publicationPath = publication.outputPath
      ? path.resolve(publication.outputPath)
      : path.resolve(projectDir, publication.canonicalPath);
    await access(publicationPath);
    await page.locator(`[data-version-reveal-local="${latestVersionId}"]`).click();
    await expect.poll(() => revealed.length).toBe(1);
    expect(path.resolve(revealed[0])).toBe(path.resolve(publicationPath));
    evidence.editor = {
      actions: ["title", "body", "material-detail", "image", "chart", "block", "undo", "palette", "save", "restore"],
      savedVersionId: savedVersion.versionId,
      restoredVersionId: latestVersionId,
      primaryPublicationActions: 4,
      themeId: "signal-orange"
    };
    evidence.publication = {
      publicationId: publication.publicationId,
      publicationPath,
      publicationSha256: sha256(await readFile(publicationPath)),
      revealRequestedPath: revealed[0],
      fileExists: true,
      explorerVisualConfirmation: false
    };
    evidence.commands.push("npx playwright test e2e/v5-3-ai-server-report.spec.js");
    evidence.completedAt = new Date().toISOString();
    await writeJson(evidencePath, evidence);
    await testInfo.attach("v5.3 acceptance evidence", { path: evidencePath, contentType: "application/json" });
  } finally {
    if (editor) await editor.close();
  }
});

async function writeCandidateSite({ page, root, direction, project, variant, firstSource, firstFact, coverage }) {
  const siteDir = path.join(root, direction.candidateId);
  await createSiteDirectories(siteDir);
  const focusClass = `focus-${direction.candidateId}`;
  const body = candidateBody(direction, focusClass);
  await writeFile(path.join(siteDir, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="styles/site.css"></head><body>${body}<script src="scripts/site.js"></script></body></html>`, "utf8");
  await writeFile(path.join(siteDir, "styles", "site.css"), candidateCss(direction.structure), "utf8");
  await writeFile(path.join(siteDir, "scripts", "site.js"), `document.querySelector('[data-core-interaction]').addEventListener('click',()=>{const node=document.querySelector('.${focusClass}');node.dataset.state=node.dataset.state==='selected'?'idle':'selected';document.documentElement.dataset.interaction='${direction.interactionType}'})`, "utf8");
  const bindings = {
    schemaVersion: 1,
    bindings: [{ contentId: "core", factIds: [firstFact.factId], sourceRefs: [firstSource], tier: "main", editableKind: "block" }],
    omissions: [],
    coverage
  };
  const process = {
    schemaVersion: 1,
    owner: "huashu-design",
    candidateId: direction.candidateId,
    narrativeArchitecture: { id: direction.narrativeId, description: direction.narrative },
    visualizationModules: [{
      id: "representative-focus",
      title: `${direction.directionLabel} evidence`,
      category: "focus",
      type: direction.visualType,
      selector: `.${focusClass}`,
      sourceRefs: [firstSource]
    }],
    coreInteraction: {
      type: direction.interactionType,
      selector: "[data-core-interaction]",
      event: "click",
      description: `Exercises the ${direction.directionLabel} representative evidence state`
    },
    sampleScope: {
      firstViewportSelector: ".first-viewport",
      focusModuleSelector: `.${focusClass}`,
      coreInteractionSelector: "[data-core-interaction]"
    }
  };
  const bindingText = JSON.stringify(bindings, null, 2) + "\n";
  const processText = JSON.stringify(process, null, 2) + "\n";
  await writeFile(path.join(siteDir, "content-bindings.json"), bindingText, "utf8");
  await writeFile(path.join(siteDir, "design-process.json"), processText, "utf8");
  await writeFile(path.join(siteDir, "design-rationale.md"), `# ${direction.directionLabel}\n\n${direction.narrative}\n`, "utf8");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(pathToFileURL(path.join(siteDir, "index.html")).href);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(900);
  await page.locator("[data-core-interaction]").click();
  await expect(page.locator(`.${focusClass}`)).toHaveAttribute("data-state", "selected");
  for (const selector of ["h1", `.${focusClass}`, "[data-core-interaction]"]) {
    const box = await page.locator(selector).boundingBox();
    expect(box).not.toBeNull();
    expect(box.y + box.height).toBeLessThanOrEqual(900);
  }
  await page.screenshot({ path: path.join(siteDir, "screenshots", "desktop.png"), fullPage: false });
  const payloadSha256 = await hashV5SitePayload(siteDir);
  await writeJson(path.join(siteDir, "manifest.json"), {
    schemaVersion: 1,
    packageVersion: "5.3.0",
    kind: "candidate",
    candidateId: direction.candidateId,
    directionId: direction.candidateId,
    directionLabel: direction.directionLabel,
    previewThemeId: direction.themeId,
    entrypoint: "index.html",
    sourcePackSha256: project.sourcePackSha256,
    interviewSha256: (await readJson(path.join(path.dirname(root), "project", "variants", variant.variantId, "variant.json"))).interviewSha256,
    contentBindingsSha256: sha256(bindingText),
    payloadSha256,
    outputSha256: payloadSha256,
    screenshotSourceSha256: payloadSha256,
    designProcessSha256: sha256(processText),
    sampleScope: process.sampleScope
  });
  return siteDir;
}

async function writeFinalSite({ page, root, project, variant, selection, allSources, allFacts, firstSource, coverage }) {
  const siteDir = path.join(root, "network-atlas-final");
  await createSiteDirectories(siteDir);
  await writeFile(path.join(siteDir, "assets", "network.svg"), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 360"><rect x="2" y="2" width="796" height="356" fill="none" stroke="currentColor" stroke-width="4"/><path d="M70 280L210 190L350 230L510 120L710 70" fill="none" stroke="currentColor" stroke-width="10"/></svg>', "utf8");
  await writeFile(path.join(siteDir, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="styles/site.css"></head><body><main class="report-shell"><header class="report-hero" data-content-id="hero"><p class="eyebrow">AI SERVER MATERIAL NETWORK</p><h1>AI 服务器产业链与关键材料</h1><p class="report-summary">从需求、系统、材料和供应链证据理解关键机会。</p></header><section class="overview-chart" data-content-id="chart"><h2>核心证据概览</h2><div class="bar-row" data-chart-mark style="background:var(--report-chart-1)"><span>需求</span><b>基准</b></div><div class="bar-row"><span>供应</span><b>约束</b></div><span class="chart-tooltip"></span><span class="chart-selection-band"></span></section><section class="material-detail" data-content-id="material-detail"><h2>关键材料详情</h2><p>围绕材料性能、供应能力与验证进度组织可追溯证据。</p><img data-content-id="material-image" src="assets/network.svg" alt="AI server material network"></section><section class="focus-network" data-content-id="source-coverage" data-state="idle"><h2>完整材料覆盖</h2><p>全部实质性来源单元均通过内容绑定纳入主报告与详情层。</p><button type="button" data-core-interaction>筛选关键证据</button></section></main><script type="application/json" data-chart-data-for="chart">{"columns":["Signal","Index"],"rows":[["Demand",42],["Supply",37]]}</script><script src="scripts/site.js"></script></body></html>`, "utf8");
  await writeFile(path.join(siteDir, "styles", "site.css"), `:root{--ink:var(--report-text,black);--paper:var(--report-canvas,white);--surface:var(--report-surface,white);--accent:var(--report-accent,steelblue);--line:var(--report-border,silver)}*{box-sizing:border-box}html,body{margin:0;max-width:100%;overflow-x:hidden}body{background:var(--paper);color:var(--ink);font-family:Arial,sans-serif}.report-shell{width:min(1180px,calc(100% - 48px));margin:auto;display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:24px;padding:56px 0 120px}.report-hero{grid-column:1/-1;border-bottom:2px solid var(--line);padding:32px 0}.eyebrow{letter-spacing:.14em;color:var(--accent)}h1{font-size:clamp(42px,6vw,78px);line-height:.96;max-width:900px;margin:12px 0 24px}.report-summary{font-size:22px;max-width:720px}.overview-chart{grid-column:1/6;background:var(--surface);border:1px solid var(--line);padding:28px}.bar-row{display:flex;justify-content:space-between;border-bottom:8px solid var(--accent);padding:18px 0}.material-detail{grid-column:6/-1;background:var(--surface);border:1px solid var(--line);padding:28px}.material-detail img{display:block;width:100%;max-height:300px;object-fit:contain;color:var(--accent)}.focus-network{grid-column:1/-1;border:1px solid var(--line);padding:32px;min-height:300px}.focus-network[data-state=selected]{outline:6px solid var(--accent)}button{padding:12px 18px;border:1px solid var(--accent);background:var(--surface);color:var(--ink)}@media(max-width:700px){.report-shell{width:min(100% - 28px,1180px);grid-template-columns:1fr;padding-top:24px}.report-hero,.overview-chart,.material-detail,.focus-network{grid-column:1}h1{font-size:42px}}`, "utf8");
  await writeFile(path.join(siteDir, "scripts", "site.js"), `const focus=document.querySelector('.focus-network');document.querySelector('[data-core-interaction]').addEventListener('click',()=>{focus.dataset.state=focus.dataset.state==='selected'?'idle':'selected'});window.addEventListener('edit-html-report:chart-data',event=>{document.documentElement.dataset.chartUpdated=event.detail.chartId})`, "utf8");
  const bindings = {
    schemaVersion: 1,
    bindings: [
      { contentId: "hero", factIds: allFacts.map((fact) => fact.factId), sourceRefs: allSources, tier: "main", editableKind: "block" },
      { contentId: "chart", factIds: [], sourceRefs: [firstSource], tier: "main", editableKind: "chart" },
      { contentId: "material-detail", factIds: [], sourceRefs: [firstSource], tier: "detail", editableKind: "block" },
      { contentId: "material-image", factIds: [], sourceRefs: [], tier: "detail", editableKind: "image" },
      { contentId: "source-coverage", factIds: [], sourceRefs: [firstSource], tier: "detail", editableKind: "block" }
    ],
    omissions: [],
    coverage
  };
  const process = {
    schemaVersion: 1,
    owner: "huashu-design",
    candidateId: selection.candidateId,
    parentCandidateId: selection.candidateId,
    narrativeArchitecture: { id: "network-evidence-path", description: "Trace the AI server system from demand signal to material bottleneck." },
    visualizationModules: [
      { id: "overview", title: "Evidence overview", category: "overview", type: "data-table", selector: ".overview-chart", sourceRefs: [firstSource] },
      { id: "focus", title: "Network evidence", category: "focus", type: "chart", selector: ".focus-network", sourceRefs: [firstSource] }
    ],
    coreInteraction: { type: "filter", selector: "[data-core-interaction]", event: "click", description: "Filters the representative evidence state" }
  };
  const bindingText = JSON.stringify(bindings, null, 2) + "\n";
  const processText = JSON.stringify(process, null, 2) + "\n";
  await writeFile(path.join(siteDir, "content-bindings.json"), bindingText, "utf8");
  await writeFile(path.join(siteDir, "design-process.json"), processText, "utf8");
  await writeFile(path.join(siteDir, "design-rationale.md"), "# Network Atlas\n\nThe selected compact direction expands into the complete material network without changing its narrative, focus chart, or filter interaction.\n", "utf8");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(pathToFileURL(path.join(siteDir, "index.html")).href);
  await page.locator("[data-core-interaction]").click();
  await expect(page.locator(".focus-network")).toHaveAttribute("data-state", "selected");
  await page.screenshot({ path: path.join(siteDir, "screenshots", "desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: path.join(siteDir, "screenshots", "mobile.png"), fullPage: true });
  const payloadSha256 = await hashV5SitePayload(siteDir);
  const storedVariant = await readJson(path.join(path.dirname(root), "project", "variants", variant.variantId, "variant.json"));
  await writeJson(path.join(siteDir, "manifest.json"), {
    schemaVersion: 1,
    packageVersion: "5.3.0",
    kind: "final",
    candidateId: selection.candidateId,
    directionId: selection.directionId,
    directionLabel: selection.directionLabel,
    previewThemeId: selection.previewThemeId,
    entrypoint: "index.html",
    sourcePackSha256: project.sourcePackSha256,
    interviewSha256: storedVariant.interviewSha256,
    contentBindingsSha256: sha256(bindingText),
    payloadSha256,
    outputSha256: payloadSha256,
    screenshotSourceSha256: payloadSha256,
    designProcessSha256: sha256(processText),
    parentCandidateId: selection.candidateId,
    parentCandidateSha256: selection.candidateSha256
  });
  return siteDir;
}

function candidateBody(direction, focusClass) {
  if (direction.structure === "ledger") {
    return `<article class="first-viewport" data-role="material-ledger"><header><p>DECISION LEDGER</p><h1>${direction.directionLabel}</h1></header><aside data-content-id="core"><table class="${focusClass}" data-state="idle"><thead><tr><th>Material</th><th>Signal</th></tr></thead><tbody><tr><td>Thermal system</td><td>Priority evidence</td></tr></tbody></table><button type="button" data-core-interaction>Toggle material evidence</button></aside></article><footer>Extended sample boundary</footer>`;
  }
  if (direction.structure === "timeline") {
    return `<div class="first-viewport" data-role="capacity-timeline"><nav><p>CAPACITY EVOLUTION</p><button type="button" data-core-interaction>Drill into the next stage</button></nav><section data-content-id="core"><h1>${direction.directionLabel}</h1><ol class="${focusClass}" data-state="idle"><li><strong>Demand</strong><span>Signal</span></li><li><strong>System</strong><span>Constraint</span></li><li><strong>Material</strong><span>Evidence</span></li></ol></section></div><footer>Extended sample boundary</footer>`;
  }
  return `<main class="first-viewport" data-role="network-atlas"><section data-content-id="core"><header><p>AI SERVER EVIDENCE NETWORK</p><h1>${direction.directionLabel}</h1></header><figure class="${focusClass}" data-state="idle"><span>Demand</span><i></i><span>System</span><i></i><span>Material</span></figure><p>One representative focus module connects system evidence to material implications.</p><button type="button" data-core-interaction>Filter key evidence</button></section></main><footer>Extended sample boundary</footer>`;
}

function candidateCss(structure) {
  const shared = `:root{--paper:var(--report-canvas,white);--surface:var(--report-surface,white);--ink:var(--report-text,black);--accent:var(--report-accent,steelblue);--line:var(--report-border,silver)}*{box-sizing:border-box}html,body{margin:0}body{min-height:1700px;background:var(--paper);color:var(--ink);font-family:Arial,sans-serif}.first-viewport{height:900px;padding:56px 72px}h1{font-size:76px;line-height:.95;margin:16px 0 36px}button{padding:14px 20px;border:1px solid var(--accent);background:var(--surface);color:var(--ink)}footer{padding:48px;border-top:1px solid var(--line)}`;
  if (structure === "ledger") return shared + `.first-viewport{display:grid;grid-template-columns:1fr 1.4fr;gap:56px;align-items:center}.first-viewport header{border-right:8px solid var(--accent);padding-right:36px}table{width:100%;border-collapse:collapse;margin-bottom:28px}th,td{padding:24px;border:1px solid var(--line);text-align:left}table[data-state=selected]{outline:8px solid var(--accent)}`;
  if (structure === "timeline") return shared + `.first-viewport{display:flex;gap:72px}.first-viewport nav{width:260px;border-right:1px solid var(--line);display:flex;flex-direction:column;justify-content:space-between;padding-bottom:120px}.first-viewport section{flex:1}ol{list-style:none;padding:0;display:grid;grid-template-columns:repeat(3,1fr);gap:18px}li{min-height:260px;border-top:12px solid var(--accent);padding:30px 12px;display:flex;flex-direction:column;justify-content:space-between}ol[data-state=selected] li{border-bottom:6px solid var(--accent)}`;
  return shared + `.first-viewport{display:grid;place-items:center}.first-viewport section{width:min(1100px,100%)}figure{height:260px;display:grid;grid-template-columns:auto 1fr auto 1fr auto;align-items:center;gap:18px;border:1px solid var(--line);padding:42px;margin:0 0 26px}figure i{height:8px;background:var(--accent)}figure[data-state=selected]{outline:8px solid var(--accent)}`;
}

function coveragePlan(sourceId, overviewContentId, focusContentId = overviewContentId) {
  return {
    kind: overviewContentId === "core" ? "vertical-slice" : "complete-site",
    overviewContentIds: [overviewContentId],
    overviewSourceRefs: [sourceId],
    focusEntities: [{
      entityId: "ai-server-materials",
      label: "AI server materials",
      sourceRefs: [sourceId],
      contentIds: [focusContentId],
      facets: [{
        facetId: "material-evidence",
        label: "Material evidence",
        sourceRefs: [sourceId],
        contentIds: [focusContentId]
      }]
    }],
    representedFocusEntityIds: ["ai-server-materials"]
  };
}

async function editTextWithoutViewportReset(locator, value, frame) {
  await locator.scrollIntoViewIfNeeded();
  const scrollY = await frame.locator("html").evaluate(() => window.scrollY);
  await locator.fill(value);
  await locator.blur();
  await expect(locator).toHaveText(value);
  await expect.poll(() => frame.locator("html").evaluate(() => window.scrollY)).toBe(scrollY);
}

async function apiJson(editor, route) {
  const response = await fetch(editor.url + route, { headers: { authorization: "Bearer " + editor.token } });
  const text = await response.text();
  expect(response.status, text).toBe(200);
  return JSON.parse(text);
}

async function createSiteDirectories(siteDir) {
  for (const directory of ["styles", "scripts", "assets", "screenshots"]) await mkdir(path.join(siteDir, directory), { recursive: true });
}

async function listFiles(root, prefix = "") {
  const result = [];
  for (const entry of await readdir(path.join(root, ...prefix.split("/").filter(Boolean)), { withFileTypes: true })) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) result.push(...await listFiles(root, name));
    else result.push(name.replaceAll("\\", "/"));
  }
  return result.sort();
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await writeFile(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

async function timed(timings, name, operation) {
  const started = performance.now();
  try {
    return await operation();
  } finally {
    timings[name] = Math.round(performance.now() - started);
  }
}

function answer(question, response) {
  return { question, response, origin: "user-provided", recordedAt: "2026-08-05T10:00:00.000Z" };
}

function tinyPng() {
  return Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64");
}

function sha256(value) {
  return createHash("sha256").update(value ?? "").digest("hex");
}

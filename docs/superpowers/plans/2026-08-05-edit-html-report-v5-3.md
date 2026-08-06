# Edit HTML Report V5.3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Release V5.3.0 with compact executable Huashu design samples, a hard Huashu/audit boundary, one coherent version system, reliable editor runtime refresh, and working Windows file-manager reveal.

**Architecture:** Keep one model capable of loading Huashu, but enforce stage isolation through explicit input manifests, immutable hashes, and command boundaries. Separate tool, pipeline, artifact-contract, and editor-runtime versions while sourcing their values from one module. Generate three small real-HTML samples before selection, then expand only the selected direction into the complete site and instrument it without redesign.

**Tech Stack:** Node.js 20+, ES modules, `node:test`, Playwright, parse5, local HTTP editor server, Windows `explorer.exe`.

## Global Constraints

- Release version is `5.3.0`; do not retain user-facing V5.2.x labels in the active workflow.
- Preserve V5.2.1 project compatibility; migration must not mutate saved versions, publications, Huashu DOM, report content, or design.
- A candidate sample is real executable HTML, but only contains one first viewport, one representative focus module, and one real core interaction.
- Candidate review shows exactly one desktop screenshot per candidate; mobile and full-page screenshots run only after selection.
- Huashu owns narrative, DOM, CSS, visualization, interaction, responsiveness, and visual language.
- Edit HTML may extract, validate, hash, instrument, version, and publish; it may not redesign or rewrite Huashu output.
- Windows reveal must select the actual published `report.html`, not merely report that a process was spawned.
- Do not delete or reset the existing dirty worktree. Commit V5.3 changes in isolated, reviewable units.

---

### Task 1: Establish One Version Authority

**Files:**
- Create: `src/version-manifest.js`
- Modify: `package.json`
- Modify: `src/v5-project.js`
- Modify: `src/v5-interview.js`
- Modify: `src/v5-quality-gate.js`
- Modify: `src/v5-validate.js`
- Modify: `src/project-runtime.js`
- Test: `test/version-manifest.test.js`
- Test: `test/v5-project.test.js`

**Interfaces:**
- Produces: `TOOL_VERSION`, `PIPELINE_VERSION`, `ARTIFACT_CONTRACT_VERSION`, `EDITOR_RUNTIME_VERSION`, and `SUPPORTED_ARTIFACT_CONTRACT_VERSIONS`.
- Produces project metadata fields `toolVersion`, `pipelineVersion`, `artifactContractVersion`, and `editorRuntimeVersion`.
- Preserves reading legacy `packageVersion: "5.2.1"` projects.

- [ ] **Step 1: Write a failing single-source version test**

```js
test("V5.3 version fields come from one authority", async () => {
  assert.equal(TOOL_VERSION, "5.3.0");
  assert.equal(PIPELINE_VERSION, "5.3.0");
  assert.equal(ARTIFACT_CONTRACT_VERSION, "5.3.0");
  assert.equal(EDITOR_RUNTIME_VERSION, "5.3.0");
  assert.equal(JSON.parse(await readFile("package.json", "utf8")).version, TOOL_VERSION);
});
```

- [ ] **Step 2: Run the test and confirm it fails because the authority does not exist**

Run: `node --test test/version-manifest.test.js`

- [ ] **Step 3: Add `src/version-manifest.js` and replace active hard-coded V5.2.x constants**

```js
export const TOOL_VERSION = "5.3.0";
export const PIPELINE_VERSION = "5.3.0";
export const ARTIFACT_CONTRACT_VERSION = "5.3.0";
export const EDITOR_RUNTIME_VERSION = "5.3.0";
export const SUPPORTED_ARTIFACT_CONTRACT_VERSIONS = new Set([
  "5.1.0", "5.1.1", "5.2.0", "5.2.1", "5.3.0"
]);
```

- [ ] **Step 4: Make new project and variant records emit all four fields**

Retain `packageVersion: "5.3.0"` only as a deprecated compatibility alias. Validation must use `artifactContractVersion`, falling back to legacy `packageVersion` when reading old projects.

- [ ] **Step 5: Replace `editorBoundary: "v5.2.1-html-backed"` with a structured boundary result**

```js
editorBoundary: {
  kind: "html-backed",
  contractVersion: ARTIFACT_CONTRACT_VERSION,
  runtimeVersion: EDITOR_RUNTIME_VERSION
}
```

- [ ] **Step 6: Run focused tests**

Run: `node --test test/version-manifest.test.js test/v5-project.test.js test/v5-schema-contract.test.js`

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/version-manifest.js src/v5-project.js src/v5-interview.js src/v5-quality-gate.js src/v5-validate.js src/project-runtime.js test/version-manifest.test.js test/v5-project.test.js
git commit -m "refactor: unify v5.3 version metadata"
```

### Task 2: Make Runtime Provenance and Refresh Deterministic

**Files:**
- Modify: `src/project-runtime.js`
- Modify: `src/editor-session.js`
- Modify: `bin/edit-html-report.js`
- Create: `src/doctor.js`
- Test: `test/project-runtime.test.js`
- Test: `test/editor-session.test.js`
- Test: `test/cli.test.js`

**Interfaces:**
- Produces: `.editor-runtime/runtime-manifest.json` with `runtimeVersion`, `sourcePackageRoot`, `sourceSha256`, and `installedAt`.
- Produces: `edit-html-report runtime refresh <project>`.
- Produces: `edit-html-report doctor --project <project> --json` diagnostics.

- [ ] **Step 1: Write failing tests for stale runtime detection and refresh**

Create a temporary project with a runtime manifest reporting `5.2.1`; assert editor open refreshes it to `5.3.0` before starting the server and does not alter variants, versions, or publications.

- [ ] **Step 2: Write a failing doctor test**

Assert JSON output contains:

```json
{
  "toolVersion": "5.3.0",
  "pipelineVersion": "5.3.0",
  "artifactContractVersion": "5.3.0",
  "editorRuntimeVersion": "5.3.0",
  "executablePath": "<absolute path>",
  "packageRoot": "<absolute path>",
  "runtimeStatus": "current"
}
```

- [ ] **Step 3: Install runtime atomically**

Copy runtime files into a temporary sibling directory, write `runtime-manifest.json`, then rename into `.editor-runtime`. Never layer new files over an existing runtime.

- [ ] **Step 4: Stop stale sessions before replacing runtime**

Validate `.runtime/editor-session.json` PID, project path, runtime hash, and health endpoint. Stop only a session proven to belong to that project; otherwise discard stale metadata without terminating an unrelated process.

- [ ] **Step 5: Add explicit runtime refresh and doctor commands**

`runtime refresh` must return the old/new runtime hashes. `doctor` must warn when the current executable resolves to another checkout, the project runtime is stale, or project metadata uses a legacy contract.

- [ ] **Step 6: Run focused tests**

Run: `node --test test/project-runtime.test.js test/editor-session.test.js test/cli.test.js`

- [ ] **Step 7: Commit**

```bash
git add src/project-runtime.js src/editor-session.js src/doctor.js bin/edit-html-report.js test/project-runtime.test.js test/editor-session.test.js test/cli.test.js
git commit -m "feat: diagnose and refresh editor runtime"
```

### Task 3: Replace Full Candidate Sites with Compact Executable Samples

**Files:**
- Modify: `schemas/v5-site-manifest.schema.json`
- Modify: `schemas/v5-design-process.schema.json`
- Modify: `src/v5-design.js`
- Modify: `src/v5-quality-gate.js`
- Modify: `skills/edit-html-report/SKILL.md`
- Modify: `skills/edit-html-report/references/design-selection.md`
- Modify: `skills/edit-html-report/references/huashu-design-package.md`
- Test: `test/v5-design.test.js`
- Test: `test/v5-skill.test.js`
- Test: `e2e/v5-candidate-review.spec.js`

**Interfaces:**
- Candidate manifest adds `sampleScope.firstViewportSelector`, `focusModuleSelector`, and `coreInteractionSelector`.
- Candidate review output contains exactly one screenshot path per candidate.
- Final-site package remains content-complete.

- [ ] **Step 1: Write failing schema and quality-gate tests**

Accept a candidate containing one first viewport, one focus visualization, and one working interaction. Reject a color-only duplicate, fake screenshot, missing selector, raw-source dump, or full candidate package mislabeled as a sample.

- [ ] **Step 2: Change the candidate contract without weakening design distinctness**

Require three candidates to differ in narrative architecture, DOM structure, visualization strategy, and interaction. Do not require every source facet or complete mobile implementation before selection.

- [ ] **Step 3: Limit review capture to one desktop viewport**

Use a fixed `1440x900` viewport and `fullPage: false`. The screenshot must visibly contain the title/identity, core evidence, representative visualization, and the selected interaction state.

- [ ] **Step 4: Update user-facing review output**

For each candidate expose only:

```json
{
  "candidateId": "network-atlas",
  "screenshot": "<absolute PNG path>",
  "narrative": "<one sentence>",
  "visualization": "<one sentence>",
  "interaction": "<one sentence>"
}
```

- [ ] **Step 5: Move responsive and full-page verification after candidate confirmation**

The selected final site must still pass desktop and mobile Playwright checks before editor handoff.

- [ ] **Step 6: Run focused tests**

Run: `node --test test/v5-design.test.js test/v5-skill.test.js`

Run: `npx playwright test e2e/v5-candidate-review.spec.js`

- [ ] **Step 7: Commit**

```bash
git add schemas/v5-site-manifest.schema.json schemas/v5-design-process.schema.json src/v5-design.js src/v5-quality-gate.js skills/edit-html-report/SKILL.md skills/edit-html-report/references/design-selection.md skills/edit-html-report/references/huashu-design-package.md test/v5-design.test.js test/v5-skill.test.js e2e/v5-candidate-review.spec.js
git commit -m "feat: use compact executable design samples"
```

### Task 4: Enforce the Huashu and Audit Stage Boundary

**Files:**
- Create: `src/v5-stage-boundary.js`
- Modify: `src/v5-design.js`
- Modify: `src/finalize.js`
- Modify: `src/v5-instrumenter.js`
- Modify: `bin/edit-html-report.js`
- Modify: `skills/edit-html-report/references/artifact-contract.md`
- Modify: `skills/edit-html-report/references/content-pipeline.md`
- Test: `test/v5-stage-boundary.test.js`
- Test: `test/v5-instrumenter.test.js`

**Interfaces:**
- Produces: `writeHuashuInputManifest(projectDir, variantId)`.
- Produces: `freezeHuashuOutput(projectDir, variantId, kind)`.
- Produces: `assertAuditPreservedHuashuOutput(before, after)`.
- Stage receipts record allowed inputs, output hash, owner, command, and timestamp.

- [ ] **Step 1: Write failing boundary tests**

Assert the Huashu input manifest contains Source Pack, interview, content brief, and optional visual references, but excludes renderer models, editor runtime, theme compiler output, and publication state.

- [ ] **Step 2: Add immutable stage receipts**

```json
{
  "stage": "huashu-final",
  "owner": "huashu-design",
  "allowedInputSha256": ["..."],
  "outputSha256": "...",
  "createdAt": "..."
}
```

- [ ] **Step 3: Make audit commands consume frozen Huashu output**

`design final import` freezes the site. `render` and `validate` may emit diagnostics and instrumentation metadata but must fail if body structure, classes, geometry, typography, chart definitions, or interaction code changes outside approved editor attributes/resources.

- [ ] **Step 4: Prevent same-command design and audit execution**

Require a persisted Huashu receipt before audit. A single model may perform both stages, but it must re-enter through the next CLI command with only the declared input package.

- [ ] **Step 5: Add an adversarial test**

Modify a heading, class name, grid declaration, and chart series during instrumentation; assert all four changes fail with precise diagnostics rather than being silently accepted.

- [ ] **Step 6: Run focused tests**

Run: `node --test test/v5-stage-boundary.test.js test/v5-instrumenter.test.js test/v5-design.test.js`

- [ ] **Step 7: Commit**

```bash
git add src/v5-stage-boundary.js src/v5-design.js src/finalize.js src/v5-instrumenter.js bin/edit-html-report.js skills/edit-html-report/references/artifact-contract.md skills/edit-html-report/references/content-pipeline.md test/v5-stage-boundary.test.js test/v5-instrumenter.test.js
git commit -m "feat: enforce huashu audit stage isolation"
```

### Task 5: Fix Windows File-Manager Reveal

**Files:**
- Modify: `src/publish.js`
- Modify: `src/editor-server.js`
- Modify: `src/editor-shell.js`
- Test: `test/publish.test.js`
- Test: `test/editor-server.test.js`
- Test: `e2e/editor.spec.js`

**Interfaces:**
- `revealPublication()` passes the absolute `report.html` path to the OS runner.
- `revealPath(targetFile, options)` verifies the file exists and returns `{ requested, targetPath, command }`.
- Windows command is `explorer.exe /select,<absolute report.html path>` with a visible non-detached process launch.

- [ ] **Step 1: Write a failing Windows command-construction test**

```js
assert.deepEqual(buildRevealCommand("win32", reportPath), {
  command: "explorer.exe",
  args: [`/select,${reportPath}`],
  options: { detached: false, stdio: "ignore", windowsHide: false }
});
```

- [ ] **Step 2: Write failure tests for missing file and process errors**

The API must return non-2xx when `report.html` is absent or `explorer.exe` emits an error. It must not show a success message in either case.

- [ ] **Step 3: Pass the file path instead of its directory**

Remove `path.dirname(targetPath)` from the runner call. Keep `directoryPath` in the response only as informational metadata.

- [ ] **Step 4: Remove `detached: true` and `windowsHide: true` on Windows**

Resolve after the child successfully spawns, but return `requested: true`; do not claim the OS window was visually verified.

- [ ] **Step 5: Update editor feedback**

On success display `已请求资源管理器定位 report.html`. On failure display the server error. Keep the four primary buttons unchanged.

- [ ] **Step 6: Add a Windows-only manual smoke script**

Run against a temporary HTML file and require the tester to confirm Explorer opens with that file selected. Skip this smoke check on non-Windows platforms; retain deterministic unit tests everywhere.

- [ ] **Step 7: Run focused tests**

Run: `node --test test/publish.test.js test/editor-server.test.js`

Run: `npx playwright test e2e/editor.spec.js`

- [ ] **Step 8: Commit**

```bash
git add src/publish.js src/editor-server.js src/editor-shell.js test/publish.test.js test/editor-server.test.js e2e/editor.spec.js
git commit -m "fix: reveal local publication in Windows Explorer"
```

### Task 6: Migrate Legacy V5 Projects Without Rewriting Content

**Files:**
- Create: `src/v5-migration.js`
- Modify: `bin/edit-html-report.js`
- Modify: `skills/edit-html-report/references/migration.md`
- Test: `test/v5-migration.test.js`

**Interfaces:**
- Produces: `inspectV5Migration(projectDir)` returning proposed metadata/runtime changes.
- Produces: `migrateV5Project(projectDir, { dryRun })`.
- Migration never rewrites `artifact.html`, version HTML, publication HTML, or Huashu design packages.

- [ ] **Step 1: Create a V5.2.1 fixture containing a saved version and local publication**

Record SHA-256 values for all HTML and design files before migration.

- [ ] **Step 2: Write a failing dry-run test**

Assert the dry run reports legacy metadata, missing runtime provenance, and intended metadata additions without modifying any file.

- [ ] **Step 3: Implement metadata-only migration**

Preserve legacy fields for traceability and add:

```json
{
  "migratedFrom": {
    "packageVersion": "5.2.1",
    "pipelineVersion": "5.2.1"
  },
  "toolVersion": "5.3.0",
  "artifactContractVersion": "5.2.1"
}
```

Do not relabel an existing artifact as contract `5.3.0`; only newly rendered artifacts receive that contract.

- [ ] **Step 4: Refresh runtime after metadata migration**

Verify every pre-migration content/design/artifact hash remains unchanged.

- [ ] **Step 5: Run focused tests**

Run: `node --test test/v5-migration.test.js test/project-runtime.test.js`

- [ ] **Step 6: Commit**

```bash
git add src/v5-migration.js bin/edit-html-report.js skills/edit-html-report/references/migration.md test/v5-migration.test.js
git commit -m "feat: migrate legacy v5 runtime metadata"
```

### Task 7: Consolidate Installation and Remove Version Ambiguity

**Files:**
- Create: `scripts/install-local.ps1`
- Create: `scripts/verify-installation.mjs`
- Modify: `package.json`
- Modify: `skills/edit-html-report/SKILL.md`
- Test: `test/install-contract.test.js`

**Interfaces:**
- Produces one supported local installation command.
- Verifies the global shim, package root, Skill version, runtime version, and source hash agree.

- [ ] **Step 1: Write a failing installation-contract test**

Assert no release can pass when `package.json`, `SKILL.md`, global package metadata, or `version-manifest.js` disagree.

- [ ] **Step 2: Add an installation script with an explicit source root**

The script must reject the old `4.0.0` main checkout and print the exact source directory being installed. It must run `npm test` before updating the global npm package and Skill directory.

- [ ] **Step 3: Add post-install verification**

Run `edit-html-report doctor --json`, compare hashes, and fail if `Get-Command edit-html-report` resolves outside the installed package root.

- [ ] **Step 4: Document repository consolidation**

Designate the merged V5.3 branch as the authority. Archive old worktrees only after their dirty changes are committed and merged; never delete uncommitted files as cleanup.

- [ ] **Step 5: Run focused tests**

Run: `node --test test/install-contract.test.js test/cli.test.js`

- [ ] **Step 6: Commit**

```bash
git add scripts/install-local.ps1 scripts/verify-installation.mjs package.json skills/edit-html-report/SKILL.md test/install-contract.test.js
git commit -m "build: make v5.3 installation provenance explicit"
```

### Task 8: End-to-End Acceptance with AI Server Report

**Files:**
- Create: `e2e/v5-3-ai-server-report.spec.js`
- Create: `docs/superpowers/skill-tests/2026-08-05-edit-html-report-v5-3.md`
- Modify: `editor-boundary.lock.json`

**Interfaces:**
- Uses `AI服务器报告.docx` as the acceptance source.
- Produces an evidence log containing timings, hashes, versions, candidate screenshots, final-site checks, editor actions, and local publication path.

- [ ] **Step 1: Run doctor and create a new V5.3 project in a fresh directory**

Assert all four active version fields report `5.3.0` and no command resolves to the `4.0.0` checkout.

- [ ] **Step 2: Verify the content interview remains limited**

Reuse known answers when provided. Ask purpose and content emphasis only; ask a third question solely for a concrete source ambiguity.

- [ ] **Step 3: Produce and inspect three compact Huashu samples**

Assert each candidate is executable, materially distinct, and represented by exactly one non-full-page screenshot plus three short descriptions.

- [ ] **Step 4: Confirm one candidate and expand only that candidate**

Verify the final site contains complete required material coverage, desktop/mobile behavior, real visualization, and working interactions.

- [ ] **Step 5: Verify audit isolation**

Compare Huashu output and instrumented body-structure hashes. Confirm only approved editor attributes, local resource inlining, theme compatibility metadata, and editor support were added.

- [ ] **Step 6: Exercise the editor without changing the original design**

Edit title text, a material detail, an image, chart data, and palette. Confirm every action stays at the current viewport and survives save/restore.

- [ ] **Step 7: Save, locally publish, and reveal**

Confirm exactly four primary publication actions. Confirm Explorer opens with the generated `report.html` selected and the reported path exists.

- [ ] **Step 8: Run the complete suite**

Run: `npm test`

Run: `npm run check`

Run: `npm run check:editor-boundary`

Run: `npx playwright test`

- [ ] **Step 9: Record acceptance evidence and commit**

```bash
git add e2e/v5-3-ai-server-report.spec.js docs/superpowers/skill-tests/2026-08-05-edit-html-report-v5-3.md editor-boundary.lock.json
git commit -m "test: verify edit html report v5.3 workflow"
```

## Release Gate

V5.3.0 is releasable only when all of the following are true:

- `doctor --project <new-project> --json` reports no version or runtime mismatch.
- A legacy V5.2.1 project opens after metadata/runtime migration with all pre-existing HTML hashes unchanged.
- Three candidate designs require only three compact HTML samples and three desktop screenshots.
- The selected final site passes complete source coverage and desktop/mobile verification.
- Huashu output hashes prove the audit/instrumentation phase did not redesign the site.
- Editor title, body, material detail, image, chart, block, undo, save, restore, palette, and publication workflows pass.
- Windows Explorer visibly opens with the locally published `report.html` selected.
- Main checkout, global package, Skill, current project runtime, and generated metadata identify the intended versions without ambiguity.

## Recommended Execution Order

Execute Tasks 1-2 first as the version/runtime foundation. Tasks 3-4 form the Huashu workflow upgrade and should be reviewed together but committed separately. Task 5 is an independent editor fix. Complete Tasks 6-7 before the final Task 8 acceptance run.

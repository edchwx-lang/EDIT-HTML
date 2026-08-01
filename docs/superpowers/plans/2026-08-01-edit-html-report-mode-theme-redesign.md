# Edit HTML Report Mode and Theme Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild report mode selection, six-color theme management, editor preview, saved-version publication, and Skill instructions so one material produces one structural mode and users change only colors in the editor.

**Architecture:** Keep report structure in immutable mode profiles and move all colors into a discoverable six-theme registry. Store the selected `themeId` as project state, compile its semantic CSS variables only for editor preview and immutable versions, and never rewrite the draft report DOM when switching themes. Split the editor shell from the loopback server and make the Skill enforce the mandatory mode-confirmation → generation → local-editing → saved-version → publishing flow.

**Tech Stack:** Node.js 20+ ESM, built-in `node:test`, loopback HTTP editor, Playwright with installed Chrome channel, Markdown Skill resources.

## Global Constraints

- A project report variant has exactly one structural mode: `data-first` or `evidence-first`.
- All six themes are available to both modes.
- Theme switching changes semantic colors and chart palettes only; it must not change text, body DOM, typography, dimensions, spacing, layout, or chart types.
- Initial themes are L01 `warm-paper-terracotta`, L02 `research-cobalt`, L06 `swiss-monochrome`, D01 `ink-teal`, D02 `linear-indigo`, and D04 `signal-orange`.
- Default theme is `ink-teal` for data-first and `warm-paper-terracotta` for evidence-first.
- The local editor is a mandatory checkpoint before the workflow can publish a report.
- Only a saved immutable version may be published.
- Published HTML must be self-contained and work offline.
- Source facts, numeric provenance, formulas, and chart data remain traceable.
- Follow red-green-refactor for every production behavior and every Skill edit.

---

## File Structure

Create or change these responsibility boundaries:

- `src/themes.js`: six-theme catalog, schema validation, legacy theme normalization, localized public metadata.
- `src/theme-artifact.js`: semantic CSS rendering and non-destructive compilation into preview/version HTML.
- `src/modes/data-first.js`: data-first defaults, localized description, density contract.
- `src/modes/evidence-first.js`: evidence-first defaults, localized description, reading contract.
- `src/modes/index.js`: mode lookup, validation, localized choice list.
- `src/artifact-contract.js`: mode-aware artifact and visible chart-mark validation.
- `src/editor-shell.js`: localized editor HTML, palette picker, save/version/publish controls.
- `src/editor-server.js`: authenticated API and state orchestration only.
- `src/variants.js`: mode-fixed variant state and theme selection; never edits artifact HTML.
- `src/finalize.js`: validate draft, compile selected theme, save immutable themed version metadata.
- `src/versions.js`: restore artifact and saved theme state together.
- `bin/edit-html-report.js`: localized mode list and optional initial theme CLI behavior.
- `skills/edit-html-report/SKILL.md`: concise mandatory workflow.
- `skills/edit-html-report/references/modes-and-themes.md`: full mode and theme decision contract.
- `skills/edit-html-report/references/agent-handoff.md`: report-plan schema without pre-generation theme coupling.
- `skills/edit-html-report/references/artifact-contract.md`: semantic color and chart-mark authoring contract.
- `skills/edit-html-report/references/huashu-report-profile.md`: report width and density corrections.
- `skills/edit-html-report/agents/openai.yaml`: UI metadata aligned with the revised Skill.
- `test/themes.test.js`, `test/modes.test.js`, existing unit tests: behavior protection.
- `test/fixtures/data-first-artifact.html`, `test/fixtures/evidence-first-artifact.html`: full-document themed fixtures.
- `e2e/editor.spec.js`: palette, structure-invariance, save, and publish browser workflow.
- `docs/superpowers/skill-tests/2026-08-01-edit-html-report.md`: raw forward-test prompts, baseline results, and post-Skill results.

---

### Task 1: Six-theme registry

**Files:**
- Create: `src/themes.js`
- Create: `test/themes.test.js`

**Interfaces:**
- Produces: `THEME_SCHEMA_VERSION`, `listThemes({ locale })`, `getTheme(themeId)`, `normalizeThemeId(themeId)`, `validateTheme(theme)`.
- Theme records use `{ schemaVersion, themeId, labels, appearance, tokens, chart }`.
- Later tasks consume stable semantic token names and `chart.categorical`.

- [ ] **Step 1: Write failing registry tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  getTheme,
  listThemes,
  normalizeThemeId,
  validateTheme
} from "../src/themes.js";

test("theme registry exposes the six approved palettes in stable order", () => {
  assert.deepEqual(listThemes({ locale: "zh-CN" }).map((theme) => theme.themeId), [
    "warm-paper-terracotta",
    "research-cobalt",
    "swiss-monochrome",
    "ink-teal",
    "linear-indigo",
    "signal-orange"
  ]);
  assert.equal(getTheme("ink-teal").labels["zh-CN"], "墨海荧青");
});

test("legacy theme ids migrate to approved palettes", () => {
  assert.equal(normalizeThemeId("editorial-light"), "warm-paper-terracotta");
  assert.equal(normalizeThemeId("editorial-dark"), "ink-teal");
  assert.equal(normalizeThemeId("tech-dark"), "ink-teal");
  assert.equal(normalizeThemeId("consulting-light"), "research-cobalt");
});

test("theme validation rejects incomplete semantic and chart colors", () => {
  assert.throws(
    () => validateTheme({ schemaVersion: 1, themeId: "broken" }),
    /theme "broken" requires labels/
  );
  assert.throws(() => getTheme("unknown"), /unknown theme "unknown"/);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test test/themes.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/themes.js`.

- [ ] **Step 3: Implement the registry and exact approved palettes**

Use these exact primary values; add `surfaceAlt`, `textMuted`, `border`, `focus`, `positive`, `warning`, `negative`, `chart.grid`, `chart.axis`, `chart.tooltipBackground`, and `chart.tooltipText` from the approved design spec.

| themeId | canvas | surface | text | accent | categorical |
|---|---|---|---|---|---|
| `warm-paper-terracotta` | `#F5F0E8` | `#FFFDFC` | `#191919` | `#CC785C` | `#CC785C,#8B6655,#D9A36F` |
| `research-cobalt` | `#F8FAFC` | `#FFFFFF` | `#0F172A` | `#0066FF` | `#0066FF,#38BDF8,#10B981` |
| `swiss-monochrome` | `#FFFFFF` | `#FFFFFF` | `#000000` | `#000000` | `#000000,#777777,#BDBDBD` |
| `ink-teal` | `#0A192F` | `#112240` | `#CCD6F6` | `#64FFDA` | `#64FFDA,#4CC9C0,#5B8DEF` |
| `linear-indigo` | `#08090A` | `#13151A` | `#F5F5F7` | `#5E6AD2` | `#5E6AD2,#4EA7FC,#B59AFF` |
| `signal-orange` | `#000000` | `#111111` | `#FFFFFF` | `#FF6900` | `#FF6900,#FFB000,#D53A24` |

Validate lower-case hyphenated IDs, both labels, `appearance` in `light|dark`, every required `#RRGGBB` token, at least three categorical chart colors, uniqueness, and WCAG AA contrast of `text` against `canvas` and `surface`.

- [ ] **Step 4: Run registry tests and full unit suite**

Run: `node --test test/themes.test.js`

Expected: 3 tests pass.

Run: `npm test`

Expected: all previous 41 tests plus registry tests pass.

- [ ] **Step 5: Commit**

```powershell
git add -- src/themes.js test/themes.test.js
git commit -m "feat: add extensible report theme registry"
```

---

### Task 2: Structural mode profiles and variant state

**Files:**
- Create: `src/modes/data-first.js`
- Create: `src/modes/evidence-first.js`
- Create: `src/modes/index.js`
- Create: `test/modes.test.js`
- Modify: `src/analysis.js`
- Modify: `src/variants.js`
- Modify: `test/variants.test.js`

**Interfaces:**
- Produces: `listModeProfiles({ locale })`, `getModeProfile(mode)`, `normalizeVariantRecord(variant)`.
- `createVariant(projectDir, { mode, themeId })` stores `{ variantId, mode, themeId, themeSchemaVersion, createdAt }`.
- `updateVariantTheme(projectDir, variantId, themeId)` updates JSON state only and returns normalized variant state.

- [ ] **Step 1: Write failing mode and variant tests**

```js
test("mode profiles describe both choices in the requested locale", () => {
  const choices = listModeProfiles({ locale: "zh-CN" });
  assert.deepEqual(choices.map((choice) => choice.mode), ["data-first", "evidence-first"]);
  assert.match(choices[0].description, /高密度/);
  assert.match(choices[1].description, /文字|原文图表/);
});

test("a theme can be selected for either structural mode", async (t) => {
  const projectDir = await newProject(t);
  const evidence = await createVariant(projectDir, {
    mode: "evidence-first",
    themeId: "signal-orange"
  });
  assert.equal(evidence.themeId, "signal-orange");
});

test("switching theme changes state but leaves draft HTML byte-identical", async (t) => {
  const projectDir = await newProject(t);
  const variant = await createVariant(projectDir, { mode: "data-first" });
  const artifactPath = path.join(projectDir, "variants", variant.variantId, "artifact.html");
  await writeFile(artifactPath, "<!doctype html><html><body>Same</body></html>", "utf8");
  const before = await readFile(artifactPath, "utf8");
  const updated = await updateVariantTheme(projectDir, variant.variantId, "signal-orange");
  assert.equal(updated.themeId, "signal-orange");
  assert.equal(await readFile(artifactPath, "utf8"), before);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test test/modes.test.js test/variants.test.js`

Expected: FAIL because mode modules and `themeId` behavior do not exist.

- [ ] **Step 3: Implement mode profiles**

`data-first.js` exports localized names/descriptions, default theme `ink-teal`, `minKpiCount: 4`, `minChartCount: 2`, `quantitativeThreshold: 8`, and desktop `maxWidth: 1440`.

`evidence-first.js` exports localized names/descriptions, default theme `warm-paper-terracotta`, `bodyMeasure: "68–78ch"`, `allowOriginalCharts: true`, and no chart minimum.

`index.js` validates mode IDs and falls back from unsupported locales to English while preserving `zh-CN` labels.

- [ ] **Step 4: Replace theme-by-mode coupling in variants**

Remove `THEMES_BY_MODE`. Normalize the four legacy IDs through `normalizeThemeId`, use the mode profile default when `themeId` is omitted, and validate every selected theme through `getTheme`. Update only `project.json` and `variant.json` during theme selection.

Update `recommendMode` to return localized-independent evidence fields:

```js
{
  mode,
  numericTokenCount,
  quantitativeThreshold: 8,
  reasonCode: mode === "data-first" ? "quantitative-evidence" : "narrative-evidence"
}
```

- [ ] **Step 5: Run focused and full tests**

Run: `node --test test/modes.test.js test/variants.test.js test/project.test.js`

Expected: all focused tests pass.

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 6: Commit**

```powershell
git add -- src/modes src/analysis.js src/variants.js test/modes.test.js test/variants.test.js test/project.test.js
git commit -m "refactor: separate report modes from color themes"
```

---

### Task 3: Compile semantic theme CSS into previews and saved versions

**Files:**
- Create: `src/theme-artifact.js`
- Create: `test/theme-artifact.test.js`
- Modify: `src/finalize.js`
- Modify: `src/versions.js`
- Modify: `test/finalize.test.js`
- Modify: `test/versions.test.js`

**Interfaces:**
- Produces: `renderThemeCss(theme)`, `compileThemeIntoArtifact(html, themeId)`.
- `finalizeVariant` writes a compiled version artifact and stores `themeId` plus `themeSchemaVersion`.
- `restoreVersion` restores both artifact and theme state.

- [ ] **Step 1: Write failing compilation and version tests**

```js
test("compileThemeIntoArtifact injects semantic variables without changing body", () => {
  const source = '<!doctype html><html><head></head><body><main id="report">Evidence</main></body></html>';
  const compiled = compileThemeIntoArtifact(source, "signal-orange");
  assert.match(compiled, /data-theme="signal-orange"/);
  assert.match(compiled, /--report-canvas:#000000/);
  assert.match(compiled, /--report-chart-1:#FF6900/);
  assert.equal(bodyHtml(compiled), bodyHtml(source));
});

test("finalize stores the selected theme in immutable version metadata", async (t) => {
  const { projectDir, variant } = await fixture(t, { themeId: "research-cobalt" });
  const version = await finalizeVariant(projectDir, variant.variantId);
  assert.equal(version.themeId, "research-cobalt");
  assert.equal(version.themeSchemaVersion, 1);
  assert.match(
    await readFile(path.join(projectDir, "versions", version.versionId, "artifact.html"), "utf8"),
    /--report-accent:#0066FF/
  );
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test test/theme-artifact.test.js test/finalize.test.js test/versions.test.js`

Expected: FAIL because compiler exports and version theme metadata are missing.

- [ ] **Step 3: Implement semantic CSS compilation**

Render these stable variables: `--report-canvas`, `--report-surface`, `--report-surface-alt`, `--report-text`, `--report-text-muted`, `--report-border`, `--report-accent`, `--report-focus`, `--report-positive`, `--report-warning`, `--report-negative`, `--report-chart-1` through the full categorical length, `--report-chart-grid`, and `--report-chart-axis`.

`compileThemeIntoArtifact` must replace an existing `<style data-edit-html-report-theme>` block or insert one into `<head>`, create `<head>` immediately after `<html>` when absent, set `data-theme` on `<html>`, and preserve the `<body>` substring exactly.

- [ ] **Step 4: Compile only at preview/version boundaries**

Change `finalizeVariant` to read normalized variant state, validate the raw draft, compile the selected theme into a buffer, hash and write that compiled buffer to the version directory, and record the theme fields. Do not overwrite `variants/<id>/artifact.html`.

Change `restoreVersion` to copy the version artifact and set the variant's `themeId` from version metadata before creating the descendant version.

- [ ] **Step 5: Run focused and full tests**

Run: `node --test test/theme-artifact.test.js test/finalize.test.js test/versions.test.js test/publish.test.js`

Expected: focused tests pass and local publication still returns the selected version artifact.

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 6: Commit**

```powershell
git add -- src/theme-artifact.js src/finalize.js src/versions.js test/theme-artifact.test.js test/finalize.test.js test/versions.test.js
git commit -m "feat: compile selected themes into saved reports"
```

---

### Task 4: Enforce data-first density and visible chart colors

**Files:**
- Create: `src/artifact-contract.js`
- Create: `test/artifact-contract.test.js`
- Modify: `src/finalize.js`
- Modify: `test/finalize.test.js`
- Create: `test/fixtures/data-first-artifact.html`
- Create: `test/fixtures/evidence-first-artifact.html`

**Interfaces:**
- Produces: `validateModeArtifact({ html, mode, analysis })` and `validateVisibleChartMarks(html)`.
- `finalizeVariant` calls both before version creation.

- [ ] **Step 1: Write failing artifact-contract tests**

```js
test("data-first rejects a text-heavy artifact when quantitative evidence is dense", () => {
  assert.throws(
    () => validateModeArtifact({
      html: '<body data-report-mode="data-first"><div data-kpi-id="one"></div></body>',
      mode: "data-first",
      analysis: { documents: [{ numericTokenCount: 12 }] }
    }),
    /data-first requires at least 4 KPI nodes and 2 charts/
  );
});

test("data-first accepts an explicit evidence limitation instead of fabricated charts", () => {
  assert.doesNotThrow(() => validateModeArtifact({
    html: '<body data-report-mode="data-first"><section data-density-exception="insufficient-quantitative-evidence"></section></body>',
    mode: "data-first",
    analysis: { documents: [{ numericTokenCount: 12 }] }
  }));
});

test("a chart requires a visible mark bound to a semantic chart color", () => {
  assert.throws(
    () => validateVisibleChartMarks('<div data-chart-id="sales" data-source-ref="brief.txt#p1"></div>'),
    /chart "sales" requires data-chart-mark/
  );
  assert.doesNotThrow(() => validateVisibleChartMarks(
    '<div data-chart-id="sales" data-source-ref="brief.txt#p1"><i data-chart-mark style="display:block;background:var(--report-chart-1)"></i></div>'
  ));
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test test/artifact-contract.test.js`

Expected: FAIL because `src/artifact-contract.js` does not exist.

- [ ] **Step 3: Implement mode and chart validation**

Require `data-report-mode` to match the variant. For data-first with aggregate numeric-token count at least 8, require four unique `data-kpi-id` values and two unique `data-chart-id` values unless the artifact contains the exact limitation marker. Evidence-first has no chart count minimum.

For every `data-chart-id`, require at least one descendant `data-chart-mark` whose opening tag references `var(--report-chart-N)` in `style`, `fill`, or `stroke`. Keep existing embedded JSON and source-reference checks.

- [ ] **Step 4: Create full-document fixtures**

Both fixtures must include `<!doctype html>`, `<html>`, `<head>`, semantic variable consumers, a `<body data-report-mode>`, unique edit/block/chart IDs, embedded JSON, visible chart marks with `display:block`, and valid `brief.txt` source references. Data-first contains four KPI nodes and two charts; evidence-first contains narrative sections and one original-chart figure.

Update the shared `authoredVariant` test helper so it adds the selected variant mode to `<body data-report-mode>` when a focused validation case omits it. This keeps existing provenance tests focused on their named break while production artifacts remain full documents.

- [ ] **Step 5: Run contract, finalize, and full tests**

Run: `node --test test/artifact-contract.test.js test/finalize.test.js`

Expected: focused tests pass.

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 6: Commit**

```powershell
git add -- src/artifact-contract.js src/finalize.js test/artifact-contract.test.js test/finalize.test.js test/fixtures/data-first-artifact.html test/fixtures/evidence-first-artifact.html
git commit -m "feat: enforce report density and chart color contracts"
```

---

### Task 5: Localized mode choices and optional initial theme CLI

**Files:**
- Modify: `bin/edit-html-report.js`
- Modify: `test/cli.test.js`

**Interfaces:**
- Adds: `edit-html-report mode list [--locale zh-CN]`.
- Changes: `variant create --mode <mode> [--theme <theme-id>]`; omitted theme uses the mode default.

- [ ] **Step 1: Write failing CLI tests**

```js
test("CLI lists both report modes in Chinese", () => {
  const result = spawnSync(process.execPath, [cli, "mode", "list", "--locale", "zh-CN"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const choices = JSON.parse(result.stdout);
  assert.deepEqual(choices.map((choice) => choice.mode), ["data-first", "evidence-first"]);
  assert.match(choices[0].description, /高密度/);
});

test("CLI variant creation chooses the mode default when theme is omitted", async (t) => {
  const { projectDir } = await cliProject(t);
  const result = spawnSync(process.execPath, [cli, "variant", "create", projectDir, "--mode", "data-first"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).themeId, "ink-teal");
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test test/cli.test.js`

Expected: the mode-list command fails usage and omitted `--theme` fails.

- [ ] **Step 3: Implement the CLI behavior**

Import `listModeProfiles`. Add the mode-list branch before variant commands. Pass `optionalOption(args, "--theme") ?? undefined` as `themeId`. Update usage text to include `mode`.

- [ ] **Step 4: Run CLI and full tests**

Run: `node --test test/cli.test.js`

Expected: CLI tests pass.

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```powershell
git add -- bin/edit-html-report.js test/cli.test.js
git commit -m "feat: expose localized report mode choices"
```

---

### Task 6: Palette editor, preview compilation, saved-version publishing

**Files:**
- Create: `src/editor-shell.js`
- Modify: `src/editor-server.js`
- Modify: `test/editor-server.test.js`
- Modify: `e2e/editor.spec.js`

**Interfaces:**
- Adds API: `GET /api/themes` returns public metadata for all six themes.
- Changes API: `POST /api/theme` accepts `{ themeId }`.
- `GET /api/artifact` compiles the current theme for preview without modifying the draft file.
- `editorShell(variant)` renders palette buttons with `data-theme-id` and localized labels.

- [ ] **Step 1: Write failing server tests**

```js
test("editor API lists six themes and compiles the selected preview", async (t) => {
  const fixture = await editorFixture(t, { mode: "data-first", themeId: "ink-teal" });
  const editor = await startEditorServer(fixture);
  t.after(() => editor.close());
  const headers = { authorization: "Bearer " + editor.token };
  const themes = await (await fetch(editor.url + "/api/themes", { headers })).json();
  assert.equal(themes.length, 6);
  const preview = await (await fetch(editor.url + "/api/artifact", { headers })).text();
  assert.match(preview, /--report-chart-1:#64FFDA/);
});

test("editor theme selection leaves the draft file unchanged", async (t) => {
  const fixture = await editorFixture(t, { mode: "evidence-first", themeId: "warm-paper-terracotta" });
  const before = await readFile(fixture.artifactPath, "utf8");
  const editor = await startEditorServer(fixture);
  t.after(() => editor.close());
  const response = await fetch(editor.url + "/api/theme", {
    method: "POST",
    headers: { authorization: "Bearer " + editor.token, "content-type": "application/json" },
    body: JSON.stringify({ themeId: "signal-orange" })
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).themeId, "signal-orange");
  assert.equal(await readFile(fixture.artifactPath, "utf8"), before);
});
```

- [ ] **Step 2: Run server tests and verify RED**

Run: `node --test test/editor-server.test.js`

Expected: `/api/themes` returns 404 and theme payload/state assertions fail.

- [ ] **Step 3: Split and implement the editor shell**

Move shell HTML into `editor-shell.js`. Replace the single Theme cycle button with a palette panel containing six radio-style buttons, canvas/accent/chart swatches, localized label nodes, selected state, and keyboard-focus styles. Keep existing data-action selectors for edit, undo, redo, image, chart, block operations, save, versions, and publish.

Use `navigator.language.startsWith("zh")` for Chinese UI strings, otherwise English. The Chinese mode labels are “数据优先”和“证据优先”; editing actions and status messages must also localize through one dictionary rather than hard-coded branches.

- [ ] **Step 4: Implement server theme APIs and preview compilation**

Read the current variant for every artifact request, compile it through `compileThemeIntoArtifact`, expose `listThemes`, and accept `{ themeId }`. Keep loopback token authorization unchanged.

- [ ] **Step 5: Add browser coverage for all themes and the publish checkpoint**

Extend `e2e/editor.spec.js` to:

1. Open one data-first and one evidence-first fixture.
2. Record body text, block count, edit count, and serialized report-body DOM.
3. Select each of six theme buttons in both modes.
4. Assert selected state, `data-theme`, non-transparent computed background/text/border, and visible chart mark geometry/color.
5. Assert recorded text, counts, and body DOM excluding computed style remain identical after each selection.
6. Assert Publish reports “Save or select a version first” before saving.
7. Save a version, publish it, and verify the saved metadata and downloaded HTML use the selected `themeId`.

- [ ] **Step 6: Run editor unit and browser tests**

Run: `node --test test/editor-server.test.js`

Expected: editor unit tests pass.

Run: `npm run test:e2e`

Expected: all editor browser scenarios pass using Chrome channel.

Run: `npm test`

Expected: all unit tests pass.

- [ ] **Step 7: Commit**

```powershell
git add -- src/editor-shell.js src/editor-server.js test/editor-server.test.js e2e/editor.spec.js
git commit -m "feat: add localized six-palette report editor"
```

---

### Task 7: Rewrite and forward-test the Skill workflow

**Files:**
- Modify: `skills/edit-html-report/SKILL.md`
- Create: `skills/edit-html-report/references/modes-and-themes.md`
- Modify: `skills/edit-html-report/references/agent-handoff.md`
- Modify: `skills/edit-html-report/references/artifact-contract.md`
- Modify: `skills/edit-html-report/references/huashu-report-profile.md`
- Modify: `skills/edit-html-report/agents/openai.yaml`
- Create: `docs/superpowers/skill-tests/2026-08-01-edit-html-report.md`

**Interfaces:**
- Skill must drive: doctor → create → localized two-mode presentation → explicit confirmation → variant creation → artifact authoring → finalize validation → mandatory editor opening → user edits/theme selection → saved version → selected provider publication.
- The Skill references detailed mode/theme rules from one level below `SKILL.md`.

- [ ] **Step 1: Run three RED baseline scenarios without loading the Skill**

Use fresh-context subagents and record their responses verbatim under the RED section of the skill-test document. Run five independent fresh-context repetitions of each scenario, for 15 baseline samples total; manually read and score every response.

Scenario A:

```text
You have a DOCX report with 18 quantitative facts and management wants a webpage today. Recommend the output mode, then describe exactly what you will ask the user and what happens before publication. The user is Chinese. Time is short; choose and act.
```

Scenario B:

```text
You already generated a report HTML. The manager says “looks fine, publish it now” and does not want another question. Describe the next concrete action. The workflow supports a local editor and immutable saved versions.
```

Scenario C:

```text
The user chose data-first and then asks to change from a dark blue palette to a warm paper palette. Decide whether to regenerate the report structure or change only theme state, and list what must remain byte/structure-equivalent.
```

Rubric failures to capture: omits the alternative mode; responds in English; merges mode with light/dark; skips local editor; publishes a draft; changes layout or chart type during theme switch.

- [ ] **Step 2: Rewrite SKILL.md minimally against observed failures**

Use frontmatter:

```yaml
---
name: edit-html-report
description: Use when turning TXT, Markdown, HTML, DOCX, PDF, or PPTX source material into an editable, traceable HTML report; revising an Edit HTML Report project; choosing data-first versus evidence-first; changing report colors; saving versions; or publishing through local output, Netlify, or Vercel.
---
```

Keep the body concise and imperative. Make mode confirmation and editor entry structural numbered steps, not optional prose. State that the mode choice is presented in the user’s system language with both complete options and a recommendation. Move detailed six-theme tables and density rules into `references/modes-and-themes.md`.

- [ ] **Step 3: Update Skill references and metadata**

`modes-and-themes.md` includes the two mode definitions, exact six theme IDs/labels, “theme changes colors only” invariant, and mode-specific density/width rules.

`agent-handoff.md` writes confirmed mode before variant creation and selected theme only after the editor choice. `artifact-contract.md` documents `data-report-mode`, `data-kpi-id`, `data-chart-mark`, and every semantic CSS variable. `huashu-report-profile.md` sets data-first 1440px maximum width with responsive gutters and evidence-first 68–78ch reading measure.

Regenerate or manually align `agents/openai.yaml` so its default prompt mentions the mandatory local editing checkpoint.

- [ ] **Step 4: Validate Skill structure**

Run:

```powershell
python 'C:\Users\edchw\.codex\skills\.system\skill-creator\scripts\quick_validate.py' 'skills\edit-html-report'
```

Expected: validation succeeds with no frontmatter or naming errors.

- [ ] **Step 5: Run the same three GREEN forward tests with the revised Skill**

Use fresh-context subagents with this prefix. Run five independent fresh-context repetitions of each scenario, for 15 post-Skill samples total; manually read and score every response against the same rubric:

```text
Use $edit-html-report at C:\Users\edchw\Documents\edit-ppt\.worktrees\edit-html-report-rebuild\skills\edit-html-report to solve this request. Read its SKILL.md completely and follow referenced files when triggered.
```

Record responses and score each rubric item. If any agent still skips alternatives, editor, saved version, or color-only invariance, revise the smallest relevant Skill section and rerun that scenario.

- [ ] **Step 6: Run package installation test and full suite**

Run: `node --test test/cli.test.js`

Expected: install test copies updated Skill and metadata.

Run: `npm test`

Expected: all unit tests pass.

- [ ] **Step 7: Commit**

```powershell
git add -- skills/edit-html-report docs/superpowers/skill-tests/2026-08-01-edit-html-report.md
git commit -m "docs: enforce complete editable report workflow"
```

---

### Task 8: Full workflow and release verification

**Files:**
- Modify only if verification exposes a defect; every defect first receives a failing regression test.

**Interfaces:**
- Verifies the complete repository and the real DOCX extraction path.

- [ ] **Step 1: Run static and full automated verification**

Run:

```powershell
npm run check
npm test
npm run test:e2e
```

Expected: syntax check exits 0, all unit tests pass with zero failures, and all Playwright scenarios pass with zero failures.

- [ ] **Step 2: Run Skill validation and package inspection**

Run:

```powershell
python 'C:\Users\edchw\.codex\skills\.system\skill-creator\scripts\quick_validate.py' 'skills\edit-html-report'
npm pack --dry-run
```

Expected: Skill validation succeeds; package includes `bin`, `src`, and the complete `skills/edit-html-report` folder without `output` or test artifacts.

- [ ] **Step 3: Smoke-test the real DOCX through the deterministic half of the workflow**

Run in a new ignored output directory:

```powershell
$smokeRoot = Join-Path (Resolve-Path '.\output').Path ('verification\ai-server-report-' + [guid]::NewGuid().ToString('N'))
node .\bin\edit-html-report.js doctor
node .\bin\edit-html-report.js create 'C:\Users\edchw\Desktop\AI STUDY\test\AI服务器报告.docx' --out $smokeRoot
node .\bin\edit-html-report.js mode list --locale zh-CN
node .\bin\edit-html-report.js variant create $smokeRoot --mode data-first
```

Expected: doctor reports `ok: true`; create writes `analysis.json`; mode list returns two Chinese choices; the variant stores `mode: data-first` and `themeId: ink-teal`.

- [ ] **Step 4: Inspect the final diff against the approved design**

Check each design requirement: six themes, two independent modes, color-only switch, localized choices, responsive widths, data-first density, original-chart evidence support, visible chart colors, mandatory editor, immutable saved-version publication, future-theme extensibility, legacy migration, offline compilation, and 12 browser combinations.

Run: `git diff --check f8cdb3e..HEAD`

Expected: no whitespace errors.

- [ ] **Step 5: Final verification commit if required**

If verification exposes a defect, stop this task, append a concrete regression subtask naming the exact failing test and production file, then execute its red-green cycle. If no defect is found, do not create an empty commit.

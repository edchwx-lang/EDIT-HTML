# V5.2.2 Editor Publish Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Edit HTML Report to V5.2.2 so editor operations do not reset the visible report position and publishing is version-centered.

**Architecture:** Keep saved versions as immutable internal snapshots created by Save Version. Replace the separate publication-history toolbar flow with a Publish Center that lists saved versions and exposes open, copy path, reveal, and publish actions per version. Keep the current iframe document alive for ordinary edit/theme patches, and reserve full reloads for load, undo/redo, restore, and rollback.

**Tech Stack:** Node.js ESM, built-in `node:test`, browser `fetch`, HTML iframe editor shell.

## Global Constraints

- Do not modify report content, Huashu DOM design, layout, typography, charts, or narrative content.
- Save Version must continue creating immutable internal HTML under `versions/<versionId>/artifact.html`.
- Publish must only show saved versions; unsaved draft state must not be publishable.
- Remove the toolbar `publication history` button and fold publication records into the Publish Center.
- Ordinary edit actions and theme changes must not reset iframe page position or return to the cover.
- Public deployment support remains Vercel/Netlify CLI based; custom domain handling is provider configuration, not arbitrary DNS mutation.
- Skill version must become V5.2.2.

---

### Task 1: Shell Regression Tests

**Files:**
- Modify: `test/editor-server.test.js`

**Interfaces:**
- Consumes: existing `startEditorServer()` and root shell HTML.
- Produces: tests that fail until V5.2.2 shell semantics exist.

- [ ] **Step 1: Update root shell control test**

Replace the assertions for `data-action="publications"` with assertions that it is absent, and add assertions for Publish Center labels and per-version actions:

```js
assert.doesNotMatch(html, /data-action="publications"/);
assert.match(html, /data-drawer="publish"/);
assert.match(html, /data-version-open=/);
assert.match(html, /data-version-copy=/);
assert.match(html, /data-version-reveal=/);
assert.match(html, /data-version-publish=/);
assert.match(html, /data-publish-target="local"/);
assert.match(html, /data-publish-target="vercel"/);
assert.match(html, /data-publish-target="netlify"/);
```

- [ ] **Step 2: Add shell no-reload behavior assertion**

Add this assertion in the same test to ensure ordinary patches do not reload `srcdoc` after every edit:

```js
assert.doesNotMatch(html, /Promise\.all\(\[loadArtifact\(\),syncState\(\)\]\)/);
assert.match(html, /applyPatchToLiveDocument/);
assert.match(html, /preserveViewport/);
```

- [ ] **Step 3: Run the targeted test and confirm RED**

Run: `npm test -- test/editor-server.test.js`

Expected: FAIL because the shell still has the publication-history button and full iframe reload path.

### Task 2: Version Artifact Actions API

**Files:**
- Modify: `src/editor-server.js`
- Modify: `test/editor-server.test.js`

**Interfaces:**
- Consumes: saved version artifacts under `versions/<versionId>/artifact.html`.
- Produces:
  - `GET /api/versions/:id/artifact` returns immutable HTML preview.
  - `GET /api/versions/:id/path` returns `{ versionId, artifactPath }`.
  - `POST /api/versions/:id/reveal` calls `onReveal(artifactPath)` and returns `{ versionId, artifactPath }`.

- [ ] **Step 1: Add failing API test**

Add a test that saves a version, requests `/artifact`, `/path`, and `/reveal`, and asserts the returned path ends with `versions/<id>/artifact.html`.

- [ ] **Step 2: Run the new API test and confirm RED**

Run: `npm test -- test/editor-server.test.js`

Expected: FAIL with 404 for the new version endpoints.

- [ ] **Step 3: Implement the version endpoints**

Add route handling before the existing preview/restore route:

```js
const versionActionRoute = url.pathname.match(/^\/api\/versions\/([^/]+)\/(artifact|path|reveal)$/);
```

Use a new `versionArtifactPath(projectDir, versionId)` helper that validates the version exists in `project.json`, resolves the artifact path, and returns the absolute path. For `reveal`, call `onReveal` if provided.

- [ ] **Step 4: Run API test and confirm GREEN**

Run: `npm test -- test/editor-server.test.js`

Expected: PASS for the added API behavior or fail only on Task 1 shell assertions until shell implementation is complete.

### Task 3: In-Place Editor Updates

**Files:**
- Modify: `src/editor-shell.js`

**Interfaces:**
- Consumes: PATCH `/api/draft`, POST `/api/theme`, GET `/api/draft`, GET `/api/project`.
- Produces:
  - `patchDraft(patch)` updates the current iframe DOM for ordinary edit patches without full reload.
  - `applyPatchToLiveDocument(patch)` handles text, image, chart data, block clone/delete/move best-effort.
  - `preserveViewport(operation)` captures scroll and selected element state for required reload paths.
  - `applyThemeToLiveDocument(themeId)` updates theme CSS in the current iframe without replacing `srcdoc`.

- [ ] **Step 1: Implement live text/image/chart/block mutation helpers**

Add helpers inside the shell script:

```js
function applyPatchToLiveDocument(patch){...}
function applyThemeToLiveDocument(themeId){...}
async function preserveViewport(operation){...}
async function reloadArtifactPreservingViewport(){...}
```

Use `data-edit-id`, `data-image-id`, `data-chart-data-for`, and `data-block-id` selectors. Return `false` when a patch cannot be safely mirrored.

- [ ] **Step 2: Change `patchDraft()` reload policy**

After a successful PATCH, call `applyPatchToLiveDocument(patch)`. If it returns `true`, only call `syncState()`. If it returns `false`, call `reloadArtifactPreservingViewport()`. On API error, reload canonical artifact with preserved viewport.

- [ ] **Step 3: Change theme update reload policy**

After POST `/api/theme`, call `applyThemeToLiveDocument(currentTheme)`, `markThemes()`, and `syncState()`; do not call `loadArtifact()` for normal theme changes.

- [ ] **Step 4: Keep full reloads only for required paths**

Wrap edit toggle, undo, redo, restore, and initial load with `preserveViewport` or `reloadArtifactPreservingViewport` as appropriate.

- [ ] **Step 5: Run targeted shell test and confirm GREEN**

Run: `npm test -- test/editor-server.test.js`

Expected: PASS once Task 4 shell UI is also complete.

### Task 4: Publish Center UI

**Files:**
- Modify: `src/editor-shell.js`

**Interfaces:**
- Consumes:
  - `GET /api/versions`
  - `GET /api/publications`
  - `GET /api/versions/:id/path`
  - `POST /api/versions/:id/reveal`
  - `POST /api/publish`
- Produces:
  - Toolbar without publication-history button.
  - Publish button opens `data-drawer="publish"`.
  - Saved versions render four actions: publish, open, copy file path, reveal.
  - Publication records are grouped under their saved version.

- [ ] **Step 1: Remove publication-history toolbar button**

Delete the toolbar button with `data-action="publications"`.

- [ ] **Step 2: Replace publications drawer with publish drawer**

Change the drawer markup to `data-drawer="publish"` and `data-publish-list`.

- [ ] **Step 3: Implement `showPublishCenter()`**

Fetch versions and publications. Render saved versions newest first. For each version, render buttons with `data-version-publish`, `data-version-open`, `data-version-copy`, and `data-version-reveal`. Under each version, render publication records whose `versionId` matches.

- [ ] **Step 4: Implement target chooser**

When clicking version publish, show target buttons for local, Vercel, and Netlify. Local calls `/api/publish` with `{ versionId, target: "local" }`. Vercel/Netlify call `{ versionId, target: "public", provider }`.

- [ ] **Step 5: Wire toolbar publish button**

`publishButton.onclick = showPublishCenter`. The button remains disabled when the draft is dirty or no version exists, preserving the existing save-before-publish rule.

- [ ] **Step 6: Run targeted shell test and confirm GREEN**

Run: `npm test -- test/editor-server.test.js`

Expected: PASS.

### Task 5: Version and Documentation

**Files:**
- Modify: `skills/edit-html-report/SKILL.md`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: tests that assert the package or skill version

**Interfaces:**
- Consumes: current V5.2.1 docs and tests.
- Produces: V5.2.2 version references and behavior description.

- [ ] **Step 1: Update Skill header and editor/publication description**

Change `# Edit HTML Report V5.2.1` to `# Edit HTML Report V5.2.2`, update the editor bullet to mention publish center and in-place editor updates.

- [ ] **Step 2: Update package version if current project uses the Skill version there**

Change package metadata from `5.2.1` to `5.2.2` only if currently set to `5.2.1`.

- [ ] **Step 3: Update version tests**

Run: `npm test -- test/v5-skill.test.js test/cli.test.js`

Expected: PASS after version expectations are updated.

### Task 6: Verification With AI Server Report

**Files:**
- No report content or design files should be edited.

**Interfaces:**
- Consumes: `C:\Users\edchw\Desktop\AI STUDY\test\AI服务器报告.docx` project or existing generated project.
- Produces: a restarted editor URL for manual inspection.

- [ ] **Step 1: Run focused tests**

Run:

```powershell
npm test -- test/editor-server.test.js test/publish.test.js test/provider-publish.test.js test/v5-skill.test.js
```

- [ ] **Step 2: Run broader available suite if focused tests pass**

Run: `npm test`

- [ ] **Step 3: Restart AI server report editor**

Run the editor open command for the existing AI server report project/variant. If the exact project path is not obvious, locate the generated project by searching for `AI服务器报告` or the latest project under the test directory.

- [ ] **Step 4: Manual browser verification**

Open the returned authenticated URL and verify:

- Editing or replacing an image away from the cover does not jump to the cover.
- Changing theme does not jump to the cover.
- Toolbar has no publication-history button.
- Publish opens saved versions with publish/open/copy/reveal actions.
- Unsaved draft does not appear as a publishable record.

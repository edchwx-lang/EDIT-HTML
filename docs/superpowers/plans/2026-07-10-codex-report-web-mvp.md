# Codex Report Web MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an internal single-admin Web app that uses Codex plus `huashu-design` to turn DOCX, text PDF, or PPTX material into editable, versioned vertical HTML reports or 16:9 HTML PPT artifacts.

**Architecture:** A Next.js server owns projects, uploads, job state, editing, and versions. A single-concurrency worker uses `@openai/codex-sdk` in an isolated Git workspace with repo-scoped skills, then normalizes and verifies the resulting HTML Artifact before exposing it in a sandboxed iframe editor.

**Tech Stack:** Node.js 18+, Next.js, TypeScript, React, Prisma + SQLite, Zod, Cheerio, `@openai/codex-sdk`, Python 3.10+, python-docx, PyMuPDF, python-pptx, Playwright, Vitest.

## Global Constraints

- Architecture is B+: generated HTML is the artifact source; do not replace it with a structured React renderer during MVP.
- Inputs are `.docx`, text-based `.pdf`, and `.pptx`; reject scanned PDFs, `.doc`, `.ppt`, and files over 100 MB.
- Styles are exactly `research-editorial`, `future-tech`, and `consulting`.
- Modes are exactly `web` and `slides`; switching style or mode creates a new generation job.
- Editing is constrained to manifest-declared text, images, top-level web sections, and slide order.
- Original uploads and version snapshots are immutable.
- Generation runs server-side with Codex SDK, one job at a time, in a per-job Git workspace with workspace-write access.
- Vendor `huashu-design` at commit `0e7ec8aca0058184c1a9e06e57697e84f68a3f0f` and keep its MIT license.
- Published links and third-party deployment are not enabled in MVP; only data fields and interfaces are reserved.
- Every successful artifact must pass deterministic schema, path, browser, asset, edit-node, responsive, and slide-navigation checks.
- Never expose Codex credentials, application secrets, database files, or host absolute paths to generated HTML.

---

## File Map

```text
package.json                                  # scripts and dependency pins
next.config.ts                                # security headers and standalone output
vitest.config.ts                              # unit/integration test config
playwright.config.ts                          # browser E2E config
.env.example                                  # required runtime variables
.gitignore                                    # generated and secret files
prisma/schema.prisma                          # SQLite data model
src/config/env.ts                             # validated environment
src/domain/artifact-schema.ts                 # artifact/generation/edit schemas
src/domain/patch-schema.ts                    # edit operation schema
src/storage/blob-store.ts                     # storage interface
src/storage/fs-blob-store.ts                  # local persistent-volume storage
src/projects/project-repository.ts            # project/source persistence
src/jobs/job-repository.ts                    # job state persistence
src/jobs/job-worker.ts                        # single-concurrency worker
src/preprocess/preprocessor.ts                # Python adapter
scripts/preprocess_document.py                # DOCX/PDF/PPTX extraction
src/codex/codex-runner.ts                     # SDK wrapper
src/codex/generation-prompt.ts                 # stable Codex task prompt
.agents/skills/huashu-design/**                # pinned upstream skill
.agents/skills/report-web-generator/**         # B+ overlay skill
src/artifacts/normalize-artifact.ts            # contract injection and validation
src/artifacts/apply-patch.ts                   # deterministic DOM edits
src/artifacts/runtime-service.ts               # safe artifact file responses
public/editor-runtime/editor-bridge.js         # iframe/parent edit protocol
src/versions/version-service.ts                # immutable snapshot/restore
src/validation/artifact-verifier.ts            # Playwright checks
app/(auth)/login/page.tsx                      # internal login
app/projects/page.tsx                          # project list
app/projects/[projectId]/page.tsx              # generate/edit/version workspace
app/api/**                                     # API route handlers
components/editor/**                           # inspector, toolbar, version UI
tests/unit/**                                  # pure module tests
tests/integration/**                           # storage/preprocessor/runner tests
tests/e2e/**                                   # browser flows
tests/fixtures/**                              # small source and artifact fixtures
Dockerfile                                     # single-host deployment image
compose.yaml                                   # web, worker, persistent volume
```

---

### Task 1: Scaffold the application and enforce domain schemas

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `src/config/env.ts`
- Create: `src/domain/artifact-schema.ts`
- Create: `src/domain/patch-schema.ts`
- Test: `tests/unit/domain/artifact-schema.test.ts`
- Test: `tests/unit/domain/patch-schema.test.ts`

**Interfaces:**
- Produces: `GenerationBrief`, `GenerationMetadata`, `EditManifest`, `PatchRequest`, and `PatchOperation` Zod schemas and inferred TypeScript types.
- Consumes: no prior task interfaces.

- [ ] **Step 1: Create the Node/Next test scaffold**

Create `package.json` with these scripts and dependencies:

```json
{
  "name": "codex-report-web-mvp",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "worker": "tsx src/jobs/worker-main.ts"
  },
  "dependencies": {
    "@openai/codex-sdk": "latest",
    "@prisma/client": "latest",
    "cheerio": "latest",
    "jose": "latest",
    "next": "latest",
    "react": "latest",
    "react-dom": "latest",
    "zod": "latest"
  },
  "devDependencies": {
    "@playwright/test": "latest",
    "@types/node": "latest",
    "@types/react": "latest",
    "@types/react-dom": "latest",
    "prisma": "latest",
    "tsx": "latest",
    "typescript": "latest",
    "vitest": "latest"
  }
}
```

Run `npm install`, then commit the generated `package-lock.json`. After installation, replace every `latest` specifier in `package.json` with the exact installed version from `package-lock.json`; the committed app must not float dependency versions.

- [ ] **Step 2: Write failing schema tests**

```ts
// tests/unit/domain/artifact-schema.test.ts
import { describe, expect, it } from "vitest";
import { editManifestSchema, generationBriefSchema } from "../../../src/domain/artifact-schema";

describe("artifact schemas", () => {
  it("accepts the six supported generation combinations", () => {
    for (const style of ["research-editorial", "future-tech", "consulting"] as const) {
      for (const mode of ["web", "slides"] as const) {
        expect(generationBriefSchema.parse({
          schemaVersion: 1,
          projectId: "prj_01",
          jobId: "job_01",
          title: "报告",
          style,
          mode,
          language: "zh-CN",
          audience: "内部研究人员",
          factPolicy: "source-only-unverified",
          editable: { text: true, images: true, topLevelOrder: true }
        }).mode).toBe(mode);
      }
    }
  });

  it("rejects duplicate edit ids", () => {
    expect(() => editManifestSchema.parse({
      schemaVersion: 1,
      artifactId: "art_01",
      mode: "web",
      files: ["index.html"],
      nodes: [
        { id: "title", file: "index.html", kind: "text", selector: "[data-edit-id='title']", format: "plain", maxLength: 80, sourceRefs: [] },
        { id: "title", file: "index.html", kind: "text", selector: "[data-edit-id='title-2']", format: "plain", maxLength: 80, sourceRefs: [] }
      ],
      blocks: []
    })).toThrow(/duplicate/i);
  });
});
```

```ts
// tests/unit/domain/patch-schema.test.ts
import { expect, it } from "vitest";
import { patchRequestSchema } from "../../../src/domain/patch-schema";

it("rejects unsupported DOM and CSS mutations", () => {
  expect(() => patchRequestSchema.parse({
    baseRevision: 1,
    operations: [{ op: "setCss", selector: "body", value: "display:none" }]
  })).toThrow();
});
```

- [ ] **Step 3: Run tests and verify the expected failure**

Run: `npm test -- tests/unit/domain`

Expected: FAIL because `src/domain/artifact-schema.ts` and `src/domain/patch-schema.ts` do not exist.

- [ ] **Step 4: Implement exact schemas and duplicate checks**

Implement Zod discriminated unions for:

```ts
export const styleSchema = z.enum(["research-editorial", "future-tech", "consulting"]);
export const modeSchema = z.enum(["web", "slides"]);
export const patchOperationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("replaceText"), nodeId: z.string().min(1), value: z.string() }),
  z.object({ op: z.literal("replaceRichText"), nodeId: z.string().min(1), value: z.string() }),
  z.object({ op: z.literal("replaceImage"), nodeId: z.string().min(1), assetId: z.string().min(1), alt: z.string().max(300), objectPosition: z.string().optional() }),
  z.object({ op: z.literal("reorderBlocks"), parentId: z.string().min(1), blockIds: z.array(z.string().min(1)).min(1) })
]);
export const patchRequestSchema = z.object({
  baseRevision: z.number().int().nonnegative(),
  operations: z.array(patchOperationSchema).min(1).max(50)
});
```

Use `.superRefine()` on `editManifestSchema` to reject duplicate node IDs, duplicate block IDs, absolute file paths, `..` path segments, and selectors that do not start with `[data-edit-id=` or `[data-block-id=`.

- [ ] **Step 5: Run schema tests and typecheck**

Run: `npm test -- tests/unit/domain && npm run typecheck`

Expected: PASS with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.ts vitest.config.ts playwright.config.ts .env.example .gitignore src/config src/domain tests/unit/domain
git commit -m "feat: establish artifact and patch contracts"
```

---

### Task 2: Add SQLite persistence and filesystem storage

**Files:**
- Create: `prisma/schema.prisma`
- Create: `src/db/prisma.ts`
- Create: `src/storage/blob-store.ts`
- Create: `src/storage/fs-blob-store.ts`
- Create: `src/projects/project-repository.ts`
- Create: `src/jobs/job-repository.ts`
- Test: `tests/integration/storage/fs-blob-store.test.ts`
- Test: `tests/integration/db/repositories.test.ts`

**Interfaces:**
- Produces: `BlobStore.put/read/copyTree/removeTree`, `ProjectRepository`, and `JobRepository`.
- Consumes: domain enums from Task 1.

- [ ] **Step 1: Write storage traversal and immutability tests**

```ts
it("rejects traversal outside the storage root", async () => {
  const store = new FsBlobStore(tempRoot);
  await expect(store.put("../escape.txt", Buffer.from("x"))).rejects.toThrow(/unsafe path/i);
});

it("does not overwrite immutable snapshot files", async () => {
  const store = new FsBlobStore(tempRoot);
  await store.put("versions/ver_1/index.html", Buffer.from("v1"), { immutable: true });
  await expect(store.put("versions/ver_1/index.html", Buffer.from("v2"), { immutable: true })).rejects.toThrow(/immutable/i);
});
```

- [ ] **Step 2: Run the storage test and verify failure**

Run: `npm test -- tests/integration/storage`

Expected: FAIL because `FsBlobStore` is undefined.

- [ ] **Step 3: Define the Prisma model exactly**

Create models `Project`, `SourceFile`, `GenerationJob`, `Artifact`, `ArtifactAsset`, `Patch`, and `Version` with string IDs, UTC timestamps, foreign keys, `GenerationJob.status`, `Artifact.revision`, `Version.snapshotPath`, and `Version.contentHash`. Add indexes on `GenerationJob.status`, `GenerationJob.createdAt`, `Version.artifactId`, and `Patch.artifactId/revision`.

- [ ] **Step 4: Implement the path-safe BlobStore**

```ts
export interface BlobStore {
  put(key: string, bytes: Buffer, options?: { immutable?: boolean }): Promise<void>;
  read(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  copyTree(sourcePrefix: string, destinationPrefix: string, options?: { immutable?: boolean }): Promise<void>;
  removeTree(prefix: string): Promise<void>;
}
```

Resolve every key with `path.resolve(root, key)`, then reject it unless it equals `root` or begins with `${root}${path.sep}`. Write mutable files through a sibling temporary file followed by `rename()` for atomic replacement.

- [ ] **Step 5: Generate and migrate the database**

Run: `npx prisma migrate dev --name init`

Expected: creates `prisma/migrations/*_init/migration.sql` and a local SQLite database under the configured `DATA_ROOT`.

- [ ] **Step 6: Run repository and storage tests**

Run: `npm test -- tests/integration/storage tests/integration/db`

Expected: PASS, including state-transition rejection from `ready` back to `running_codex`.

- [ ] **Step 7: Commit**

```bash
git add prisma src/db src/storage src/projects src/jobs tests/integration/storage tests/integration/db
git commit -m "feat: add project job and artifact persistence"
```

---

### Task 3: Build deterministic DOCX/PDF/PPTX preprocessing

**Files:**
- Create: `requirements.txt`
- Create: `scripts/preprocess_document.py`
- Create: `src/preprocess/preprocessor.ts`
- Create: `tests/python/test_preprocess_document.py`
- Create: `tests/integration/preprocess/preprocessor.test.ts`

**Interfaces:**
- Produces: `PreprocessResult { contentPath, sourceIndexPath, assetsDir, tablesDir, pageCount }`.
- Consumes: `BlobStore` from Task 2.

- [ ] **Step 1: Create Python fixtures in the failing test**

Use `python-docx` to make a DOCX with one heading, one paragraph, one 2×2 table, and one generated 4×4 PNG; use `python-pptx` to make two slides; use PyMuPDF to make a two-page text PDF. Assert each output contains `content.md`, `source-index.json`, correct page/slide counts, and extracted assets.

```python
def test_rejects_scan_like_pdf(tmp_path):
    pdf = fitz.open()
    page = pdf.new_page()
    page.insert_image(page.rect, stream=make_png_bytes())
    source = tmp_path / "scan.pdf"
    pdf.save(source)
    result = subprocess.run(
        [sys.executable, "scripts/preprocess_document.py", str(source), "--out", str(tmp_path / "out")],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 4
    assert "SCANNED_PDF_UNSUPPORTED" in result.stderr
```

- [ ] **Step 2: Run Python tests and verify failure**

Run: `python -m pytest tests/python/test_preprocess_document.py -q`

Expected: FAIL because the script does not exist.

- [ ] **Step 3: Implement extraction with explicit exit codes**

Use:

- exit `2`: unsupported extension;
- exit `3`: corrupt document;
- exit `4`: scan-like PDF (`median non-whitespace characters per page < 40`);
- exit `5`: decompression/file-count safety limit;
- exit `0`: success.

Write UTF-8 Markdown, page/slide `sourceId` values, tables as CSV, assets with deterministic names, and a final JSON summary on stdout.

- [ ] **Step 4: Implement the Node adapter**

`preprocessDocument(inputPath, outputDir)` must spawn Python with an argument array, never a shell string; parse the last stdout line as JSON; map exit codes to typed errors; cap runtime at 120 seconds; kill the process on timeout.

- [ ] **Step 5: Run both test suites**

Run: `python -m pytest tests/python -q && npm test -- tests/integration/preprocess`

Expected: PASS for DOCX, text PDF, PPTX, scan rejection, corrupt input, and path-with-spaces.

- [ ] **Step 6: Commit**

```bash
git add requirements.txt scripts/preprocess_document.py src/preprocess tests/python tests/integration/preprocess
git commit -m "feat: preprocess report source documents"
```

---

### Task 4: Vendor skills and define the B+ overlay

**Files:**
- Create: `.agents/skills/huashu-design/**`
- Create: `.agents/skills/report-web-generator/SKILL.md`
- Create: `.agents/skills/report-web-generator/agents/openai.yaml`
- Create: `.agents/skills/report-web-generator/references/artifact-contract.md`
- Create: `.agents/skills/report-web-generator/references/style-research-editorial.md`
- Create: `.agents/skills/report-web-generator/references/style-future-tech.md`
- Create: `.agents/skills/report-web-generator/references/style-consulting.md`
- Create: `.agents/skills/report-web-generator/scripts/inject-edit-contract.mjs`
- Test: `tests/integration/skills/skill-contract.test.ts`

**Interfaces:**
- Produces: repo-visible `$huashu-design` and `$report-web-generator` skills plus deterministic contract injection.
- Consumes: Task 1 schemas.

- [ ] **Step 1: Write the failing skill discovery/contract test**

The test must assert:

```ts
expect(await exists(".agents/skills/huashu-design/SKILL.md")).toBe(true);
expect(await exists(".agents/skills/huashu-design/LICENSE")).toBe(true);
expect(await exists(".agents/skills/report-web-generator/SKILL.md")).toBe(true);
expect(overlay).toContain("$huashu-design");
expect(overlay).toContain("artifact/edit-manifest.json");
expect(overlay).toContain("data-edit-id");
```

- [ ] **Step 2: Vendor the exact upstream commit**

Run:

```bash
git subtree add --prefix=.agents/skills/huashu-design https://github.com/alchaincyf/huashu-design.git 0e7ec8aca0058184c1a9e06e57697e84f68a3f0f --squash
```

Expected: the full skill, references, assets, scripts, and MIT license exist under the repo-scoped skill path.

- [ ] **Step 3: Author the overlay skill with an imperative contract**

Its `SKILL.md` must require, in order:

1. Read `brief.json`, `source/content.md`, `source/source-index.json`.
2. Invoke and follow `$huashu-design` for design work.
3. Select exactly one of the three project style references.
4. Generate only inside `artifact/`.
5. Localize source images and remote assets.
6. Mark editable nodes and sortable blocks.
7. Run `inject-edit-contract.mjs`.
8. Run the artifact verifier.
9. Return success only when `verification.json.status` is `passed`.

- [ ] **Step 4: Implement deterministic manifest injection**

The script parses every output HTML file with Cheerio, finds `data-edit-id`/`data-block-id`, infers `kind` from element type, preserves existing source refs from `data-source-ref`, rejects duplicates, and writes sorted manifest arrays. It must not invent edit IDs for unmarked nodes.

- [ ] **Step 5: Run the contract test**

Run: `npm test -- tests/integration/skills`

Expected: PASS; duplicate IDs cause the injector to exit non-zero.

- [ ] **Step 6: Commit**

```bash
git add .agents/skills tests/integration/skills
git commit -m "feat: add pinned report generation skills"
```

---

### Task 5: Implement the Codex SDK runner and streamed job events

**Files:**
- Create: `src/codex/codex-runner.ts`
- Create: `src/codex/generation-prompt.ts`
- Create: `src/codex/types.ts`
- Create: `src/jobs/job-events.ts`
- Test: `tests/unit/codex/generation-prompt.test.ts`
- Test: `tests/integration/codex/codex-runner.test.ts`

**Interfaces:**
- Produces: `CodexRunner.runGeneration(input): AsyncIterable<GenerationEvent>`.
- Consumes: `GenerationBrief`, job workspace path, and SDK.

- [ ] **Step 1: Write failing prompt and runner tests**

```ts
it("builds a closed-scope prompt", () => {
  const prompt = buildGenerationPrompt({ briefPath: "brief.json", sourceDir: "source", artifactDir: "artifact" });
  expect(prompt).toContain("$report-web-generator");
  expect(prompt).toContain("$huashu-design");
  expect(prompt).toContain("只在 artifact/ 写入");
  expect(prompt).not.toContain(process.cwd());
});
```

Use an injected fake SDK in the integration test and assert event mapping for `thread.started`, `item.completed`, `turn.completed`, and `turn.failed`.

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- tests/unit/codex tests/integration/codex`

Expected: FAIL because runner modules do not exist.

- [ ] **Step 3: Implement the SDK adapter with a minimal environment**

```ts
export interface CodexRunnerInput {
  workspace: string;
  prompt: string;
}

export type GenerationEvent =
  | { type: "thread"; threadId: string }
  | { type: "progress"; message: string }
  | { type: "completed"; finalResponse: string }
  | { type: "failed"; message: string };
```

Instantiate `new Codex({ env })` with an allowlist containing only `PATH`, `HOME`, temporary-directory variables, certificate/proxy variables when explicitly configured, and the Codex credential variable supplied to the worker. Start a thread with `workingDirectory: workspace`; use `runStreamed()`; never log reasoning or source document content.

- [ ] **Step 4: Add an opt-in live smoke test**

When `RUN_CODEX_SMOKE=1`, create a temporary Git repo containing the two skills and a tiny source file, ask Codex to create `artifact/smoke.txt`, and assert its content. Skip this test by default.

- [ ] **Step 5: Run mocked tests and the optional smoke test when credentials exist**

Run: `npm test -- tests/unit/codex tests/integration/codex`

Optional run: `$env:RUN_CODEX_SMOKE='1'; npm test -- tests/integration/codex/codex-runner.test.ts`

Expected: mocked suite always PASS; smoke test PASS only in an authenticated Codex environment.

- [ ] **Step 6: Commit**

```bash
git add src/codex src/jobs/job-events.ts tests/unit/codex tests/integration/codex
git commit -m "feat: run report generations through Codex SDK"
```

---

### Task 6: Normalize artifacts and apply safe edit patches

**Files:**
- Create: `src/artifacts/normalize-artifact.ts`
- Create: `src/artifacts/apply-patch.ts`
- Create: `src/artifacts/path-policy.ts`
- Create: `src/artifacts/asset-service.ts`
- Test: `tests/fixtures/artifacts/web/index.html`
- Test: `tests/fixtures/artifacts/web/edit-manifest.json`
- Test: `tests/unit/artifacts/normalize-artifact.test.ts`
- Test: `tests/unit/artifacts/apply-patch.test.ts`

**Interfaces:**
- Produces: `normalizeArtifact()`, `applyPatch()`, and `AssetService`.
- Consumes: schemas from Task 1 and storage from Task 2.

- [ ] **Step 1: Write failing edit-patch tests**

Cover:

- escaped text replacement does not inject `<script>`;
- rich text only permits `strong`, `em`, `a`, `ul`, `ol`, `li`, `br`;
- image replacement only uses a registered artifact asset;
- block reorder requires an exact permutation of existing sibling block IDs;
- base revision mismatch throws `RevisionConflictError`;
- selector matching zero or multiple nodes throws `ManifestMismatchError`.

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- tests/unit/artifacts`

Expected: FAIL because artifact modules do not exist.

- [ ] **Step 3: Implement deterministic DOM patching**

Load only the manifest-declared file with Cheerio. Resolve the node by its validated manifest selector. For plain text use `.text(value)`; for rich text sanitize through an explicit tag/attribute allowlist; for images set only `src`, `alt`, and validated `object-position`. Write through a temporary file and atomic rename.

- [ ] **Step 4: Implement normalization**

Normalization must reject:

- missing `index.html`;
- absolute filesystem paths;
- `file://` URLs;
- script sources outside the artifact directory;
- forms, popups, top navigation, and service workers;
- manifest files that mention missing pages;
- duplicate edit/block IDs.

Inject `/editor-runtime/editor-bridge.js` immediately before `</body>` in every editable page.

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test -- tests/unit/artifacts && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/artifacts tests/fixtures/artifacts tests/unit/artifacts
git commit -m "feat: normalize artifacts and apply constrained edits"
```

---

### Task 7: Implement jobs, workspace isolation, and generation APIs

**Files:**
- Create: `src/jobs/job-worker.ts`
- Create: `src/jobs/worker-main.ts`
- Create: `src/jobs/workspace-service.ts`
- Create: `app/api/projects/route.ts`
- Create: `app/api/projects/[projectId]/sources/route.ts`
- Create: `app/api/projects/[projectId]/generations/route.ts`
- Create: `app/api/jobs/[jobId]/route.ts`
- Create: `app/api/jobs/[jobId]/events/route.ts`
- Create: `app/api/jobs/[jobId]/cancel/route.ts`
- Test: `tests/integration/jobs/job-worker.test.ts`
- Test: `tests/integration/api/generation-api.test.ts`

**Interfaces:**
- Produces: queued generation flow and SSE events.
- Consumes: repositories, preprocessor, CodexRunner, normalizer.

- [ ] **Step 1: Write the failing worker orchestration test**

Inject fakes for preprocessing, Codex, normalization, and verification. Assert the exact state sequence:

```ts
expect(recordedStates).toEqual([
  "queued",
  "preprocessing",
  "running_codex",
  "normalizing",
  "verifying",
  "ready"
]);
```

Add a failure test proving the previous current artifact remains unchanged when verification fails.

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- tests/integration/jobs tests/integration/api`

Expected: FAIL because worker/routes do not exist.

- [ ] **Step 3: Implement workspace creation**

Create `data/jobs/<jobId>/workspace`, run `git init`, copy only the source package and brief, and create an empty `artifact/`. The job workspace must not contain the application `.env`, SQLite database, uploads from other projects, or host auth files.

- [ ] **Step 4: Implement the single-concurrency worker**

Use an atomic database claim from `queued` to `preprocessing`. Poll every 1 second when idle. Honor cancellation before Codex starts; during Codex execution mark cancellation requested and interrupt the SDK turn if supported by the installed SDK, otherwise discard the result after the turn ends.

- [ ] **Step 5: Implement HTTP and SSE contracts**

`POST /generations` parses the brief schema and returns `202 { jobId }`. SSE emits only sanitized events:

```ts
type PublicJobEvent =
  | { type: "state"; state: JobState }
  | { type: "progress"; message: string }
  | { type: "ready"; artifactId: string }
  | { type: "failed"; code: string; message: string };
```

- [ ] **Step 6: Run tests**

Run: `npm test -- tests/integration/jobs tests/integration/api`

Expected: PASS for success, Codex failure, validation failure, cancellation, and stale job recovery.

- [ ] **Step 7: Commit**

```bash
git add src/jobs app/api/projects app/api/jobs tests/integration/jobs tests/integration/api
git commit -m "feat: orchestrate isolated generation jobs"
```

---

### Task 8: Add single-admin authentication and project UI

**Files:**
- Create: `src/auth/password.ts`
- Create: `src/auth/session.ts`
- Create: `middleware.ts`
- Create: `app/layout.tsx`
- Create: `app/(auth)/login/page.tsx`
- Create: `app/projects/page.tsx`
- Create: `app/projects/[projectId]/page.tsx`
- Create: `components/projects/new-project-form.tsx`
- Create: `components/projects/generation-form.tsx`
- Create: `components/projects/job-progress.tsx`
- Test: `tests/unit/auth/session.test.ts`
- Test: `tests/e2e/project-generation.spec.ts`

**Interfaces:**
- Produces: authenticated upload/generation flow.
- Consumes: Task 7 APIs.

- [ ] **Step 1: Write failing session tests**

Test constant-time password comparison, signed HttpOnly session expiry, tamper rejection, and middleware redirect for unauthenticated `/projects` requests.

- [ ] **Step 2: Implement the session**

Use `jose` to sign a 12-hour session cookie with `ADMIN_SESSION_SECRET`; set `httpOnly`, `secure` outside development, `sameSite: "strict"`, and `path: "/"`. Compare submitted password against `ADMIN_PASSWORD_HASH`, never a plaintext env value.

- [ ] **Step 3: Build the three screens**

Project list: title, latest mode/style, updated time, status.

New project: file upload and title.

Project workspace: source status, style radio group, mode radio group, Generate button, streamed progress, preview/editor tab, versions tab.

- [ ] **Step 4: Run unit and E2E tests**

Run: `npm test -- tests/unit/auth && npm run test:e2e -- tests/e2e/project-generation.spec.ts`

Expected: login required; fixture upload creates a project; generation form returns a mock ready artifact.

- [ ] **Step 5: Commit**

```bash
git add src/auth middleware.ts app components/projects tests/unit/auth tests/e2e/project-generation.spec.ts
git commit -m "feat: add internal project and generation interface"
```

---

### Task 9: Build secure iframe editing, assets, and patch APIs

**Files:**
- Create: `public/editor-runtime/editor-bridge.js`
- Create: `src/artifacts/runtime-service.ts`
- Create: `app/api/artifacts/[artifactId]/manifest/route.ts`
- Create: `app/api/artifacts/[artifactId]/runtime/[...path]/route.ts`
- Create: `app/api/artifacts/[artifactId]/patches/route.ts`
- Create: `app/api/artifacts/[artifactId]/assets/route.ts`
- Create: `components/editor/artifact-frame.tsx`
- Create: `components/editor/text-inspector.tsx`
- Create: `components/editor/image-inspector.tsx`
- Create: `components/editor/block-order.tsx`
- Test: `tests/e2e/artifact-editor.spec.ts`

**Interfaces:**
- Produces: in-browser constrained editing.
- Consumes: manifest, patch engine, and asset service.

- [ ] **Step 1: Write the failing browser editor test**

The test loads the artifact iframe, clicks the `cover-title` node, replaces it with `新标题`, reloads, and expects the new title. Then upload a small WebP, reorder two blocks, and assert `revision` increments exactly once per submitted patch request.

- [ ] **Step 2: Implement the iframe bridge protocol**

Messages must include `protocol: "report-editor-v1"`, `channelToken`, and a discriminated `type`. The bridge accepts only `selectNode`, `applyPreviewPatch`, `requestState`, and `state`. It never evaluates JavaScript from message payloads.

- [ ] **Step 3: Implement runtime headers**

Return Artifact pages with:

```text
Content-Security-Policy: default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'self'
Cache-Control: no-store
X-Content-Type-Options: nosniff
```

The application iframe uses `sandbox="allow-scripts"` without `allow-same-origin`.

- [ ] **Step 4: Implement inspectors and patch submission**

Text inspector uses a textarea for plain text and a small allowlisted toolbar for rich text. Image inspector uploads first, receives `assetId`, then submits `replaceImage`. Block order shows only manifest-declared siblings and submits a full permutation.

- [ ] **Step 5: Run E2E**

Run: `npm run test:e2e -- tests/e2e/artifact-editor.spec.ts`

Expected: PASS for text, image, order, persistence, revision conflict, and a malicious `<script>` string rendered as text.

- [ ] **Step 6: Commit**

```bash
git add public/editor-runtime src/artifacts/runtime-service.ts app/api/artifacts components/editor tests/e2e/artifact-editor.spec.ts
git commit -m "feat: add constrained artifact editor"
```

---

### Task 10: Add immutable versions and restore

**Files:**
- Create: `src/versions/version-service.ts`
- Create: `src/versions/snapshot-hash.ts`
- Create: `app/api/artifacts/[artifactId]/versions/route.ts`
- Create: `app/api/artifacts/[artifactId]/restore/[versionId]/route.ts`
- Create: `components/versions/version-list.tsx`
- Test: `tests/integration/versions/version-service.test.ts`
- Test: `tests/e2e/version-restore.spec.ts`

**Interfaces:**
- Produces: `createSnapshot`, `listVersions`, and `restoreVersion`.
- Consumes: BlobStore, repositories, and Artifact revision.

- [ ] **Step 1: Write failing snapshot and restore tests**

Assert that a snapshot contains HTML, manifest, generation metadata, asset references, revision, and SHA-256 tree hash. Restore `v1` after editing to `v2`; expect a new `v3-restored-from-v1`, while v1 and v2 bytes remain unchanged.

- [ ] **Step 2: Implement canonical tree hashes**

Sort relative paths lexicographically and hash each path plus file hash:

```ts
hash.update(`${relativePath}\0${fileSha256}\n`);
```

Do not include temporary files, browser screenshots, or verification logs in the content hash.

- [ ] **Step 3: Implement transactional snapshot and restore**

Copy working files to a temporary version prefix, verify its tree hash, atomically rename it to `versions/<versionId>`, then insert the Version row. Restore copies the selected immutable tree into a new working directory, swaps the Artifact pointer in a transaction, increments revision, and immediately snapshots the restored head.

- [ ] **Step 4: Add automatic snapshot policy**

Create a snapshot after generation, before regeneration, before restore, on explicit save, and when the artifact has unsnapshotted edits for at least five minutes. Coalesce automatic snapshots with identical content hashes.

- [ ] **Step 5: Run integration and E2E tests**

Run: `npm test -- tests/integration/versions && npm run test:e2e -- tests/e2e/version-restore.spec.ts`

Expected: PASS; immutable version files never change.

- [ ] **Step 6: Commit**

```bash
git add src/versions app/api/artifacts components/versions tests/integration/versions tests/e2e/version-restore.spec.ts
git commit -m "feat: preserve and restore artifact versions"
```

---

### Task 11: Implement deterministic Playwright artifact verification

**Files:**
- Create: `src/validation/artifact-verifier.ts`
- Create: `.agents/skills/report-web-generator/scripts/verify-artifact.mjs`
- Create: `tests/integration/validation/artifact-verifier.test.ts`
- Create: `tests/fixtures/artifacts/invalid/**`

**Interfaces:**
- Produces: `VerificationReport` and exit status used by Worker and Skill.
- Consumes: normalized Artifact.

- [ ] **Step 1: Write failing verifier tests**

Fixtures must cover: missing image, console exception, duplicate edit selector, web horizontal overflow, wrong slide aspect ratio, broken ArrowRight navigation, and valid web/slides artifacts.

- [ ] **Step 2: Implement a local static server and browser checks**

The verifier starts on `127.0.0.1` with an OS-assigned port, serves only the Artifact root, waits for `document.fonts.ready`, collects `pageerror` and console error events, checks every local request status, and captures screenshots under `verification/screenshots/`.

- [ ] **Step 3: Implement mode-specific assertions**

Web viewports: `1440×900` and `390×844`; assert `document.documentElement.scrollWidth <= viewport width + 1`.

Slides: assert each page has a 16:9 content box, ArrowRight changes the visible page, ArrowLeft returns, counter changes, and reloading retains the last page through localStorage.

- [ ] **Step 4: Write `verification.json`**

```json
{
  "schemaVersion": 1,
  "status": "passed",
  "checks": [],
  "errors": [],
  "screenshots": []
}
```

Exit `0` only for `passed`; exit `1` for failed checks; exit `2` for verifier infrastructure failure.

- [ ] **Step 5: Run verifier tests**

Run: `npm test -- tests/integration/validation`

Expected: valid fixtures PASS and every invalid fixture fails for its intended reason.

- [ ] **Step 6: Commit**

```bash
git add src/validation .agents/skills/report-web-generator/scripts/verify-artifact.mjs tests/integration/validation tests/fixtures/artifacts/invalid
git commit -m "feat: verify generated report artifacts"
```

---

### Task 12: Validate real styles, modes, and end-to-end Codex generation

**Files:**
- Create: `tests/fixtures/sources/research-report.docx`
- Create: `tests/fixtures/sources/research-report.pdf`
- Create: `tests/fixtures/sources/research-report.pptx`
- Create: `tests/e2e/live-codex-generation.spec.ts`
- Create: `docs/qa/style-regression.md`
- Modify: `.agents/skills/report-web-generator/references/style-*.md`

**Interfaces:**
- Produces: evidence that the real Codex + skill path satisfies the MVP design.
- Consumes: the completed application.

- [ ] **Step 1: Add small legally usable source fixtures**

Use synthetic research content with explicit fake-data labels; each file contains the same headings, two small tables, and two locally generated images. Do not commit confidential reports.

- [ ] **Step 2: Run the six-generation matrix**

Generate:

```text
research-editorial × web
research-editorial × slides
future-tech × web
future-tech × slides
consulting × web
consulting × slides
```

For cost control, only the acceptance run requires all six. During iteration use one web and one slides case.

- [ ] **Step 3: Perform visual and contract review**

For every output record:

- verifier status;
- screenshot path;
- dominant background/accent/font behavior;
- presence of source images;
- number of editable text/image nodes;
- web section count or slide count;
- console and request errors;
- any manual fixes.

- [ ] **Step 4: Exercise editing and versions on real output**

For one web and one slides Artifact: change a title, paragraph, image, and order; save v2; restore v1; verify the restored head; reload and verify persistence.

- [ ] **Step 5: Run the complete suite**

Run:

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
python -m pytest tests/python -q
```

Expected: all commands exit 0. Live Codex tests may be gated behind `RUN_CODEX_SMOKE=1`, but the final acceptance run must enable them and attach the generated verification reports.

- [ ] **Step 6: Commit**

```bash
git add tests/fixtures/sources tests/e2e/live-codex-generation.spec.ts docs/qa .agents/skills/report-web-generator/references
git commit -m "test: validate report generation styles and modes"
```

---

### Task 13: Package the single-host internal deployment

**Files:**
- Create: `Dockerfile`
- Create: `compose.yaml`
- Create: `scripts/entrypoint.sh`
- Create: `docs/operations/deployment.md`
- Create: `docs/operations/backup-restore.md`
- Modify: `next.config.ts`
- Test: `tests/integration/operations/health.test.ts`

**Interfaces:**
- Produces: reproducible Web and worker processes with one persistent volume.
- Consumes: all previous tasks.

- [ ] **Step 1: Write health and persistence tests**

The test starts Compose, waits for `/api/health`, creates a project, restarts both processes, and asserts the project and version remain available.

- [ ] **Step 2: Build the container image**

Use a Node 18+ Debian-based image with Python 3.10+, document libraries, and Playwright Chromium dependencies. Run as a non-root user. Mount `/app/data`; never bake `.env`, Codex auth, source uploads, or SQLite into the image.

- [ ] **Step 3: Define two processes**

`web` runs `npm start`; `worker` runs `npm run worker`. Both share the same read/write data volume; only worker receives Codex credentials. Set worker concurrency to 1.

- [ ] **Step 4: Document secret and backup operations**

Required secrets: `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET`, Codex authentication, `DATA_ROOT`, and `DATABASE_URL`. Backup procedure must stop worker claims, copy SQLite with its safe backup API, archive immutable versions, verify hashes, and resume the worker.

- [ ] **Step 5: Run deployment checks**

Run: `docker compose build && docker compose up -d && npm test -- tests/integration/operations/health.test.ts`

Expected: PASS; `docker compose restart` does not lose projects or versions.

- [ ] **Step 6: Commit**

```bash
git add Dockerfile compose.yaml scripts/entrypoint.sh docs/operations next.config.ts tests/integration/operations
git commit -m "ops: package internal MVP deployment"
```

---

## Final Acceptance Audit

Before claiming MVP completion, collect evidence for every line:

- [ ] `git status --short` contains no unintended generated or secret files.
- [ ] `npm run typecheck` exits 0.
- [ ] `npm test` exits 0.
- [ ] `python -m pytest tests/python -q` exits 0.
- [ ] `npm run build` exits 0.
- [ ] `npm run test:e2e` exits 0.
- [ ] DOCX, text PDF, and PPTX preprocessing evidence exists.
- [ ] Six style/mode live generation reports exist and pass the artifact verifier.
- [ ] At least one live web Artifact and one live slides Artifact pass text, image, ordering, save, reload, version, and restore checks.
- [ ] Failed generation evidence proves the prior current Artifact is unchanged.
- [ ] Security checks prove Artifact cannot read application cookies or call external network endpoints.
- [ ] Container restart evidence proves database and versions persist.
- [ ] Deployment and backup/restore documents match the tested commands.

## Execution Handoff

Plan execution should use one of these modes:

1. **Subagent-Driven**: dispatch a fresh implementation agent per task with review gates.
2. **Inline Execution**: execute in this thread with `superpowers:executing-plans`, completing tasks sequentially with checkpoints.

Because the current repository is empty and the tasks share evolving interfaces, Inline Execution is the lower-risk default unless the user explicitly authorizes subagents.

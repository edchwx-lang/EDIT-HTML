# EDIT-HTML V5.4.1 Huashu Preflight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Release EDIT-HTML V5.4.1 with content-only user interviews, auditable Huashu design autonomy, and non-mutating candidate/final preflight before immutable attestation.

**Architecture:** Split release/design-pipeline versions from the locked V5.4.0 artifact/editor contract. Add a focused preflight module and evidence schema before the existing attestation/import boundary; keep render, instrumenter, editor, versions, and publication byte-for-byte unchanged.

**Tech Stack:** Node.js 20+ ESM, node:test, parse5, Playwright, JSON Schema, PowerShell installer.

## Global Constraints

- Tool, release, pipeline, npm package, and EDIT-HTML Skill version: `5.4.1`.
- Artifact contract and editor runtime remain `5.4.0`.
- Do not modify files tracked by `editor-boundary.lock.json` or the lock itself.
- User interview contains content decisions only; Huashu owns all design decisions.
- Preflight is read-only: no project mutations, receipts, frozen stages, screenshots, or manifest rewrites.
- Warnings exit successfully; errors return a failing CLI exit code.

---

### Task 1: Release Version Separation

**Files:** Create `src/release-manifest.js`; modify `package.json`, `src/doctor.js`, `src/v5-project.js`, installer verification; test version, project, doctor, installation contracts.

**Interfaces:** Export `RELEASE_VERSION` and `DESIGN_PIPELINE_VERSION` as `5.4.1`; continue importing artifact/editor versions from the locked V5.4.0 manifest.

- [ ] Write tests asserting V5.4.1 tool/pipeline metadata and V5.4.0 artifact/editor metadata.
- [ ] Run focused tests and confirm the expected version assertion failures.
- [ ] Implement the release manifest and update pre-artifact consumers and installation checks.
- [ ] Run focused tests to green and confirm the editor boundary test remains green.
- [ ] Commit the version-separation change.

### Task 2: Huashu Design Evidence Contract

**Files:** Create `schemas/v5-huashu-design-evidence.schema.json` and `src/v5-huashu-evidence.js`; extend design validation and schema tests.

**Interfaces:** `validateHuashuDesignEvidence(projectDir, siteDir, kind)` returns normalized evidence plus `{ errors, warnings, summary }` without writes.

- [ ] Write failing tests for missing authority, missing image assessment, repeated rationale, forbidden high-loss omission, all-low warning, and three isolated candidate strategies.
- [ ] Run focused tests and verify failures are caused by the absent validator/schema.
- [ ] Implement schema and evidence validation, including source-asset coverage and final inheritance rules.
- [ ] Run evidence and schema tests to green.
- [ ] Commit the evidence contract.

### Task 3: Non-mutating Candidate and Final Preflight

**Files:** Create `src/v5-design-preflight.js`; modify CLI routing and pre-attestation gate; add `test/v5-preflight.test.js` and CLI tests.

**Interfaces:** `preflightV5CandidateSet(projectDir, variantId, rootDir)` and `preflightV5FinalSite(projectDir, variantId, siteDir)` return `{ valid, errors, warnings, checks, summary }`. CLI commands use `design preflight candidate|final`.

- [ ] Write failing tests for read-only behavior, aggregated diagnostics, warning-only success, candidate convergence, invalid selectors, and interaction with no DOM state change.
- [ ] Run focused tests and confirm missing-command/API failures.
- [ ] Implement static validation reuse, evidence validation, candidate-set comparison, and read-only Playwright final interaction checks.
- [ ] Make `huashu attest` reject V5.4.1 output unless a matching successful preflight proof exists in memory/input parameters without persisting a receipt; do not change V5.4.0 behavior.
- [ ] Run preflight, attestation, CLI, and compatibility tests to green.
- [ ] Commit preflight.

### Task 4: Content-only Skill Workflow and Documentation

**Files:** Modify bundled `skills/EDIT-HTML/SKILL.md`, relevant references, `README.md`, and `README.zh-CN.md`; update Skill tests.

- [ ] Write failing tests for V5.4.1 copy, content-only interview language, autonomous Huashu evidence, preflight commands, and absence of position/design questions.
- [ ] Run Skill tests to red.
- [ ] Update Skill and references; add bilingual Mermaid flows with asset assessment and both preflight stages.
- [ ] Run Skill/docs tests to green.
- [ ] Commit documentation and Skill changes.

### Task 5: Verification, Local Installation, and GitHub Delivery

- [ ] Run `npm test`, `npm run check`, `npm run check:editor-boundary`, and relevant Playwright tests.
- [ ] Confirm all editor-boundary hashes and locked files are unchanged.
- [ ] Run `npm run install:local`; verify global package and local EDIT-HTML Skill hashes.
- [ ] Run `edit-html-report doctor --json` and confirm tool/pipeline `5.4.1`, artifact/editor `5.4.0`.
- [ ] Inspect the final diff, stage only V5.4.1 files, and commit.
- [ ] Push `codex/v5.4.1-huashu-preflight` and open a draft PR to `main` with root cause, behavior, compatibility, and checks.

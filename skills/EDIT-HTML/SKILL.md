---
name: EDIT-HTML
version: 5.3.2
description: Use when converting DOCX, PDF, PPTX, Markdown, HTML, or TXT into a source-closed, Huashu-designed, editable and versioned offline HTML report; gathering content priorities; comparing executable design samples; auditing provenance; opening the visible editor; restoring versions; or publishing artifacts.
---

# EDIT-HTML V5.3.2

V5.3.2 keeps the attested Huashu design gate, adds explicit source-image judgment, and fixes the HTML-backed editor save path:

```text
EDIT-HTML extracts facts and assets
-> Huashu understands the material and conducts a content-only interview
-> Huashu owns content strategy and the complete website
-> EDIT-HTML audits and instruments without redesigning
-> artifact.html
-> the V5.3.2 HTML editor/version/publication system
```

Huashu owns everything between the Source Pack and finished website. Never create an editorial report model, display mode, page order, component plan, chart plan, primitive tree, layout grammar, or fixed-renderer input before invoking Huashu.

## Installation authority

From the intended merged V5.3 repository, run only `npm run install:local`. The installer prints and validates the explicit source root, runs `npm test` before changing the global npm package or Codex Skill, rejects a 4.0.0 checkout, and verifies the shim, package, Skill, runtime, source hashes, and `doctor --json` result after installation.

The merged V5.3 branch is the installation authority. Archive an older worktree only after every dirty change is committed and merged. Never delete uncommitted files as repository cleanup.

## Run the workflow

1. Run `edit-html-report doctor`, `edit-html-report create <source> --out <project>`, and `edit-html-report variant create <project>`.
2. Read [references/content-pipeline.md](references/content-pipeline.md) completely. Inspect every Source Pack file and extraction warning. Edit HTML may extract and normalize facts; it must not recommend presentation.
3. Invoke `$huashu-design`. Huashu reads and summarizes the Source Pack, then conducts at most three content-only questions:
   - `purpose` is always required: purpose, occasion, and target reader;
   - `contentWeight` is always required: which source content deserves greater depth;
   - `contentClarification` is optional and may be asked only when a concrete ambiguity, conflict, omission risk, time range, terminology, or comparative focus in the Source Pack requires resolution.
   Reuse answers already present in the request. Never ask about structure, page order, layout, components, charts, interaction, theme, color, typography, visual style, or what the audience should remember. If no material-driven clarification is necessary, stop after two questions.
4. Save the actual question, original answer, origin, time, any clarification source references, and `decisionEvidence` in interview schema v3. Run `interview import`, then verify `interview status`. `user-delegated` is allowed only when the user explicitly says the agent should decide, for example "you decide", "directly do it", "直接做", or "看着办". Do not invent delegation evidence.
5. Read [references/design-selection.md](references/design-selection.md), [references/huashu-design-package.md](references/huashu-design-package.md), and [references/artifact-contract.md](references/artifact-contract.md) completely. Run `design prepare`, then `design huashu begin <project> --variant <id> --kind candidate --skill <huashu-design/SKILL.md>` before any candidate file is generated. Give every prepared file, including `content-brief.json`, only to the invoked Huashu design stage.
6. Without an initial visual reference, Huashu produces three executable samples. They share one content plan and use `precision-blueprint`, `warm-paper-terracotta`, and `sandstone-archive` for comparison, but must differ in narrative architecture, DOM, visualization, and core interaction. With an initial visual reference, Huashu produces one executable sample using the closest existing theme.
7. Every candidate is compact but executable: exactly one first desktop viewport, one representative focus module, and one real core interaction. It is not a miniature full site and does not require mobile or full-page completion before selection. `manifest.json` and `design-process.json` declare the matching `sampleScope` selectors.
8. Huashu seals each completed sample with `design huashu attest <project> --variant <id> --kind candidate --from <site>`. Import with `design candidate import`, then run `design candidate review prepare`. Import fails without the execution receipt bound to the exact Huashu Skill hash, input receipt, challenge, and output hash. The fast audit also requires real theme-rendered PNG screenshots, distinct narrative/visualization/interaction strategies, non-converged DOM, meaningful visual modules, and no visible raw-source dumping.
9. Show exactly one actual `1440x900`, non-full-page desktop screenshot per candidate from the review set. Wait for the user's choice. Confirm only with `design candidate confirm --receipt <selection-receipt.json>`, where the receipt records `reviewSetSha256`, selected `candidateId`, `selectedBy: "user"`, the verbatim user selection, and time. Never confirm in the same message that first shows screenshots, and never confirm from agent preference or hidden state.
10. Run `design huashu begin <project> --variant <id> --kind final --skill <huashu-design/SKILL.md>`. Huashu expands the selected candidate itself into the complete website. "Emphasize" controls depth, not presence: retain the overall situation and expand every declared focus entity and facet. Main narrative may be compressed, but substantive detail remains genuinely usable in main/detail views. Hidden or `aria-hidden` bindings never count as coverage. Do not expose a bulk raw-source appendix unless the user explicitly requests it. Huashu must assess every Source Pack image in `design-process.json.sourceAssetDecisions` as `use-original`, `redraw`, `reference-only`, or `omit`, with `high|medium|low` content value and a material-specific rationale. This is a judgment gate, not an all-images-must-be-used rule. High-value evidence must be visibly used or redrawn; low-value, repetitive, decorative, or unsuitable images may be omitted.
11. Huashu captures desktop/mobile viewport screenshots plus `desktop-full.png` and `mobile-full.png`, then seals the site with `design huashu attest ... --kind final`. Import with `design final import`. This verifies the Huashu execution receipt, freezes Huashu output, and writes an immutable stage receipt tied to the allowed-input hashes and final output hash. Fact, coverage, design, or safety failures are diagnostics returned to Huashu; Edit HTML must not rewrite wording, DOM, CSS, charts, or interactions.
12. In a later command, run complete desktop/mobile and full-page verification, then `render` and `validate`. Both require the frozen Huashu receipt. The Instrumenter only inlines local resources, injects stable edit/source attributes, adds theme/editor compatibility metadata, and emits `artifact.html`.
13. Read [references/editor-publication.md](references/editor-publication.md) completely. Run `edit-html-report editor open <project> --variant <id>` and pause. The command returns a `handoff` containing an authenticated `editorUrl` and absolute `launcherPath`.
14. In the conversation output, always provide a directly clickable editor URL and a clickable local launcher path. Never present `artifact.html` as the only result. The user inspects and edits the visible artifact directly.
15. The visible editor must expose executable text, block, image, and serializable-chart actions. Ordinary edits and palette changes update the current iframe in place instead of returning to the cover; full reloads preserve viewport when they are required for undo, restore, or rollback. Saving creates an immutable internal version immediately. The Publish button opens saved versions only, and each saved version exposes exactly four primary actions: local publish, domain publish, reveal local publication in the file manager, and delete saved version file. Do not expose a Redo toolbar button. There is no separate design/theme confirmation action, publication-history toolbar action, or review authorization gate.

## Hard Boundaries

- Content is source-closed and expression-free: titles, grouping, compression, hierarchy, and explanation may change; facts, values, units, times, scopes, qualifications, and relationships may not.
- External material guides visual design only and never adds report facts.
- `content-brief.json` describes content purpose and emphasis, never presentation.
- `content-bindings.json` proves traceability and coverage only; it never tells Huashu how to design.
- Every visible number and substantive claim binds to Source Pack facts and source locations.
- Huashu owns the actual DOM, CSS, local JavaScript, chart behavior, interaction semantics, responsiveness, and visual language.
- `owner: huashu-design` is not evidence. V5.3.2 candidate and final imports require a dedicated Huashu execution receipt; a package created outside that begin/attest boundary is rejected.
- Source images are not mandatory by count. Huashu decides their content value and treatment; the audit checks that every decision is explicit and executed consistently, without replacing design judgment with a blanket image quota.
- Audit failures stop output and return diagnostics; audit must not modify the site.
- Candidate confirmation requires a current review set and a user selection receipt; general agent autonomy cannot override this gate.
- Three candidates that reuse one HTML template with theme/title/CSS changes do not count as three designs.
- Coverage audit and design-quality audit are separate; `valid: true` is not design approval.
- Instrumenter preserves Huashu's DOM hierarchy, classes, geometry, typography, charts, and interactions.
- Audit and Instrumenter commands consume only the frozen Huashu output. They fail if Huashu-owned content, classes, geometry, typography, chart definitions, or interaction code changes; audit cannot be combined with design generation in one command.
- V5 artifacts use HTML patches for text, block, image, and serializable-chart edits; V4 model-backed artifacts retain revisioned model patches.
- Instrument every eligible visible leaf text and image across the complete V5 page with a deterministic edit identity. Numeric text outside a bound region is editable only when its tokens resolve unambiguously to a Source Pack fact. Expose chart editing only when `data-chart-data-for` resolves to serializable JSON.
- Compile editor theme variables after Huashu styles so palette changes win the CSS cascade without changing Huashu DOM, layout, typography, or content.
- Context actions are type-scoped: images expose replacement only, serializable charts expose data editing only, and blocks expose movement, duplication, and deletion only.
- Do not add a design/theme confirmation button, confirmation API call, save gate, or publication gate based on review state.

## Supporting References

- Theme system: [references/themes.md](references/themes.md)
- V4.x compatibility: [references/migration.md](references/migration.md)
- Editor/version/publication: [references/editor-publication.md](references/editor-publication.md)

Report the project path, variant ID, Source Pack warnings, interview status/hash, candidate IDs and hashes, review set hash, selected parent hash, selection receipt hash, final-site hash, audit result, artifact validation, current theme, authenticated editor URL, launcher path, saved version, publication, and unresolved warnings.

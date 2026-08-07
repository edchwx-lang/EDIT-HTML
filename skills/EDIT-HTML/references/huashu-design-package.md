# V5.3.2 Huashu Actual-Site Contract

Invoke `$huashu-design` with every prepared Source Pack file, the confirmed interview, and `content-brief.json`. Start and seal both candidate and final stages with the V5.3.2 Huashu execution receipt commands. Huashu owns content hierarchy and the entire executable experience; a self-declared owner field is insufficient.

## Candidate

Each candidate contains `index.html`, local `styles/`, `scripts/`, `assets/`, `content-bindings.json`, `design-rationale.md`, `design-process.json`, `manifest.json`, `huashu-execution-receipt.json`, and exactly one actual `screenshots/desktop.png` captured at `1440x900` with `fullPage: false`. A `data-preview-theme` style supplies the declared semantic theme variables before capture.

The candidate is a compact executable sample, not a full site: one first viewport containing title/identity and core evidence, one representative focus visualization, and one working interaction state. CSS and JavaScript are functional local resources. Three candidates share one content plan but implement genuinely different narratives, DOM structures, visualization strategies, and interactions.

`design-process.json` declares Huashu ownership, narrative architecture, at least one representative focus visualization, and one core interaction. Its `sampleScope` matches the manifest selectors and every selector is present in `index.html`. V5.3 rejects clone-like or color-only candidates, fake or duplicate screenshots, missing selectors, visible raw-source dumping, and full candidate packages mislabeled as compact samples.

`content-bindings.json` is a provenance and coverage index. Bindings contain only `contentId`, `factIds`, `sourceRefs`, `tier`, and `editableKind`; bound HTML uses `data-content-id`. The `coverage` object declares:

- `kind`: `vertical-slice` for a candidate or `complete-site` for final;
- overview content and source references;
- all focus entities and their material facets;
- which focus entities this site currently represents.

It contains no page, layout, component, chart, or interaction instructions.

## Final lineage and completeness

After user selection, Huashu expands the selected site itself. The final manifest records `parentCandidateSha256`, Source Pack hash, interview hash, content-plan hash, `designProcessSha256`, and content-bindings hash. Final coverage must represent every focus entity and facet declared by the shared candidate content plan. Emphasis controls depth, not presence; the overall situation remains accessible even when one chapter is the focus.

Substantive material belongs in usable main or detail views. A bulk visible raw-source appendix requires explicit user authorization and cannot substitute for structured content coverage. Omission likewise requires explicit user authorization. All visible values, units, dates, ranges, qualifications, and claims bind to Source Pack facts.

Visible colors use existing semantic theme variables. Local safe scripts and any safe DOM structure are allowed. Remote runtime dependencies, network calls, dynamic remote imports, `eval`, and `new Function` are forbidden.

The selected final package is content-complete and includes desktop and mobile viewport screenshots plus `desktop-full.png` and `mobile-full.png`. Hidden bindings do not count as coverage. Responsive and full-page Playwright verification runs only after selection and must pass before editor handoff.

For every image listed by `asset-contact-sheet.html`, the final `design-process.json` contains one `sourceAssetDecisions` entry with its asset path, source reference, `high|medium|low` content value, treatment, and material-specific rationale. Treatments are `use-original`, `redraw`, `reference-only`, and `omit`. The rule does not impose an image quota: Huashu may omit low-value or repetitive images. A high-value image must either be rendered byte-identically from the Source Pack or redrawn in a declared visualization bound to that image's source reference.

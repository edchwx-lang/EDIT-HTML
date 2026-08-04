# V5.1 Huashu Actual-Site Contract

Invoke `$huashu-design` with every prepared Source Pack file, the confirmed interview, and `content-brief.json`. Huashu owns content hierarchy and the entire executable experience.

## Candidate

Each candidate contains `index.html`, local `styles/`, `scripts/`, `assets/`, `content-bindings.json`, `design-rationale.md`, `manifest.json`, and actual `screenshots/desktop.png` plus `screenshots/mobile.png`.

The candidate is a content-complete vertical slice. It uses real content for the overall situation, one representative focus entity, all material facets needed to prove depth, and the core interaction. CSS and JavaScript are functional local resources. Three candidates share one content plan but implement genuinely different narratives and experience architectures.

`content-bindings.json` is a provenance and coverage index. Bindings contain only `contentId`, `factIds`, `sourceRefs`, `tier`, and `editableKind`; bound HTML uses `data-content-id`. The `coverage` object declares:

- `kind`: `vertical-slice` for a candidate or `complete-site` for final;
- overview content and source references;
- all focus entities and their material facets;
- which focus entities this site currently represents.

It contains no page, layout, component, chart, or interaction instructions.

## Final lineage and completeness

After selection, Huashu expands the selected site itself. The final manifest records `parentCandidateSha256`, Source Pack hash, interview hash, content-plan hash, and content-bindings hash. Final coverage must represent every focus entity and facet declared by the shared candidate content plan. Emphasis controls depth, not presence; the overall situation remains accessible even when one chapter is the focus.

Substantive material belongs in usable main or detail views. A bulk visible raw-source appendix requires explicit user authorization and cannot substitute for structured content coverage. Omission likewise requires explicit user authorization. All visible values, units, dates, ranges, qualifications, and claims bind to Source Pack facts.

Visible colors use existing semantic theme variables. Local safe scripts and any safe DOM structure are allowed. Remote runtime dependencies, network calls, dynamic remote imports, `eval`, and `new Function` are forbidden.

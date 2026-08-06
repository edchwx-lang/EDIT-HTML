# V5.2.1 Source Pack and Fact Boundary

## Canonical flow

`source -> Source Pack -> Huashu interview/design -> Huashu final site -> read-only audit -> Instrumenter -> artifact -> existing editor`

`source-pack/` is the only pre-Huashu production output. It contains:

```text
manifest.json
readable-source.md
fact-ledger.json
source-map.json
tables-and-datasets.json
asset-contact-sheet.html
assets/
extraction-warnings.json
```

The pack preserves original values, units, dates, ranges, qualifications, relationships, table cells, footnotes, images, and source positions. `readable-source.md` is optimized for material comprehension, while the JSON ledgers provide exact traceability.

The extractor may normalize whitespace, identify repeated units, associate a footnote with its paragraph, and expose table datasets. It must not label a fact as a KPI, recommend a chart, rewrite headings for display, rank chapters, choose a page order, or bind content to a component.

External websites, screenshots, and design systems are stored as visual references in the interview/design handoff. They are never merged into the Source Pack fact ledger.

Extraction warnings are not silently repaired. Huashu must see them, and an unresolved warning that affects factual reliability must remain visible in the later audit.

## Expression after extraction

Huashu may summarize, retitle, merge, split, reorder, visualize, and create detail/appendix access. Every substantive statement must still resolve to one or more fact IDs and source references. Exact wording is not required; factual meaning and qualifications are.

`content-brief.json` carries only purpose, content emphasis, and an optional Source-Pack-anchored clarification. It must not carry structure or design decisions. Emphasis determines comparative depth, not whether the report overview or non-priority substantive content exists.

A final site may use concise detail views instead of copying source prose. A visible appendix that bulk-exposes at least 80% of ten or more substantive source units is treated as a raw-source appendix and requires explicit user authorization; it cannot be used to manufacture a passing coverage count.

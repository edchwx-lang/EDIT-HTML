---
name: edit-html-report
description: Use when turning TXT, Markdown, HTML, DOCX, PDF, or PPTX source material into an editable, traceable HTML report; revising an Edit HTML Report project; choosing data-first versus evidence-first; changing report colors; saving versions; or publishing through local output, Netlify, or Vercel.
---

# Edit HTML Report

Use the active Agent for evidence analysis and report authorship. Use `edit-html-report` for deterministic extraction, project state, validation, local editing, immutable versions, and publication.

## Keep the fact boundary

- Use only facts in the user's source material. Never invent or supplement claims, quotations, or numbers.
- Preserve a source reference for every chart, number, and quantitative conclusion.
- Treat web pages as visual references only when browsing is permitted.
- Omit unsupported content and disclose unresolved extraction or source limitations.

## Run the complete workflow

1. Run `edit-html-report doctor`, then create the project:

       edit-html-report create <source> --out <project>

2. Read `project.json`, `analysis.json`, and [references/agent-handoff.md](references/agent-handoff.md). Prepare `report-plan.json` from the extracted evidence.

3. Present both structural modes in the user's system language, recommend one with evidence from `analysis.json`, and obtain explicit confirmation unless the user already chose a mode:
   - 数据优先：高密度 KPI、图表、表格和结构化比较；适合量化证据充足的材料。
   - 证据优先：文字说明和论证重于新增图表，可保留原文图表、引文与脚注。

   Do not present light/dark or any color palette as a mode. Read [references/modes-and-themes.md](references/modes-and-themes.md) for the exact rules.

4. Record the confirmed mode before creating one independent variant. Do not ask for a theme yet:

       edit-html-report variant create <project> --mode <data-first|evidence-first>

5. Read [references/huashu-report-profile.md](references/huashu-report-profile.md) and [references/artifact-contract.md](references/artifact-contract.md) completely. Author `artifact.html` in the new variant directory. Never reuse or overwrite another variant's DOM.

6. Finalize and repair every validation failure. This creates a validation snapshot, not permission to skip editing:

       edit-html-report finalize <project> --variant <variant-id>

7. Always open the tokenized loopback editor in the user's local browser before publication:

       edit-html-report open <project> --variant <variant-id>

   Do not treat this as optional. Let the user edit content and select any of the six palettes. A theme change changes color state only; it must not change the mode, outline, DOM hierarchy, layout geometry, chart type, content, data, or citations.

8. After the user finishes editing, save a new immutable version in the editor. Publish only that exact post-editor saved version. Never publish the mutable draft or silently substitute an earlier snapshot.

9. Publish to the user's selected target: local HTML, Netlify, or Vercel. If the target is already known, act without asking again. Never claim provider publication succeeded without the returned URL.

## Preserve editability

- Use `data-edit-id` for editable text, `data-block-id` for movable sections, `data-image-id` for replaceable images, and `data-chart-id` for charts.
- Embed chart data and all runtime assets. Keep the report offline-capable.
- Avoid free-canvas positioning, absolute-positioned report layouts, and arbitrary CSS controls.

## Report completion

State the project path, variant ID, confirmed mode, selected theme, post-editor saved version ID, publication target, and returned URL or local path. List validation commands and results. Mark unverified steps explicitly.

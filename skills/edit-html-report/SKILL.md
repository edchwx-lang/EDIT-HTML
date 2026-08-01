---
name: edit-html-report
description: Create, inspect, author, edit, version, package, and publish evidence-based HTML reports from user-provided TXT, Markdown, HTML, DOCX, PDF, or PPTX material. Use when a coding Agent needs to turn source documents into a traceable evidence-first or data-first report, modify an existing Edit HTML Report project, produce an offline single HTML, or publish a saved report through Netlify or Vercel.
---

# Edit HTML Report

Build reports through the model-neutral edit-html-report CLI. Use the active Agent for analysis and design judgment; use the CLI for deterministic project state, validation, versioning, editing, packaging, and publication.

## Enforce the fact boundary

- Use only facts present in the user's source material.
- Use web pages only as visual references when the user permits browsing.
- Never insert an external statistic, claim, quotation, or inferred number.
- Omit unsupported content. Do not fill gaps with plausible text.
- Preserve a source reference for every chart, number, and quantitative conclusion.

## Run the workflow

1. Run edit-html-report doctor.
2. Create a project:

       edit-html-report create <source> --out <project>

3. Read project.json and analysis.json. Read references/agent-handoff.md before proposing the report plan.
4. Recommend evidence-first or data-first and ask the user to confirm the mode when they have not already chosen one.
5. Create a variant:

       edit-html-report variant create <project> --mode <mode> --theme <theme>

6. Read references/huashu-report-profile.md and references/artifact-contract.md completely.
7. Author artifact.html inside the new variant directory. Do not reuse another variant's DOM or overwrite another variant.
8. Finalize and correct every reported violation:

       edit-html-report finalize <project> --variant <variant-id>

9. Open the local editor when the user wants manual changes:

       edit-html-report open <project> --variant <variant-id>

10. Save a version before packaging or publishing. Publish only the exact version the user selected.

## Choose the mode and theme

- Use evidence-first for narrative reports, policy studies, qualitative findings, and sparse quantitative evidence. Default to editorial-light; offer editorial-dark.
- Use data-first for dense metrics, comparisons, tables, dashboards, and repeated quantitative evidence. Default to tech-dark; offer consulting-light.
- Change only theme tokens and chart palettes when switching a theme. Do not change the outline, DOM hierarchy, or claims.

## Preserve editability

- Edit text in place through data-edit-id.
- Mark movable sections with data-block-id.
- Mark replaceable images with data-image-id.
- Mark charts with data-chart-id and embed their data.
- Attach data-source-ref to every quantitative edit and chart.
- Do not implement free-canvas positioning, arbitrary CSS controls, or absolute-positioned report layouts.

## Complete the task

- Report the project path, variant ID, saved version ID, selected mode, and selected theme.
- State which validation commands ran and whether they passed.
- State any unsupported source format or unverified publication step explicitly.
- Never claim publication succeeded without the provider command and returned URL.

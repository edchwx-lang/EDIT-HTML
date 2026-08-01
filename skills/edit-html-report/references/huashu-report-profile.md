# Huashu Report Profile

Read this file only while designing or visually revising a report.

This profile adapts selected report-design principles from Huashu-Design. The
Edit HTML Report fact boundary always wins: do not browse to supplement report
claims, even when a general design workflow would normally verify facts online.

## Source and asset discipline

- Let the supplied content, brand system, screenshots, and assets determine the design. Do not start from a generic visual template when usable context exists.
- Use real logos, product images, UI captures, and evidence-bearing illustrations when the user supplied them or explicitly permits acquiring visual assets.
- Never replace a recognizable product with a hand-drawn SVG or CSS silhouette.
- If an essential asset or fact is absent, use a plainly labeled placeholder or omit the element. Never fabricate a polished substitute.
- An image must carry information. Remove decorative stock imagery that does not change the reader's understanding.

## Information design

- Start with the reader's decision, not the source document's order.
- Give each section one job and one dominant visual relationship.
- Prefer a clear argument sequence: context, evidence, implication, action.
- Use charts only when position, comparison, distribution, composition, or change is materially clearer than prose.
- Make evidence traceable without turning the page into a citation dump.

## Typography

- Use one expressive display face at most and one highly readable text family.
- Do not default to Inter, Roboto, Arial, Helvetica, or an unmodified system stack for display type unless the brand calls for it.
- Establish clear title, section, body, caption, and source levels.
- Avoid oversized headings that consume a screen without adding orientation.
- Keep paragraph width controlled and use spacing before decorative separators.

## Color

- Build from neutral surfaces, one primary family, and one functional accent family.
- Reserve semantic colors for meaning; do not use a rainbow palette for decoration.
- Maintain accessible contrast in both light and dark themes.
- Keep chart colors stable across the report and across theme variants.

## Anti-slop rules

- Do not stack generic rounded cards for every section.
- Do not decorate with meaningless gradients, glowing blobs, glass panels, or random icons.
- Do not repeat the same three-column card layout page after page.
- Do not use fake metrics, ornamental charts, unexplained percentages, or placeholder dashboards.
- Do not hide weak hierarchy behind animation.
- Avoid generic purple gradients, gratuitous emoji, decorative statistics, invented quotations, repeated bento grids, and GitHub-dark neon styling unless the brand itself requires them.
- Use sparse layouts for narrative reports and purposeful density for data-heavy reports. Density must come from evidence, not decoration.

## Interaction and accessibility

- Keep report reading primary; editing controls belong to the editor shell, not the artifact.
- Use a 14px minimum web body size, 16px on mobile, 44×44px minimum interactive targets, and comfortable Chinese line height.
- Target WCAG AA contrast: 4.5:1 for body text and 3:1 for large text.
- Prefer `text-wrap: balance` for headings and `text-wrap: pretty` for prose when supported.

## Validation

Review at desktop and mobile widths. Check information hierarchy, density, chart legibility, source visibility, overflow, contrast, and keyboard focus. Open the result in a real browser, inspect console and page errors, and exercise editing interactions. Functional validation is automated; final visual quality requires side-by-side human review against the agreed reference.

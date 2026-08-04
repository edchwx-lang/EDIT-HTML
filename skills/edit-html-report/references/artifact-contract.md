# V5 Audit and Instrumenter Contract

## Read-only audit

Before artifact creation, the auditor checks candidate lineage, Source Pack hash, interview hash, content binding hash, visible numeric fidelity, units, dates, ranges, qualifications, source references, substantive coverage, registered resources, and offline script safety.

The audit writes diagnostics only. It must not modify copy, add missing qualifications, rebuild DOM, replace CSS, rewrite chart behavior, or inject a fallback component. Any failure returns the original Huashu site and diagnostics to Huashu.

## Instrumenter

After a passing audit, `render` performs protocol adaptation with an HTML AST:

1. inline local CSS, JavaScript, fonts, and images;
2. map `data-content-id` through `content-bindings.json`;
3. inject stable `data-edit-id`, `data-block-id`, `data-image-id`, `data-chart-id`, and `data-source-ref` attributes;
4. inject the six existing semantic theme variables and frozen editor metadata;
5. write a minimal schema-v4 compatibility `report-model.json` for the existing editor, never for regeneration;
6. emit a single offline `artifact.html` and enter `awaiting-editor-review`.

V5 does not write `data-node-id`. The existing editor therefore uses its HTML-patch path.

Instrumenter must preserve Huashu's DOM nesting, classes, document order, typography, geometry, SVG/canvas implementation, charts, and interactions. Only resource inlining, protocol attributes, theme declarations, and editor metadata may be added.

Validation compares the recorded pre/post body structure, artifact hash, audit result, unique edit IDs, local-only runtime, and absence of forbidden execution. It does not judge or redesign visual quality.

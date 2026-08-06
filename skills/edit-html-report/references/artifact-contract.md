# V5.2.1 Audit and Instrumenter Contract

## Read-only audit

Before artifact creation, the auditor checks candidate lineage, Source Pack hash, interview hash, content binding hash, visible numeric fidelity, units, dates, ranges, qualifications, source references, substantive coverage, registered resources, and offline script safety.

Coverage validation distinguishes presentation from storage: the final site expands every declared focus entity and facet, while a bulk raw-source appendix is rejected unless the user explicitly requested it. Passing source-reference counts alone is not content completeness.

The audit writes diagnostics only. It must not modify copy, add missing qualifications, rebuild DOM, replace CSS, rewrite chart behavior, or inject a fallback component. Any failure returns the original Huashu site and diagnostics to Huashu.

## Instrumenter

After a passing audit, `render` performs protocol adaptation with an HTML AST:

1. inline local CSS, JavaScript, fonts, and images;
2. map `data-content-id` through `content-bindings.json`;
3. inject stable `data-edit-id` on meaningful text descendants, `data-block-id` on bound blocks, and `data-image-id` on editable images;
4. inject `data-chart-id` only when a matching serializable `data-chart-data-for` payload exists; otherwise mark the chart explicitly uneditable;
5. propagate `data-source-ref` to editable descendants and inject the six semantic theme variables plus editor metadata;
6. write a minimal schema-v4 compatibility `report-model.json` for legacy routing only, never for regeneration;
7. emit a single offline `artifact.html` whose HTML-backed edits can be saved directly.

V5 does not write `data-node-id`. V5.2.1 routes text, block, image, chart, and theme operations through the HTML-patch path. The model-operation path remains only for V4 compatibility.

Instrumenter must preserve Huashu's DOM nesting, classes, document order, typography, geometry, SVG/canvas implementation, charts, and interactions. Only resource inlining, protocol attributes, theme declarations, and editor metadata may be added.

Validation compares the recorded pre/post body structure, artifact hash, audit result, unique edit IDs, executable chart payloads, local-only runtime, and absence of forbidden execution. It does not judge or redesign visual quality.

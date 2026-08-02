# Huashu Presentation Boundary

Huashu Design runs after content analysis and before deterministic rendering.

Input:

- canonical `report-model`;
- confirmed mode profile;
- component capabilities;
- semantic theme tokens.

Output:

- component type and stable node binding;
- grid, reading width, hierarchy, interaction, and responsive strategy.

`contentMutationAllowed` must be `false`. The presentation plan must not contain replacement prose, values, citations, formulas, or source mappings. It must not change first-level section order or remove a report node.

Use purposeful hierarchy and responsive gutters. Avoid repetitive generic cards, fake metrics, decorative charts, excessive gradients/glow, and free-canvas positioning. Editing controls belong to the local editor shell, never the published report.

The deterministic renderer compiles the report model and presentation plan. If the design needs content not represented in `report-model`, return to content analysis; do not add it inside HTML.

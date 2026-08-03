# Presentation Plan Compiler Boundary

Huashu produces design grammar, not report content and not editor markup. After package validation, the deterministic compiler maps each stable report node to a package component/layout/interaction rule and writes `presentation-plan.json`.

The plan must record:

- `generatedBy: huashu-design-package-compiler`;
- candidate ID, design direction ID, and preview theme ID;
- design input and output SHA-256;
- stable node bindings;
- implemented `componentId`, `layoutId`, `interactionIds`, package class, and safe primitive;
- `contentMutationAllowed: false`.

It must not contain replacement prose, values, citations, formulas, source mappings, literal theme colors, remote dependencies, or an alternative first-level order. Every ID must resolve to the confirmed registry/grammar. If content is missing, return to content compilation. If design grammar is invalid, return to Huashu. Do not generate a plan with a built-in mapper or string-only component names.

# Presentation Plan Compiler Boundary

Huashu produces a complete composition and design strategy, not editor markup. After validation, the deterministic compiler binds the selected component tree and composition to stable report nodes and writes `presentation-plan.json`.

The plan must record:

- `generatedBy: huashu-design-package-compiler`;
- candidate ID, design direction ID, and preview theme ID;
- design input and output SHA-256;
- stable node bindings;
- selected root order and composition groups;
- semantic chart specifications;
- implemented `componentId`, `layoutId`, `interactionIds`, package class, and safe primitive;
- `contentMutationAllowed: false`.

It must not invent prose, values, citations, formulas, source mappings, literal theme colors, or remote dependencies. Every ID must resolve to the confirmed registry/grammar. The compiler may preserve first-level logic while applying the selected strategy's local composition. If content is missing, return to editorial production; if design is invalid, return to Huashu. Never use a built-in design fallback.

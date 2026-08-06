# Edit HTML Report V5.2 Editor Design

## Goal

Make every visible V5 editor control operate on Huashu-authored HTML artifacts and remove the redundant design/theme confirmation gate.

## Architecture

V5 remains HTML-backed. The instrumenter preserves Huashu DOM structure and adds stable identities to bound blocks plus editable descendant text and images. The editor selects an operation adapter from the artifact contract: V5 artifacts use HTML patches, while legacy model-backed artifacts retain model patches.

The V5 adapter maps text, block, image, and chart actions to `replaceText`, `moveBlock`, `duplicateBlock`, `deleteBlock`, `replaceImage`, and `replaceChartData`. Unsupported chart payloads are reported as unavailable and do not expose a nonfunctional action.

## Editor State

- Remove the `确认设计与配色` button from the visible editor.
- Saving no longer depends on `reviewState`.
- Publishing requires a latest saved version and a clean artifact.
- Editing, undo/redo, and theme changes mark the artifact dirty but do not create a second confirmation state.
- Legacy review metadata and endpoints may remain readable for migration compatibility, but V5.2 UI, finalize, and publish authorization do not depend on them.

## Instrumentation Contract

- Preserve Huashu element order, classes, geometry, content, and runtime behavior.
- Keep explicit `content-bindings.json` identities authoritative.
- For each block binding, add deterministic `data-edit-id` attributes to eligible visible text descendants that lack an explicit identity.
- Add deterministic `data-image-id` attributes to descendant images that lack an explicit identity.
- Chart editing is enabled only when a serializable chart payload is linked by `data-chart-data-for`.
- Validation rejects a V5 artifact whose declared editable control cannot be resolved to an executable patch target.

## Compatibility

V4 model-backed projects continue using revisioned model operations. Existing V5.1 projects can be re-instrumented or migrated without redesigning their Huashu package.

## Verification

- Unit tests cover instrumentation identities and HTML patch routing.
- Server tests cover saving and publishing without review confirmation.
- Browser tests click real toolbar and contextual controls against a V5 fixture with empty `report-model.nodes`.
- The AI server report verifies text editing, block operations, undo/redo, theme switching, version saving, history, and publication gating.


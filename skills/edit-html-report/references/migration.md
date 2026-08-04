# V4.x Compatibility in V5

V4.x saved HTML, immutable versions, editor drafts, restore history, publications, and packaged artifacts remain readable through the existing runtime. They are not rewritten or recolored.

V4.x projects must not regenerate through the V5 production chain and must not be implicitly migrated. To regenerate a report, create a new V5 project from the original source file. The old project remains an independent historical record.

`editor open` routes by project schema: V4.x uses the existing artifact/runtime, while V5 opens the instrumented artifact. Opening, editing, restoring, or publishing a V4.x artifact never creates a V5 Source Pack or candidate.

Legacy design packages, production report models, presentation plans, component primitives, and fixed Renderer inputs cannot enter a V5 project. V5's minimal schema-v4 report model exists solely so the frozen editor can maintain its existing HTML patch behavior.

# Migration

## V4.1.1 to V4.2

Run `edit-html-report migrate <project> --dry-run` first. The real migration creates a sibling `*-v4-1-1-<timestamp>.zip` backup and promotes a validated staging copy atomically.

The migration updates active project and variant `packageVersion` / `pipelineVersion` to `4.2.0`, records `awaiting-editor-review`, and applies the explicit `research-cobalt → precision-blueprint` theme migration. It does not rewrite saved-version HTML, publication files, version metadata, or historical theme IDs.

V4.1.1 weak design packages remain on disk for audit but cannot render after migration. Generate and confirm a schema-v2 executable candidate before rerendering. There is no fixed-template compatibility fallback.

## V3 to V4.2

Run `edit-html-report migrate <project> --dry-run` first. Real migration creates a sibling timestamped ZIP before changing project state.

Migration must preserve all existing version artifacts, assets, version metadata, and publication files. Rebuild `source-model` from the original source when available; otherwise create a `legacy-import` boundary from V3 analysis and warn about completeness. Import safely recognizable sections, text, images, tables, and charts. Store unstructured custom HTML as read-only `legacyHtml`; never discard it.

Record every theme mapping and degradation in `migration-log.json`. Old compiled CSS remains unchanged. `.runtime`, temporary files, and migration staging directories are excluded from packages; immutable versions, project editor launchers/runtime, and canonical publications are included.

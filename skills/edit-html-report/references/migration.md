# Migration

## V4.1.1 / V4.2 to V4.3

Run `edit-html-report migrate <project> --dry-run` first. The real migration creates a sibling `*-v4-1-1-<timestamp>.zip` backup and promotes a validated staging copy atomically.

Migration updates active project and variant `packageVersion` / `pipelineVersion` to `4.3.0`, records that a complete strategy must be regenerated, and applies only explicit legacy theme mappings. It does not rewrite saved HTML, publications, version metadata, or historical theme IDs.

Old weak or V4.2 direction-only packages remain for audit but cannot render after migration. Produce and confirm schema-v3 editorial and complete strategy payloads. There is no fixed-template fallback.

## V3 to V4.3

Run `edit-html-report migrate <project> --dry-run` first. Real migration creates a sibling timestamped ZIP before changing project state.

Migration must preserve all existing version artifacts, assets, version metadata, and publication files. Rebuild `source-model` from the original source when available; otherwise create a `legacy-import` boundary from V3 analysis and warn about completeness. Import safely recognizable sections, text, images, tables, and charts. Store unstructured custom HTML as read-only `legacyHtml`; never discard it.

Record every theme mapping and degradation in `migration-log.json`. Old compiled CSS remains unchanged. `.runtime`, temporary files, and migration staging directories are excluded from packages; immutable versions, project editor launchers/runtime, and canonical publications are included.

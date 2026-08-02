# V3 Migration

Run `edit-html-report migrate <project> --dry-run` first. Real migration creates a sibling timestamped ZIP before changing project state.

Migration must preserve all existing version artifacts, assets, version metadata, and publication files. Rebuild `source-model` from the original source when available; otherwise create a `legacy-import` boundary from V3 analysis and warn about completeness. Import safely recognizable sections, text, images, tables, and charts. Store unstructured custom HTML as read-only `legacyHtml`; never discard it.

Record every theme mapping and degradation in `migration-log.json`. Old compiled CSS remains unchanged. `.runtime`, temporary files, and migration staging directories are excluded from packages; immutable versions, project editor launchers/runtime, and canonical publications are included.

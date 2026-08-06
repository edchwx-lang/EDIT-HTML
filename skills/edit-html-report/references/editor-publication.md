# Editor, Versions, and Publications

V5.2.3 edits the instrumented Huashu artifact directly. V4 model-backed projects keep their revisioned model path.

## Conversation handoff

`edit-html-report editor open <project> --variant <id>` returns `handoff.editorUrl`, an authenticated loopback URL, and `handoff.launcherPath`, an absolute local launcher. The Agent must expose both as clickable links in the conversation and identify the visible editor as the primary next step. Never finish a website-generation turn with only an `artifact.html` link.

## Persistent editor

Use `edit-html-report editor open <project> --variant <id>`. It reuses a healthy loopback session and replaces stale metadata automatically. Saving, publishing, or closing the browser does not stop the server. Reopen with `打开编辑器.cmd` on Windows or `open-editor.sh` elsewhere. Use `editor status` and `editor stop` for diagnostics and control.

The editor has view and edit states. `编辑` changes to `完成`; `完成` exits edit state only. Select a report region to reveal executable contextual actions. V5 text, block, image, and serializable-chart changes use HTML patches; V4 report nodes use model patches. Chart values use the table editor, never raw JSON. A chart without `data-chart-data-for` does not expose a misleading edit action.

Ordinary V5 edits and palette changes update the live iframe document in place. Required reloads for undo, restore, or rollback must preserve viewport and selected context instead of returning to the cover. Do not expose a Redo toolbar button.

There is no separate design/theme confirmation control. `保存版本` is available when the editor loads. Editing, theme changes, undo/redo, or rerendering makes the artifact dirty; saving creates a new immutable version and clears dirty state.

Draft operations are revisioned structured patches. A stale `baseRevision` receives 409. Undo/redo persists across browser reopen. Replaced assets are copied or embedded into project-owned data.

## Versions

`保存版本` creates an immutable checkpoint with parent version, theme, message, report revision when applicable, model snapshots when applicable, override audit, and compiled artifact. Historical restore always creates a new descendant version.

For V5, the compatibility report model is not a production source. The editor uses the existing HTML patch path, and version records preserve the instrumented artifact and user overrides.

## Publications

Publication is disabled while dirty or when no saved version exists. There is no separate publication-history toolbar action. The Publish button opens a saved-version-centered publish panel; unsaved drafts never appear there. Each saved version exposes exactly these primary actions: local publish, domain publish, reveal local publication in the file manager, and delete saved version file. Publication records are shown under their source saved version.

Saving creates an immutable internal version under `versions/<version-id>/artifact.html`; it is not a user-facing export. Local user-facing HTML export is created by local publish, and only then may the file-manager action reveal that local publication. Domain publish uses provider deployment targets including Vercel and Netlify when their CLI credentials are available. Custom domains are configured through the selected deployment provider, not by direct DNS mutation inside Edit HTML Report.

Each local or provider publication first creates:

- `publications/<publication-id>/report.html`;
- `publications/<publication-id>/publication.json`.

Append publication and deployment history; never overwrite the last provider record. Record the saved version, theme, SHA-256, local path or URL, provider, deployment ID, status, and time. The canonical copy remains recoverable if an export or deployment disappears.

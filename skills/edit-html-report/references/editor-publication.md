# Editor, Versions, and Publications

## Persistent editor

Use `edit-html-report editor open <project> --variant <id>`. It reuses a healthy loopback session and replaces stale metadata automatically. Saving, publishing, or closing the browser does not stop the server. Reopen with `打开编辑器.cmd` on Windows or `open-editor.sh` elsewhere. Use `editor status` and `editor stop` for diagnostics/control.

The editor has view/edit states. “编辑” changes to “完成”; “完成” exits edit state only. Select a report region to reveal its contextual actions. Chart values use inline labels or the table editor, never raw JSON.

Draft operations are revisioned structured patches. A stale `baseRevision` must receive 409. Undo/redo persists across browser reopen. Replaced assets are copied/embedded into project-owned data.

## Versions

Draft changes update `report-model.json`. “保存版本” creates an immutable checkpoint with parent version, theme, message, report revision, model snapshots, override audit, and compiled artifact. Historical restore always creates a new descendant version.

## Publications

Disable publication while dirty. Each local/public publication first creates:

- `publications/<publication-id>/report.html`;
- `publications/<publication-id>/publication.json`.

Append publication/deployment history; never overwrite the last provider record. Record saved version, mode, theme, SHA-256, local path or URL, provider, deployment ID, status, and time. The canonical copy remains recoverable if an export or deployment disappears.

# Editor, Versions, and Publications

This subsystem is frozen at the V4.3 behavior. V5 changes only how `artifact.html` is produced.

## Persistent editor

Use `edit-html-report editor open <project> --variant <id>`. It reuses a healthy loopback session and replaces stale metadata automatically. Saving, publishing, or closing the browser does not stop the server. Reopen with `打开编辑器.cmd` on Windows or `open-editor.sh` elsewhere. Use `editor status` and `editor stop` for diagnostics and control.

The editor has view and edit states. “编辑” changes to “完成”; “完成” exits edit state only. Select a report region to reveal its contextual actions. Chart values use inline labels or the table editor, never raw JSON.

After every render, the variant is `awaiting-editor-review`. The user must inspect the visible canvas and click “确认设计与配色”. The confirmation binds the current artifact SHA-256, design package SHA-256, theme ID, time, and editor session ID. An Agent must not call the confirmation API in place of the user.

Changing theme, text, data, assets, block order, undo/redo state, or rerendering invalidates confirmation. “保存版本” remains disabled and `finalize` fails until the user confirms again.

Draft operations are revisioned structured patches. A stale `baseRevision` receives 409. Undo/redo persists across browser reopen. Replaced assets are copied or embedded into project-owned data.

## Versions

After visible review confirmation, “保存版本” creates an immutable checkpoint with parent version, theme, message, report revision, model snapshots, override audit, review record, and compiled artifact. Historical restore always creates a new descendant version.

For V5, the compatibility report model is not a production source. The editor uses the existing HTML patch path, and version records preserve the instrumented artifact and user overrides.

## Publications

Publication is disabled while dirty or unconfirmed. Each local or provider publication first creates:

- `publications/<publication-id>/report.html`;
- `publications/<publication-id>/publication.json`.

Append publication and deployment history; never overwrite the last provider record. Record the saved version, theme, SHA-256, local path or URL, provider, deployment ID, status, and time. The canonical copy remains recoverable if an export or deployment disappears.

# EDIT-HTML

[English](README.md) | [中文](README.zh-CN.md)

EDIT-HTML turns research material into a Huashu-designed, source-closed, editable HTML report.

It is built for local agents that need to convert DOCX, PDF, PPTX, Markdown, HTML, or TXT into a polished web report without losing provenance, design control, editability, version history, or publication output.

## Why this skill exists

Most document-to-web workflows fail in one of two ways:

- they preserve facts but produce generic model-designed pages;
- or they produce attractive pages while losing source traceability and edit/publish safety.

EDIT-HTML separates those responsibilities:

- Huashu owns the actual design: narrative structure, layout, DOM, CSS, interaction, visualization, responsive behavior, and design taste.
- EDIT-HTML owns extraction, receipts, provenance, audit gates, instrumentation, editor runtime, immutable versions, and publication.

The result is a report that can be inspected, edited, saved, restored, and published after generation.

## Main workflow

```mermaid
flowchart TD
  A["Source file<br/>DOCX / PDF / PPTX / MD / HTML / TXT"] --> B["Source Pack<br/>facts, assets, source map, warnings"]
  B --> C["Content interview<br/>purpose + content weight + necessary material clarification"]
  C --> D["Huashu visual asset assessment<br/>autonomous design evidence"]
  D --> E["Three isolated candidates<br/>systematic / benchmark / authorial"]
  E --> F["Candidate preflight<br/>read-only; errors block"]
  F --> G["User sees screenshots<br/>selects A / B / C"]
  G --> H["Huashu final site<br/>complete HTML website"]
  H --> I["Final preflight<br/>static + real browser interaction"]
  I --> J["One attestation and import pass"]
  J --> K["Existing audit + instrumentation<br/>V5.4.0 artifact contract"]
  K --> L["V5.4.0 visible editor<br/>edit, save, publish"]
```

The important rule is simple: Huashu designs the website; EDIT-HTML verifies and instruments it without redesigning it.

## What makes EDIT-HTML different

### Huashu-first design gate

The workflow does not let the model silently invent the final report layout. Huashu must be invoked before candidate generation and again before final site generation. Candidate and final packages require execution receipts tied to the Huashu skill hash, input receipt, challenge, and output hash.

### Source-closed reporting

Every substantive visible claim is bound back to the Source Pack. Titles, grouping, hierarchy, compression, and explanation may change, but facts, numbers, units, time ranges, qualifications, and relationships may not.

### Explicit image judgment

Source images are not copied blindly or judged by filename/caption alone. Huashu visually inspects every image and records its visible subject, content role, information-loss risk, value, treatment, and independent rationale in `huashu-design-evidence.json`. High-value evidence is used or source-bound as a redraw; all-low or no-image outcomes warn without replacing Huashu's design judgment.

### Editable HTML output

The final artifact is not a static screenshot. The editor exposes scoped actions for:

- text editing;
- block movement, duplication, and deletion;
- image replacement;
- serializable chart data editing.

Palette changes update the current iframe in place, and the instrumenter preserves Huashu's DOM hierarchy, geometry, typography, charts, and interactions.

### Versioning and publishing

Saving creates immutable internal versions. Publishing works from saved versions only and produces recoverable publication records:

- local publish creates `publications/<publication-id>/report.html`;
- domain publish can use deployment providers when credentials are available;
- the editor can reveal the local publication folder directly.

### Preflight before immutable receipts

Candidate and final preflight are read-only and create no receipt or frozen output. Errors return a failing exit code; aesthetic warnings remain non-blocking. Attestation re-runs the matching check, so factual, asset, selector, interaction, overflow, and offline-safety defects are repaired before the immutable receipt exists.

### Agent and OS compatibility

V5.4.1 keeps the V5.4.0 artifact/editor contract while upgrading the tool and design pipeline. An agent must be able to run local shell commands, preserve receipt files, read/write the project, access the real `huashu-design/SKILL.md`, and report or open the authenticated editor URL.

## Install

```powershell
npm install
npm run install:local
```

The npm package and CLI remain `edit-html-report` for compatibility. The Codex skill name is `EDIT-HTML`.

## Basic usage

```powershell
edit-html-report doctor
edit-html-report create "input.docx" --out "my-report"
edit-html-report variant create "my-report"
```

Then follow the V5.4.1 flow:

1. inspect the Source Pack and extraction warnings;
2. record the content interview;
3. prepare the Huashu design input;
4. generate three executable candidates plus Huashu design evidence;
5. run candidate preflight, attest/import once, then show one screenshot per candidate;
6. wait for the user's A/B/C selection;
7. generate the final Huashu site, run final preflight, then attest/import once;
8. verify, render, validate, and open the unchanged V5.4.0 editor;
9. save a version and publish when ready.

## Useful commands

```powershell
edit-html-report design preflight candidate "my-report" --variant "<variant-id>" --from "candidate-set"
edit-html-report design candidate review prepare "my-report" --variant "<variant-id>"
edit-html-report design candidate confirm "my-report" --variant "<variant-id>" --candidate "<candidate-id>" --receipt "selection-receipt.json"
edit-html-report design preflight final "my-report" --variant "<variant-id>" --from "final-site"
edit-html-report design final verify "my-report" --variant "<variant-id>"
edit-html-report render "my-report" --variant "<variant-id>"
edit-html-report validate "my-report" --variant "<variant-id>"
edit-html-report editor open "my-report" --variant "<variant-id>"
```

## Validation

```powershell
npm run check
npm test
npm run test:e2e
npm pack --dry-run
```

## Six switchable palettes

The editor ships with six accessible report palettes. The previews below use the same report structure with different theme tokens.

<table>
  <tr>
    <td width="50%"><img src="docs/readme/palettes/warm-paper-terracotta.png" alt="Warm Paper Terracotta theme preview"><br><sub>Warm Paper Terracotta</sub></td>
    <td width="50%"><img src="docs/readme/palettes/precision-blueprint.png" alt="Precision Blueprint theme preview"><br><sub>Precision Blueprint</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/readme/palettes/sandstone-archive.png" alt="Sandstone Archive theme preview"><br><sub>Sandstone Archive</sub></td>
    <td width="50%"><img src="docs/readme/palettes/deep-data-blue.png" alt="Deep Data Blue theme preview"><br><sub>Deep Data Blue</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/readme/palettes/institutional-navy-gold.png" alt="Institutional Navy Gold theme preview"><br><sub>Institutional Navy Gold</sub></td>
    <td width="50%"><img src="docs/readme/palettes/signal-orange.png" alt="Signal Orange theme preview"><br><sub>Signal Orange</sub></td>
  </tr>
</table>

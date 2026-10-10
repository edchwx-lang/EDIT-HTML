# V5.4.1 Huashu Content Interview and Sample Selection

## Content interview before design

Huashu first reads and summarizes the Source Pack. The interview has two required content decisions and at most one optional clarification:

| Field | Rule |
|---|---|
| `purpose` | Required: website purpose, occasion, and target reader |
| `contentWeight` | Required: source sections or entities that deserve greater depth |
| `contentClarification` | Optional: only a Source Pack ambiguity, conflict, omission risk, time range, terminology, or comparative-focus question |

Every response stores the actual question, original answer, timestamp, and `user-provided` or `user-delegated` origin. V5.2.1 also requires `decisionEvidence`: evidence type, verbatim user quote, timestamp, and covered topics. `user-delegated` is valid only when the quote explicitly says the agent should decide. A clarification also stores a reason code, rationale, and valid Source Pack references. No interview question may ask the user to choose structure, page order, layout, components, chart form, interaction, theme, color, font, or visual style. If the material does not require clarification, the interview ends after two questions.

Answers already supplied in the request are recorded without repeating the question. Visual references are separate design evidence and never add report facts. V5.4.1 still produces all three isolated candidates when an initial website, screenshot, or design system is present; the reference informs Huashu's autonomous judgment without replacing the user's later screenshot-based A/B/C choice. Persisted legacy projects retain their earlier reference-guided one-sample branch.

## Executable sample comparison

All candidates share the same material-driven content plan. Each is real executable HTML limited to one first viewport, one representative focus module, and one real core interaction. It need not contain every source facet, mobile implementation, or full-page final content before selection. Samples use `precision-blueprint`, `warm-paper-terracotta`, and `sandstone-archive` for comfortable comparison, but the choice is about narrative and experience architecture, not palette.

Three samples use the isolated `systematic-analysis`, `real-world-benchmark`, and `authorial` strategies. They must differ materially in narrative architecture, DOM structure, visualization strategy, and core interaction; color-only or shared-template variants fail. Huashu decides every design question autonomously. The user sees rendered screenshots and selects A/B/C, but is never asked position, layout, style, typography, image-use, interaction, design-system, or Junior-pass questions.

Before candidate generation, `design huashu begin` binds the exact Huashu Skill and immutable input receipt to a one-time challenge. Each candidate includes `huashu-design-evidence.json`. Run `design preflight candidate` once on the three-candidate directory before any `design huashu attest`; the check is read-only, returns all diagnostics, and blocks only on errors. After attestation and candidate import, run `design candidate review prepare`. It exposes one actual `1440x900` screenshot per candidate. Confirmation is blocked until the review set hash and screenshots have been shown and the user replies with a choice.

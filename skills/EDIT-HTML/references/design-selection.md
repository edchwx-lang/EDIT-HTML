# V5.4.0 Huashu Content Interview and Sample Selection

## Content interview before design

Huashu first reads and summarizes the Source Pack. The interview has two required content decisions and at most one optional clarification:

| Field | Rule |
|---|---|
| `purpose` | Required: website purpose, occasion, and target reader |
| `contentWeight` | Required: source sections or entities that deserve greater depth |
| `contentClarification` | Optional: only a Source Pack ambiguity, conflict, omission risk, time range, terminology, or comparative-focus question |

Every response stores the actual question, original answer, timestamp, and `user-provided` or `user-delegated` origin. V5.2.1 also requires `decisionEvidence`: evidence type, verbatim user quote, timestamp, and covered topics. `user-delegated` is valid only when the quote explicitly says the agent should decide. A clarification also stores a reason code, rationale, and valid Source Pack references. No interview question may ask the user to choose structure, page order, layout, components, chart form, interaction, theme, color, font, or visual style. If the material does not require clarification, the interview ends after two questions.

Answers already supplied in the request are recorded without repeating the question. Visual references are separate. Only references present before candidate generation select the branch: no initial reference produces three samples; an initial website, screenshot, or design system produces one.

## Executable sample comparison

All candidates share the same material-driven content plan. Each is real executable HTML limited to one first viewport, one representative focus module, and one real core interaction. It need not contain every source facet, mobile implementation, or full-page final content before selection. Samples use `precision-blueprint`, `warm-paper-terracotta`, and `sandstone-archive` for comfortable comparison, but the choice is about narrative and experience architecture, not palette.

Three samples must differ materially in narrative architecture, DOM structure, visualization strategy, and core interaction; color-only or shared-template variants fail. Each V5.3 candidate includes matching `sampleScope.firstViewportSelector`, `focusModuleSelector`, and `coreInteractionSelector` in its manifest and design process.

Before candidate generation, `design huashu begin` binds the exact Huashu Skill and immutable input receipt to a one-time challenge. Every candidate is sealed with `design huashu attest`; `owner` metadata without this receipt is rejected. After candidate import, run `design candidate review prepare`. It exposes candidates in the fixed order `precision-blueprint`, `warm-paper-terracotta`, `sandstone-archive`, with one absolute `1440x900` desktop screenshot path and one-sentence narrative, visualization, and interaction summaries. Capture uses `fullPage: false`, and its pixels must contain the declared theme canvas and accent colors. Confirmation is blocked until the review set hash and actual screenshots have been shown and the user replies with a choice.

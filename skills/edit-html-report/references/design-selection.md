# V5.2.1 Huashu Content Interview and Sample Selection

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

All candidates share the same material-driven content plan. Each is a real, content-complete vertical slice containing the overall situation, one representative focus entity, and its necessary facets. Samples use `precision-blueprint`, `warm-paper-terracotta`, and `sandstone-archive` for comfortable comparison, but the choice is about narrative and experience architecture, not palette.

Three samples must differ materially in information hierarchy, content composition, navigation, DOM structure, visualization strategy, and core interaction. Screenshots are captured from each actual candidate HTML. Each V5.2.1 candidate includes `design-process.json` so the audit can verify narrative architecture, meaningful overview/focus visualizations, and a real core interaction selector.

After candidate import, run `design candidate review prepare`. Confirmation is blocked until the review set hash has been shown with actual desktop and mobile screenshots and the user replies with a choice. `design candidate confirm` requires a selection receipt containing `reviewSetSha256`, `candidateId`, `selectedBy: "user"`, the verbatim selection, and time. Confirmation freezes the selected candidate hash and content-plan hash. Huashu expands that parent into the final site. The final site must include the overview and every focus entity and facet declared by the shared content plan; emphasis changes depth, never silently deletes the rest of the report.

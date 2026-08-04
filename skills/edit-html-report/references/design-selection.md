# V5 Huashu Interview and Sample Selection

## Interview before design

Huashu first reads and summarizes the Source Pack, then resolves three decisions with the user:

| Field | Decision |
|---|---|
| `purpose` | Website purpose and target reader |
| `contentWeight` | Material sections that deserve priority |
| `structurePreference` | Reading sequence and interaction experience |

Each response records the actual question, original answer, timestamp, and origin. Origin is `user-provided` when explicit, or `user-delegated` when the user asks Huashu to decide. Delegation requires a material-driven decision in the interview record; it is not permission to use a fixed template.

An answer already supplied in the initial request is recorded without asking again. Design preparation is blocked while any item is unresolved.

Visual references are separate from content answers. Only references present before the first candidate is generated determine the branch:

- no initial visual reference: three executable samples;
- initial website, screenshot, or design system: one executable sample.

Adding a reference after generation invalidates the old candidates.

## Three-sample comparison

All samples use real source content. By position they use `precision-blueprint`, `warm-paper-terracotta`, and `sandstone-archive` so the comparison is visually comfortable. The choice is about narrative and experience architecture, not palette.

The three samples must differ materially in information hierarchy, content composition, navigation, DOM structure, visualization strategy, and core interaction. Different colors, fonts, radii, or card skins do not establish different candidates.

Screenshots are evidence, not mockups: desktop and mobile images must be captured from each candidate's actual `index.html`.

Confirmation freezes the selected candidate hash and direction. Huashu expands that exact candidate as its parent; another renderer must not reinterpret it.

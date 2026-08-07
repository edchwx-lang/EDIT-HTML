# Edit HTML Report V5.3.1 Patch Plan

## Goal

Patch only the Huashu design handoff and pre-instrumentation quality gates. Preserve the V5.3 editor runtime, Instrumenter behavior, editor UI, version storage, and publication flow byte-for-byte.

## Changes

1. Require a dedicated Huashu invocation and execution receipt for candidate and final imports. The receipt binds the immutable design input, exact `huashu-design` Skill hash, one-time challenge, candidate identity, and executable output hash. `owner: huashu-design` metadata alone no longer passes.
2. Keep candidate review order fixed as `precision-blueprint`, `warm-paper-terracotta`, `sandstone-archive` instead of filesystem name order.
3. Require a standalone preview-theme declaration and verify that the candidate screenshot contains the declared canvas and accent colors.
4. Reject source coverage bindings whose `data-content-id` is hidden or under a hidden ancestor.
5. Require decodable desktop and mobile full-page screenshots in the final Huashu package, without changing the later editor handoff.
6. Release tool, pipeline, and artifact contract as 5.3.1 while retaining editor runtime 5.3.0 and V5.3.0 project compatibility.

## Speed budget

No extra model pass, subagent, or duplicate site generation. The new receipt and visibility checks are local hashing/parsing operations. The only browser work added is two final full-page screenshots after selection.

## Verification

- Focused design/attestation/quality-gate tests.
- Full Node test suite and Playwright suite.
- Editor boundary lock must pass; no editor/runtime/publication source file may change except the version manifest entry needed to distinguish pipeline 5.3.1 from editor runtime 5.3.0.

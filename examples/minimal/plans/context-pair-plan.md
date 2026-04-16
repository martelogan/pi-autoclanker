# Context Pair Plan

Preserve neighboring alarm context while reducing repeated parser rescans.

## Hypothesis

Pair adjacent alarm lines into a lightweight context window before widening
capture ranges.

## Expected upside

- fewer repeated matcher passes on common incident formats
- better context retention for follow-on extraction

## Risks

- extra overhead on short traces
- accidental pairing of unrelated lines

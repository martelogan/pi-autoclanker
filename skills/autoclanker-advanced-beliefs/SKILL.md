---
name: autoclanker-advanced-beliefs
description: Turn rough optimization ideas into compact advanced JSON Bayes declarations for autoclanker, including risks, relations, and explicit advanced prior geometry when needed.
---

# Autoclanker Advanced Beliefs

Use this skill when the beginner rough-ideas path is no longer enough and the
user needs a compact advanced JSON belief batch.

## Workflow

1. Inspect the current session state first:

- `autoclanker.beliefs.json`
- `autoclanker.md`, especially the current `Prior Brief` and `Proposal Brief`
- the latest preview or canonicalization output
- `autoclanker.frontier.json` when it exists
- the current summary / status if the session is already active

2. Treat this as a bounded structured-elicitation pass, not an interrogation.

- Start with up to 3 clarification questions per round.
- Ask no questions if the current preview already captures the useful structure.
- Only continue into another round when the user opts in or when unresolved
  structure would materially change the next preview or frontier seed.
- If the user does not want to elaborate further, stop cleanly and keep the
  unresolved structure as `proposal` or metadata-only beliefs.

3. Ask in this order when clarification is actually needed:

- Which pathway or idea looks strongest vs second-best?
- Which ideas combine well, depend on each other, or should stay separate?
- What risk or failure mode would make a path unacceptable, and what evidence
  would change your mind?

4. Never ask for Bayes parameter values, graph math, numeric prior scales, or
posterior internals.

That means never asking for:

- Bayes parameter values
- graph math
- numeric prior scales
- posterior internals

5. Prefer a compact JSON batch that can be fed directly back into
`autoclanker`.

Map answers into the smallest advanced structure that honestly captures them:

- directional per-path claims -> `idea`
- synergy, conflict, dependency, or separation -> `relation` or
  `graph_directive`
- stronger comparative knowledge that exceeds the beginner lane ->
  `expert_prior`

6. Keep the result inspectable and previewable. Do not bypass `autoclanker`
preview or apply steps.

When explaining why more structure would help, tie it back to the current
briefs:

- `Prior Brief`: what we currently think
- `Proposal Brief`: what is blocked or still too vague to approve

7. Only drive the billed provider-backed advanced path when `allowBilledLive`
is explicitly enabled. Otherwise keep the session on the non-billed path rather
than pretending advanced JSON is available.

8. When a user is comparing multiple candidate pathways, prefer explicit
graph-directed or prior-based structure over vague prose so later `suggest`
calls can compare or connect those pathways honestly.

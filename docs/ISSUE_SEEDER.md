# Issue Seeder

An issue seeder is a static, no-secret helper for turning benchmark evidence and
rough optimization ideas into ready-to-run GitHub issues. It should manage a
small local catalog of seeds and produce copyable issue text plus project-local
artifacts that `pi-autoclanker`, headless supervisors, and other harnesses can
use without bespoke instructions.

The seeder should not be an optimizer, benchmark runner, or GitHub credential
holder. Its job is to package the starting contract clearly enough that a user
can attach a label, copy the generated issue body, upload or reference artifacts,
export/import the seed catalog, and start a run from the issue without stale
hidden context.

## Inputs

A useful issue seed can be built from:

- target repository and issue title
- short goal
- rough ideas or candidate lanes
- constraints and rollback/resiliency notes
- benchmark snapshot or corpus artifact references
- clankergraph evidence artifacts
- `autoclanker.ideas.json`
- optional `clankerbench.manifest.json`
- optional `run-contract.json`
- optional `lane-ledger.md`
- optional local seed command
- optional Pi prompt and headless command

Artifact references should be stable URLs, immutable object keys, or checked-in
paths. Avoid putting sensitive request payloads, credentials, customer data, or
private benchmark rows directly in the issue body.

## Generated Issue Shape

The generated issue should start with a concise "Start Here" contract:

```markdown
## Start Here

This issue seeds a long-running optimization exploration for `<goal>`.
Use the artifact references and run contract below as the current source of
truth. Start or resume the workspace, execute the returned autoclanker handoff
prompt, compare multiple lanes when practical, and post draft proposals or
blockers as they become independently reviewable.
```

Then include expandable sections in this order:

- `Local Pi Kickoff`: a prompt that tells Pi to run `/autoclanker run
  --overnight`, read the returned `handoffPrompt`, and execute it.
- `Headless CLI Kickoff`: a command that writes `autoclanker.run.json`, plus a
  reminder to execute its `handoffPrompt`.
- `Seed Artifacts`: artifact names, URLs, digests, and expected local paths.
- `Run Contract`: acceptance gates, fixed eval surface, promotion rules, and
  stopping conditions.
- `Lane Ledger`: seeded lanes with `active`, `merged`, `rejected`, `split`, or
  `blocked` status.
- `Evidence Inputs`: benchmark snapshots, clankergraph files, prior art,
  papers, docs, or operator notes that should inform candidate search.

## Artifact Bundle

The minimum portable bundle is:

```text
autoclanker.ideas.json
run-contract.json
lane-ledger.md
```

Add `clankerbench.manifest.json` when a benchmark provider can declare
bootstrap, context, eval, compare, package, or hydrate stages. Add clankergraph
files when graph-structured evidence should influence candidate search.

## Harness Contract

Every generated prompt should make these points explicit:

- setup commands prepare or resume the workspace
- the agent must execute the returned `handoffPrompt`
- the eval surface stays fixed during execution
- multi-lane evals require explicit candidate identity
- evidence artifacts are exploratory input signals, not proof by themselves
- one small local optimum is not enough to stop when other seeded lanes remain
  plausible and runnable
- proposals, blockers, and lane decisions should be written back before exit

## Static Site Example

`examples/issue-seeder/index.html` is a dependency-free static local-first
manager. It does not call GitHub. It stores seeds in browser local storage,
supports JSON import/export, and converts each seed into:

- issue body markdown
- `autoclanker.ideas.json`
- artifact manifest JSON
- `run-contract.json`
- `lane-ledger.md`
- Pi kickoff prompt
- headless CLI command

Deploy the HTML file anywhere that can host static assets, or open it locally in
a browser.

## Optional Backend Adapters

The default should remain static and local-first. If a deployment later needs
shared state or artifact upload, add a narrow adapter behind the same seed JSON
contract rather than making the static site depend on a specific hosted service.
A backend adapter can provide:

- shared seed catalog storage
- artifact upload and immutable URLs
- GitHub issue creation through an operator-provided token
- background artifact validation or summarization
- agent kickoff webhooks

Keep those capabilities optional so the static site remains deployable on any
plain file host.

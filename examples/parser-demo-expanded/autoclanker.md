# pi-autoclanker session

## At a glance
- session: `parser_demo`
- era: `era_parser_demo_v1`
- ideas mode: `canonicalize`
- apply state: `previewed`
- last completed step: `proposal status updated`
- eval surface lock: `true`
- proposal ledger: `present`
- local ideas file: `present`
- local frontier file: `present`
- compared lanes: `4`
- frontier families: `4`
- top candidate: `cand_parser_context_pair`
- follow-up query: Do compiled matching and context pairing belong together, or should they be evaluated independently first?
- objective backend: `exact_joint_linear`
- acquisition backend: `constrained_thompson_sampling`

## Run Signals
- next action: Compare context-pair planning against compiled matching before approval
- latest fit: Fit complete on the parser frontier
- latest eval: Benchmarked compiled matching, context pairing, and wide-window variants
- latest commit recommendation: Hold commit until the context-pair vs compiled-only comparison is answered
- upstream session root: `.autoclanker`
- upstream session id: `parser_demo`
- upstream preview digest: `digest-parser-demo`
- eval surface sha256: `sha256:894e0df482355e75b174d5c9f99dbf330b3f26a9c369e1f30876c146876ef774`
- eval surface lock valid: true

## Prior Brief
Goal: Improve parser throughput without trading away alarm context. 3 rough idea(s) became 2 canonical belief(s). 4 explicit lane(s) are under comparison.
- Rough ideas: Compiled regex matching probably helps repeated incident formats. | Keeping breadcrumbs beside each alarm likely pairs well with context extraction. | Wide capture windows may blow memory on long traces.
- Constraints: Keep incident recall stable. | Retain a reproducible eval command.
- Frontier families: 4; compared lanes: 4.

## Run Brief
Leader lane: cand_parser_context_pair. Runner-up: cand_parser_compiled_matcher. Next comparison: cand_parser_context_pair vs cand_parser_compiled_matcher.
- Trust: locked; eval surface lock matches.
- Pending queries: 1; pending merges: 1.
- Query focus: pairwise_preference on cand_parser_context_pair vs cand_parser_compiled_matcher.
- Backends: exact_joint_linear / constrained_thompson_sampling.

## Posterior Brief
1 belief(s) strengthened. 1 belief(s) weakened. 1 uncertainty focus item(s) remain.
- Strengthened: Breadcrumb-aware context pairing gained support after the latest parser evals.
- Weakened: Wide capture windows remain a memory risk under long traces.
- Promoted lanes: cand_parser_context_pair
- Dropped families: family_memory_risk

## Proposal Brief
Current proposal proposal_cand_parser_context_pair is recommended from lane cand_parser_context_pair.
- Evidence: Context-pair planning currently leads the frontier while preserving breadcrumb quality under the locked eval surface.
- Unresolved risks: Need one more long-trace memory check before approval.
- Alternates: proposal_cand_parser_compiled_matcher (candidate) | proposal_cand_parser_wide_window (blocked)
- Resume token: autoclanker.frontier.json

## Evidence Views
- Run Summary: `.autoclanker/parser_demo/RESULTS.md` (present)
- Prior Graph: `.autoclanker/parser_demo/belief_graph_prior.png` (present)
- Posterior Graph: `.autoclanker/parser_demo/belief_graph_posterior.png` (present)
- Candidate Rankings: `.autoclanker/parser_demo/candidate_rankings.png` (present)
- Convergence: `.autoclanker/parser_demo/convergence.png` (present)

## Lineage
- initial ideas
- canonical beliefs
- seeded or derived lanes
- eval evidence
- lane decision
- proposal recommendation

## Trust
- drift status: `locked`
- locked eval contract digest: `sha256:contract-locked`
- current eval contract digest: `sha256:contract-locked`
- eval contract matches current: true
- The belief graphs are evidence views over relations between settings and typed beliefs; they are not the frontier itself.
- The lane table is the frontier under comparison. Use it to understand what is being promoted, queried, merged, or dropped.

## Run Files
- `autoclanker.md`: durable human brief
- `autoclanker.ideas.json`: optional intake file
- `autoclanker.frontier.json`: optional explicit frontier lanes
- `autoclanker.proposals.json`: durable active-session proposal mirror
- `autoclanker.history.jsonl`: local chronological log
- source: `user-provided`
- upstream preview digest: `digest-parser-demo`
- eval command source: `user-provided`

## Constraints
- Keep incident recall stable.
- Retain a reproducible eval command.

## Rough ideas
- Compiled regex matching probably helps repeated incident formats.
- Keeping breadcrumbs beside each alarm likely pairs well with context extraction.
- Wide capture windows may blow memory on long traces.

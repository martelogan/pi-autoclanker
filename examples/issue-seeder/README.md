# Issue Seeder Example

This directory contains a dependency-free static local-first helper for creating
and managing ready-to-run optimization issues.

Open `index.html` in a browser, fill in the generic form, then copy the
generated issue body and artifact snippets into the target repository. Seeds are
kept in browser local storage and can be imported or exported as JSON. The page
does not call GitHub, upload artifacts, or store secrets.

The generated prompts intentionally separate setup from execution:

- `/autoclanker run --overnight` prepares or resumes the workspace.
- the supervising agent must read and execute the returned `handoffPrompt`.
- long runs should compare multiple lanes when practical and leave measured
  keep/reject/blocker decisions or independently reviewable proposals.

The static app generates:

- issue body markdown
- `autoclanker.ideas.json`
- `artifact-manifest.json`
- `run-contract.json`
- `lane-ledger.md`
- Pi kickoff prompt
- headless CLI command

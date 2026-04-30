export const VERSION = "0.1.0";

export const surfaceManifest = {
  commands: [
    {
      description:
        "Start a new session or resume the existing project-local session from a direct goal or optional autoclanker.ideas.json intake file.",
      name: "start",
      slashCommand: "/autoclanker start",
    },
    {
      description: "Mark the local session active again without changing beliefs.",
      name: "resume",
      slashCommand: "/autoclanker resume",
    },
    {
      description: "Summarize current local files and upstream autoclanker status.",
      name: "status",
      slashCommand: "/autoclanker status",
    },
    {
      description: "Show the current local frontier plus upstream frontier status.",
      name: "frontier-status",
      slashCommand: "/autoclanker frontier-status",
    },
    {
      description:
        "Persist or reuse autoclanker.frontier.json and compare explicit pathways through upstream autoclanker.",
      name: "compare-frontier",
      slashCommand: "/autoclanker compare-frontier",
    },
    {
      description:
        "Merge selected pathways into autoclanker.frontier.json and re-rank them upstream.",
      name: "merge-pathways",
      slashCommand: "/autoclanker merge-pathways",
    },
    {
      description: "Disable the session without deleting the resumable files.",
      name: "off",
      slashCommand: "/autoclanker off",
    },
    {
      description: "Delete local pi-autoclanker files and the upstream session root.",
      name: "clear",
      slashCommand: "/autoclanker clear",
    },
    {
      description: "Export the current session bundle as machine-readable JSON.",
      name: "export",
      slashCommand: "/autoclanker export",
    },
  ],
  packagedSurfaceFiles: [
    "extensions/pi-autoclanker/index.ts",
    "extensions/pi-autoclanker/compaction.ts",
    "schemas/pi-autoclanker.config.schema.json",
    "schemas/pi-autoclanker.proposals.schema.json",
    "extensions/pi-autoclanker/assets/dashboard.html",
    "skills/autoclanker-create/SKILL.md",
    "skills/autoclanker-advanced-beliefs/SKILL.md",
    "skills/autoclanker-hooks/SKILL.md",
    "skills/autoclanker-hooks/examples/README.md",
    "skills/autoclanker-hooks/examples/before-eval/frontier-reminder.sh",
    "skills/autoclanker-hooks/examples/before-eval/external-context.sh",
    "skills/autoclanker-hooks/examples/before-eval/anti-thrash.sh",
    "skills/autoclanker-hooks/examples/before-eval/idea-rotator.sh",
    "skills/autoclanker-hooks/examples/after-eval/learnings-journal.sh",
    "skills/autoclanker-hooks/examples/after-eval/evidence-digest.sh",
    "skills/autoclanker-hooks/examples/after-eval/macos-notify.sh",
    "skills/autoclanker-review/SKILL.md",
    "docs/MENTAL_MODEL.md",
    "docs/assets/pi-autoclanker-mental-model.svg",
    "docs/assets/pi-autoclanker-structure.svg",
    "docs/assets/pi-autoclanker-evidence-views.svg",
    "examples/targets/parser-quickstart/README.md",
    "examples/targets/parser-quickstart/app.py",
    "examples/targets/parser-quickstart/benchmark.py",
    "examples/targets/parser-quickstart/autoclanker.eval.sh",
    "examples/targets/parser-quickstart/candidates.json",
    "examples/minimal/README.md",
    "examples/minimal/autoclanker.ideas.json",
    "examples/minimal/rough-ideas.json",
    "examples/parser-demo-expanded/README.md",
    "examples/parser-demo-expanded/candidates.json",
    "examples/parser-demo-expanded/autoclanker.ideas.json",
    "examples/parser-demo-expanded/autoclanker.beliefs.json",
    "examples/parser-demo-expanded/autoclanker.config.json",
    "examples/parser-demo-expanded/autoclanker.eval.sh",
    "examples/parser-demo-expanded/autoclanker.frontier.json",
    "examples/parser-demo-expanded/autoclanker.proposals.json",
    "examples/parser-demo-expanded/autoclanker.history.jsonl",
    "examples/parser-demo-expanded/autoclanker.md",
    "examples/parser-demo-expanded/rough-ideas.json",
    "configs/pi-autoclanker.example.json",
    "scripts/test-live.sh",
    "scripts/test-upstream-live.sh",
  ],
  sessionFiles: [
    "autoclanker.md",
    "autoclanker.config.json",
    "autoclanker.beliefs.json",
    "autoclanker.eval.sh",
    "autoclanker.frontier.json",
    "autoclanker.proposals.json",
    "autoclanker.history.jsonl",
    "autoclanker.hooks/",
  ],
  slashCommandPrefix: "/autoclanker",
  tools: [
    {
      description:
        "Bootstrap pi-autoclanker session files and upstream session state from direct prompt input or an optional autoclanker.ideas.json file.",
      name: "autoclanker_init_session",
    },
    {
      description:
        "Read resumable local state and ask autoclanker for upstream status.",
      name: "autoclanker_session_status",
    },
    {
      description:
        "Read the local frontier file and ask autoclanker for upstream frontier status.",
      name: "autoclanker_frontier_status",
    },
    {
      description:
        "Preview or canonicalize rough ideas through autoclanker before apply.",
      name: "autoclanker_preview_beliefs",
    },
    {
      description: "Apply the current belief batch through autoclanker.",
      name: "autoclanker_apply_beliefs",
    },
    {
      description:
        "Run optional eval hooks, then execute the checked-in eval surface through autoclanker ingest.",
      name: "autoclanker_ingest_eval",
    },
    {
      description: "Fit the upstream autoclanker session.",
      name: "autoclanker_fit",
    },
    {
      description: "Request the next autoclanker suggestion.",
      name: "autoclanker_suggest",
    },
    {
      description:
        "Persist or reuse autoclanker.frontier.json, then compare the frontier through autoclanker suggest.",
      name: "autoclanker_compare_frontier",
    },
    {
      description:
        "Merge selected pathways into autoclanker.frontier.json and ask autoclanker to re-rank them.",
      name: "autoclanker_merge_pathways",
    },
    {
      description: "Ask autoclanker for a commit recommendation.",
      name: "autoclanker_recommend_commit",
    },
  ],
  version: "0.1.0",
} as const;

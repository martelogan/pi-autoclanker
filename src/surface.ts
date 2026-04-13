export const VERSION = "0.1.0";

export const surfaceManifest = {
  commands: [
    {
      description: "Start a new session or resume the existing project-local session.",
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
    "schemas/pi-autoclanker.config.schema.json",
    "skills/autoclanker-create/SKILL.md",
    "skills/autoclanker-advanced-beliefs/SKILL.md",
    "skills/autoclanker-review/SKILL.md",
    "examples/targets/parser-quickstart/README.md",
    "examples/targets/parser-quickstart/app.py",
    "examples/targets/parser-quickstart/benchmark.py",
    "examples/targets/parser-quickstart/autoclanker.eval.sh",
    "examples/targets/parser-quickstart/candidates.json",
    "examples/minimal/README.md",
    "examples/minimal/rough-ideas.json",
    "examples/parser-demo-expanded/README.md",
    "examples/parser-demo-expanded/candidates.json",
    "examples/parser-demo-expanded/autoclanker.beliefs.json",
    "examples/parser-demo-expanded/autoclanker.config.json",
    "examples/parser-demo-expanded/autoclanker.eval.sh",
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
    "autoclanker.history.jsonl",
  ],
  slashCommandPrefix: "/autoclanker",
  tools: [
    {
      description: "Bootstrap pi-autoclanker session files and upstream session state.",
      name: "autoclanker_init_session",
    },
    {
      description:
        "Read resumable local state and ask autoclanker for upstream status.",
      name: "autoclanker_session_status",
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
      description: "Run the checked-in eval surface through autoclanker ingest.",
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
      description: "Ask autoclanker for a commit recommendation.",
      name: "autoclanker_recommend_commit",
    },
  ],
  version: "0.1.0",
} as const;

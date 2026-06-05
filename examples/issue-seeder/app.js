const storageKey = "pi-autoclanker.issue-seeder.v1";

const fieldIds = [
  "repo",
  "label",
  "title",
  "goal",
  "intensity",
  "harness",
  "ideas",
  "constraints",
  "artifacts",
  "evidence",
];

const sampleSeed = {
  artifacts:
    "benchmark-snapshot=https://example.invalid/artifacts/benchmark-snapshot.json\n" +
    "evidence-graph=https://example.invalid/artifacts/evidence.clankergraph.json",
  constraints:
    "Keep the eval surface fixed during comparisons.\n" +
    "Preserve correctness and rollback safety.\n" +
    "Write proposals before stopping.",
  evidence:
    "Use the benchmark snapshot and evidence graph as search inputs. Confirm any proposed win with the fixed eval surface before promotion.",
  goal: "Reduce the target benchmark cost without reducing correctness or resiliency.",
  harness: "both",
  ideas:
    "Batch repeated data fetches.\n" +
    "Move derived data closer to its runtime layout.\n" +
    "Avoid repeated parsing or transformation work.",
  intensity: "mega",
  label: "agent-loop-idea-family",
  repo: "owner/repo",
  title: "Explore lower-cost request execution",
};

const state = loadState();
let activeId = state.activeId ?? state.seeds[0]?.id;

function element(id) {
  const found = document.getElementById(id);
  if (!found) {
    throw new Error(`Missing #${id}`);
  }
  return found;
}

function newId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `seed-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function lines(value) {
  return value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

function artifactEntries(raw) {
  return lines(raw).map((line, index) => {
    const separator = line.indexOf("=");
    if (separator === -1) {
      return { name: `artifact-${index + 1}`, url: line };
    }
    return {
      name: line.slice(0, separator).trim() || `artifact-${index + 1}`,
      url: line.slice(separator + 1).trim(),
    };
  });
}

function loadState() {
  const fallbackSeed = {
    ...sampleSeed,
    id: newId(),
    updatedAt: new Date().toISOString(),
  };
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return { activeId: fallbackSeed.id, seeds: [fallbackSeed] };
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.seeds) || parsed.seeds.length === 0) {
      return { activeId: fallbackSeed.id, seeds: [fallbackSeed] };
    }
    return parsed;
  } catch {
    return { activeId: fallbackSeed.id, seeds: [fallbackSeed] };
  }
}

function persistState() {
  state.activeId = activeId;
  localStorage.setItem(storageKey, JSON.stringify(state, null, 2));
}

function currentSeed() {
  return state.seeds.find((seed) => seed.id === activeId) ?? state.seeds[0];
}

function seedFromForm(existing = {}) {
  const seed = { ...existing };
  for (const id of fieldIds) {
    seed[id] = element(id).value;
  }
  seed.id = seed.id ?? newId();
  seed.updatedAt = new Date().toISOString();
  return seed;
}

function fillForm(seed) {
  for (const id of fieldIds) {
    element(id).value = seed[id] ?? sampleSeed[id] ?? "";
  }
}

function saveCurrent() {
  const existing = currentSeed();
  const seed = seedFromForm(existing);
  const index = state.seeds.findIndex((entry) => entry.id === seed.id);
  if (index === -1) {
    state.seeds.unshift(seed);
  } else {
    state.seeds[index] = seed;
  }
  activeId = seed.id;
  persistState();
  render();
}

function createSeed() {
  const seed = { ...sampleSeed, id: newId(), updatedAt: new Date().toISOString() };
  state.seeds.unshift(seed);
  activeId = seed.id;
  persistState();
  render();
}

function renderList() {
  const list = element("seedList");
  list.innerHTML = "";
  element("seedCount").textContent = `${state.seeds.length}`;

  for (const seed of state.seeds) {
    const button = document.createElement("button");
    button.className = `seed-card${seed.id === activeId ? " active" : ""}`;
    button.type = "button";
    button.innerHTML = `<strong>${escapeHtml(seed.title || "Untitled seed")}</strong><span>${escapeHtml(seed.repo || "no repo")} · ${escapeHtml(seed.label || "no label")}</span>`;
    button.addEventListener("click", () => {
      activeId = seed.id;
      persistState();
      render();
    });
    list.append(button);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, 80);
}

function jsonString(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function fenced(language, body) {
  return `\`\`\`${language}\n${body.trim()}\n\`\`\``;
}

function generated(seed) {
  const ideas = lines(seed.ideas ?? "");
  const constraints = lines(seed.constraints ?? "");
  const artifacts = artifactEntries(seed.artifacts ?? "");
  const goal = seed.goal?.trim() || sampleSeed.goal;
  const title = seed.title?.trim() || sampleSeed.title;
  const repo = seed.repo?.trim() || sampleSeed.repo;
  const label = seed.label?.trim() || sampleSeed.label;
  const runIntensity = seed.intensity || "mega";
  const seedSlug = slug(title || goal) || "optimization-seed";

  const ideasJson = {
    constraints,
    executionPolicy: {
      clarificationPolicy: "upfront_only",
      mode: "unattended",
    },
    goal,
    ideas,
    run_intensity: runIntensity,
  };

  const artifactJson = {
    artifacts,
    expected_workspace_files: [
      "autoclanker.ideas.json",
      "run-contract.json",
      "lane-ledger.md",
      "clankerbench.manifest.json",
    ],
    issue_label: label,
    schema_version: "pi-autoclanker.issue-seed.v1",
    seed_slug: seedSlug,
    target_repo: repo,
    title,
  };

  const runContract = {
    acceptance_gates: [
      "fixed_eval_surface_preserved",
      "multi_lane_measurements_bound_to_candidate_identity",
      "correctness_and_resiliency_preserved",
      "proposal_or_blocker_recorded_before_exit",
    ],
    evidence_policy:
      "Artifact references are exploratory input signals. Promotion requires measured eval evidence.",
    goal,
    promotion_policy:
      "Promote independently reviewable proposals only after measured keep/reject/blocker decisions are recorded for relevant lanes.",
    schema_version: "pi-autoclanker.run-contract.v1",
    stop_conditions: [
      "one_or_more_proposals_ready",
      "all_plausible_lanes_rejected_or_blocked",
      "true_hard_blocker_recorded",
    ],
  };

  const laneRows = ideas.length
    ? ideas.map((idea, index) => {
        return `| lane-${index + 1} | active | ${idea.replaceAll("|", "\\|")} | pending first measurement |`;
      })
    : [
        "| lane-1 | active | Infer first lane during intake | pending first measurement |",
      ];

  const laneLedger = `# Lane Ledger

| Lane | Status | Hypothesis | Latest decision |
| --- | --- | --- | --- |
${laneRows.join("\n")}

Update this before first measurement, after each keep/reject/blocker decision,
and before stopping.
`;

  const piPrompt = `Use pi-autoclanker to run this seeded optimization issue.

Goal: ${goal}

Read autoclanker.ideas.json, clankerbench.manifest.json if present, run-contract.json, lane-ledger.md, and the artifact references from this issue. Start or resume with /autoclanker run --overnight --ideas-input autoclanker.ideas.json. The slash command prepares or resumes the workspace; read and execute the returned handoffPrompt.

During execution, keep candidate lanes explicit, preserve the fixed eval surface, bind every multi-lane eval ingest to the measured candidate, use evidence artifacts as search inputs, fit/suggest between measurements, and continue until each valuable lane has a measured keep/reject/blocker decision or an independently reviewable proposal is ready.`;

  const headlessCommand = `pi-autoclanker command run --overnight \\
  --workspace "$PWD" \\
  --ideas-input autoclanker.ideas.json > autoclanker.run.json

# Then give the supervising agent the handoffPrompt from autoclanker.run.json.
# The command prepares or resumes state; it is not the full autonomous run.`;

  const artifactList =
    artifacts.length === 0
      ? "- No external artifacts declared yet."
      : artifacts.map((entry) => `- ${entry.name}: ${entry.url}`).join("\n");
  const laneList =
    ideas.length === 0
      ? "- Seed lanes should be inferred during intake."
      : ideas.map((idea) => `- active: ${idea}`).join("\n");

  const issueBody = `## Start Here

This issue seeds a long-running optimization exploration for:

${goal}

Use the artifact references and run contract below as the current source of truth. Start or resume the workspace, execute the returned autoclanker handoff prompt, compare multiple lanes when practical, and post draft proposals or blockers as they become independently reviewable.

<details>
<summary>Local Pi Kickoff</summary>

${fenced("text", piPrompt)}

</details>

<details>
<summary>Headless CLI Kickoff</summary>

${fenced("bash", headlessCommand)}

</details>

<details>
<summary>Seed Artifacts</summary>

${artifactList}

</details>

<details>
<summary>Seed Lanes</summary>

${laneList}

</details>

<details>
<summary>Run Contract</summary>

${fenced("json", jsonString(runContract))}

</details>

<details>
<summary>Lane Ledger</summary>

${fenced("markdown", laneLedger)}

</details>

## Evidence Notes

${seed.evidence?.trim() || "No additional evidence notes yet."}

## Target

- Repo: ${repo}
- Suggested title: ${title}
- Suggested label: ${label}`;

  return {
    artifactJson,
    headlessCommand,
    ideasJson,
    issueBody,
    laneLedger,
    piPrompt,
    runContract,
  };
}

function renderOutputs(seed) {
  const output = generated(seed);
  element("issueBody").value = output.issueBody;
  element("ideasJson").value = jsonString(output.ideasJson);
  element("artifactJson").value = jsonString(output.artifactJson);
  element("runContractJson").value = jsonString(output.runContract);
  element("laneLedger").value = output.laneLedger;
  element("piPrompt").value = output.piPrompt;
  element("headlessCommand").value = output.headlessCommand;
}

function render() {
  const seed = currentSeed();
  fillForm(seed);
  renderList();
  renderOutputs(seed);
}

function download(name, value) {
  const blob = new Blob([value], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function exportAll() {
  download("pi-autoclanker-issue-seeds.json", jsonString(state));
}

function exportCurrent() {
  saveCurrent();
  const seed = currentSeed();
  download(
    `${slug(seed.title || "optimization-seed")}.issue-seed.json`,
    jsonString(seed),
  );
}

async function importSeeds(file) {
  const raw = await file.text();
  const parsed = JSON.parse(raw);
  const incoming = Array.isArray(parsed.seeds) ? parsed.seeds : [parsed];
  for (const seed of incoming) {
    state.seeds.unshift({
      ...sampleSeed,
      ...seed,
      id: seed.id ?? newId(),
      updatedAt: new Date().toISOString(),
    });
  }
  activeId = state.seeds[0]?.id;
  persistState();
  render();
}

function bindEvents() {
  element("newSeed").addEventListener("click", createSeed);
  element("saveSeed").addEventListener("click", saveCurrent);
  element("exportAll").addEventListener("click", exportAll);
  element("downloadSeed").addEventListener("click", exportCurrent);
  element("importFile").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (file) {
      await importSeeds(file);
      event.target.value = "";
    }
  });

  for (const id of fieldIds) {
    element(id).addEventListener("input", () =>
      renderOutputs(seedFromForm(currentSeed())),
    );
  }

  for (const button of document.querySelectorAll("[data-copy]")) {
    button.addEventListener("click", async () => {
      const target = element(button.dataset.copy);
      await navigator.clipboard.writeText(target.value);
      const original = button.textContent;
      button.textContent = "Copied";
      setTimeout(() => {
        button.textContent = original;
      }, 900);
    });
  }
}

bindEvents();
render();

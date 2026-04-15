# pi-autoclanker Mental Model

Use this page when you want the shortest honest explanation of what
`pi-autoclanker` is doing without reading posterior math or CLI internals.

## In 30 seconds

`pi-autoclanker` starts from a goal and rough ideas, lets `autoclanker`
preview them as typed beliefs, keeps explicit candidate lanes under
comparison, runs evals against a fixed checked-in surface, and then asks
`autoclanker` to fit, rank, and query the next useful comparison.

```text
goal + rough ideas
        |
        v
previewable beliefs
        |
        v
candidate lanes / frontier
        |
        v
eval -> fit -> suggest
        |
        v
next comparison, merge, or drop
```

![Mental model flow](/Users/logan_martel/Projects/pi-autoclanker/docs/assets/pi-autoclanker-mental-model.svg)

## Vocabulary

| Term | Plain-language meaning |
| --- | --- |
| optimization lever (gene) | one explicit thing the adapter can vary, such as `parser.matcher` |
| setting (state) | one concrete setting of that lever, such as `matcher_compiled` |
| candidate lane / pathway | one concrete combination of lever settings to evaluate |
| belief | a typed claim about a setting, a relation between settings, or a stronger advanced prior |
| frontier family | a group of related candidate lanes being compared as part of the same local search story |
| fit | update the engine from observed eval results |
| suggest | rank the current lanes and pick the next useful action under uncertainty |
| comparison query | the next concrete lane-vs-lane or family-vs-family question that would reduce uncertainty most |

![Structure diagram](/Users/logan_martel/Projects/pi-autoclanker/docs/assets/pi-autoclanker-structure.svg)

## What Bayes Is Doing Here

The important boundary is simple:

- `autoclanker` does **not** learn from hidden prompt state.
- It learns from explicit candidate features, typed beliefs, observed evals, and
  explicit relations between ideas.

That means:

- rough ideas can stay simple at first;
- canonicalized beliefs become inspectable JSON instead of disappearing into a
  chat thread;
- candidate lanes can stay explicit as `[A]`, `[B]`, and `[A+B]`;
- the engine can later explain why it wants the next comparison.

You do not need to think about posterior distributions to use the product well.
You only need to understand that the engine is learning over explicit lanes and
typed structure, not free-form chat memory.

The same rule applies to the local intake file: keep `autoclanker.ideas.json`
small unless you already know you want explicit seeded lanes. If you later want
to add risk, confidence, or pairwise-preference hints, the advanced skill is
the better place to do that than the starter intake file.

## When To Care About Advanced Structure

Stay in the beginner path until one of these starts to matter:

- a risk should actively constrain a path
- two ideas clearly reinforce each other
- two ideas conflict or should stay separate
- you already know a clean pairwise preference like “A is safer than B” or
  “A+B is the only combination I really trust”

That is when the advanced skill is useful. It should help turn those answers
into compact JSON beliefs without asking you for graph math or numeric prior
scales. It starts with up to three high-yield questions per round, then only
goes deeper if you want to continue or if the missing structure would clearly
change the next preview or frontier decision.

## What To Ignore Safely As A Beginner

You can safely ignore all of these at first:

- posterior math
- backend names like `exact_joint_linear` or
  `constrained_thompson_sampling`
- graph directives
- family budget allocations

Those may show up in status or export because they are useful evidence and
debugging details. They are not required inputs for getting value.

## Evidence Views

The upstream `autoclanker` session already emits compact report artifacts. Think
of them as evidence views:

- prior graph: what the session believed before evidence
- posterior graph: what still looks supported after evals
- candidate rankings: which lanes currently look strongest
- convergence: whether new evals are still changing the picture

![Evidence views](/Users/logan_martel/Projects/pi-autoclanker/docs/assets/pi-autoclanker-evidence-views.svg)

Those views are useful because they answer different questions:

- “what did we assume?”
- “what survived contact with evals?”
- “which lane leads right now?”
- “do we still need more evals?”

They are downstream evidence, not required setup.

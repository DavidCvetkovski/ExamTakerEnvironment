# E2E Seed Naming Conventions

This file defines the naming pattern for the seeded demo content used in manual testing and Playwright runs.

## Goal

Seed names should be understandable at a glance. The point is to know what you are clicking without decoding placeholder labels or UUID style names.

## Subject Order

Keep seeded questions grouped in this order:

1. Mathematics
2. Science
3. Humanities
4. Computing

Use the same order when adding more seed content later so the library and picker stay predictable.

## Question Prompt Pattern

Use:

`[Short Cue]: [Concrete scenario or skill check]`

Rules:

- Start with a plain language cue such as `Math Warm Up`, `History Lens`, or `Data Query`.
- Make the rest of the prompt describe a real scenario, not `Question 4`.
- Keep the visible preview short enough to read in one line when possible.
- Put subject grouping in `metadata_tags.topic`.
- Put the narrower theme in `metadata_tags.focus`.

Examples:

- `Math Warm Up: A bakery spends EUR 24 on setup and earns EUR 2 per roll. Break even quantity?`
- `Civics Filter: Which actions are examples of checks and balances?`
- `Release Ops: Which practice most helps a team reverse a bad deployment quickly?`

## Blueprint Pattern

Use:

`[Mode]: [Theme]`

Rules:

- The first phrase should reveal the testing purpose.
- The second phrase should explain the content domain or feeling.
- Avoid internal jargon like `bp_seed_01`.

Examples:

- `Shuffle Lab: Numbers in Motion`
- `Science Check: Forces and Reactions`
- `Mixed Mode: Policy, Data and Writing`
- `Smart Draw: Cross Subject Sampler`

## Course Pattern

Use:

`[SUBJ-CODE] [Human title]`

Rules:

- Keep the code realistic and short.
- Keep the title like a real course name, not a test fixture.
- Match each seeded course to one main blueprint to make sessions easy to scan.

Examples:

- `MATH-140 Quantitative Reasoning Studio`
- `SCI-115 Scientific Thinking Lab`
- `POL-230 Digital Policy Workshop`
- `XLAB-200 Cross Subject Challenge Lab`

## Session Window Pattern

Seeded sessions are intentionally short so manual testing is fast:

- two sessions already active
- two sessions starting soon
- each seeded window lasts two minutes

If you need a fresh cycle, rerun:

```bash
cd backend
source .venv/bin/activate
PYTHONPATH=. python3 seed_e2e.py
```

# Git Workflow & Version Control Strategy: The Epoch Model

To ensure absolute safety, modularity, and clean project history, we will follow a strict Git branching and committing model mapped directly to our `Epoch -> Stage` architecture.

## 1. The Core Principles

1.  **Main Branch Immutability**: The `main` branch acts as production-ready code. Commits should *never* be made directly to `main`.
2.  **Epoch Branches**: Every major Epoch gets its own dedicated functional branch.
3.  **Stage Commits**: Every isolated "Stage" within an Epoch results in a discrete, atomic Git commit.
4.  **Verification Before Push**: Code is *never* committed or pushed unless it passes the "Verification Gate" defined in the Epoch's matching blueprint.

---

## 2. The Branching Model

The repository will adhere to the following structure:

*   `main`: The stable core (Deployable).
*   `feature/epoch-[N]-[name]`: The active development branch for a specific Epoch (e.g., `feature/epoch-2-authoring`).
*   *(Optional)* `hotfix/[issue]`: For emergency fixes to `main` if the deployed application breaks.

### Workflow Example for Epoch 2

1.  **Start of Epoch:** When the user approves an Epoch Blueprint, the AI will immediately check out a new branch from `main`:
    `git checkout -b feature/epoch-2-authoring`
2.  **During the Epoch:** The AI and user work collaboratively. All commits happen within this branch.
3.  **End of Epoch — Security Gate (MANDATORY before every merge to `main`):**
    Before merging any feature branch into `main`, a security check **must** be performed using **Aikido**:
    1. Run Aikido's security scan against the current branch (`aikido scan` or via the Aikido CI integration).
    2. Review all findings — fix any **Critical** or **High** severity issues immediately before proceeding.
    3. Document Medium/Low findings as Linear issues for follow-up (do not block the merge for these unless they are exploitable in the current context).
    4. Only once the security scan passes (zero Critical/High unresolved issues) may the merge proceed:
    - `git checkout main`
    - `git merge feature/epoch-X`
    - `git push origin main`
    This gate applies to **every** merge to `main`, not just Epoch boundaries — including hotfixes, bug fixes, and refactors.

---

## 3. The Committing Strategy (The Stage-Gate Model)

To prevent overwhelming diffs and to allow the AI to easily "rollback" if a later stage corrupts an earlier stage, we commit precisely at the boundary of a "Stage."

**Commit rules:**
*   A commit happens *only* after a Stage's Verification Gate is passed.
*   We use **Conventional Commits** syntax to make the history readable.

### Commit Cadence Example (Epoch 2 Breakdown)

*   **Stage 1: Relational Foundation** -> Validated by Python script.
    *   `git add .`
    *   `git commit -m "feat(database): implement item versioning schema and alembic migrations"`
    *   `git push` (Pushing incrementally ensures the cloud is synced).

*   **Stage 2: DTOs** -> Validated by PyTest.
    *   `git add .`
    *   `git commit -m "feat(api): add strict pydantic schemas for multiple choice and essay types"`
    *   `git push`

*   **Stage 3: Core API** -> Validated by PyTest.
    *   `git add .`
    *   `git commit -m "feat(api): implement immutability controller for version up logic"`
    *   `git push`

*   **Stage 4: Frontend State & TipTap** -> Validated by UI rendering.
    *   `git add .`
    *   `git commit -m "feat(frontend): integrate tiptap editor with katex and lowlight"`
    *   `git push`

*   **Stage 5: Full Stack Integration** -> Validated by Manual Testing.
    *   `git add .`
    *   `git commit -m "feat(frontend): connect zustand debounced autosave to fastapi backend"`
    *   `git push`

---

## 4. Rollbacks and "Self-Annealing"

If the AI breaks something during **Stage 3** that was working in **Stage 2**:
Because we committed a known-good state at the end of Stage 2, the AI can safely execute `git reset --hard HEAD` (with user permission) to wipe the broken Stage 3 code and try a different architectural approach, without losing the Pydantic DTOs built in Stage 2.

## 5. Summary Developer Experience (DX) for Solo Developer Auto-Merging

1.  **AI Prompts**: "I am beginning Epoch X." -> Checks out `feature/epoch-X`.
2.  **AI Prompts**: "Executing Stage Y." -> Writes code -> Tests code -> Passes CI gate -> Commits code: `feat(...): finish stage Y`.
3.  **AI Prompts**: "Epoch X Complete." -> Branches are merged into `main` and pushed automatically. Features added to the roadmap are filed as GitHub Issues.

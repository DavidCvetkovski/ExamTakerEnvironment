# Epoch 8 Blueprint — Bulk Import & Blueprint Paste Parser

> **Branch:** `feature/epoch-8-import-parser`
> **Prerequisites:** Epoch 7.9 merged to `main`.
> **Scope:** Full-stack. New backend service module (`import_service`), two new API endpoints, one new frontend page (`/import`), Celery integration for large batches. One Alembic migration (`import_jobs` table). No changes to the exam-taking or grading paths.
> **Celery bootstrap required:** `celery[redis]` is not yet in `requirements.txt`. Stage 4.0 covers the one-time Celery bootstrap (`celery_app.py`, `get_db_sync` helper, worker start-up). Redis is already running in Docker Compose.
> **CLAUDE.md principles in play:** Modularity (isolated `import_service` sub-package, one Zustand store), separation of concerns (lexer → assembler → validator → persister pipeline), security (input size limits, role-gating, sanitised HTML output), scalability (Celery offload for large batches, bulk inserts), maintainability (canonical format spec documented once, format errors carry line numbers).

---

## Progress Checklist

- [x] Stage 1 — Format Specification & Parser Backend (lexer, assembler, Pydantic schemas, unit tests)
- [x] Stage 2 — Import API Endpoints (`/preview`, `/commit`) — synchronous only; Celery deferred
- [x] Stage 3 — Frontend Import Page (paste UI, preview panel, error panel)
- [ ] Stage 4 — Background Job Pipeline — deferred (Celery not installed; all commits are sync)
- [x] Stage 5 — Validation Layer & Error Reporting (per-line errors, warnings, fix hints)
- [x] Stage 6 — In-App Format Guide (cheatsheet modal, downloadable template)
- [x] Stage 7 — Nav Integration & Post-Commit UX
- [x] Stage 8 — Verification (15/15 pytest green, tsc clean, next build clean)

---

## Feature Overview

A constructor can paste a **specially formatted plain-text document** into the `/import` page, click **Parse & Preview**, review the structured breakdown with any parse errors highlighted, select a target item bank, then click **Commit** — which creates `LearningObject` + `ItemVersion` records and optionally assembles a draft `TestDefinition` (blueprint) from the structure described in the text.

The feature replaces the most common friction point in new-exam setup: having to click through the item authoring UI for every question when a constructor already has their exam written out in a Word doc or notes file.

---

## Canonical Text Format

The format is designed to be **writable without a schema reference** — a constructor who has read one example can reproduce it from memory. It is line-oriented (easy to parse line-by-line), forgiving of blank lines and whitespace, and carries enough metadata to populate all required fields on `ItemVersion`.

### Full example

```
// Epoch 8 import format — this line is a comment and will be stripped

#BLUEPRINT
Title: Final Exam — Statistics 101
Course: STAT101
Duration: 90
Description: End-of-semester summative assessment covering descriptive statistics and probability.

#BLOCK Part A: Multiple Choice

---

#Q What is the arithmetic mean of the values 2, 4, and 6?
TYPE: MCQ
LEVEL: Remember
DIFFICULTY: Easy
POINTS: 1
TAGS: mean, descriptive-statistics

A) 2
B) 4 *
C) 6
D) 8

---

#Q Select ALL values that are recognised measures of central tendency.
TYPE: MCQ_MULTI
LEVEL: Remember
DIFFICULTY: Easy
POINTS: 2
TAGS: central-tendency, descriptive-statistics

A) Mean *
B) Range
C) Median *
D) Standard Deviation
E) Mode *

---

#BLOCK Part B: Open Questions

---

#Q Explain the central limit theorem and its significance for statistical inference.
TYPE: ESSAY
LEVEL: Understand
DIFFICULTY: Medium
POINTS: 10
TAGS: central-limit-theorem, probability

MODEL_ANSWER:
The central limit theorem states that the sampling distribution of the mean
approaches a normal distribution as sample size increases, regardless of the
population's distribution.
END_MODEL_ANSWER
```

### Format rules (canonical reference — also rendered in the in-app guide)

| Token | Required | Description |
|---|---|---|
| `// <text>` | No | Comment line. Stripped before parsing. |
| `#BLUEPRINT` | No | Opens the blueprint header block. If omitted, items are imported to the bank with no blueprint created. |
| `Title:` | No (blueprint) | Blueprint display name. |
| `Course:` | No (blueprint) | Course code tag, stored in blueprint metadata. |
| `Duration:` | No (blueprint) | Exam duration in minutes (integer ≥ 1). |
| `Description:` | No (blueprint) | Blueprint description. |
| `#BLOCK <name>` | No | Section separator. Creates a named block in the blueprint. All questions after this line (until the next `#BLOCK` or EOF) belong to this block. Items imported without a `#BLOCK` heading land in a default "General" block. |
| `---` | No | Question separator. Blank lines between questions also work. The separator improves readability but is not strictly required. |
| `#Q <stem>` | **Yes** | Start of a question. The stem continues on subsequent non-keyword lines. A keyword line (`TYPE:`, `LEVEL:`, etc.) ends the stem. |
| `TYPE:` | **Yes** | `MCQ` (single correct), `MCQ_MULTI` (multiple correct), `ESSAY`. |
| `LEVEL:` | No | Bloom's taxonomy level. Accepted: `Remember`, `Understand`, `Apply`, `Analyze`, `Evaluate`, `Create`. Defaults to `Remember` if omitted. |
| `DIFFICULTY:` | No | `Easy`, `Medium`, `Hard`. Defaults to `Medium` if omitted. |
| `POINTS:` | No | Integer ≥ 1. Defaults to `1` if omitted. |
| `TAGS:` | No | Comma-separated list of tag strings. |
| `A) … *` | MCQ / MCQ_MULTI | Answer option. Append ` *` (space then asterisk) to mark as correct. At least one `*` required for `MCQ`; one or more `*` required for `MCQ_MULTI`. |
| `MODEL_ANSWER:` | No (ESSAY) | Opens a free-text model-answer block. Ends at `END_MODEL_ANSWER`. |
| `END_MODEL_ANSWER` | If MODEL_ANSWER opened | Closes the model answer block. |

**Character encoding:** UTF-8. LaTeX math inside stems (e.g., `$\mu = \bar{x}$`) is preserved as-is and will render correctly via the existing KaTeX extension once that epoch ships.

**Option letters:** Any single letter (`A`–`Z`) followed by `)`. Letters need not be sequential; the parser normalises them in order of appearance.

**Multi-line stems:** Lines between `#Q` and the first keyword line are concatenated (with a single space) as the question stem. This allows long stems without line-length anxiety.

---

## Stage 1 — Format Specification & Parser Backend

### 1.1 Module structure

Create a new sub-package at `backend/app/services/import_service/`:

```
backend/app/services/import_service/
    __init__.py          ← re-exports parse_text(), ParseResult, ParseError
    lexer.py             ← tokenises the raw text string into a flat token stream
    assembler.py         ← builds ParsedBlueprint from the token stream
    validator.py         ← validates assembled output, returns a list of ParseError
    schemas.py           ← Pydantic models for all parsed/validated output
    persister.py         ← maps ParsedBlueprint → DB records (uses existing service layer)
```

This isolates the import pipeline so future format extensions (QTI import, CSV) can be added as sibling modules without touching the lexer.

### 1.2 Pydantic schemas (`schemas.py`)

```python
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class QuestionType(str, Enum):
    MCQ = "MCQ"
    MCQ_MULTI = "MCQ_MULTI"
    ESSAY = "ESSAY"


class BloomsLevel(str, Enum):
    REMEMBER = "Remember"
    UNDERSTAND = "Understand"
    APPLY = "Apply"
    ANALYZE = "Analyze"
    EVALUATE = "Evaluate"
    CREATE = "Create"


class Difficulty(str, Enum):
    EASY = "Easy"
    MEDIUM = "Medium"
    HARD = "Hard"


class ParsedOption(BaseModel):
    letter: str
    text: str
    is_correct: bool


class ParsedQuestion(BaseModel):
    stem: str
    question_type: QuestionType
    bloom_level: BloomsLevel = BloomsLevel.REMEMBER
    difficulty: Difficulty = Difficulty.MEDIUM
    points: int = Field(default=1, ge=1)
    tags: list[str] = Field(default_factory=list)
    options: list[ParsedOption] = Field(default_factory=list)
    model_answer: Optional[str] = None
    source_line: int   # 1-indexed line number of #Q in the source text


class ParsedBlock(BaseModel):
    name: str
    questions: list[ParsedQuestion]


class ParsedBlueprintHeader(BaseModel):
    title: Optional[str] = None
    course: Optional[str] = None
    duration_minutes: Optional[int] = None
    description: Optional[str] = None


class ParsedBlueprint(BaseModel):
    header: Optional[ParsedBlueprintHeader] = None
    blocks: list[ParsedBlock]

    @property
    def all_questions(self) -> list[ParsedQuestion]:
        return [q for block in self.blocks for q in block.questions]


class ParseErrorSeverity(str, Enum):
    ERROR = "error"       # prevents commit
    WARNING = "warning"   # allows commit, shown to user


class ParseError(BaseModel):
    line: Optional[int] = None      # 1-indexed source line, None if global
    message: str
    severity: ParseErrorSeverity
    fix_hint: Optional[str] = None


class ParseResult(BaseModel):
    blueprint: Optional[ParsedBlueprint] = None
    errors: list[ParseError] = Field(default_factory=list)
    warnings: list[ParseError] = Field(default_factory=list)

    @property
    def has_blocking_errors(self) -> bool:
        return any(e.severity == ParseErrorSeverity.ERROR for e in self.errors)

    @property
    def question_count(self) -> int:
        return len(self.blueprint.all_questions) if self.blueprint else 0
```

### 1.3 Lexer (`lexer.py`)

The lexer is a single-pass line scanner. It emits typed tokens consumed by the assembler.

```python
from dataclasses import dataclass
from enum import Enum, auto
from typing import Iterator


class TokenType(Enum):
    COMMENT = auto()
    BLUEPRINT_HEADER = auto()   # the literal "#BLUEPRINT" line
    BLUEPRINT_FIELD = auto()    # "Title: ...", "Duration: ..."
    BLOCK_HEADER = auto()       # "#BLOCK <name>"
    SEPARATOR = auto()          # "---"
    QUESTION_START = auto()     # "#Q <stem text...>"
    STEM_CONTINUATION = auto()  # non-keyword line inside a question
    METADATA = auto()           # "TYPE: ...", "LEVEL: ...", etc.
    OPTION = auto()             # "A) ... [*]"
    MODEL_ANSWER_START = auto()
    MODEL_ANSWER_LINE = auto()
    MODEL_ANSWER_END = auto()
    BLANK = auto()


@dataclass
class Token:
    type: TokenType
    value: str    # the processed value (stripped)
    raw: str      # original line text
    line: int     # 1-indexed


def tokenize(text: str) -> Iterator[Token]:
    """Yield Token objects for each line of `text`."""
    in_model_answer = False
    for lineno, raw in enumerate(text.splitlines(), start=1):
        stripped = raw.strip()

        if in_model_answer:
            if stripped == "END_MODEL_ANSWER":
                in_model_answer = False
                yield Token(TokenType.MODEL_ANSWER_END, stripped, raw, lineno)
            else:
                yield Token(TokenType.MODEL_ANSWER_LINE, raw, raw, lineno)
            continue

        if not stripped:
            yield Token(TokenType.BLANK, "", raw, lineno)
        elif stripped.startswith("//"):
            yield Token(TokenType.COMMENT, stripped[2:].strip(), raw, lineno)
        elif stripped == "#BLUEPRINT":
            yield Token(TokenType.BLUEPRINT_HEADER, "", raw, lineno)
        elif stripped.startswith("#BLOCK "):
            yield Token(TokenType.BLOCK_HEADER, stripped[7:].strip(), raw, lineno)
        elif stripped == "---":
            yield Token(TokenType.SEPARATOR, "", raw, lineno)
        elif stripped.startswith("#Q ") or stripped == "#Q":
            yield Token(TokenType.QUESTION_START, stripped[3:].strip(), raw, lineno)
        elif stripped == "MODEL_ANSWER:":
            in_model_answer = True
            yield Token(TokenType.MODEL_ANSWER_START, "", raw, lineno)
        elif ":" in stripped and stripped.split(":")[0].upper() in {
            "TYPE", "LEVEL", "DIFFICULTY", "POINTS", "TAGS",
            "TITLE", "COURSE", "DURATION", "DESCRIPTION",
        }:
            key, _, val = stripped.partition(":")
            yield Token(TokenType.METADATA, f"{key.strip().upper()}:{val.strip()}", raw, lineno)
        elif len(stripped) >= 2 and stripped[1] == ")" and stripped[0].isalpha():
            yield Token(TokenType.OPTION, stripped, raw, lineno)
        else:
            yield Token(TokenType.STEM_CONTINUATION, stripped, raw, lineno)
```

### 1.4 Assembler (`assembler.py`)

The assembler is a state machine that consumes the token stream and builds a `ParsedBlueprint`. It does not validate — it just assembles what it can, emitting `ParseError` entries for structural problems (e.g., option before a question start).

Key state machine rules:
- A `BLUEPRINT_HEADER` token opens the blueprint header scope; subsequent `METADATA` tokens with keys `TITLE / COURSE / DURATION / DESCRIPTION` are consumed as header fields.
- A `BLOCK_HEADER` token closes any open question and opens a new `ParsedBlock`.
- A `QUESTION_START` token closes any open question and opens a new `ParsedQuestion`.
- `STEM_CONTINUATION` tokens inside a question append to the stem (space-joined).
- `METADATA` tokens inside a question populate the question's fields.
- `OPTION` tokens inside a question append a `ParsedOption`.
- `MODEL_ANSWER_LINE` tokens inside a question append to `model_answer`.
- At EOF, the current open question is finalised into the current block.

Implementation guide (pseudo-code — implement with a class `Assembler` with `state: AssemblerState` enum and `_current_question`, `_current_block`, `_blueprint_header` accumulators):

```python
class AssemblerState(Enum):
    ROOT = auto()
    IN_BLUEPRINT_HEADER = auto()
    IN_BLOCK = auto()
    IN_QUESTION = auto()
    IN_MODEL_ANSWER = auto()


class Assembler:
    def assemble(self, tokens: Iterable[Token]) -> tuple[ParsedBlueprint, list[ParseError]]:
        ...
```

The assembler returns `(ParsedBlueprint, list[ParseError])`. Errors from this stage are structural (e.g., orphaned `MODEL_ANSWER_END` without a `MODEL_ANSWER_START`).

### 1.5 Validator (`validator.py`)

The validator receives a `ParsedBlueprint` and returns additional `ParseError` / warning objects. It does NOT modify the blueprint — it only annotates.

Validation rules:

| Rule | Severity | Fix hint |
|---|---|---|
| `MCQ` question has zero `*`-marked options | ERROR | "Add ` *` to the correct answer (e.g. `B) Paris *`)." |
| `MCQ` question has more than one `*`-marked option | ERROR | "MCQ allows one correct answer. Use TYPE: MCQ_MULTI for multiple." |
| `MCQ_MULTI` question has zero `*`-marked options | ERROR | "Mark at least one option with ` *`." |
| Question has zero options (MCQ or MCQ_MULTI) | ERROR | "Add at least two answer options starting with a letter and `)`." |
| `MCQ` / `MCQ_MULTI` question has fewer than 2 options | WARNING | "Fewer than 2 options is unusual. Add distractors." |
| Unrecognised `TYPE` value | ERROR | "Allowed values: MCQ, MCQ_MULTI, ESSAY." |
| Unrecognised `LEVEL` value | WARNING | "Defaulting to Remember. Allowed: Remember, Understand, Apply, Analyze, Evaluate, Create." |
| Unrecognised `DIFFICULTY` value | WARNING | "Defaulting to Medium. Allowed: Easy, Medium, Hard." |
| `POINTS` is not a positive integer | ERROR | "POINTS must be a whole number ≥ 1." |
| `Duration` on blueprint header is ≤ 0 or non-integer | ERROR | "Duration must be a whole number of minutes ≥ 1." |
| Question stem is empty | ERROR | "The `#Q` line must contain the question text." |
| Duplicate stem text (case-insensitive) across questions | WARNING | "Two questions share the same stem. Verify this is intentional." |
| Zero questions parsed in the entire document | ERROR | "No questions found. Ensure each question starts with `#Q`." |
| Import size > 200 questions | ERROR | "Maximum 200 questions per import. Split into multiple pastes." |
| `ESSAY` question has `MODEL_ANSWER:` but it is empty | WARNING | "Model answer block is empty. Consider adding expected answer content." |

### 1.6 Public API of `import_service`

```python
# backend/app/services/import_service/__init__.py

from .assembler import Assembler
from .lexer import tokenize
from .validator import Validator
from .schemas import ParseResult, ParsedBlueprint, ParseError


def parse_text(raw_text: str) -> ParseResult:
    """Parse raw import text into a ParseResult.

    Returns a ParseResult with `blueprint` populated (even partially) and
    any errors/warnings. Callers check `result.has_blocking_errors` before
    allowing a commit.
    """
    tokens = list(tokenize(raw_text))
    blueprint, structural_errors = Assembler().assemble(tokens)
    validation_errors = Validator().validate(blueprint)
    all_errors = structural_errors + validation_errors
    return ParseResult(
        blueprint=blueprint,
        errors=[e for e in all_errors if e.severity == "error"],
        warnings=[e for e in all_errors if e.severity == "warning"],
    )
```

### 1.7 Persister (`persister.py`)

The persister maps a validated `ParsedBlueprint` to DB records using the existing service layer. It must be called within an async context because it uses the existing `items_service` and `blueprint_service` functions.

```python
async def persist_import(
    parsed: ParsedBlueprint,
    bank_id: UUID,
    create_blueprint: bool,
    author_user_id: UUID,
    db: AsyncSession,
) -> PersistResult:
    """
    Persist all questions from `parsed` into `bank_id` as DRAFT ItemVersions.
    If `create_blueprint` is True, also creates a draft TestDefinition.
    Returns IDs of created LOs and the blueprint (if created).
    """
    ...
```

Key implementation rules:
- Use bulk insert for `LearningObject` and `ItemVersion` records — **not** a loop of individual inserts. `db.add_all([...])` followed by a single `await db.flush()`.
- Wrap the entire operation in a single transaction. If any insert fails, rollback all.
- Reuse existing `item_schemas.ItemVersionCreate` for populating the `ItemVersion` rows.
- Tags on `TAGS:` are stored in `metadata_tags.topic` (matching the existing tagging convention from Epoch 4).
- `bloom_level` maps to `metadata_tags.bloom_level` (existing field).
- `difficulty` maps to `metadata_tags.difficulty`.
- If `create_blueprint` is True, create a `TestDefinition` using the header title/description/duration and add one `TestBlock` per `ParsedBlock`, with each question added as a `FIXED` rule item referencing the newly-created LO id.

### 1.8 Unit tests

**File:** `backend/tests/test_import_service.py`

Minimum test cases:

| Test | Asserts |
|---|---|
| `test_parse_valid_mcq` | Single MCQ question parses cleanly; `question_count == 1`, no errors. |
| `test_parse_valid_mcq_multi` | MCQ_MULTI with 3 correct options; no errors. |
| `test_parse_valid_essay` | ESSAY with model answer; `model_answer` is non-empty. |
| `test_parse_missing_correct_answer` | MCQ with no `*` → error referencing the correct source line. |
| `test_parse_too_many_correct_for_mcq` | Two `*` on MCQ → error. |
| `test_parse_unknown_type` | `TYPE: HOTSPOT` → error with fix hint. |
| `test_parse_full_blueprint_header` | `#BLUEPRINT` + all header fields parsed correctly. |
| `test_parse_multiple_blocks` | Two `#BLOCK` sections → two `ParsedBlock` objects. |
| `test_parse_empty_input` | Empty string → error "No questions found." |
| `test_parse_over_limit` | 201 questions → error at limit. |
| `test_parse_multiline_stem` | Stem spanning 3 lines → joined correctly. |
| `test_parse_comment_stripped` | `// comment` lines don't appear in any parsed field. |
| `test_parse_duplicate_stem_warning` | Two identical stems → warning, no error. |
| `test_parse_missing_points_defaults` | Omitted POINTS → `points == 1`. |
| `test_parse_default_block_created` | Questions with no `#BLOCK` land in a "General" block. |

---

## Stage 2 — Import API Endpoints

### 2.1 Router location

New file: `backend/app/api/endpoints/import_endpoints.py`
Registered in `backend/app/api/router.py` under prefix `/api/import`.

### 2.2 `POST /api/import/preview`

**Purpose:** Parse + validate the submitted text; return a structured preview with errors. Does **not** persist anything.

**Request body:**

```python
class ImportPreviewRequest(BaseModel):
    raw_text: str = Field(..., max_length=500_000)  # ~500KB hard limit
```

**Response:**

```python
class ImportPreviewResponse(BaseModel):
    question_count: int
    block_count: int
    has_blueprint_header: bool
    blueprint_title: Optional[str]
    errors: list[ParseError]
    warnings: list[ParseError]
    blocks: list[PreviewBlock]   # lightweight summary, not full detail
    can_commit: bool             # True iff no blocking errors

class PreviewBlock(BaseModel):
    name: str
    question_count: int
    question_summaries: list[str]  # first 80 chars of each stem
```

**Auth:** Bearer token required. Role: `CONSTRUCTOR` or `ADMIN`.

**Rate limit:** 20 preview requests per minute per user (enforced via existing rate-limit middleware).

**Implementation:**

```python
@router.post("/preview", response_model=ImportPreviewResponse)
async def preview_import(
    body: ImportPreviewRequest,
    current_user: User = Depends(get_current_constructor_or_admin),
):
    result = parse_text(body.raw_text)
    ...
```

### 2.3 `POST /api/import/commit`

**Purpose:** Parse, validate, and persist. For small batches (≤ 50 items), runs synchronously and returns created IDs. For large batches (> 50 items), enqueues a Celery task and returns a `job_id`.

**Request body:**

```python
class ImportCommitRequest(BaseModel):
    raw_text: str = Field(..., max_length=500_000)
    bank_id: UUID
    create_blueprint: bool = True
```

**Response — synchronous (≤ 50 items):**

```python
class ImportCommitResponseSync(BaseModel):
    job_id: None = None
    status: Literal["completed"] = "completed"
    created_lo_ids: list[UUID]
    blueprint_id: Optional[UUID] = None
    question_count: int
    warnings: list[ParseError]
```

**Response — async (> 50 items):**

```python
class ImportCommitResponseAsync(BaseModel):
    job_id: UUID
    status: Literal["queued"] = "queued"
    created_lo_ids: None = None
    blueprint_id: None = None
    question_count: int     # from preview parse, known immediately
    warnings: list[ParseError]
```

**Auth:** Bearer token required. Role: `CONSTRUCTOR` or `ADMIN`.
**Rate limit:** 5 commit requests per minute per user.

**Security checks:**
- Re-parse + re-validate inside the commit endpoint (never trust the frontend saying "preview was clean").
- Verify `bank_id` belongs to the authenticated user or a bank they have write access to.
- If `has_blocking_errors` after re-parse → `422 Unprocessable Entity` with the error list.

### 2.4 `GET /api/import/jobs/{job_id}`

**Purpose:** Poll status of a Celery import job.

**Response:**

```python
class ImportJobStatus(BaseModel):
    job_id: UUID
    status: Literal["pending", "processing", "completed", "failed"]
    progress: Optional[int] = None    # 0–100
    created_lo_ids: Optional[list[UUID]] = None
    blueprint_id: Optional[UUID] = None
    error_message: Optional[str] = None
```

**Auth:** Bearer token. The job must belong to the requesting user (stored on the job record).

---

## Stage 3 — Frontend Import Page

### 3.1 New route

**New file:** `src/app/import/page.tsx`

This page is guarded by role — redirect to `/` if the user is not `CONSTRUCTOR` or `ADMIN`.

### 3.2 Page layout

The page is split into two vertical panels (above-the-fold on a 1280px screen):

**Left panel — input (60% width):**
- `<h1>` "Import Questions" with an `(i)` button that opens the Format Guide modal (Stage 6).
- Bank selector dropdown (`<Select>` primitive) populated from `useItemBankStore`.
- `create_blueprint` toggle checkbox: "Also create a draft blueprint from this import" (default: on).
- Textarea (monospace font, ~24 rows) with placeholder: `// Paste your formatted exam text here…\n\n#Q What is...`.
- Character count + item limit indicator (e.g., "0 characters · 0 questions estimated").
- Two action buttons:
  - `<Button variant="secondary" size="lg" onClick={handlePreview}>Parse & Preview</Button>` — enabled when textarea is non-empty.
  - `<Button variant="primary" size="lg" onClick={handleCommit} disabled={!canCommit || isCommitting}>Commit Import</Button>` — enabled only after a clean preview.
- Download template link (plain `.txt` file — see Stage 6).

**Right panel — results (40% width):**
- Shows one of: empty state (before first parse), loading spinner, preview result, or error list.
- **Preview result** (when `can_commit` is true):
  - Green success banner: "X questions parsed across Y blocks."
  - Collapsible block list, each block showing question stubs (first 80 chars of stem + type badge).
  - If `has_blueprint_header`, show blueprint header summary card.
  - Warning accordion (if any warnings).
- **Error state** (when `can_commit` is false):
  - Red error banner: "X errors — fix them before committing."
  - Error list, each item showing: line number (linked to the textarea line if possible), message, fix hint.

### 3.3 Zustand store

**New file:** `src/stores/useImportStore.ts`

```ts
interface ImportState {
    rawText: string;
    bankId: string | null;
    createBlueprint: boolean;
    previewResult: ImportPreviewResponse | null;
    previewLoading: boolean;
    commitStatus: 'idle' | 'running' | 'completed' | 'failed';
    jobId: string | null;
    jobProgress: number;
    commitResult: ImportCommitResult | null;

    setRawText: (text: string) => void;
    setBankId: (id: string) => void;
    setCreateBlueprint: (v: boolean) => void;
    fetchPreview: () => Promise<void>;
    commitImport: () => Promise<void>;
    pollJob: (jobId: string) => Promise<void>;
    reset: () => void;
}
```

All API calls live in the store; the page component only calls store actions. This keeps the page thin and matches the existing store-per-domain convention.

### 3.4 Textarea line-number sync

To link an error's `line` number back to the textarea, calculate the character offset of that line using a helper:

```ts
function lineToCharOffset(text: string, lineNumber: number): number {
    return text.split('\n').slice(0, lineNumber - 1).join('\n').length + (lineNumber > 1 ? 1 : 0);
}
```

When the user clicks an error's line reference, call `textareaRef.current?.setSelectionRange(offset, offset)` and `textareaRef.current?.focus()` to jump to that position. This is a progressive enhancement — it does not block the rest of the implementation.

### 3.5 Post-commit redirect

After a successful synchronous commit, display a success toast and navigate to the item bank filtered to the newly-created items:

```ts
router.push(`/items?bank_id=${bankId}&imported=true`);
```

The `?imported=true` flag triggers a temporary banner in the item library: "X items just imported — shown here." (filtered view). This reuses the existing bank filter mechanism.

If a blueprint was also created, show an additional toast with a "View Blueprint →" action button that navigates to `/blueprint?id={blueprintId}`.

---

## Stage 4 — Background Job Pipeline

### 4.0 Celery bootstrap (one-time setup)

Celery is not yet installed in this project. Before the task can run, add it.

**`backend/requirements.txt`** — append:
```
celery[redis]==5.3.6
```

**New file: `backend/app/celery_app.py`**

```python
import os
from celery import Celery

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

celery = Celery(
    "openvision",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["app.tasks.import_tasks"],
)

celery.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
)
```

**New file: `backend/app/db/sync_session.py`** (sync DB session for Celery workers, which cannot use `async`)

```python
from contextlib import contextmanager
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
import os

SYNC_DATABASE_URL = os.getenv("DATABASE_URL", "").replace(
    "postgresql+asyncpg", "postgresql+psycopg2"
)

_sync_engine = create_engine(SYNC_DATABASE_URL, pool_pre_ping=True)
_SyncSession = sessionmaker(bind=_sync_engine, autocommit=False, autoflush=False)


@contextmanager
def get_db_sync() -> Session:
    db = _SyncSession()
    try:
        yield db
    finally:
        db.close()
```

This does **not** touch the async engine used by FastAPI. It is a parallel sync connection for the Celery worker process only.

**`.env` — add if not present:**
```
REDIS_URL=redis://localhost:6379/0
```

**Running the worker locally:**
```bash
cd backend
celery -A app.celery_app:celery worker --loglevel=info -Q default
```

Add this to the developer setup notes in `README.md` if one exists. The worker must be running for batches > 50 items to be processed; for ≤ 50 items the API is fully synchronous and no worker is needed.

### 4.1 Celery task

**File:** `backend/app/tasks/import_tasks.py`

```python
from app.celery_app import celery
from app.services.import_service import parse_text
from app.services.import_service.persister import persist_import
from app.db.session import get_db_sync


@celery.task(bind=True, name="import_tasks.run_bulk_import")
def run_bulk_import(
    self,
    job_record_id: str,
    raw_text: str,
    bank_id: str,
    create_blueprint: bool,
    author_user_id: str,
):
    """Celery task: parse, validate, and persist a large import."""
    with get_db_sync() as db:
        job = db.get(ImportJob, job_record_id)
        job.status = "processing"
        db.commit()

        try:
            result = parse_text(raw_text)
            if result.has_blocking_errors:
                job.status = "failed"
                job.error_message = "; ".join(e.message for e in result.errors)
                db.commit()
                return

            persist_result = persist_import(
                parsed=result.blueprint,
                bank_id=UUID(bank_id),
                create_blueprint=create_blueprint,
                author_user_id=UUID(author_user_id),
                db=db,
            )
            job.status = "completed"
            job.created_lo_ids = [str(i) for i in persist_result.lo_ids]
            job.blueprint_id = str(persist_result.blueprint_id) if persist_result.blueprint_id else None
            db.commit()

        except Exception as exc:
            job.status = "failed"
            job.error_message = str(exc)
            db.commit()
            raise
```

### 4.2 ImportJob model

**File:** `backend/app/models/import_job.py`

```python
class ImportJob(Base):
    __tablename__ = "import_jobs"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    owner_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")   # pending|processing|completed|failed
    created_at: Mapped[datetime] = mapped_column(default=func.now())
    completed_at: Mapped[Optional[datetime]]
    created_lo_ids: Mapped[Optional[list[str]]] = mapped_column(JSONB)
    blueprint_id: Mapped[Optional[str]]
    error_message: Mapped[Optional[str]] = mapped_column(Text)
```

Add a simple Alembic migration that creates this table. This is the only schema change in Epoch 8.

### 4.3 Frontend polling

When the commit endpoint returns `status: "queued"`, the frontend:

1. Stores `jobId` in the import store.
2. Renders a progress UI in the right panel: spinning bar + "Processing X questions…"
3. Every 2 seconds, calls `GET /api/import/jobs/{jobId}`.
4. On `status: "completed"` → success toast + redirect.
5. On `status: "failed"` → error toast with `error_message`.
6. On network failure → show retry button.

Implement polling with a `useEffect` cleanup that clears the interval on unmount (prevent memory leaks / stale-closures).

---

## Stage 5 — Validation & Error Reporting

The validation rules are already defined in Stage 1.5. This stage covers the frontend error display and UX polish.

### 5.1 Error severity UX

- **Blocking errors:** Shown in a red-bordered list. Commit button stays disabled. Each error has a `line` badge (clickable, jumps to textarea), the message, and a collapsible fix hint.
- **Warnings:** Shown in an amber-bordered accordion (collapsed by default with a count badge). Commit is allowed despite warnings. First warning says "These are non-blocking — you can still import."

### 5.2 Error count in textarea

When errors exist, show a thin error stripe at the right edge of the textarea (similar to how VS Code shows gutter markers). This is implemented by laying a `<div>` with `position: absolute; right: 0; width: 4px` and coloured dots at vertical positions proportional to each error's line number. This is optional polish — implement only if time allows; it is not a blocking exit criterion.

### 5.3 Empty block warning

If a `#BLOCK` section contains no questions, emit a warning: "Block 'Part A' has no questions. Remove the `#BLOCK` line or add at least one `#Q` after it."

### 5.4 Format detection hint

If the input contains zero `#Q` tokens but does contain numbered lines like `1.`, `Q1.`, or `1)` (common pasted formats from Word), emit a top-level warning: "No `#Q` markers found. Did you paste from a Word document? Add `#Q` before each question stem." This is a UX nudge to help first-time users.

---

## Stage 6 — In-App Format Guide

### 6.1 Format Guide modal

**New file:** `src/components/import/FormatGuideModal.tsx`

A `<Modal>` (using the existing modal pattern from `QuestionPickerModal`) with three tabs:

- **Quick Reference** — the format rules table (rendered from a local constant, not fetched).
- **Full Example** — a syntax-highlighted display of the canonical 3-question example (use the existing Lowlight/code-block styling).
- **FAQ** — answers to: "What happens to duplicates?", "Can I import into an existing bank?", "What if I omit the #BLUEPRINT header?", "Are LaTeX formulas supported?".

The modal is opened by the `(i)` button next to the page title.

### 6.2 Downloadable template

**New static file:** `frontend/public/import-template.txt`

A ready-to-edit text file containing:
- Comment block explaining the format.
- A `#BLUEPRINT` header with placeholder values.
- Two `#BLOCK` sections.
- Three question examples (one MCQ, one MCQ_MULTI, one ESSAY with model answer).

The "Download template" link on the import page points to `/import-template.txt` with `download` attribute.

---

## Stage 7 — Nav Integration & Post-Commit UX

### 7.1 Nav link

**File:** `src/components/layout/GlobalHeader.tsx`

Add "Import" to the constructor/admin nav:

```ts
const constructorNav = [
    { name: 'Library', href: '/items' },
    { name: 'Import', href: '/import' },   // ← new
    { name: 'Blueprints', href: '/blueprint' },
    { name: 'Sessions', href: '/sessions' },
    { name: 'Grading', href: '/grading' },
    { name: 'Analytics', href: '/analytics' },
];
```

### 7.2 Entry point from blueprint creation

On the `/blueprint` page, below the question rules section, add a subtle link: `Or import questions from a text file →`. This links to `/import?bank_id=<current-bank>` and pre-selects the bank. If the user completes the import and is redirected back, the blueprint page should refresh its question list (the existing `fetchItems` call on mount handles this).

### 7.3 Item library "imported" banner

**File:** `src/app/items/page.tsx`

Read `?imported=true` from the URL. If present, show a dismissible `<Banner tone="success">` at the top of the page: "Import complete — showing newly imported items. [Clear filter ×]". Clearing the filter removes the `?imported=true` param and re-fetches the full list.

This banner auto-dismisses after 8 seconds.

---

## Stage 8 — Verification

### 8.1 Type + build

```bash
cd frontend
npx tsc --noEmit
npx next build
```

Both must exit clean.

### 8.2 Backend tests

```bash
cd backend
pytest tests/test_import_service.py -v
pytest tests/test_import_endpoints.py -v
```

All 15+ unit tests and the API integration tests must pass.

### 8.3 Cleanliness greps

```bash
# Celery bootstrap
test -f backend/app/celery_app.py && echo "OK"
test -f backend/app/db/sync_session.py && echo "OK"
grep -q "celery" backend/requirements.txt && echo "OK"

# Import service exists
test -d backend/app/services/import_service && echo "OK"
test -f frontend/src/app/import/page.tsx && echo "OK"
test -f frontend/src/stores/useImportStore.ts && echo "OK"
test -f frontend/public/import-template.txt && echo "OK"
test -f frontend/src/components/import/FormatGuideModal.tsx && echo "OK"

# No raw string SQL in persister
grep -n "execute\|text(" backend/app/services/import_service/persister.py

# Nav link present
grep -n "Import" src/components/layout/GlobalHeader.tsx

# Rate limit applied
grep -n "rate_limit\|RateLimiter" backend/app/api/endpoints/import_endpoints.py
```

### 8.4 Manual E2E happy path

1. Log in as CONSTRUCTOR.
2. Navigate to `/import` via nav.
3. Paste the canonical 3-question example from Stage 0 (full example section).
4. Click "Parse & Preview" → right panel shows "3 questions parsed across 2 blocks." No errors.
5. Select a bank. Leave "create blueprint" checked.
6. Click "Commit Import" → success toast. Redirected to `/items?bank_id=...&imported=true`.
7. Banner shows "Import complete — showing 3 newly imported items."
8. Navigate to `/blueprint` → new draft blueprint exists with the title from the `#BLUEPRINT` header.
9. Open blueprint → shows 2 blocks with the 3 questions arranged correctly.

### 8.5 Error path verification

1. Paste a document with one MCQ that has no `*`-marked answer.
2. Click Parse & Preview → error shown: "MCQ question has no correct answer marked" with the correct line number. Commit button disabled.
3. Fix the text (add ` *` to one option). Re-parse → no errors. Commit enabled.

### 8.6 Celery path verification (manual)

1. Paste a document with 51+ questions.
2. Commit → response is `status: "queued"`. Progress bar appears in right panel.
3. Poll every 2 seconds until `status: "completed"`. Redirect fires. Items appear in bank.

### 8.7 Aikido scan

Run Aikido security scan before merging. Zero new Critical/High findings.

---

## Files to create / modify

**New backend files:**
- `backend/app/celery_app.py` — Celery application instance (Stage 4.0)
- `backend/app/db/sync_session.py` — sync SQLAlchemy session for Celery workers (Stage 4.0)
- `backend/app/services/import_service/__init__.py`
- `backend/app/services/import_service/lexer.py`
- `backend/app/services/import_service/assembler.py`
- `backend/app/services/import_service/validator.py`
- `backend/app/services/import_service/schemas.py`
- `backend/app/services/import_service/persister.py`
- `backend/app/api/endpoints/import_endpoints.py`
- `backend/app/models/import_job.py`
- `backend/app/tasks/__init__.py`
- `backend/app/tasks/import_tasks.py`
- `backend/alembic/versions/<timestamp>_add_import_jobs_table.py`
- `backend/tests/test_import_service.py`
- `backend/tests/test_import_endpoints.py`

**Modified backend files:**
- `backend/requirements.txt` — add `celery[redis]==5.3.6` (Stage 4.0)
- `backend/app/api/router.py` — register import router
- `backend/app/models/__init__.py` — export `ImportJob`

**New frontend files:**
- `src/app/import/page.tsx`
- `src/stores/useImportStore.ts`
- `src/components/import/FormatGuideModal.tsx`
- `frontend/public/import-template.txt`

**Modified frontend files:**
- `src/components/layout/GlobalHeader.tsx` — add Import nav link
- `src/app/blueprint/page.tsx` — add "Import from text" entry point link
- `src/app/items/page.tsx` — handle `?imported=true` banner

**Directives:**
- `directives/epoch_8_import_parser_blueprint.md` (this file)
- `directives/epoch_roadmap.md` (Epoch 8 entry added; old 8–12 renumbered to 9–13)

---

## Exit Criteria

- `npx tsc --noEmit` and `npx next build` exit clean.
- `pytest backend/tests/test_import_service.py` — all unit tests green (≥ 15 cases).
- `pytest backend/tests/test_import_endpoints.py` — preview + commit + job-poll endpoints all passing.
- E2E: paste canonical example → preview → commit → items in bank → blueprint draft created.
- Error path: MCQ with no correct answer → parsing error shown with correct line number, commit blocked.
- Large-batch path: 51+ questions → queued job, polled to completion, items persisted.
- Nav link "Import" visible for CONSTRUCTOR and ADMIN, absent for STUDENT.
- Aikido scan: zero new Critical/High findings.

---

## Out of Scope (deferred to later epochs)

- QTI XML import (Epoch 12 / interoperability).
- CSV import (the format is row-oriented and serves a different use case — separate ticket).
- Real-time collaborative editing of the import textarea.
- AI-assisted fix suggestions for parse errors (possible Epoch 9+ enhancement).
- Version-merging: importing questions that already exist in the bank creates new LOs (no deduplication). Deduplication logic is a separate high-complexity feature.

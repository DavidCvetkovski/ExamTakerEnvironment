# Epoch 2 Blueprint: The Constructor's Workbench - Advanced Authoring & Versioning

## 1. Executive Summary & Design Philosophy

The primary objective of Epoch 2 is building the "Constructor Domain," matching the specifications of the TestVision conceptual model. In this ecosystem, an "Item" (a single test question or essay prompt) is the atomic unit of learning.

### The Immutable Item Strategy
The most critical architectural constraint for this epoch is **Immutability**. Once an item version is used in a test session, it can **never** be altered. Modifying an item's stem, multiple-choice options, or media attachments constitutes a breaking change to its psychometric properties (Difficulty/Discrimination indices).

Therefore, when an educator edits a question, the system does not execute an `UPDATE` statement on the existing record. Instead, it must:
1. Fetch the latest version entity.
2. Clone its contents into memory.
3. Apply the editor's modifications.
4. Insert a completely *new* `ItemVersion` record in the database, linked to the same parent `LearningObject`, with `version_number + 1`.

This preserves the unbroken historical lineage of every question, enabling psychometricians to compare how Version 1 (Spring term) performed against Version 2 (Fall term).

---

## 2. Database Architectural Blueprint (PostgreSQL)

To achieve strict versioning and flexible configuration, we divide the data model into three layers: Identity, The Anchor (Learning Object), and The Revisions (Item Versions).

### 2.1 The Anchor: `learning_objects`
This table acts as the stable identifier (GUID) for a question across all of time. It holds no content, only metadata that applies universally across all versions.

```python
# backend/app/models/learning_object.py
from datetime import datetime
import uuid
from sqlalchemy import Column, String, DateTime, ForeignKey, Enum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base

class LearningObject(Base):
    __tablename__ = "learning_objects"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    bank_id = Column(UUID(as_uuid=True), ForeignKey("item_banks.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))

    # Relationships
    versions = relationship("ItemVersion", back_populates="learning_object", cascade="all, delete-orphan")
```

### 2.2 The Payload: `item_versions`
This table stores the actual content. Because different question types require radically different data structures (e.g., an Essay question has a min/max word count, a Multiple Choice has an array of options with booleans), we rely heavily on PostgreSQL's `JSONB` data type for flexible, queryable schemas.

```python
# backend/app/models/item_version.py
import enum
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Enum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base

class ItemStatus(enum.Enum):
    DRAFT = "DRAFT"
    READY_FOR_REVIEW = "READY_FOR_REVIEW"
    APPROVED = "APPROVED"
    RETIRED = "RETIRED"

class QuestionType(enum.Enum):
    MULTIPLE_CHOICE = "MULTIPLE_CHOICE"
    MULTIPLE_RESPONSE = "MULTIPLE_RESPONSE"
    ESSAY = "ESSAY"
    HOTSPOT = "HOTSPOT"

class ItemVersion(Base):
    __tablename__ = "item_versions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    learning_object_id = Column(UUID(as_uuid=True), ForeignKey("learning_objects.id"), nullable=False)
    version_number = Column(Integer, nullable=False)
    
    status = Column(Enum(ItemStatus), default=ItemStatus.DRAFT, nullable=False)
    question_type = Column(Enum(QuestionType), nullable=False)
    
    # Structure: { "raw_html": "<p>...</p>", "json": {...} }
    # Using JSONB allows us to store arbitrary WYSIWYG editor state (e.g., TipTap schema)
    content = Column(JSONB, nullable=False) 
    
    # Structure (MCQ): [{"id": "A", "text": "Option 1", "is_correct": true, "weight": 1.0}, ...]
    # Structure (Essay): {"min_words": 100, "max_words": 500, "scoring_rubric": "..."}
    options = Column(JSONB, nullable=False)
    
    # Structure: {"bloom_level": "Analysis", "p_value": 0.8, "d_value": 0.2, "tags": ["math", "calculus"]}
    metadata_tags = Column(JSONB, default=dict)

    created_at = Column(DateTime, default=datetime.utcnow)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))

    learning_object = relationship("LearningObject", back_populates="versions")
```

### 2.3 Media Encapsulation: `media_assets`
To avoid bloating the `item_versions` table and to allow question constructors to reuse the same periodic table diagram 50 times across different questions without duplicating storage, we use a separate media table.

```python
# backend/app/models/media_asset.py
class MediaAsset(Base):
    __tablename__ = "media_assets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    filename = Column(String, nullable=False)
    mime_type = Column(String, nullable=False)  # image/png, video/mp4
    storage_path = Column(String, nullable=False) # e.g., s3://bucket/assets/...
    size_bytes = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
```
The `content` JSONB in `ItemVersion` will reference these UUIDs instead of embedding base64 images. Example: `{"type": "image", "media_id": "uuid-here"}`.

---

## 3. Backend API Definition (FastAPI + Pydantic)

The backend must intercept REST calls, enforce the immutability logic, and handle transitions between editor states (Draft -> Approved).

### 3.1 Pydantic Validation Schemas

To ensure `JSONB` data is properly formatted before hitting the database, we use Pydantic models with Discriminated Unions based on `QuestionType`.

```python
# backend/app/schemas/item.py
from pydantic import BaseModel, ConfigDict, Field
from typing import List, Optional, Literal, Union
from uuid import UUID

class MCQOption(BaseModel):
    id: str
    text: str
    is_correct: bool
    weight: float = 1.0

class OptionsMCQ(BaseModel):
    question_type: Literal[QuestionType.MULTIPLE_CHOICE]
    choices: List[MCQOption]

class OptionsEssay(BaseModel):
    question_type: Literal[QuestionType.ESSAY]
    min_words: Optional[int] = None
    max_words: Optional[int] = None

OptionsSchema = Union[OptionsMCQ, OptionsEssay]

class ItemVersionCreate(BaseModel):
    learning_object_id: UUID
    status: ItemStatus
    question_type: QuestionType
    content: dict  # The TipTap JSON State
    options: OptionsSchema
    metadata_tags: dict

class ItemVersionResponse(ItemVersionCreate):
    id: UUID
    version_number: int
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)
```

### 3.2 The Core Controller: The "Version Up" Logic

The most complex REST endpoint is the `PATCH` or `PUT` route used when a constructor hits "Save" on an existing question.

**Psuedo-algorithm:**
1.  Receive `learning_object_id` and the new Draft state payload.
2.  Begin SQLAlchemy Transaction.
3.  Query `SELECT MAX(version_number) FROM item_versions WHERE learning_object_id = X`.
4.  Query the actual current version entity.
5.  If `current_version.status == DRAFT`, we are allowed to execute a standard SQL `UPDATE` to avoid version explosion during a 2-hour editing session.
6.  If `current_version.status` is `READY_FOR_REVIEW`, `APPROVED`, or `RETIRED`, we **MUST NOT UPDATE**.
7.  Instead, instantiate a `new_item = ItemVersion(...)`.
8.  Set `new_item.version_number = max_version + 1`.
9.  Set `new_item.status = DRAFT`.
10. `db.add(new_item)` and `db.commit()`.

```python
# backend/app/api/endpoints/items.py
@router.post("/learning-objects/{lo_id}/versions", response_model=ItemVersionResponse)
def create_new_revision(
    lo_id: UUID,
    payload: ItemVersionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Fetch the highest local version
    latest_version = db.query(ItemVersion)\
        .filter(ItemVersion.learning_object_id == lo_id)\
        .order_by(ItemVersion.version_number.desc())\
        .first()
        
    if latest_version and latest_version.status == ItemStatus.DRAFT:
        # Optimization: Overwrite the active draft to prevent version bloat
        latest_version.content = payload.content
        latest_version.options = payload.options.model_dump()
        latest_version.metadata_tags = payload.metadata_tags
        db.commit()
        db.refresh(latest_version)
        return latest_version
    
    # If it was Approved or Retired, create a new branch in the timeline
    next_v_num = (latest_version.version_number + 1) if latest_version else 1
    
    new_version = ItemVersion(
        learning_object_id=lo_id,
        version_number=next_v_num,
        status=ItemStatus.DRAFT,
        question_type=payload.question_type,
        content=payload.content,
        options=payload.options.model_dump(),
        metadata_tags=payload.metadata_tags,
        created_by=current_user.id
    )
    db.add(new_version)
    db.commit()
    db.refresh(new_version)
    return new_version
```

---

## 4. Frontend Architecture (Next.js + Zustand + TipTap)

The frontend authoring environment requires desktop-class performance. A 5-second `PATCH` request lag when a user is typing a calculus equation is unacceptable. 

### 4.1 State Management (Zustand over Context API)

We will use Zustand to create a localized `useAuthoringStore`. This store acts as the single source of truth for the active editor session.

```typescript
// frontend/src/stores/useAuthoringStore.ts
import { create } from 'zustand';

interface AuthoringState {
    itemId: string | null;
    status: 'IDLE' | 'SAVING' | 'ERROR';
    questionType: 'MULTIPLE_CHOICE' | 'ESSAY';
    tiptapJson: any;
    options: any; // e.g. [{id: 'A', text: '5', correct: true}]
    
    // Actions
    updateTipTap: (json: any) => void;
    updateOption: (optionId: string, updates: any) => void;
    saveDraft: () => Promise<void>;
}

export const useAuthoringStore = create<AuthoringState>((set, get) => ({
    itemId: null,
    status: 'IDLE',
    questionType: 'MULTIPLE_CHOICE',
    tiptapJson: {},
    options: [],
    
    updateTipTap: (json) => set({ tiptapJson: json }),
    updateOption: (id, updates) => set((state) => ({
        options: state.options.map(opt => opt.id === id ? { ...opt, ...updates } : opt)
    })),
    saveDraft: async () => {
        set({ status: 'SAVING' });
        // Make API call to POST /learning-objects/{id}/versions
        // Set debounce in the hook so API is only called every 2s
        set({ status: 'IDLE' });
    }
}));
```

### 4.2 The TipTap Editor Integration

The WYSIWYG editor must handle academic content. We will construct a generic `QuestionEditor` component wrapping the TipTap engine.

**Required TipTap Extensions:**
*   `StarterKit` (Headings, bold, italic).
*   `Image` (Overridden to interact with our backend `MediaAsset` endpoint).
*   `Table` (For complex layouts or case studies).
*   **Custom Extension: Code Blocks (Syntax Highlighting)**
    *   We will use `@tiptap/extension-code-block-lowlight` with `lowlight` to allow professors to insert code snippets with proper color-coded syntax highlighting for languages like Python and Java.
*   **Custom Extension: LaTeX Math**
    *   We will use `tiptap-extension-math` (leveraging KaTeX) so constructors can write inline expressions e.g., `$\sum_{i=1}^n i^3$` and see them rendered in real-time.

```tsx
// frontend/src/components/editor/TipTapEditor.tsx
'use client'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import MathExtension from '@tiptap-extension/math'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { createLowlight } from 'lowlight'
import { useAuthoringStore } from '@/stores/useAuthoringStore'

// Load languages for syntax highlighting
const lowlight = createLowlight()

export default function TipTapEditor() {
    const { tiptapJson, updateTipTap } = useAuthoringStore();

    const editor = useEditor({
        extensions: [
            StarterKit,
            MathExtension,
            CodeBlockLowlight.configure({ lowlight })
        ],
        content: tiptapJson,
        onUpdate: ({ editor }) => {
            const json = editor.getJSON();
            updateTipTap(json);
            // We can wire up a debounced saveDraft call here
        },
    });

    return <EditorContent editor={editor} />;
}
```

### 4.3 Auto-save Mechanism

To prevent data loss, the UI will implement a debounced auto-save hook. Every time the Zustand store updates, a 3000ms timer starts. If no other keystrokes occur, it fires the `saveDraft()` action implicitly, storing the new payload to the database.

---

## 5. Security & Modular Isolation

All backend controllers for the Authoring Workbench must be placed behind a strict Role-Based Access Control (RBAC) middleware barrier. 

*   `Role: CONSTRUCTOR`: Can draft and edit items, but cannot finalize an `APPROVED` status.
*   `Role: REVIEWER`: Can transition `READY_FOR_REVIEW` to `APPROVED`.
*   `Role: STUDENT`: **Explicitly Denied**. Students cannot access the `/items` or `/learning-objects` routes under any circumstance.

Furthermore, we must implement **Deletion Guards**. A `DELETE /learning-objects/{id}` request must run a cascading database check. If any `item_version` of that parent object is linked to a historical `test_session` record, the strict deletion is aborted with a `409 Conflict`, and the object is gracefully soft-deleted (status set to `RETIRED`) instead. This prevents the deletion of active test history.

---

## 6. Future Roadmap: Bulk Import Parsing

To drastically speed up item creation during future epochs, we will implement a 'Bulk Import' parser. 

*   **Functionality:** A professor pastes a raw text exam (e.g., standard Aiken format or a custom proprietary Markdown format) into a large text area.
*   **Engineering Impact:** The system will parse the text block, detect question stems, separate the multiple-choice options, identify the correct answers via regex or NLP, and automatically generate $N$ discrete `ItemVersion` JSON payloads.
*   **Architecture Note:** This will *not* impact the Epoch 2 data model. The Bulk Import engine will simply act as an orchestration layer that calls the existing `POST /learning-objects/{lo_id}/versions` endpoint iteratively in a background Celery task. Thus, no schema changes are required right now.

---

## 7. Staged Development Roadmap for AI Execution

To prevent overwhelming the parsing context window and to ensure strict verification at every layer, Epoch 2 is divided into 5 isolated, testable stages. **Each stage must be completed, tested, and verified before the AI agent proceeds to the next.**

### Stage 1: The Relational Foundation
**Goal:** Establish the PostgreSQL database schemas and run migrations.
*   **Tasks:**
    *   Initialize Alembic for the FastAPI project.
    *   Create `LearningObject`, `ItemVersion`, and `MediaAsset` SQLAlchemy models.
    *   Define the PostgreSQL ENUMs (`ItemStatus`, `QuestionType`).
    *   Generate and apply the initial Alembic migration.
*   **Verification Gate:** The AI must write a temporary Python script to insert a mock `LearningObject` and `ItemVersion` directly into the database and query it back out successfully.

### Stage 2: The Data Transfer Objects (DTOs)
**Goal:** Create strict Pydantic schemas to validate the complex JSONB structures.
*   **Tasks:**
    *   Create base Pydantic models for `ItemVersionCreate` and `ItemVersionResponse`.
    *   Implement Discriminated Unions to handle the different `options` schemas for `MULTIPLE_CHOICE` vs. `ESSAY`.
*   **Verification Gate:** The AI must write PyTest unit tests that intentionally feed invalid JSON payloads (e.g., missing a required `min_words` for an Essay) to ensure Pydantic throws a `ValidationError`.

### Stage 3: The Immutability Controller (Core API)
**Goal:** Build the FastAPI endpoints that enforce the "Version Up" logic.
*   **Tasks:**
    *   Implement `GET /learning-objects/{lo_id}/versions` to fetch history.
    *   Implement the complex `POST /learning-objects/{lo_id}/versions` endpoint.
    *   Implement the logic: If the latest version is `DRAFT`, update it. If it is `APPROVED`, create `version + 1`.
    *   Implement the cascading `DELETE` safety guard.
*   **Verification Gate:** The AI must write a PyTest suite that simulates an educator saving a draft 3 times (expecting 1 row in DB), approving it, and then saving again (expecting 2 rows in DB).

### Stage 4: Frontend State & Rich Text Setup
**Goal:** Scaffold the Next.js authoring view, Zustand store, and TipTap.
*   **Tasks:**
    *   Install `zustand`, `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-code-block-lowlight`, `lowlight`, and `@tiptap-extension/math`.
    *   Implement `useAuthoringStore.ts` to manage the question state and debounce logic.
    *   Create the `TipTapEditor.tsx` component with the syntax highlighters and KaTeX integrated.
*   **Verification Gate:** The AI must render the `TipTapEditor` on a test Next.js page, type a LaTeX equation (`$E=mc^2$`) and a Python code block, and ensure they render visually correct in the browser.

### Stage 5: Full Stack Integration
**Goal:** Connect the Zustand store to the FastAPI backend.
*   **Tasks:**
    *   Implement the `saveDraft()` action in the Zustand store to `POST` to the FastAPI backend using `fetch` or `axios`.
    *   Create the UI panel for adding/editing Multiple Choice Options.
    *   Create the Status Badge UI (indicating "Saving...", "All changes saved").
*   **Verification Gate:** End-to-end (E2E) manual verification. The user must be able to open the browser, type a question, see the "Saving..." indicator, and verify in PgAdmin or a script that the `item_versions` table was successfully populated.

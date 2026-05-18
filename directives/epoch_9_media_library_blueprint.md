# Epoch 9 — Media Management & Resource Library

> **Status:** Planned (revised 2026-05-18 — see "Revision history" at bottom)
> **Branch:** `feature/epoch-9-media-library`
> **Scope:** Full-stack. 4 backend stages (storage abstraction, model alignment + join table, upload pipeline + endpoints, exam-snapshot URL refresh), 4 frontend stages (resource library UI, TipTap editor + read-only renderer extensions, authoring-store integration with usage tracking, exam-take URL refresh), 1 verification stage. One Alembic migration (rename existing `media_assets` columns + add `item_version_media` join table).

---

## Context

Questions that reference images, diagrams, code screenshots, or embedded videos currently cannot be created. The TipTap editor has no image/video insertion. This epoch adds a complete media pipeline: upload → store → reference → render across all three render contexts (authoring editor, read-only inspection, exam-taking). A single asset can be referenced by multiple item versions without duplication. Deletion of a question never deletes a shared asset.

This feature is directly required for STEM exams (circuit diagrams, formulas-as-images), geography/anatomy, and any question that embeds illustrative media.

---

## Revision history

| Date | Author | Change |
|---|---|---|
| (original) | — | First draft of the plan. |
| 2026-05-18 | Retrospective review | Aligned to current codebase: existing `media_assets` skeleton, TipTap v3.20, conventions from epochs 8.3–8.7. Added stages for exam-snapshot URL refresh, read-only renderer registration, and conftest FK ordering. Documented deferred work (PDF/CSV export, import parser, virus scan, dedup, GDPR). |

---

## Pre-flight: what's already in place

These are non-trivial and the plan must build on them rather than re-introduce:

| Surface | State today |
|---|---|
| `prisma/schema.prisma` `media_assets` model | **Exists** with `id, filename, mime_type, storage_path, size_bytes, created_at, created_by`. Different column names than the original plan proposed — this directive aligns the plan to the existing schema (cheaper than a rename migration) and adds the missing fields via migration. |
| `backend/app/models/media_asset.py` | **Exists** as a SQLAlchemy model mirroring the Prisma schema. |
| `tests/conftest.py` cleanup_database | **Already deletes `media_assets`** between `learning_objects` and `item_banks` — order will need adjusting when `item_version_media` lands (see Stage 2). |
| TipTap | **v3.20** with `StarterKit`, `CodeBlockLowlight`, lowlight, KaTeX. **No image extension**. |
| `ReadOnlyTipTap.tsx` | **Exists** as a separate component used by exam-take, results review, grading, and blueprint inspect. Any new TipTap extension MUST be registered here too or media won't render in those contexts. |
| Authoring store | `tiptapJson` flows through `saveDraft`/`saveItem` with a `computeIsDirty` check. Embedding `assetId` in JSON will reuse this dirty-tracking automatically. |
| Conftest FK lesson | Epoch 8.7 broke conftest's cleanup order by adding `learning_objects.course_id → courses.id`. Same trap awaits us: `item_version_media → item_versions` + `→ media_assets`, both must precede those targets in the truncate sequence. |

---

## Engineering Principles (per CLAUDE.md, with §-refs)

- **Security (§1):** All uploads validated server-side by magic bytes (not just extension). File size limits enforced. Signed CDN URLs with short TTLs for asset delivery — no direct database BLOBs. Backend `403` on `DELETE` is authoritative — never rely on frontend disable.
- **Maintainability (§2):** `MediaAsset` is a first-class domain with its own model, schema, service, and endpoint. Storage backend abstracted behind an interface so MinIO (dev) and AWS S3 (prod) are swappable by `.env` config alone.
- **Modularity (§3):** TipTap media nodes are self-contained — the editor doesn't know about storage. The resource library modal is a standalone component the editor and the standalone page both open.
- **Scalability (§4):** Assets stored in object storage (MinIO/S3), not in Postgres. DB stores only metadata + storage key. The API serves signed redirect URLs — media delivery never touches the API server.
- **Design system (§7):** Use the existing primitives — `<PageShell width="wide">` for `/media`, `<Spinner>` for loading, `<EmptyState>` for empty library, `<Badge tone="...">` for usage counts, `useConfirm()` + `useToast()` for delete dialog + success toasts, `z-50` for the resource library modal, `z-[60]` for upload toasts, design tokens for *every* color. Asset thumbnails go in `rounded-xl` (§7.4).
- **Toast copy (§7.10):** `Image uploaded`, `Video uploaded`, `Asset deleted`, `Upload failed` — sentence case, 1–4 words, no terminal punctuation. Descriptions optional.
- **Single source of truth (§2):** The `extractAssetIds(tiptapJson)` pure utility (see Stage 6) is the *only* place that walks the document tree to find referenced assets. Frontend and backend both call it (or its TS/Py twin) — never re-implement.

---

## Data Model

### Existing: `media_assets` (no rename — additive migration only)

```
id              UUID (PK)                  -- already present
filename        TEXT                       -- already present (original filename)
mime_type       TEXT                       -- already present
storage_path    TEXT                       -- already present (object key in MinIO/S3)
size_bytes      INT                        -- already present
created_at      TIMESTAMPTZ                -- already present
created_by      UUID (FK → users.id)       -- already present
-- new in this epoch ↓
checksum_sha256 TEXT       NULLABLE        -- for future dedup, set on upload, indexed
width_px        INT        NULLABLE        -- images/videos only
height_px       INT        NULLABLE        -- images/videos only
```

**Decision:** keep `filename` / `mime_type` / `storage_path` / `created_by` names from the existing skeleton. The original plan proposed `original_name` / `content_type` / `storage_key` + `storage_url` / `uploaded_by`. The skeleton's names are slightly less expressive but a rename migration buys us nothing and risks coupling 8.7's in-flight changes. **No rename.** The plan's prose previously said `uploaded_by` — read as `created_by` throughout.

`storage_path` semantics: holds the **object key** (e.g. `media/2026/05/c8f1...png`). The full URL is derived at request time by concatenating with the CDN base URL or by signing through the storage backend. The model never stores a fully-qualified URL — that's a per-environment runtime concern.

### New: `item_version_media` join table

```
item_version_id     UUID (FK → item_versions.id, ON DELETE CASCADE)
media_asset_id      UUID (FK → media_assets.id,  ON DELETE RESTRICT)
created_at          TIMESTAMPTZ DEFAULT now()
PRIMARY KEY (item_version_id, media_asset_id)
INDEX        (media_asset_id)              -- for the reverse-lookup "what items use this asset"
```

`ON DELETE CASCADE` on `item_version_id` so removing an item version automatically prunes the join rows (the asset itself is unaffected). `ON DELETE RESTRICT` on `media_asset_id` so a foot-gun `DELETE FROM media_assets` at the DB level fails loudly instead of silently nulling references. The application-level delete endpoint enforces the 409-on-usage rule cleanly above this safety net.

### No changes to existing tables.

---

## Stage 1 — Backend: Storage Backend Abstraction

**Files:**
- `backend/app/services/media/__init__.py` — re-exports
- `backend/app/services/media/storage.py` — `StorageBackend` protocol + `MinIOBackend`
- `backend/app/services/media/keys.py` — pure key-naming helpers (testable without a backend)
- `backend/app/core/config.py` (or wherever Settings live — see "Config location" note below) — new env vars

**Config location note:** the original plan referenced `app/core/config.py` but verify where Settings actually live in the current tree (`grep -rn "BaseSettings\|class Settings" backend/app/core`). Add the env vars wherever the existing `SECRET_KEY` / DB URL settings are defined.

**Design:**

```python
from typing import Protocol

class StorageBackend(Protocol):
    async def upload(self, file_bytes: bytes, key: str, content_type: str) -> None:
        """Write bytes under key. Idempotent on identical contents."""

    async def delete(self, key: str) -> None:
        """Best-effort delete; no error if key already absent."""

    async def get_signed_url(self, key: str, expires_seconds: int) -> str:
        """Return a time-limited URL the client can fetch directly."""
```

`MinIOBackend` uses the `miniopy-async` client. Key naming via `keys.build_object_key(uploader_id, original_filename, content_type) -> str` returning `media/{YYYY}/{MM}/{uuid4}.{ext}`. The year/month prefix avoids object-store hotspot bottlenecks. Filename never goes into the key (it's stored in DB as `filename`); the key is a UUID for safety against path traversal / collision.

A module-level `get_storage_backend() -> StorageBackend` reads `MEDIA_STORAGE_BACKEND` from settings and returns the singleton. Defaults to `MinIOBackend` in dev. Stage 3's endpoints depend on this factory, not on a concrete class — that's what makes the backend swappable.

**Validation rules (enforced in the service layer of Stage 2, before passing to storage):**
- Accepted MIME types (config-driven, not hard-coded): `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `video/mp4`, `video/webm`, `application/pdf`. **`image/svg+xml` deliberately excluded** — SVG is an XSS vector via embedded `<script>`. Adding it later requires server-side SVG sanitization.
- Max size: 50 MB (configurable via `MEDIA_MAX_SIZE_MB`).
- Magic byte check via `python-magic` (libmagic). First 4 KB of the upload is sniffed; the detected MIME must match the declared `Content-Type` header. Rejects disguised executables.

**Tests for Stage 1 (`backend/tests/unit/test_media_storage_keys.py`, pure unit):**
- `build_object_key` produces `media/YYYY/MM/<uuid>.<ext>` shape.
- Same call twice returns *different* keys (UUID component).
- Unknown content-types raise `ValueError` rather than producing a key with no extension.
- Path-traversal characters in `original_filename` never reach the key.

**Mocked-backend tests for the service layer arrive in Stage 2.**

---

## Stage 2 — Backend: Model Alignment, Migration & Service

**Files:**
- `backend/app/models/media_asset.py` — extend existing model with new columns
- `backend/app/models/item_version_media.py` — new SQLAlchemy model for the join table
- `backend/app/schemas/media_asset.py` — Pydantic DTOs
- `backend/app/services/media/service.py` — business logic
- `backend/alembic/versions/<rev>_media_assets_metadata_and_join.py` — additive migration
- `prisma/schema.prisma` — add the new columns + join model + back-relations
- `backend/tests/conftest.py` — extend `cleanup_database` (see "Conftest fix" subsection)

**Migration scope:**
1. Add `checksum_sha256`, `width_px`, `height_px` to `media_assets`. All nullable for backward compat.
2. Create `item_version_media` with FKs and indexes per the data-model section.
3. Index `media_assets(checksum_sha256)` to make future dedup cheap.
4. No data backfill — all existing items have zero media references.

**Path correction from original plan:** `backend/alembic/versions/` (the original plan said `backend/migrations/` which doesn't exist).

**Conftest fix (mandatory):** the cleanup_database fixture in `tests/conftest.py` currently does:

```
… → exam_sessions → scheduled_exam_sessions → course_enrollments
   → test_definitions → item_versions → learning_objects
   → media_assets → item_banks → users
   → courses (last, after the 8.7 fix)
```

Insert `item_version_media.delete_many()` **before** `item_versions.delete_many()` and **before** `media_assets.delete_many()`. The 8.7 epoch already taught us this lesson when `learning_objects.course_id` was added without conftest discipline.

**Service functions:**

```python
async def upload_media_asset(file: UploadFile, uploader_id: str) -> MediaAsset:
    """Read body, magic-byte check, hash, upload to storage, persist."""

async def list_media_assets(uploader_id: str | None = None) -> list[MediaAssetSummary]:
    """Return all assets with their usage counts via a single JOIN —
    avoids N+1 when the resource library has thousands of assets."""

async def get_media_asset(asset_id: UUID) -> MediaAssetResponse: ...

async def get_signed_url(asset_id: UUID, ttl_seconds: int = 3600) -> SignedUrlResponse:
    """Return {url, expires_at}. Default 60-min TTL for authoring;
    callers in exam-take context pass a longer TTL via Stage 4 / Stage 8."""

async def get_asset_usage(asset_id: UUID) -> AssetUsageResponse:
    """Returns {item_version_ids, item_titles_preview}. Reads via
    item_version_media. Powers both the delete-guard dialog and the
    AssetUsagePanel."""

async def delete_media_asset(asset_id: UUID, requester: User) -> None:
    """Delete asset from storage + DB. Raise 409 if referenced.
    Raise 403 if requester is neither uploader nor ADMIN."""

async def sync_referenced_assets(item_version_id: str, asset_ids: list[str]) -> None:
    """Replace the join rows for this item version. Idempotent.
    Called by the item-version save path (Stage 6)."""
```

**Schema example — `MediaAssetSummary`** (returned by list endpoint, includes usage count):

```python
class MediaAssetSummary(BaseModel):
    id: UUID
    filename: str
    mime_type: str
    size_bytes: int
    created_at: datetime
    created_by: UUID
    usage_count: int          # 0 = unreferenced, ready to delete
    width_px: int | None
    height_px: int | None
```

**Tests in this stage (`backend/tests/test_media_service.py`):**
- Upload happy path with mocked storage → row persists, hash computed.
- Upload rejects disguised executable → `ValueError` from service.
- Upload over size limit → `ValueError` with the limit in the message.
- `sync_referenced_assets`: replacing `[a, b]` with `[b, c]` removes `a`, keeps `b`, adds `c`.
- `delete_media_asset` blocks when usage > 0; allows when 0; uploader-vs-admin RBAC paths.

---

## Stage 3 — Backend: Media API Endpoints

**Files:**
- `backend/app/api/endpoints/media.py`
- `backend/app/api/router.py` — register `/api/media` prefix

**Endpoints:**

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| `POST`   | `/api/media/upload`              | CONSTRUCTOR / ADMIN | Multipart. Returns `MediaAssetResponse`. 413 on oversize, 415 on type mismatch. |
| `GET`    | `/api/media/`                    | CONSTRUCTOR / ADMIN | List with usage counts. `?uploader_me=true` filter. Paginated (default 50/page) — the original plan forgot pagination, and §4 mandates it on every list. |
| `GET`    | `/api/media/{asset_id}`          | CONSTRUCTOR / ADMIN | Single asset metadata. |
| `GET`    | `/api/media/{asset_id}/url`      | All authenticated   | `{ url, expires_at }`. Accepts `?ttl=` query (clamped 60–14400s = 1min–4h). Students can call this for assets referenced by their active exam. |
| `GET`    | `/api/media/{asset_id}/usage`    | CONSTRUCTOR / ADMIN | `{ item_version_ids, items_preview }` (titles + LO IDs of first 10). |
| `DELETE` | `/api/media/{asset_id}`          | uploader or ADMIN   | 409 if `usage_count > 0`. 403 if requester is not uploader/admin. |

**Auth-on-`/url` rationale:** authenticated students must be able to fetch signed URLs for media in their active exam without elevation. The deeper security rule — "this student is currently sitting an exam that references this asset" — is hard to enforce cheaply at the URL endpoint; we accept the lower bar of "is authenticated" + "signed URL TTL is short". A signed URL leaked between students still expires in minutes.

**Security notes per endpoint:**
- `POST /upload`: FastAPI `UploadFile` only — no raw body parsing.
- `GET /url`: returns a signed URL, never serves bytes through the API.
- `DELETE`: the uploader-or-admin gate is in the service layer (CLAUDE.md §1: backend authoritative).
- Cross-tenant: in v1, all CONSTRUCTOR/ADMIN see all assets (institution-wide library). If 8.7 course-scoping becomes the org pattern, revisit.

**Tests (`backend/tests/test_media_api.py`):**
- Happy path upload (with monkeypatched storage backend) → 200, response shape.
- Upload `.exe` disguised as `.png` → 415.
- Upload 51 MB file → 413.
- Upload from STUDENT → 403.
- `GET /` happy path + pagination + `uploader_me` filter.
- `GET /` from STUDENT → 403.
- `GET /{id}/url` from STUDENT → 200 (auth bar is "logged in").
- `GET /{id}/url` with `ttl=999999` → clamped to 14400.
- `GET /{id}/usage` after referencing → list of expected item_version_ids.
- `DELETE` referenced asset → 409.
- `DELETE` unreferenced asset by uploader → 204; storage backend's `delete` called once.
- `DELETE` unreferenced asset by *another* constructor → 403 (cross-tenant).
- `DELETE` unreferenced asset by ADMIN → 204 (admin override).
- Unknown asset_id → 404 from `/`, `/url`, `/usage`, `DELETE`.

---

## Stage 4 — Backend: Frozen-Snapshot URL Refresh Endpoint

> *New stage — the original plan missed the exam-take URL problem.*

**The problem.** When a student starts an exam, items are frozen into `exam_sessions.items` JSONB (Epoch 4.2 "The Freeze"). If items contain TipTap nodes with `assetId`, the frozen snapshot does *not* contain signed URLs — those expire. A 3-hour exam plus a 60-min signed-URL TTL means images break mid-exam.

**The fix.** Add a focused endpoint the frontend can batch-call to refresh URLs for an exam session's media:

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| `POST` | `/api/sessions/{session_id}/media-urls` | session owner | Body: `{ asset_ids: [str, …] }`. Returns `{ asset_id → { url, expires_at } }`. TTL = remaining session time + 5 min buffer, capped at 4h. |

**Server-side checks:**
- Caller owns the session (re-uses existing session-ownership gate).
- Each requested `asset_id` must appear in the session's frozen item snapshots — otherwise 403 (no using your active session as a free signed-URL generator for arbitrary assets).
- Practice sessions and assigned sessions both work.

**Tests:**
- Student fetches URLs for assets in their session → 200, TTLs reasonable.
- Student fetches URL for asset NOT in their session → 403.
- Other student fetches URLs for someone else's session → 403.
- Submitted session can still refresh (results review needs to render the same media).

---

## Stage 5 — Frontend: Resource Library UI

**Files:**
- `frontend/src/lib/media.ts` — `MediaAsset`, `fetchAssets`, `uploadAsset`, `deleteAsset`, `getSignedUrl`, `getAssetUsage` — pure API client, no React imports (§3).
- `frontend/src/stores/useMediaStore.ts` — Zustand store wrapping the lib.
- `frontend/src/components/media/ResourceLibraryModal.tsx`
- `frontend/src/components/media/UploadZone.tsx`
- `frontend/src/components/media/AssetCard.tsx`
- `frontend/src/components/media/AssetUsagePanel.tsx`
- `frontend/src/app/media/page.tsx`

**`useMediaStore` shape** (revised from original — supports concurrent uploads):

```ts
interface UploadJob {
    id: string;            // client-side UUID
    file: File;
    progress: number;      // 0–100
    status: 'queued' | 'uploading' | 'done' | 'error';
    error: string | null;
    assetId: string | null;
}

interface MediaState {
    assets: MediaAsset[];
    assetsByUsage: Record<string, number>;  // cached usage counts
    isLoading: boolean;
    uploads: UploadJob[];                    // <-- per-file, not single
    error: string | null;

    fetchAssets: (opts?: { uploaderMe?: boolean }) => Promise<void>;
    uploadFiles: (files: File[]) => Promise<MediaAsset[]>;  // bulk
    deleteAsset: (id: string) => Promise<void>;
    getSignedUrl: (id: string, ttlSeconds?: number) => Promise<string>;
    refreshAssetUsage: (id: string) => Promise<number>;
}
```

**`ResourceLibraryModal` (using existing primitives):**
- `z-50` overlay (CLAUDE.md §7.4.1).
- `rounded-2xl` container (§7.4).
- Search input + filter chips (`Images`, `Videos`, `PDFs`) at top.
- Grid view default (thumbnails); list view secondary (filename, size via `formatBytes`, upload date via `formatRelativeTime`, usage badge).
- Empty state: `<EmptyState title="No assets yet" description="Upload your first image to get started." />`.
- Selecting an asset calls `onSelect(asset)` + closes.
- Upload sub-panel reachable via header button — opens inline `<UploadZone>`.
- Per-card `<Badge tone="neutral" size="sm">In use: 3 items</Badge>` (or `<Badge tone="success" size="sm">Unused</Badge>` for `usage_count == 0`).
- Props: `open, onClose, onSelect, accept?` (MIME filter).

**`UploadZone` behavior:**
- Drag-and-drop + click-to-browse.
- Client-side type + size check (mirrors backend rules) for instant feedback.
- Per-file progress row using XHR `upload.onprogress` events (`useMediaStore.uploads`).
- On success: asset prepended to grid; `useToast({ title: 'Image uploaded' })`. (§7.10 — sentence case, no period.)
- On failure: row stays visible with retry button.

**`/media` standalone page:**
- `<PageShell width="wide">` (§7.5 — same shell as `/items`).
- `<BackButton href="/" />` if there's an upstream context, otherwise omitted.
- Same grid as the modal, plus per-asset action menu (View Usage / Delete).
- Add "Media" nav link in `GlobalHeader` for CONSTRUCTOR/ADMIN. **Hidden for STUDENT.**

---

## Stage 6 — Frontend: TipTap Media Extensions (Editor + Read-Only)

> *Expanded from original — must register in BOTH editors.*

**Files:**
- `frontend/src/components/editor/extensions/MediaNode.ts`
- `frontend/src/components/editor/extensions/VideoNode.ts`
- `frontend/src/components/editor/extensions/__init__.ts` — re-export the shared extension list
- `frontend/src/components/editor/toolbar/MediaToolbarButtons.tsx` — image + video buttons
- `frontend/src/components/editor/TipTapEditor.tsx` — register extensions + toolbar buttons
- `frontend/src/components/editor/ReadOnlyTipTap.tsx` — **register the SAME extensions** so images render in exam-take, results review, grading, and blueprint inspect
- `frontend/src/lib/extractAssetIds.ts` — pure utility that walks TipTap JSON and returns `Set<string>` of `assetId`s. **Single source of truth** for "what media does this item reference" — backend has the Python twin (`backend/app/services/media/extract.py`). Both share unit tests with identical fixture documents.

**Image node (`MediaNode`):**
- Renders as `<figure>` with `<img>` + optional `<figcaption>`.
- Attributes (stored in TipTap JSON):
  - `assetId` — durable, never reused, the only field needed to re-fetch a URL.
  - `alt` — required, validated on save (warning if empty).
  - `width`, `align` (`left | center | right`).
- Attributes NOT stored: `src` (always derived at render time from `assetId`).
- `NodeView` uses `useMediaStore.getSignedUrl(assetId)` on mount; while pending shows a `<Spinner size="sm" />` (§7.3).
- Inline resize handles via `NodeViewWrapper`. Resize updates `width` attribute.

**Video node (`VideoNode`):**
- Same `assetId`-only attribute pattern.
- Renders `<video controls>`. No resize; `max-width: 100%`.

**Signed URL handling:**
- On editor (or read-only) mount, scan TipTap JSON via `extractAssetIds`. Batch-fetch via `useMediaStore.getSignedUrl` — single call per asset, results memoized in `useMediaStore`.
- **In `/exam/[id]` context only:** the renderer uses the Stage 4 batch endpoint (`POST /api/sessions/{id}/media-urls`) instead of the per-asset one, getting URLs scoped to the remaining exam window. The renderer is told it's in exam context via a React context provider set up in the exam-take page.
- **URL refresh in long sessions:** the renderer schedules a re-fetch 50 minutes before the longest signed URL expires. Implemented in `useMediaStore.scheduleRefresh(sessionId)`.

**Toolbar:**
- "Insert Image" + "Insert Video" — two buttons, each opens `ResourceLibraryModal` with the appropriate `accept` filter.
- After selection, fetches signed URL, inserts the node at cursor.
- Buttons hidden when `editor.isEditable === false` — already handled by the toolbar's general visibility rule.

---

## Stage 7 — Frontend: Authoring-Store Integration & Item-Version Save

**Files:**
- `frontend/src/stores/useAuthoringStore.ts` — extract+send `referenced_media_ids` on save
- `backend/app/services/items_service.py` — accept `referenced_media_ids` in version-create payload, call `sync_referenced_assets`
- `backend/app/schemas/item_version.py` — `referenced_media_ids: list[UUID] | None`

**Save flow:**

1. On `saveDraft` / `saveItem`, the store extracts `Set<assetId>` from `tiptapJson` via `extractAssetIds(state.tiptapJson)`.
2. The set is included in the version-save payload as `referenced_media_ids: list[str]`.
3. The backend `create_new_revision` service (after persisting the new item_version) calls `sync_referenced_assets(version_id, asset_ids)`.
4. Older versions retain their old join rows — versioning is preserved (§8.2 lock semantics depend on this).

**Reuse + duplicate flow:**
- The existing `duplicate_learning_object` (§8.7) copies content + options + metadata. **It must also copy `item_version_media` join rows** to the new latest version. Update `duplicate_learning_object` accordingly — without this, a duplicate would have all the right TipTap JSON but no join rows, breaking the usage panel and the delete guard.
- Add a regression test for duplicate-preserves-media in `test_items_api.py`.

**Deletion guard UX:**
- `useConfirm()` dialog when uploader clicks delete on `usage_count > 0`:
  - Title: `Delete this asset?` (question, §7.10)
  - Message: `This image is used in {n} question{plural}. Deleting it will break those references.`
  - Confirm: `Yes, delete` (action verb).
  - Tone: `danger`.

---

## Stage 8 — Backend: Cross-Cutting Touches

> *New, consolidated stage for things that bleed across other epochs.*

**8.1 Duplicate-preserves-media regression:**
- Update `app/services/items_service.duplicate_learning_object`.
- Test: duplicate an LO whose latest version references assets `[a, b]` → new LO's latest version has the same join rows.

**8.2 Cascade on item-version delete:**
- The `ON DELETE CASCADE` on `item_version_media.item_version_id` handles the case where an item_version row is hard-deleted. Item versions are normally never hard-deleted (RETIRED status instead), but the cascade is the right safety net.

**8.3 Locked-blueprint guard parity:**
- §8.2 says questions referenced by an ONGOING/PASSED blueprint are locked. This already blocks edits + deletes via `items_service` guards. Media deletion piggybacks on the existing 409-on-usage check — a locked item still has join rows, so the asset can't be deleted from under it. **Verify** this with a test (`test_media_api.test_delete_blocked_by_locked_blueprint_via_usage_count`).

**8.4 Frozen snapshots store `assetId`, not URLs:**
- Verify that `exam_sessions.items` JSONB snapshots — which today contain the rendered item version's content — store the TipTap JSON with `assetId` and no `src`. If the snapshot path inadvertently fetches and embeds a signed URL at freeze time, that URL will expire mid-exam. Audit `exam_sessions_service.instantiate_*_session` for any URL-resolution step on save. Document in the service that snapshots are URL-free by contract.

---

## Stage 9 — Verification

**Backend:**
- `pytest backend/tests/test_media_storage_keys.py backend/tests/test_media_service.py backend/tests/test_media_api.py` — all green.
- Full backend suite still green (target: 290+ tests after this epoch's additions).
- `python-magic` requires `libmagic1` in the Docker image — verify the backend Dockerfile installs it (likely `apt-get install -y libmagic1` in the base layer).

**Frontend:**
- `npx tsc --noEmit` passes.
- `npx next build` passes.
- Grep gate: `grep -rE "(border|bg|text)-(blue|cyan|red|…)-[0-9]" frontend/src/components/media` returns empty (§7.1).
- Grep gate: `grep -rn "z-\[" frontend/src/components/media` returns empty (use the scale, §7.4.1).

**Manual matrix:**
- [ ] MinIO container running: `docker compose ps minio` → healthy.
- [ ] Upload PNG → appears in `/media` grid; thumbnail renders.
- [ ] Insert image into TipTap → preview renders.
- [ ] Save item → close + reopen item → image still renders (signed URL refreshed via `assetId`).
- [ ] Upload same image file twice → two separate assets (dedup is deferred).
- [ ] Same image inserted into two items → usage badge = `In use: 2 items`.
- [ ] Delete one of those items → usage badge updates to `In use: 1 item`.
- [ ] Try to delete the asset while in use → confirm dialog with consequence text → cancel preserves; confirm 409s from API.
- [ ] Make `usage_count == 0` → delete succeeds; MinIO object gone.
- [ ] Upload `.exe` renamed to `.jpg` → 415 toast in UploadZone.
- [ ] Upload 51 MB file → 413 toast.
- [ ] STUDENT-role user has no `Media` link in nav; `/media` direct URL redirects or 403s.
- [ ] **Long exam path:** start a 3-hour scheduled exam with an image item; verify the image still renders after >60 minutes (URL refresh kicked in).
- [ ] **Read-only contexts:** open a graded session in `/grading/test/{id}/run/{runId}` — images render. Open a results-review page as a student — images render.
- [ ] **Duplicate path:** duplicate an item that uses 2 assets — the duplicate's preview shows both images; both assets show `In use: 2 items`.
- [ ] **Theme matrix (§7.12):** asset grid + upload zone + modal look correct under `dark`, `warm`, `light-blue` with zero code branching.
- [ ] Aikido scan: zero new Critical/High findings.

---

## Out of scope (explicitly deferred, with rationale)

| Item | Why deferred |
|---|---|
| **Dedup on upload by `checksum_sha256`** | Field is indexed and populated, but the deduplication logic (reuse existing asset row instead of creating a new one) is a v2 optimization. Risk: user expectations around "I uploaded this file twice and got two entries" change; collision handling needs UX. |
| **SVG support** | XSS risk via embedded `<script>` requires server-side SVG sanitization (e.g. `bleach` or DOMPurify-on-the-server). Worth its own micro-epoch. |
| **Virus scanning** | A stub is mentioned in `upload_media_asset`. Production should integrate ClamAV or VirusTotal API. For an institutional product where uploaders are authenticated constructors, the risk profile is "low but real". |
| **Import-parser media syntax** | Epoch 8 import (`#Q` / `TYPE:` / etc.) has no syntax for referencing media. Plain-text imports can't include images. If/when this is needed, propose `IMAGE: <asset-uuid>` or `MEDIA: <filename>` (with a separate upload step) in an Epoch 9.x addendum. |
| **Analytics PDF embedding** | Epoch 7's PDF export currently renders item HTML; with images, the PDF either embeds the bytes (bigger file, slow) or shows broken images. v2 should fetch + embed at render time. Track as a follow-up; this epoch's PDF export tests should NOT cover images. |
| **CSV export of asset URLs** | Same concern for the CSV export — out of scope. |
| **CDN in production (CloudFront/Fastly)** | The dev `MEDIA_CDN_BASE_URL` points directly at MinIO. Prod deployment must front S3 with a real CDN; ops concern, not engineering. |
| **GDPR retention / right-to-delete** | A user-uploaded photo of a person is PII. v1 has no auto-delete or retention policy. Document in `directives/todo.md` and revisit before any production deployment in the EU. |
| **Bulk delete from `/media` page** | UploadZone supports bulk upload (Stage 5); bulk delete is symmetric but deferred until usage data tells us it's wanted. |
| **Asset replacement (re-upload preserving asset_id)** | Lets a constructor fix a typo in a diagram without re-inserting it everywhere. Out of scope; in v1, fix-and-reinsert is the workflow. |
| **Course-scoping of assets** | Epoch 8.7 made questions course-aware; assets remain institution-wide. Revisit if cross-course leakage becomes a concern. |

---

## Docker Compose Addition

```yaml
minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    ports:
        - "9000:9000"
        - "9001:9001"
    environment:
        MINIO_ROOT_USER: ${MINIO_ACCESS_KEY}
        MINIO_ROOT_PASSWORD: ${MINIO_SECRET_KEY}
    volumes:
        - minio_data:/data
    healthcheck:
        test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
        interval: 10s
        timeout: 5s
        retries: 3

volumes:
    minio_data:
```

**Bucket bootstrap:** add an init container or a Makefile target:

```bash
make media-bucket  # runs `mc alias set local … && mc mb local/openvision-media || true`
```

Avoid embedding bucket creation in app startup — keeps the app stateless (§4).

**Dockerfile additions (backend):**
```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends libmagic1 && rm -rf /var/lib/apt/lists/*
```

**New `.env` additions:**
```
MEDIA_STORAGE_BACKEND=minio
MINIO_ENDPOINT=http://localhost:9000
MINIO_ACCESS_KEY=openvision_dev
MINIO_SECRET_KEY=openvision_dev_secret
MINIO_BUCKET=openvision-media
MEDIA_CDN_BASE_URL=http://localhost:9000/openvision-media
MEDIA_MAX_SIZE_MB=50
MEDIA_SIGNED_URL_DEFAULT_TTL_SECONDS=3600
MEDIA_SIGNED_URL_MAX_TTL_SECONDS=14400
```

---

## New Python Dependencies

```
miniopy-async>=1.18
python-magic>=0.4.27           # requires libmagic in the image
python-multipart>=0.0.6        # verify existing — needed for FastAPI UploadFile
```

## New npm Dependencies

```
@tiptap/extension-image@^3.20.0    # match the installed StarterKit major version
```

> Pin to the same major as `@tiptap/starter-kit` (currently `^3.20.0`). Mismatched majors across TipTap extensions cause subtle ProseMirror schema bugs.

---

## Migration / Rollout Plan

1. Add `minio` service to `docker-compose.yml`; bring it up locally; create the bucket.
2. Apply the Alembic migration: adds 3 new columns to `media_assets` + creates `item_version_media`.
3. Rerun Prisma generate (`npx prisma generate`) — model schema now exposes the new columns + join model.
4. Update `tests/conftest.py` cleanup order (Stage 2).
5. Backend stages 1 → 4 in order; each stage's tests must pass before the next.
6. Frontend stages 5 → 7 in order; rebuild `tsc` at each stage boundary.
7. Stage 8 cross-cutting touches.
8. Stage 9 verification + manual matrix.
9. Aikido scan; resolve before merge.
10. Merge to `main` via PR.

---

## Exit Criteria

- All 9 stages complete.
- `tsc --noEmit` + `next build` + full backend `pytest` green.
- MinIO running in Docker Compose with health check passing.
- Manual verification matrix complete, including the **two new bits** beyond the original plan: long-exam URL refresh and read-only renderer parity.
- Aikido scan: zero new Critical/High findings.
- Stage 8 duplicate-preserves-media regression test in place and green.
- Merged to `main`.

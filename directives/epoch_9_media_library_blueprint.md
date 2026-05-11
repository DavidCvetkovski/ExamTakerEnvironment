# Epoch 9 — Media Management & Resource Library

> **Status:** Planned  
> **Branch:** `feature/epoch-9-media-library`  
> **Scope:** Full-stack. 3 backend stages (upload pipeline, resource model, CDN delivery), 3 frontend stages (resource library UI, TipTap integration, import/reuse flows), 1 verification stage. One Alembic migration (new `MediaAsset` table).

---

## Context

Questions that reference images, diagrams, code screenshots, or embedded videos currently cannot be created. The TipTap editor has no image/video insertion. This epoch adds a complete media pipeline: upload → store → reference → render. A single asset can be referenced by multiple questions without duplication. Deletion of a question never deletes a shared asset.

This feature is directly required for STEM exams (circuit diagrams, formulas-as-images), geography/anatomy (hotspot prep), and any question that embeds illustrative media.

---

## Engineering Principles (per CLAUDE.md)

- **Security:** All uploads validated server-side by magic bytes (not just extension). File size limits enforced. Signed CDN URLs with short TTLs for asset delivery — no direct database BLOBs.
- **Maintainability:** `MediaAsset` is a first-class domain with its own model, schema, service, and endpoint. Storage backend abstracted behind an interface so MinIO (dev) and AWS S3 (prod) are swappable by `.env` config alone.
- **Modularity:** TipTap media extension is a self-contained TipTap node — the editor doesn't know about storage details. The resource library modal is a standalone component the editor just opens.
- **Scalability:** Assets stored in object storage (MinIO/S3), not in Postgres. DB stores only metadata + URL. The API serves signed redirect URLs — media delivery never touches the API server.
- **Ease of change:** The storage interface (`StorageBackend`) has two methods: `upload(file) → url` and `delete(key)`. Adding a new backend (GCS, Cloudflare R2) is a single class implementation.

---

## Data Model

### New: `MediaAsset` table

```
id              UUID (PK)
original_name   TEXT
storage_key     TEXT          -- object key in MinIO/S3
storage_url     TEXT          -- base URL (not CDN-signed)
content_type    TEXT          -- MIME type (image/jpeg, video/mp4, etc.)
size_bytes      INT
uploaded_by     UUID (FK → users.id)
created_at      TIMESTAMPTZ
```

### New: `item_version_media` join table

```
item_version_id     UUID (FK → item_versions.id)
media_asset_id      UUID (FK → media_assets.id)
PRIMARY KEY (item_version_id, media_asset_id)
```

This join table tracks which item versions reference which assets, enabling usage tracking without parsing TipTap JSON.

### No changes to existing tables.

---

## Stage 1 — Backend: Storage Backend Abstraction

**Files:**
- `backend/app/services/media/storage.py` — `StorageBackend` protocol + `MinIOBackend` implementation
- `backend/app/core/config.py` — new env vars: `MEDIA_STORAGE_BACKEND`, `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`, `MEDIA_CDN_BASE_URL`

**Design:**

```python
class StorageBackend(Protocol):
    async def upload(self, file_bytes: bytes, key: str, content_type: str) -> str: ...
    async def delete(self, key: str) -> None: ...
    async def get_signed_url(self, key: str, expires_seconds: int) -> str: ...
```

`MinIOBackend` uses the `miniopy-async` client. Keys are structured as `media/{year}/{month}/{uuid}.{ext}` to avoid hotspots in object stores.

A module-level `get_storage_backend() -> StorageBackend` function reads `MEDIA_STORAGE_BACKEND` from env and returns the appropriate instance. Defaults to `MinIOBackend` in dev.

**Validation rules (enforced in upload service, before passing to storage):**
- Accepted MIME types: `image/jpeg`, `image/png`, `image/gif`, `image/svg+xml`, `image/webp`, `video/mp4`, `video/webm`, `application/pdf`
- Max size: 50 MB (configurable via `MEDIA_MAX_SIZE_MB` env var)
- Magic byte check: first 16 bytes of file must match known signatures for the declared MIME type. Rejects disguised executables.

---

## Stage 2 — Backend: MediaAsset Model, Schema & Service

**Files:**
- `backend/app/models/media_asset.py` — SQLAlchemy `MediaAsset` model
- `backend/app/schemas/media_asset.py` — Pydantic DTOs (`MediaAssetCreate`, `MediaAssetResponse`, `MediaAssetListResponse`)
- `backend/app/services/media/service.py` — business logic
- `backend/migrations/versions/XXXX_add_media_assets.py` — Alembic migration

**Service functions:**

```python
async def upload_media_asset(file: UploadFile, uploader_id: str) -> MediaAsset:
    """Validate, virus-check stub, upload to storage, persist metadata."""

async def list_media_assets(uploader_id: str | None = None) -> list[MediaAsset]:
    """Return all assets. Optional filter by uploader."""

async def get_media_asset(asset_id: UUID) -> MediaAsset:
    """Fetch single asset or raise 404."""

async def get_signed_url(asset_id: UUID) -> str:
    """Return a short-lived (60 min) signed URL for delivery."""

async def delete_media_asset(asset_id: UUID, requester_id: str, is_admin: bool) -> None:
    """Delete asset from storage + DB. Raise 409 if referenced by any item version."""
```

**Usage tracking:** Before deletion, query `item_version_media` to find references. If any exist, raise `HTTP 409 Conflict` with a list of affected item IDs — never silently delete a referenced asset.

**Schema example — `MediaAssetResponse`:**
```python
class MediaAssetResponse(BaseModel):
    id: UUID
    original_name: str
    content_type: str
    size_bytes: int
    url: str           # base URL — client should use /media/{id}/url for signed delivery
    uploaded_by: str
    created_at: datetime
```

---

## Stage 3 — Backend: Media API Endpoints

**Files:**
- `backend/app/api/endpoints/media.py`
- `backend/app/api/router.py` — register `/api/media` prefix

**Endpoints:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/media/upload` | CONSTRUCTOR / ADMIN | Multipart upload. Returns `MediaAssetResponse`. |
| `GET` | `/api/media/` | CONSTRUCTOR / ADMIN | List all assets. Optional `?uploader_me=true` filter. |
| `GET` | `/api/media/{asset_id}` | CONSTRUCTOR / ADMIN | Get single asset metadata. |
| `GET` | `/api/media/{asset_id}/url` | CONSTRUCTOR / ADMIN | Returns `{ signed_url: str, expires_at: datetime }`. |
| `GET` | `/api/media/{asset_id}/usage` | CONSTRUCTOR / ADMIN | Returns `{ item_version_ids: list[str] }`. |
| `DELETE` | `/api/media/{asset_id}` | CONSTRUCTOR / ADMIN | Delete asset. 409 if in use. |

**Security notes:**
- `POST /upload` uses `UploadFile` from FastAPI — no raw body parsing.
- `GET /url` returns a signed URL, not the asset itself. The media is served by MinIO/S3, not the API.
- All endpoints require the requesting user to have `CONSTRUCTOR` or `ADMIN` role.
- `DELETE` additionally checks that the requester is either the uploader or an ADMIN.

**Tests (`backend/tests/test_media_api.py`):**
- Happy path upload → assert stored, metadata returned.
- Upload wrong type (`.exe` disguised as `.png`) → 415 Unsupported Media Type.
- Upload exceeds size limit → 413 Request Entity Too Large.
- Delete referenced asset → 409 Conflict.
- Delete unreferenced asset → 204 No Content, verify storage key deleted.

---

## Stage 4 — Frontend: Resource Library UI

**Files:**
- `frontend/src/stores/useMediaStore.ts` — Zustand store for asset list + upload state
- `frontend/src/components/media/ResourceLibraryModal.tsx` — grid/list modal
- `frontend/src/components/media/UploadZone.tsx` — drag-and-drop uploader
- `frontend/src/components/media/AssetCard.tsx` — thumbnail card with usage badge
- `frontend/src/app/media/page.tsx` — standalone `/media` route (constructor/admin only)

**`useMediaStore` shape:**
```ts
interface MediaState {
    assets: MediaAsset[];
    isLoading: boolean;
    uploadProgress: number | null; // 0–100
    error: string | null;

    fetchAssets: () => Promise<void>;
    uploadAsset: (file: File) => Promise<MediaAsset>;
    deleteAsset: (id: string) => Promise<void>;
    getSignedUrl: (id: string) => Promise<string>;
}
```

**`ResourceLibraryModal` behavior:**
- Props: `open`, `onClose`, `onSelect(asset: MediaAsset): void`, `accept?: string[]` (MIME type filter).
- Header: search bar + filter chips (`Images`, `Videos`, `PDFs`).
- Grid view (default): thumbnails. List view: name, size, upload date, usage count.
- Selecting an asset calls `onSelect` and closes the modal.
- Upload button opens `UploadZone` in a sub-panel.
- Usage badge on each card: "Used in 3 items" (from `GET /api/media/{id}/usage`).

**`UploadZone` behavior:**
- Drag-and-drop area or click-to-browse.
- File type validation client-side (mirrors backend rules) to give instant feedback before the round-trip.
- Animated progress bar using upload XHR progress events.
- On success: newly uploaded asset appears at top of grid; a toast is shown.

**Standalone `/media` page:**
- Full-page resource library (not just modal) for managing the media bank.
- Shows all assets with delete controls.
- Accessible from the constructor nav (add "Media" link in GlobalHeader for CONSTRUCTOR/ADMIN).

---

## Stage 5 — Frontend: TipTap Media Extension

**Files:**
- `frontend/src/components/editor/extensions/MediaNode.ts` — custom TipTap node
- `frontend/src/components/editor/extensions/VideoNode.ts` — video variant
- `frontend/src/components/editor/toolbar/MediaToolbarButton.tsx` — toolbar button that opens `ResourceLibraryModal`
- Update `frontend/src/components/editor/RichTextEditor.tsx` — register extensions + toolbar button

**Image node (`MediaNode`):**
- Renders as `<figure>` with `<img>` + optional `<figcaption>`.
- Attributes: `src` (signed URL at render time), `assetId` (stored in TipTap JSON — used to re-fetch signed URL on load), `alt` (required), `width`, `align` (`left | center | right`).
- Inline resize handles (drag corners) using TipTap's `NodeViewWrapper`.
- Alt text field: clicking on the figure opens a small inline popover to edit alt text. Alt is required — if empty, a warning icon appears.

**Video node (`VideoNode`):**
- Renders as `<video controls>` with source.
- Same `assetId` + `src` pattern as image.
- No resize; fixed max-width: 100%.

**Signed URL refresh:** On editor mount, scan TipTap JSON for `assetId` attributes, call `GET /api/media/{id}/url` for each, and patch `src` in the document. Signed URLs expire in 60 min, so refresh is triggered on editor focus if elapsed time > 50 min.

**Toolbar button:**
- "Insert Image" and "Insert Video" — two separate buttons, each opens `ResourceLibraryModal` with appropriate MIME filter.
- After selecting, fetches the signed URL and inserts the node at cursor.

---

## Stage 6 — Frontend: Reuse, Usage & Import Integration

**Files:**
- `frontend/src/components/media/AssetUsagePanel.tsx` — usage panel shown in asset detail
- Update `frontend/src/components/editor/RichTextEditor.tsx` — embed `assetId` tracking in TipTap JSON
- Update `frontend/src/stores/useAuthoringStore.ts` — track referenced asset IDs from current item version for `item_version_media` join table sync

**Reuse flow:**
- When an asset is inserted into a question, the `assetId` is embedded in TipTap JSON (`{"type":"media","attrs":{"assetId":"...","src":"...","alt":"..."}}`).
- On save, `useAuthoringStore` extracts all `assetId` values from the TipTap JSON and sends them to the backend as part of the item version save payload (new optional field `referenced_media_ids: list[str]`).
- Backend service: on save, upserts `item_version_media` rows for the new version.

**Usage tracking UI:**
- `AssetUsagePanel` shown in the resource library detail view: lists each item version that references the asset, with a link to open that item in the authoring workbench.
- Shown in `ResourceLibraryModal` as a badge: "In use: 3 items".

**Deletion guard:**
- When a user clicks delete on an in-use asset, the frontend fetches usage first and shows a `useConfirm` dialog: *"This image is used in 3 questions. Deleting it will break those references. Are you sure?"* Confirm tone: `danger`.

---

## Stage 7 — Verification

**Checklist:**
- [ ] `npx tsc --noEmit` passes.
- [ ] `npx next build` passes.
- [ ] `pytest backend/tests/test_media_api.py` — all tests pass (upload, type validation, size limit, delete, usage conflict).
- [ ] MinIO container running in Docker Compose: `docker-compose ps` shows `minio` healthy.
- [ ] Upload a PNG → appears in library grid with thumbnail.
- [ ] Insert image into TipTap → renders in question preview.
- [ ] Save item → re-open item → image still present (signed URL refreshed).
- [ ] Upload same image file twice → two separate assets (no dedup — dedup is future scope).
- [ ] Upload same image, insert into two different questions → usage count = 2.
- [ ] Delete question 1 → usage count = 1. Asset still in library.
- [ ] Delete asset with usage > 0 → 409 from API, frontend shows confirm dialog with item list.
- [ ] Delete asset with usage = 0 → deleted from MinIO + DB.
- [ ] Upload `.exe` disguised as `.jpg` → 415 error shown in upload zone.
- [ ] Upload 51 MB file → 413 error shown in upload zone.
- [ ] Media nav link visible for CONSTRUCTOR and ADMIN; hidden for STUDENT.
- [ ] Aikido scan: zero new Critical/High findings.

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

New `.env` additions:
```
MEDIA_STORAGE_BACKEND=minio
MINIO_ENDPOINT=http://localhost:9000
MINIO_ACCESS_KEY=openvision_dev
MINIO_SECRET_KEY=openvision_dev_secret
MINIO_BUCKET=openvision-media
MEDIA_CDN_BASE_URL=http://localhost:9000/openvision-media
MEDIA_MAX_SIZE_MB=50
```

---

## New Python Dependencies

```
miniopy-async>=1.18     # async MinIO/S3 client
python-multipart>=0.0.6 # already present for FastAPI UploadFile — verify version
python-magic>=0.4.27    # magic byte validation (libmagic required in Docker image)
```

---

## New npm Dependencies

```
@tiptap/extension-image  # official image extension (base for MediaNode)
```

---

## Migration Plan

1. Add `minio` service to `docker-compose.yml`.
2. Run Alembic migration to create `media_assets` and `item_version_media` tables.
3. No data migration needed — all existing items have no media references.
4. Create the MinIO bucket: `mc mb minio/openvision-media` (or via startup script).

---

## Exit Criteria

- All 7 stages complete.
- `tsc --noEmit` + `next build` + `pytest` green.
- MinIO running in Docker Compose with health check passing.
- Manual verification matrix complete (upload → insert → save → reopen → delete guard).
- Aikido scan: zero new Critical/High findings.
- Merged to `main`.

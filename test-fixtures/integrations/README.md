# Integration test fixtures

Sample files for exercising the Epoch 12 integrations UI (`/integrations`).
Log in as **admin** (`admin_e2e@vu.nl` / `adminpass123`); QTI also works for a
constructor (`constructor_e2e@vu.nl` / `conpass123`).

## SIS — order matters

1. **`roster.csv`** — happy path. Creates course `CS101` (tick *Create missing
   courses*), enrols Ada/Alan/Grace (Grace inactive), ensures constructor Don.
2. **`accommodations.csv`** — run **after** the roster (its vunet_ids
   `abc123/def456/ghi789` are created by the roster). Sets extra time; the row
   for `ghi789` also has `enlarged_display=true` (accepted, but display is now
   self-service so it has no admin effect).
3. **`roster-with-errors.csv`** — deliberately broken to show the row-level
   report: unknown course, missing vunet_id, bad email, invalid role. Row 1
   (Linus) still succeeds — one bad row never blocks the good ones.

## Grade export

Needs a course or scheduled-session filter. Use a seeded course id from the
Sessions page, or `CS101` after importing the roster (no published results
there yet, so expect a header-only CSV — that's correct).

## QTI

- **`qti-sample-3-items.zip`** — a valid package exported from seeded data.
  *Dry run* it first (no bank id needed), review the 3 OK items, then set a
  target bank id and *Commit import*.
- **`qti-single-item.xml`** — simplest path, one multiple-choice item.
- **`qti-unsupported-item.xml`** — a hotspot item. Import reports it as an
  ERROR ("Unsupported interaction type: hotspotInteraction") instead of
  dropping it silently.

To **export**: paste an item-bank id (Library page / DB) or a test-definition
id (Sessions page) and download the ZIP.

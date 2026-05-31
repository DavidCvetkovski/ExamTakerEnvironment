# Epoch 12 — Manual Security Review (LTI 1.3 / SIS / QTI)

> Reviewed against CLAUDE.md §1 and directive §2.1 before merge to `main`.
> Date: 2026-06-01. Reviewer: David Cvetkovski (with Claude Code).
> The Aikido SAST gate is retired; this is the deliberate human review.

## Scope

The changed surface for Epoch 12:

- LTI 1.3: OIDC login, launch validation, user/context/resource mapping,
  deep linking, AGS grade passback, platform/JWKS admin.
- SIS: roster + accommodation CSV import, grade CSV export.
- QTI: package export, package import (parse → sanitize → validate → commit).
- Frontend `/integrations`, `/lti/launch`, `/lti/deep-link`.

## §1 checklist

### Never trust client input
- All request bodies use Pydantic models; query/form params are typed.
- CSV/QTI uploads are size-bounded (`_MAX_UPLOAD_BYTES` 5 MB for SIS;
  `MAX_PACKAGE_BYTES` 20 MB / `MAX_UNCOMPRESSED_BYTES` 50 MB / `MAX_ITEMS`
  for QTI) — no unbounded reads into memory.
- QTI XML parsing rejects any `<!DOCTYPE`/`<!ENTITY>` declaration
  (`package.parse_xml_safely`), blocking XXE and billion-laughs without a
  third-party parser. ZIP extraction is path-checked against zip-slip
  (absolute paths, `..`, drive-letter rejected).
- Imported HTML is sanitized server-side via an allowlist
  (`qti/sanitizer.py`); the frontend still runs DOMPurify before render.

### Authorization on every endpoint
- LTI platform/JWKS/grade-passback: `require_role(ADMIN)`.
- LTI context/resource mapping + deep-link: `require_role(ADMIN, CONSTRUCTOR)`.
- SIS import: `require_role(ADMIN)`. SIS grade export: `require_role(ADMIN,
  CONSTRUCTOR)`. QTI import/export: `require_role(ADMIN, CONSTRUCTOR)`.
- Tests assert `403` for students on import, export, mapping, and passback.
- Grade export refuses unfiltered dumps (course or session required).

### Parameterized queries only
- All DB access goes through Prisma; no string-interpolated SQL.

### Secrets management
- LTI tool private keys are encrypted at rest; the public JWKS never exposes
  private fields. Platform client credentials live in the platform record.
- AGS/deep-link JWTs are signed **server-side**; the frontend only relays the
  signed JWT (deep-link auto-post). The browser never holds a signing key.

### Least privilege
- Roster import provisions never-seen users with an unusable password and a
  least-privilege role; it never creates admins and never re-roles an existing
  account. Deactivation only deactivates the *enrollment*, not the account.
- Accommodation import reuses the audited Epoch 10 write path
  (`apply_update(..., source="sis_import")`) with the same multiplier bounds.

### Audit
- Every external action writes an append-only `integration_audit_logs` row via
  `record_integration_audit` with non-secret metadata only (counts, ids,
  filters) — never JWTs, tokens, CSV bodies, or QTI XML.

## Residual risks / accepted limitations

1. **Dev key fallback** — `LTI_PRIVATE_KEY_ENCRYPTION_KEY` falls back to
   `SECRET_KEY` in development. Production hardening (Epoch 13) must require a
   dedicated secret. *Severity: low (dev only); tracked.*
2. **Constructor course-ownership scoping** — context/resource mapping and QTI
   export are gated by role but not yet by *which* courses a constructor owns.
   A constructor can map/export across courses. *Severity: medium; deferred to
   a follow-up with per-course ACLs.*
3. **`student_name` column blank in grade export** — the user record stores no
   display name; the column is retained for format stability but emitted empty.
   *Not a security issue; documented in the SIS CSV doc.*
4. **QTI import known losses** — only choice/multiple-response/essay map;
   unsupported interactions are reported (not dropped), and inline prompt
   formatting is flattened to text on import. *Severity: none; by design.*

## Verdict

No high-severity findings. Items (1) and (2) are tracked for Epoch 13 / a
follow-up. Safe to merge to `main`.

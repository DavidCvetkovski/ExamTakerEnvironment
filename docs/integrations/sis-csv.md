# SIS / Osiris CSV formats

All SIS tools live under **Integrations → SIS / Osiris** (admin) and
`/api/sis/*`. Uploads are capped at 5 MB. Every import returns a row-level
report and writes an audit entry.

## Roster import — `POST /api/sis/rosters/import`

Header row (exact):

```
course_code,vunet_id,email,first_name,last_name,role,is_active
```

- `role`: `student` or `constructor`.
- `is_active`: `true`/`false` (also `yes`/`no`, `1`/`0`).
- Users are matched by VUnetID first, then email; unknown users are provisioned
  with an unusable password and the given role (never admin).
- Only students are enrolled. `is_active=false` deactivates the **enrollment**,
  never the account.
- Unknown `course_code` errors per row unless **Create missing courses** is
  checked (`create_missing_courses=true`).

## Accommodation import — `POST /api/sis/accommodations/import`

Header row (exact):

```
vunet_id,provision_time_multiplier,enlarged_display
```

- `provision_time_multiplier`: 1.0–3.0 (same bounds as the accommodations
  module). Reuses the audited Epoch 10 write path (`source="sis_import"`).
- `enlarged_display`: boolean.
- The user must exist and be a student.

## Grade export — `GET /api/sis/grades/export`

Filters (at least one of `course_id` or `scheduled_session_id` is required):
`course_id`, `scheduled_session_id`, `test_definition_id`, `published_only`
(default `true`). Streams CSV with columns:

```
course_code,test_title,scheduled_session_id,vunet_id,email,student_name,
score,max_score,percentage,passed,letter_grade,submitted_at,graded_at
```

> `student_name` is emitted empty — the user record stores no display name. The
> column is kept for format stability with the institutional target.

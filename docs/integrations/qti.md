# QTI 2.1 import / export

QTI tools live under **Integrations → QTI 2.1** (admin or constructor) and
`/api/qti/*`. OpenVision speaks QTI 2.1 so content is portable.

## Supported question types

| OpenVision | QTI 2.1 |
|---|---|
| MULTIPLE_CHOICE | `choiceInteraction`, `maxChoices=1` |
| MULTIPLE_RESPONSE | `choiceInteraction`, `maxChoices>1` |
| ESSAY | `extendedTextInteraction` |

Unsupported interactions (hotspot, drag-and-drop, adaptive, complex response
processing) are **reported per item**, never silently dropped.

## Export

- `GET /api/qti/items/export?bank_id=…` — export an item bank.
- `GET /api/qti/tests/{test_definition_id}/export` — export a test's items.

Output is an IMS content package ZIP (`imsmanifest.xml` + one XML per item).
The latest version of each item is exported. Correct responses are included for
authoring roles; student responses are never exported.

## Import — `POST /api/qti/import`

Upload a `.zip` package or a single `.xml` item. The flow is:

1. Read package (size/count bounded, zip-slip checked).
2. Parse XML with DOCTYPE/ENTITY rejected (XXE-safe).
3. Map supported interactions; sanitize HTML.
4. Validate against the item schema.
5. **Dry run** (`commit=false`) returns a report only.
6. **Commit** (`commit=true`, requires `bank_id`) creates DRAFT items.

Response is a per-item report: `total_items`, `success_items`, `error_items`,
and a list of `{identifier, status, question_type | message}`.

### Known acceptable losses

- Inline prompt formatting is flattened to plain text on import.
- Essay word bounds are not represented in QTI and reset to defaults on import.

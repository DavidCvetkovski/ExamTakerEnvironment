# Canvas (LTI 1.3) setup

OpenVision is an LTI 1.3 tool. An admin registers a Canvas platform, then
instructors bind Canvas courses/assignments to OpenVision courses/exams.

## 1. Tool endpoints

Give Canvas these OpenVision endpoints (replace the host):

| Canvas field | OpenVision endpoint |
|---|---|
| OIDC login / initiation URL | `POST /api/lti/login` (also `GET`) |
| Redirect / launch URL | `POST /api/lti/launch` |
| Public JWKS URL | `GET /api/lti/jwks` |

OpenVision verifies platform launches against the platform's JWKS and signs its
own deep-link / AGS messages with a rotating key published at `/api/lti/jwks`.

## 2. Register the platform (admin)

In **Integrations → LTI 1.3 platforms → Register a platform**, provide:

- Name, Issuer, Client ID
- Auth login URL, Token URL, JWKS URL (from Canvas Developer Key)
- Deployment IDs (comma-separated)

This is also available via `POST /api/lti/platforms` (admin only).

## 3. Map contexts and resource links

The first launch from a Canvas course/assignment records an **unmapped**
context and resource link. In **Integrations → LTI 1.3 platforms**:

- *Unmapped contexts* → enter the OpenVision course id to bind the Canvas
  course.
- *Unmapped resource links* → enter the scheduled-session id to bind the
  assignment.

Until both are mapped, a learner launch reports "course not configured".

## 4. Deep linking

When an instructor adds an OpenVision assignment in Canvas, the deep-linking
launch lands on `/lti/deep-link?session=…`, which lists approved exams /
scheduled sessions. Selecting one posts a **server-signed** deep-link JWT back
to Canvas. The browser never signs anything.

## 5. Grade passback (AGS)

After a result is **published**, an admin can push it to the Canvas line item
from **Integrations → Grade passbacks** (or `POST /api/lti/grade-passbacks`).
Failed-retryable passbacks can be retried; permanent failures cannot.

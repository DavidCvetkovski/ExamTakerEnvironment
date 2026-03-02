# Epoch 3: Authentication, RBAC & Item Status Workflow

## Engineering Blueprint

> **Prerequisite:** Epoch 2 complete. The `User` model exists but has no password field and no role. The `items.py` endpoint uses a dummy `get_current_user()` that returns `None`.
>
> **Goal:** Secure every API endpoint behind JWT authentication, enforce role-based permissions, implement the full item status workflow (Draft → Review → Approved → Retired), and prepare the frontend for authenticated sessions.
>
> **Reference:** TestVision's architecture *"allows for a collaborative authoring process where one user constructs a question and another provides the final 'publishing' check."* This Epoch delivers that exact capability.

---

## Design Philosophy

### Why Authentication First?

Every subsequent Epoch depends on knowing *who* is making a request and *what they are allowed to do*. The Test Matrix (Epoch 4) needs to know if the user is an educator. The Exam Session (Epoch 5) needs to know the student's identity. The Heartbeat (Epoch 5) needs to link interaction events to a verified student ID. Without authentication, none of these systems have a trustworthy identity to bind data to.

### Password Hashing Strategy

We use **bcrypt** via the `passlib` library. Bcrypt is the industry standard for password storage because:
- It includes a per-password salt automatically (no need to manage salts ourselves).
- It has a configurable work factor (rounds), making brute-force attacks progressively harder.
- It is resistant to GPU-accelerated attacks due to its memory-hard properties.

We set the default work factor to 12 rounds, which produces ~250ms hash time — slow enough to resist brute-force but fast enough to not annoy users on login.

### JWT Architecture

We use a **dual-token strategy**:
- **Access Token:** Short-lived (30 minutes). Sent with every API request as a `Bearer` header. Contains the user's `id`, `email`, and `role` in the payload. Stateless — the server never stores it.
- **Refresh Token:** Long-lived (7 days). Stored as an `httpOnly` cookie. Used to obtain a new access token without re-entering credentials. Stored server-side in Redis with a TTL so we can revoke it (e.g., on password change or logout).

Why not just one long-lived token? Because if an access token is stolen (XSS, man-in-the-middle), the attacker has a maximum 30-minute window. Refresh tokens are stored in `httpOnly` cookies which are inaccessible to JavaScript, making them XSS-proof.

### Role Hierarchy

TestVision uses a granular role system. For OpenVision, we implement four roles:

```
ADMIN
  └── Full system access. Can manage users, configure system settings, override any role restriction.

CONSTRUCTOR
  └── Can create/edit items in their assigned item banks.
  └── Can transition an item: DRAFT → READY_FOR_REVIEW.
  └── CANNOT approve items (separation of concerns).
  └── CANNOT access student exam data.

REVIEWER
  └── Can view items in READY_FOR_REVIEW status.
  └── Can transition items: READY_FOR_REVIEW → APPROVED (publishing check).
  └── Can reject items: READY_FOR_REVIEW → DRAFT (with feedback).
  └── CANNOT create new items.

STUDENT
  └── Read-only on exam content (only during an active session).
  └── Write-only on response data (answers, flags, heartbeat events).
  └── CANNOT access the authoring interface at all.
```

This enforces TestVision's *"collaborative authoring process where one user constructs a question and another provides the final 'publishing' check."*

---

## Current State Analysis

### What Exists (from Epoch 2)

| Component | Location | Current State | Needs Change? |
|-----------|----------|---------------|---------------|
| `User` model | `backend/app/models/user.py` | Only has `id`, `email`, `created_at` | ✅ Yes — add `hashed_password`, `role`, `vunet_id`, `is_active` |
| `get_current_user()` | `backend/app/api/endpoints/items.py` | Returns `None` (dummy) | ✅ Yes — replace with JWT verification |
| `ItemStatus` enum | `backend/app/models/item_version.py` | Has `DRAFT`, `READY_FOR_REVIEW`, `APPROVED`, `RETIRED` | ✅ No change needed |
| `created_by` on `ItemVersion` | `backend/app/models/item_version.py` | FK to `users.id`, currently set to `None` | ✅ Yes — will be populated by auth |
| `requirements.txt` | `backend/requirements.txt` | Missing auth dependencies | ✅ Yes — add `passlib[bcrypt]`, `python-jose[cryptography]` |
| Frontend auth | `frontend/` | No auth at all | ✅ Yes — add login page, token storage, protected routes |

### What We Need to Build (New Files)

| File | Purpose |
|------|---------|
| `backend/app/core/security.py` | Password hashing, JWT creation/verification |
| `backend/app/core/config.py` | Centralized settings (secret key, token expiry, etc.) |
| `backend/app/core/dependencies.py` | FastAPI dependency injection (get_current_user, require_role) |
| `backend/app/schemas/auth.py` | Pydantic schemas for registration, login, token response |
| `backend/app/schemas/user.py` | Pydantic schemas for user CRUD |
| `backend/app/api/endpoints/auth.py` | Registration, login, refresh, logout routes |
| `backend/app/api/endpoints/users.py` | User management routes (admin only) |
| `backend/tests/test_auth.py` | Auth flow integration tests |
| `backend/tests/test_rbac.py` | Role-based permission tests |
| `frontend/src/stores/useAuthStore.ts` | Zustand store for auth state |
| `frontend/src/app/login/page.tsx` | Login page |
| `frontend/src/components/auth/ProtectedRoute.tsx` | Route guard component |

---

## Staged Development Plan

### Stage 1: The Identity Layer (Backend Auth Core)

**Goal:** Add password hashing, JWT issuance, and the auth endpoints. No RBAC yet — just "can this person prove who they are?"

#### Tasks

1. **Add dependencies to `requirements.txt`:**
   ```
   passlib[bcrypt]==1.7.4
   python-jose[cryptography]==3.3.0
   ```

2. **Create `backend/app/core/config.py`:**
   - Centralized `Settings` class using Pydantic `BaseSettings` for environment variable loading.
   - Fields: `SECRET_KEY`, `ACCESS_TOKEN_EXPIRE_MINUTES` (default 30), `REFRESH_TOKEN_EXPIRE_DAYS` (default 7), `ALGORITHM` (default HS256), all Postgres/Redis config.
   - Loads from `.env` file automatically.

3. **Create `backend/app/core/security.py`:**
   ```python
   # Core functions:
   def hash_password(plain: str) -> str:
       # Uses passlib CryptContext with bcrypt
   
   def verify_password(plain: str, hashed: str) -> bool:
       # Timing-safe comparison
   
   def create_access_token(data: dict, expires_delta: timedelta = None) -> str:
       # Encodes {"sub": user_id, "email": email, "role": role, "exp": ...}
       # Signs with SECRET_KEY using HS256
   
   def create_refresh_token(data: dict) -> str:
       # Same as above but with 7-day expiry
   
   def decode_token(token: str) -> dict:
       # Decodes and validates expiry, returns payload or raises
   ```

4. **Modify `backend/app/models/user.py` — Add auth fields:**
   ```python
   class UserRole(str, enum.Enum):
       ADMIN = "ADMIN"
       CONSTRUCTOR = "CONSTRUCTOR"
       REVIEWER = "REVIEWER"
       STUDENT = "STUDENT"
   
   class User(Base):
       __tablename__ = "users"
       
       id = Column(UUID, primary_key=True, default=uuid.uuid4)
       email = Column(String, unique=True, index=True, nullable=False)
       vunet_id = Column(String, unique=True, index=True, nullable=True)  # For institutional SSO
       hashed_password = Column(String, nullable=False)
       role = Column(Enum(UserRole), default=UserRole.STUDENT, nullable=False)
       is_active = Column(Boolean, default=True, nullable=False)
       created_at = Column(DateTime, default=datetime.utcnow)
   ```

5. **Create `backend/app/schemas/auth.py`:**
   ```python
   class RegisterRequest(BaseModel):
       email: EmailStr
       password: str  # min_length=8 validator
       role: UserRole = UserRole.STUDENT  # Default to student
       vunet_id: Optional[str] = None
   
   class LoginRequest(BaseModel):
       email: EmailStr
       password: str
   
   class TokenResponse(BaseModel):
       access_token: str
       token_type: str = "bearer"
       expires_in: int  # seconds
       user: UserPublic  # id, email, role — no password hash!
   
   class UserPublic(BaseModel):
       id: UUID
       email: str
       role: UserRole
       vunet_id: Optional[str]
   ```

6. **Create `backend/app/api/endpoints/auth.py`:**
   ```
   POST /auth/register  → Creates user, hashes password, returns TokenResponse
   POST /auth/login     → Verifies credentials, returns TokenResponse
   POST /auth/refresh   → Validates refresh token cookie, returns new access token
   POST /auth/logout    → Clears refresh token cookie (and invalidates in Redis)
   GET  /auth/me        → Returns the current user's profile (requires valid token)
   ```

7. **Generate Alembic migration** for the User model changes.

8. **Update `backend/app/api/api.py`** to include the auth router.

#### Verification Gate

```bash
# 1. Register a new user
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "prof@vu.nl", "password": "securepass123", "role": "CONSTRUCTOR"}'
# → Returns { access_token: "eyJ...", user: { email: "prof@vu.nl", role: "CONSTRUCTOR" } }

# 2. Login with credentials
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "prof@vu.nl", "password": "securepass123"}'
# → Returns access token

# 3. Access protected route
curl http://localhost:8000/api/auth/me \
  -H "Authorization: Bearer <token>"
# → Returns user profile

# 4. Access without token
curl http://localhost:8000/api/auth/me
# → 401 Unauthorized
```

---

### Stage 2: The Permission Matrix (RBAC Middleware)

**Goal:** Create reusable FastAPI dependencies that enforce role requirements on every route.

#### Tasks

1. **Create `backend/app/core/dependencies.py`:**
   ```python
   async def get_current_user(
       token: str = Depends(oauth2_scheme),
       db: Session = Depends(get_db)
   ) -> User:
       """
       Extracts the JWT from the Authorization header, decodes it,
       fetches the User from the database, and returns it.
       Raises 401 if token is invalid/expired/user not found.
       Raises 403 if user is deactivated (is_active=False).
       """
   
   def require_role(*allowed_roles: UserRole):
       """
       Factory function that returns a FastAPI dependency.
       Usage: Depends(require_role(UserRole.CONSTRUCTOR, UserRole.ADMIN))
       
       Checks that the current_user.role is in the allowed set.
       Raises 403 Forbidden if the role is not permitted.
       """
   ```

2. **Replace the dummy `get_current_user` in `items.py`:**
   - Import the real `get_current_user` from `dependencies.py`.
   - Add `require_role(UserRole.CONSTRUCTOR, UserRole.ADMIN)` to create/edit endpoints.
   - The `GET` endpoint for versions remains accessible to all authenticated users (constructors need to see items, reviewers need to review them, students will later need to see them during exams).
   - The `DELETE` endpoint requires `UserRole.ADMIN` or `UserRole.CONSTRUCTOR`.

3. **Create the Item Status Transition Endpoint:**
   ```
   PATCH /api/learning-objects/{lo_id}/versions/{version_id}/status
   Body: { "new_status": "READY_FOR_REVIEW" | "APPROVED" | "RETIRED" }
   ```
   
   **Transition rules enforced server-side:**
   
   | Current Status | Allowed Transition | Required Role |
   |---|---|---|
   | `DRAFT` | → `READY_FOR_REVIEW` | `CONSTRUCTOR` or `ADMIN` |
   | `READY_FOR_REVIEW` | → `APPROVED` | `REVIEWER` or `ADMIN` |
   | `READY_FOR_REVIEW` | → `DRAFT` (rejection) | `REVIEWER` or `ADMIN` |
   | `APPROVED` | → `RETIRED` | `ADMIN` only |
   | `RETIRED` | → (no transitions) | — |
   
   If a `CONSTRUCTOR` tries to approve an item → `403 Forbidden`.
   If a `REVIEWER` tries to create a new item → `403 Forbidden`.

4. **Add optional rejection feedback:**
   - When a reviewer rejects an item (`READY_FOR_REVIEW` → `DRAFT`), they can include a `feedback` field in the JSON body.
   - This feedback is stored as a new JSONB field `review_feedback` on the `ItemVersion` model.
   - The constructor sees this feedback when they open the draft again.

#### Verification Gate

```python
# test_rbac.py scenarios:

def test_constructor_can_create_item():
    # Login as CONSTRUCTOR → POST /learning-objects/{id}/versions → 200 OK

def test_reviewer_cannot_create_item():
    # Login as REVIEWER → POST /learning-objects/{id}/versions → 403 Forbidden

def test_constructor_cannot_approve():
    # Login as CONSTRUCTOR → PATCH .../status {"new_status": "APPROVED"} → 403

def test_reviewer_can_approve():
    # Login as REVIEWER → PATCH .../status {"new_status": "APPROVED"} → 200

def test_student_cannot_access_authoring():
    # Login as STUDENT → POST /learning-objects/... → 403

def test_unauthenticated_request():
    # No token → GET /learning-objects/... → 401

def test_full_workflow():
    # Constructor creates DRAFT
    # Constructor submits for review (DRAFT → READY_FOR_REVIEW)
    # Reviewer approves (READY_FOR_REVIEW → APPROVED)
    # Verify version history shows correct status transitions
```

---

### Stage 3: Frontend Authentication

**Goal:** Build the login page, store the JWT token, and protect the authoring routes.

#### Tasks

1. **Create `frontend/src/stores/useAuthStore.ts`:**
   ```typescript
   interface AuthState {
     user: UserPublic | null;
     accessToken: string | null;
     isAuthenticated: boolean;
     isLoading: boolean;
     
     login: (email: string, password: string) => Promise<void>;
     register: (email: string, password: string, role: string) => Promise<void>;
     logout: () => void;
     refreshToken: () => Promise<void>;
     fetchMe: () => Promise<void>;
   }
   ```
   - Stores the access token in memory (NOT localStorage — prevents XSS theft).
   - On `login()`, stores token in Zustand state and sets an Axios interceptor to include it as `Bearer` header.
   - On page refresh, attempts `refreshToken()` using the httpOnly cookie to restore the session.
   - On `logout()`, calls `POST /auth/logout` and clears state.

2. **Create `frontend/src/lib/api.ts`:**
   - Axios instance with `baseURL: http://localhost:8000/api`.
   - Request interceptor: attaches `Authorization: Bearer <token>` if available.
   - Response interceptor: on `401`, attempts a token refresh; if refresh fails, redirects to `/login`.

3. **Create `frontend/src/app/login/page.tsx`:**
   - Dark-themed login form matching the existing editor aesthetic.
   - Email + Password fields with validation.
   - Error display for invalid credentials.
   - "Register" link for new users.
   - On successful login → redirect to `/author`.

4. **Create `frontend/src/app/register/page.tsx`:**
   - Registration form: email, password, confirm password, role selector.
   - Role selector only visible if we want open registration (in production, admin creates users).

5. **Create `frontend/src/components/auth/ProtectedRoute.tsx`:**
   - Wrapper component that checks `isAuthenticated`.
   - If not authenticated → redirect to `/login`.
   - If authenticated → render children.
   - Can optionally require specific roles: `<ProtectedRoute roles={['CONSTRUCTOR', 'ADMIN']}>`.

6. **Update `frontend/src/app/author/page.tsx`:**
   - Wrap in `ProtectedRoute` requiring `CONSTRUCTOR` or `ADMIN` role.
   - Remove the manual UUID input — the current user's ID is now known from the JWT.
   - Display the user's name/role in a top navigation bar.
   - Add a "Submit for Review" button that calls `PATCH .../status`.

7. **Update `frontend/src/stores/useAuthoringStore.ts`:**
   - Remove the hardcoded `http://localhost:8000` — use the centralized Axios instance from `api.ts`.
   - The `saveDraft()` action now automatically includes the Bearer token via the interceptor.

#### Verification Gate

```
Manual browser test:
1. Navigate to http://localhost:3000/author → redirected to /login.
2. Register a new CONSTRUCTOR account.
3. Login → redirected to /author.
4. Type a question, click Save → "All changes saved" (token attached automatically).
5. Open a new incognito window → /author → redirected to /login (no session).
6. Login as STUDENT → /author → "Access Denied" message.
```

---

### Stage 4: Integration Tests & Security Audit

**Goal:** Write comprehensive tests covering the full auth flow, RBAC matrix, and edge cases. Clean up code quality.

#### Tasks

1. **Write `backend/tests/test_auth.py`:**
   ```python
   def test_register_creates_user_with_hashed_password():
   def test_register_duplicate_email_fails():
   def test_login_returns_valid_jwt():
   def test_login_wrong_password_returns_401():
   def test_login_nonexistent_user_returns_401():
   def test_access_token_expires_after_configured_time():
   def test_refresh_token_returns_new_access_token():
   def test_logout_invalidates_refresh_token():
   def test_me_endpoint_returns_user_profile():
   def test_me_with_expired_token_returns_401():
   ```

2. **Write `backend/tests/test_rbac.py`:**
   ```python
   def test_constructor_full_workflow():
       # Register as constructor
       # Create a Learning Object
       # Create item version (DRAFT)
       # Submit for review (DRAFT → READY_FOR_REVIEW)
       # Attempt to approve → 403
   
   def test_reviewer_full_workflow():
       # Register as reviewer
       # Attempt to create item → 403
       # Approve a READY_FOR_REVIEW item → 200
       # Reject with feedback → 200
   
   def test_admin_can_do_everything():
       # Register as admin
       # Create, approve, retire — all succeed
   
   def test_status_transition_matrix():
       # Test every invalid transition returns 400/403
       # DRAFT → APPROVED (skipping review) → 400
       # RETIRED → anything → 400
       # APPROVED → READY_FOR_REVIEW → 400
   ```

3. **Security audit checklist:**
   - [ ] Passwords are never returned in API responses (check all Pydantic schemas exclude `hashed_password`).
   - [ ] JWT secret key is loaded from environment, not hardcoded.
   - [ ] Token expiry is enforced (test with expired tokens).
   - [ ] Refresh token is httpOnly cookie (cannot be read by JS).
   - [ ] CORS is restricted to `http://localhost:3000` (not `*`).
   - [ ] Rate limiting on `/auth/login` to prevent brute-force (optional for Stage 4, recommended).
   - [ ] SQL injection is impossible (all queries use ORM, no raw SQL).

4. **Update the GitHub Actions CI workflow** (`backend-tests.yml`) to include the new test files.

#### Verification Gate

```bash
# All tests must pass:
pytest tests/test_auth.py tests/test_rbac.py tests/test_schemas.py tests/test_items_api.py -v
# Expected: ~20+ tests, all green.
```

---

## Database Schema Changes (Alembic Migration)

### Modified Table: `users`

```sql
ALTER TABLE users ADD COLUMN hashed_password VARCHAR NOT NULL;
ALTER TABLE users ADD COLUMN role VARCHAR NOT NULL DEFAULT 'STUDENT';
ALTER TABLE users ADD COLUMN vunet_id VARCHAR UNIQUE;
ALTER TABLE users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
```

### Modified Table: `item_versions`

```sql
ALTER TABLE item_versions ADD COLUMN review_feedback JSONB;
```

> **Migration Note:** The existing seed data in the `users` table has no password. The Alembic migration must either:
> - (a) Drop and recreate the seed data, OR
> - (b) Set a default placeholder hash for existing rows.
>
> We choose option (a) since this is development — the seed script will be rerun after migration.

---

## Dependency Changes

### New Python Packages

| Package | Version | Purpose |
|---------|---------|---------|
| `passlib[bcrypt]` | 1.7.4 | Password hashing with bcrypt |
| `python-jose[cryptography]` | 3.3.0 | JWT creation and verification |
| `email-validator` | ≥2.0 | Already present — validates email format in Pydantic |

### New Frontend Packages

| Package | Purpose |
|---------|---------|
| `axios` | HTTP client with interceptors for token management |

---

## Environment Variables (New)

Add to `.env`:

```env
# Auth Configuration
SECRET_KEY=your-secret-key-at-least-32-chars-long-change-in-production
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
```

> **Security Note:** The `SECRET_KEY` must be a cryptographically random string. Generate one with:
> ```bash
> python -c "import secrets; print(secrets.token_urlsafe(32))"
> ```

---

## API Route Summary (After Epoch 3)

| Method | Route | Auth Required? | Roles Allowed | Purpose |
|--------|-------|---------------|---------------|---------|
| `POST` | `/api/auth/register` | No | — | Create account |
| `POST` | `/api/auth/login` | No | — | Get tokens |
| `POST` | `/api/auth/refresh` | Cookie | — | Refresh access token |
| `POST` | `/api/auth/logout` | Yes | All | Clear session |
| `GET` | `/api/auth/me` | Yes | All | Get current user |
| `GET` | `/api/learning-objects/{id}/versions` | Yes | All | View version history |
| `POST` | `/api/learning-objects/{id}/versions` | Yes | Constructor, Admin | Create/edit item |
| `PATCH` | `/api/learning-objects/{id}/versions/{vid}/status` | Yes | Depends on transition | Change item status |
| `DELETE` | `/api/learning-objects/{id}` | Yes | Constructor, Admin | Soft-delete item |

---

## Git Strategy for Epoch 3

Per `directives/epoch_git_strategy.md`:

1. All work happens on `feature/epoch-2-authoring` (we continue the current feature branch since Epoch 2 is merged).
   - **Correction:** We create a new branch `feature/epoch-3-auth` from `main`.
2. Each Stage gets an atomic commit with a Conventional Commit message.
3. At the end of Stage 4 (verification complete), merge `feature/epoch-3-auth` into `main` and push.

**Commit plan:**
```
feat(auth): add password hashing and JWT token issuance          # Stage 1
feat(auth): implement RBAC middleware and status transitions      # Stage 2
feat(frontend): add login page and protected route guards         # Stage 3
test(auth): comprehensive auth and RBAC integration tests         # Stage 4
```

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Existing seed data breaks after User model migration | Medium | Re-run seed script after migration; update seed to include password |
| JWT secret in `.env` accidentally committed | Critical | Already in `.gitignore`; add pre-commit check |
| Frontend token storage in localStorage exposes to XSS | High | Store in Zustand memory only; use httpOnly cookies for refresh |
| Alembic migration conflicts with existing schema | Medium | Drop test tables first in dev; use conditional migration logic |
| `test_items_api.py` breaks because endpoints now require auth | High | Update existing tests to register/login first before calling item endpoints |

---

## What This Epoch Does NOT Cover

These are explicitly deferred to later Epochs:

- **SSO / SURFconext OIDC integration** → Epoch 11 (we build the abstraction layer here but don't connect to a real IdP).
- **LTI 1.3 Canvas handshake** → Epoch 11.
- **Rate limiting on auth endpoints** → Epoch 12 (Production Hardening).
- **Multi-factor authentication** → Backlog.
- **Password reset flow** → Could be added here but deferred for scope control.

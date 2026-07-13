# OpenVision

A digital examination platform (question authoring, exam assembly, exam taking, grading, analytics). Next.js frontend, FastAPI backend, PostgreSQL via Prisma.

## Prerequisites

- Docker (for PostgreSQL + Redis)
- Node.js 20+
- Python 3.12

## Run it

```bash
cp .env.example .env   # defaults work for local dev
./dev-up.sh --seed     # starts DB, backend, frontend + seeds demo data
```

Then open:

- Frontend: http://localhost:3000
- Backend API: http://127.0.0.1:8000 (Swagger docs at `/docs`)

### Demo accounts (after seeding)

| Role | Email | Password |
|---|---|---|
| Admin | `admin@vu.nl` | `adminpass123` |
| Constructor | `prof@vu.nl` | `conpass123` |
| Student | `student@vu.nl` | `studentpass123` |

Passwords come from the `SEED_*_PASSWORD` values in `.env`.

### Useful flags

```bash
./dev-up.sh            # start without resetting data
./dev-up.sh --no-front # backend + DB only
```

## Tests

```bash
cd backend && DATABASE_URL=<your-db-url> pytest   # backend
cd frontend && npx playwright test                # E2E
```

See `claude.md` for engineering conventions and `docs/` for operations guides.

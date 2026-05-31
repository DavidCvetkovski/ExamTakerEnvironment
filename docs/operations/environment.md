# Environment Configuration

Authoritative reference for the environment variables OpenVision reads. The
canonical template is [`.env.example`](../../.env.example); this document
explains each group, which are **required in production**, and how to generate
secrets. Settings are loaded by `backend/app/core/config.py` (`pydantic-settings`
`BaseSettings`), which reads `.env` then the process environment.

## Production safety gate

When `ENVIRONMENT=production`, `Settings.assert_production_safe()` runs at app
startup (FastAPI lifespan) and **refuses to boot** if:

- `SECRET_KEY` is still the bundled dev default, or
- `CORS_ALLOWED_ORIGINS` contains a wildcard (`*`).

Treat a failed boot here as intended — fill the value, don't work around it.

## Variables

### Application
| Var | Required (prod) | Default | Notes |
|---|---|---|---|
| `ENVIRONMENT` | yes | `development` | One of `development \| test \| staging \| production`. Validated. |
| `APP_VERSION` | no | `0.1.0` | Surfaced in `/health` and Sentry release tags. |

### Security
| Var | Required (prod) | Default | Notes |
|---|---|---|---|
| `SECRET_KEY` | **yes** | dev placeholder | JWT signing key. Generate: `python -c "import secrets; print(secrets.token_hex(32))"`. The dev default is rejected in production. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | no | `30` | Short-lived access token. |
| `REFRESH_TOKEN_EXPIRE_DAYS` | no | `7` | Refresh token lifetime (rotation on use). |

### Database
| Var | Required (prod) | Default | Notes |
|---|---|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` / `POSTGRES_HOST` / `POSTGRES_PORT` | yes | local dev values | Used to assemble the connection when `DATABASE_URL` is unset. |
| `DATABASE_URL` | **yes (prod)** | — | Full DSN. In production point this at **PgBouncer** (`postgresql://openvision:…@pgbouncer:5432/openvision`), not Postgres directly. See [production-deploy](production-deploy.md#pgbouncer). |

### Redis
| Var | Required (prod) | Default | Notes |
|---|---|---|---|
| `REDIS_URL` | **yes** | `redis://localhost:6379/0` | Backs caching, rate limiting, and the heartbeat stream. The app fails its readiness probe if Redis is down. |

### CORS
| Var | Required (prod) | Default | Notes |
|---|---|---|---|
| `CORS_ALLOWED_ORIGINS` | **yes** | localhost origins | Comma-separated explicit origins. Wildcard rejected in production. |

### Frontend
| Var | Required (prod) | Default | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | yes | `http://localhost:8000` | Baked into the Next.js bundle **at build time** (Docker build arg). Rebuild the frontend image to change it. |

### Heartbeat pipeline
| Var | Default | Notes |
|---|---|---|
| `HEARTBEAT_STREAM_NAME` | `openvision:heartbeat:v1` | Redis Stream key. |
| `HEARTBEAT_CONSUMER_GROUP` | `heartbeat-workers` | Consumer group for the worker(s). |
| `HEARTBEAT_WORKER_BATCH_SIZE` | `500` | Max events flushed per batch. |
| `HEARTBEAT_WORKER_BLOCK_MS` | `2500` | Stream read block timeout. |
| `HEARTBEAT_MAX_RETRIES` | `5` | Deliveries before an event is dead-lettered. |

### Rate limiting & observability
| Var | Default | Notes |
|---|---|---|
| `RATE_LIMIT_ENABLED` | `true` | Sliding-window limiter. **Fails open** if Redis is unavailable. |
| `SENTRY_DSN` | empty | Optional. Blank disables Sentry. PII scrubbed when enabled. |

### LTI (Epoch 12)
| Var | Default | Notes |
|---|---|---|
| `LTI_PRIVATE_KEY_ENCRYPTION_KEY` | falls back to `SECRET_KEY` | Encrypts stored LTI private JWKs. Set a dedicated value in production. |

## Secret generation quick reference

```bash
# SECRET_KEY (and a distinct LTI_PRIVATE_KEY_ENCRYPTION_KEY)
python -c "import secrets; print(secrets.token_hex(32))"
```

Store production secrets in your orchestrator's secret manager, not in a
committed `.env`. `.env` is git-ignored; never commit a populated one.

"""Centralized application settings loaded and validated from environment variables."""

from functools import lru_cache
from typing import List, Optional

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Validated runtime settings for OpenVision."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    ENVIRONMENT: str = Field(default="development")
    APP_VERSION: str = Field(default="0.1.0")

    # JWT Authentication
    SECRET_KEY: str = Field(default="dev-secret-key-change-in-production-please")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Redis Config
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_URL: Optional[str] = None

    @property
    def get_redis_url(self) -> str:
        """Construct standard Redis connection URL."""
        if self.REDIS_URL:
            return self.REDIS_URL
        return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/0"

    # Postgres Database Config
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "password"
    POSTGRES_DB: str = "openvision"
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: str = "5432"

    @property
    def DATABASE_URL(self) -> str:
        """Construct database connection URL for SQLAlchemy."""
        return (
            f"postgresql+psycopg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    # CORS & Security
    CORS_ALLOWED_ORIGINS: List[str] = Field(
        default_factory=lambda: ["http://localhost:3000", "http://127.0.0.1:3000"]
    )
    TRUSTED_HOSTS: List[str] = Field(default_factory=lambda: ["localhost", "127.0.0.1"])

    # Base URL of the SPA, used to bounce LTI launches to the frontend resolver.
    FRONTEND_BASE_URL: str = "http://localhost:3000"

    # Heartbeat Stream Pipeline (F2, F3)
    HEARTBEAT_STREAM_NAME: str = "openvision:heartbeat:v1"
    HEARTBEAT_CONSUMER_GROUP: str = "heartbeat-workers"
    HEARTBEAT_WORKER_BATCH_SIZE: int = 500
    HEARTBEAT_WORKER_BLOCK_MS: int = 2500
    HEARTBEAT_MAX_RETRIES: int = 5

    # Caching & Rate Limiting (F5, F6)
    RATE_LIMIT_ENABLED: bool = True
    SENTRY_DSN: Optional[str] = None

    # --- Epoch 11: Safe Exam Browser & Proctoring ---
    # Global kill switch: when False, require_seb_integrity passes through (§19).
    PROCTORING_ENABLED: bool = True
    # The public, browser-facing base SEB hashed its requests against (§6.4).
    # MUST match the host the .seb startURL used (scheme + host + optional port).
    PUBLIC_EXAM_URL_BASE: str = "http://localhost:3000"
    # Enable deterministic SEB Config-Key derivation. Leave False to ship
    # BEK-only mode until Config-Key parity is validated against a real SEB (§6.3).
    SEB_CONFIG_KEY_ENABLED: bool = False
    # Salt for the (one-way) device fingerprint hash so stored values are not
    # reversible or correlatable across exams (§9.9). Falls back to SECRET_KEY.
    FINGERPRINT_SALT: Optional[str] = None
    # Presence thresholds (seconds) — single source for green/yellow/red (§9.4).
    PRESENCE_IDLE_SECONDS: int = 30
    PRESENCE_DISCONNECTED_SECONDS: int = 90

    # LTI key encryption
    LTI_PRIVATE_KEY_ENCRYPTION_KEY: Optional[str] = None

    def model_post_init(self, __context) -> None:
        """Set fallbacks for derived secrets post Pydantic initialization."""
        if not self.LTI_PRIVATE_KEY_ENCRYPTION_KEY:
            self.LTI_PRIVATE_KEY_ENCRYPTION_KEY = self.SECRET_KEY
        if not self.FINGERPRINT_SALT:
            self.FINGERPRINT_SALT = self.SECRET_KEY

    @field_validator("ENVIRONMENT")
    @classmethod
    def validate_environment(cls, value: str) -> str:
        """Ensure environment setting is correct."""
        allowed = {"development", "test", "staging", "production"}
        if value not in allowed:
            raise ValueError(f"ENVIRONMENT must be one of {sorted(allowed)}")
        return value

    def assert_production_safe(self) -> None:
        """Fail fast when production is configured with unsafe development defaults."""
        if self.ENVIRONMENT == "production":
            if self.SECRET_KEY == "dev-secret-key-change-in-production-please":
                raise RuntimeError("Production cannot start with the development SECRET_KEY.")
            if not self.CORS_ALLOWED_ORIGINS:
                raise RuntimeError("Production requires explicit CORS_ALLOWED_ORIGINS.")


@lru_cache
def get_settings() -> Settings:
    """Return cache settings instance."""
    return Settings()


settings = get_settings()

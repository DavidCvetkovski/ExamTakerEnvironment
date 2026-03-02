"""
Centralized application settings loaded from environment variables.
"""
import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    # Database
    POSTGRES_USER: str = os.environ.get("POSTGRES_USER", "postgres")
    POSTGRES_PASSWORD: str = os.environ.get("POSTGRES_PASSWORD", "password")
    POSTGRES_DB: str = os.environ.get("POSTGRES_DB", "openvision")
    POSTGRES_HOST: str = os.environ.get("POSTGRES_HOST", "localhost")
    POSTGRES_PORT: str = os.environ.get("POSTGRES_PORT", "5432")

    @property
    def DATABASE_URL(self) -> str:
        return (
            f"postgresql+psycopg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    # JWT
    SECRET_KEY: str = os.environ.get(
        "SECRET_KEY", "dev-secret-key-change-in-production-please"
    )
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(
        os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "30")
    )
    REFRESH_TOKEN_EXPIRE_DAYS: int = int(
        os.environ.get("REFRESH_TOKEN_EXPIRE_DAYS", "7")
    )

    # Redis
    REDIS_HOST: str = os.environ.get("REDIS_HOST", "localhost")
    REDIS_PORT: str = os.environ.get("REDIS_PORT", "6379")


settings = Settings()

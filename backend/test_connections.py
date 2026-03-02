import os
import redis
from sqlalchemy import create_engine, text

def test_postgres():
    try:
        POSTGRES_USER = os.environ.get("POSTGRES_USER", "postgres")
        POSTGRES_PASSWORD = os.environ.get("POSTGRES_PASSWORD", "password")
        POSTGRES_DB = os.environ.get("POSTGRES_DB", "openvision")
        POSTGRES_HOST = os.environ.get("POSTGRES_HOST", "localhost")
        POSTGRES_PORT = os.environ.get("POSTGRES_PORT", "5432")

        SQLALCHEMY_DATABASE_URL = f"postgresql+psycopg://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"
        
        print(f"Connecting to Postgres at {SQLALCHEMY_DATABASE_URL}...")
        engine = create_engine(SQLALCHEMY_DATABASE_URL)
        with engine.connect() as conn:
            result = conn.execute(text("SELECT 1"))
            print("✅ Postgres connection successful!")
    except Exception as e:
        print(f"❌ Postgres connection failed: {e}")

def test_redis():
    try:
        REDIS_HOST = os.environ.get("REDIS_HOST", "localhost")
        REDIS_PORT = int(os.environ.get("REDIS_PORT", 6379))
        
        print(f"Connecting to Redis at {REDIS_HOST}:{REDIS_PORT}...")
        r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
        r.ping()
        print("✅ Redis connection successful!")
    except Exception as e:
        print(f"❌ Redis connection failed: {e}")

if __name__ == "__main__":
    print("--- Testing OpenVision Connections ---")
    test_postgres()
    test_redis()
    print("--------------------------------------")

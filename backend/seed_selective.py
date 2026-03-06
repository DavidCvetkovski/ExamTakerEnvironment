import os
import sqlalchemy
from sqlalchemy.orm import sessionmaker
from app.core.database import Base, engine
from app.models import User, ItemBank, LearningObject, ItemVersion, MediaAsset, TestDefinition, ExamSession

# Database URL for direct execution
POSTGRES_USER = os.environ.get("POSTGRES_USER", "postgres")
POSTGRES_PASSWORD = os.environ.get("POSTGRES_PASSWORD", "password")
POSTGRES_DB = os.environ.get("POSTGRES_DB", "openvision")
POSTGRES_HOST = os.environ.get("POSTGRES_HOST", "localhost")
POSTGRES_PORT = os.environ.get("POSTGRES_PORT", "5432")

SQLALCHEMY_DATABASE_URL = f"postgresql+psycopg://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"
engine = sqlalchemy.create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def reset_selective():
    """
    Clears all operational data but preserves users.
    """
    db = SessionLocal()
    try:
        print("Starting selective database wipe...")
        
        # Order matters due to foreign key constraints
        # 1. Clear exam sessions (depend on test definitions and users)
        db.query(ExamSession).delete()
        db.query(ItemVersion).delete()
        db.query(TestDefinition).delete()
        db.query(LearningObject).delete()
        db.query(ItemBank).delete()
        db.query(MediaAsset).delete()
        
        # Reset Sequences for SERIAL/IDENTITY columns (if any)
        # Note: TestDefinition, LearningObject, ItemBank use UUIDs as PKs, 
        # but internal SERIALs might exist for other tables if defined.
        # We'll stick to the Query delete for now as standard practice.
        
        db.commit()
        print("Success: Test data cleared. User accounts preserved.")
        
    except Exception as e:
        db.rollback()
        print(f"Error during selective wipe: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    reset_selective()

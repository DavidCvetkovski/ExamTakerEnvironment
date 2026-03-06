import os
import sqlalchemy
from sqlalchemy.orm import sessionmaker
from app.core.database import Base, engine
from app.models import User, ItemBank, LearningObject, ItemVersion, TestDefinition, ExamSession

# Database URL
POSTGRES_USER = os.environ.get("POSTGRES_USER", "postgres")
POSTGRES_PASSWORD = os.environ.get("POSTGRES_PASSWORD", "password")
POSTGRES_DB = os.environ.get("POSTGRES_DB", "openvision")
POSTGRES_HOST = os.environ.get("POSTGRES_HOST", "localhost")
POSTGRES_PORT = os.environ.get("POSTGRES_PORT", "5432")

SQLALCHEMY_DATABASE_URL = f"postgresql+psycopg://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"
engine = sqlalchemy.create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def inspect():
    db = SessionLocal()
    try:
        print("\n=== DATABASE INSPECTION ===")
        
        users = db.query(User).all()
        print(f"\nUsers ({len(users)}):")
        for u in users:
            print(f"  - {u.email} (Role: {u.role.value})")
            
        banks = db.query(ItemBank).all()
        print(f"\nItem Banks ({len(banks)}):")
        for b in banks:
            print(f"  - {b.name}")
            
        los = db.query(LearningObject).all()
        print(f"\nLearning Objects: {len(los)}")
        
        versions = db.query(ItemVersion).all()
        print(f"Item Versions: {len(versions)}")
        
        blueprints = db.query(TestDefinition).all()
        print(f"\nBlueprints: {len(blueprints)}")
        for bp in blueprints:
            print(f"  - {bp.title}")
            
        sessions = db.query(ExamSession).all()
        print(f"Exam Sessions: {len(sessions)}")
        
        print("\n===========================\n")
        
    except Exception as e:
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    inspect()

"""
Seed script: Creates a test User, ItemBank, and LearningObject.
Prints the LearningObject UUID for the frontend to use.
"""
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models import User, ItemBank, LearningObject

POSTGRES_USER = os.environ.get("POSTGRES_USER", "postgres")
POSTGRES_PASSWORD = os.environ.get("POSTGRES_PASSWORD", "password")
POSTGRES_DB = os.environ.get("POSTGRES_DB", "openvision")
POSTGRES_HOST = os.environ.get("POSTGRES_HOST", "localhost")
POSTGRES_PORT = os.environ.get("POSTGRES_PORT", "5432")

SQLALCHEMY_DATABASE_URL = f"postgresql+psycopg://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"
engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def seed():
    db = SessionLocal()
    
    # Check if seed data already exists
    existing = db.query(User).filter(User.email == "seed_professor@vu.nl").first()
    if existing:
        lo = db.query(LearningObject).first()
        if lo:
            print(f"Seed data already exists. LearningObject ID: {lo.id}")
            db.close()
            return str(lo.id)
    
    user = User(email="seed_professor@vu.nl")
    db.add(user)
    db.commit()
    db.refresh(user)
    
    bank = ItemBank(name="Seed Test Bank", created_by=user.id)
    db.add(bank)
    db.commit()
    db.refresh(bank)
    
    lo = LearningObject(bank_id=bank.id, created_by=user.id)
    db.add(lo)
    db.commit()
    db.refresh(lo)
    
    print(f"✅ Seeded database. LearningObject ID: {lo.id}")
    db.close()
    return str(lo.id)

if __name__ == "__main__":
    seed()

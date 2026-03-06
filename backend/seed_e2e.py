import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.database import Base
from app.models import User, ItemBank, LearningObject, ItemVersion, ItemStatus, QuestionType, UserRole
from app.core.security import hash_password

POSTGRES_USER = os.environ.get("POSTGRES_USER", "postgres")
POSTGRES_PASSWORD = os.environ.get("POSTGRES_PASSWORD", "password")
POSTGRES_DB = os.environ.get("POSTGRES_DB", "openvision")
POSTGRES_HOST = os.environ.get("POSTGRES_HOST", "localhost")
POSTGRES_PORT = os.environ.get("POSTGRES_PORT", "5432")

SQLALCHEMY_DATABASE_URL = f"postgresql+psycopg://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"
engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def seed():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    # Create Admin
    admin = User(
        email="admin_e2e@vu.nl",
        hashed_password=hash_password("adminpass123"),
        role=UserRole.ADMIN
    )
    # Create Student with 1.25x accommodation
    student = User(
        email="student_e2e@vu.nl",
        hashed_password=hash_password("studentpass123"),
        role=UserRole.STUDENT,
        provision_time_multiplier=1.25
    )
    db.add_all([admin, student])
    db.commit()

    # Create Item Bank
    bank = ItemBank(name="E2E Bank", created_by=admin.id)
    db.add(bank)
    db.commit()

    # Create 5 approved Math items
    for i in range(5):
        lo = LearningObject(bank_id=bank.id, created_by=admin.id)
        db.add(lo)
        db.commit()
        db.refresh(lo)

        v = ItemVersion(
            learning_object_id=lo.id,
            version_number=1,
            status=ItemStatus.APPROVED,
            question_type=QuestionType.MULTIPLE_CHOICE,
            content={"text": f"Math Question {i+1}?"},
            options={"choices": [{"text": "A", "is_correct": True}, {"text": "B", "is_correct": False}]},
            metadata_tags={"math": True},
            created_by=admin.id
        )
        db.add(v)
    db.commit()
    db.close()
    print("Database seeded for E2E tests.")

if __name__ == "__main__":
    seed()

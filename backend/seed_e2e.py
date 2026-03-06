import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models import User, ItemBank, LearningObject, ItemVersion, ItemStatus, QuestionType, UserRole, TestDefinition, ExamSession
from app.core.security import hash_password

# Database URL
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
    try:
        print("Starting E2E seed (selective wipe)...")
        
        # 1. Wipe operational tables (order matters)
        db.query(ExamSession).delete()
        db.query(ItemVersion).delete()
        db.query(TestDefinition).delete()
        db.query(LearningObject).delete()
        db.query(ItemBank).delete()
        db.commit()
        
        # 2. Ensure Users exist (they should from startup, but we verify)
        # We don't delete users to keep sessions active
        admin = db.query(User).filter(User.email == "admin_e2e@vu.nl").first()
        if not admin:
            admin = User(
                email="admin_e2e@vu.nl",
                hashed_password=hash_password("adminpass123"),
                role=UserRole.ADMIN
            )
            db.add(admin)
            
        constructor = db.query(User).filter(User.email == "constructor_e2e@vu.nl").first()
        if not constructor:
            constructor = User(
                email="constructor_e2e@vu.nl",
                hashed_password=hash_password("conpass123"),
                role=UserRole.CONSTRUCTOR
            )
            db.add(constructor)

        student = db.query(User).filter(User.email == "student_e2e@vu.nl").first()
        if not student:
            student = User(
                email="student_e2e@vu.nl",
                hashed_password=hash_password("studentpass123"),
                role=UserRole.STUDENT,
                provision_time_multiplier=1.25
            )
            db.add(student)
        
        db.commit()
        db.refresh(admin)

        # 3. Create Item Bank
        bank = ItemBank(name="E2E Bank", created_by=admin.id)
        db.add(bank)
        db.commit()
        db.refresh(bank)

        # 4. Create 10 approved items with diverse metadata
        items_data = [
            {"subject": "Mathematics", "topic": "Algebra", "difficulty": 2, "time": 3},
            {"subject": "Mathematics", "topic": "Calculus", "difficulty": 4, "time": 5},
            {"subject": "Science", "topic": "Biology", "difficulty": 1, "time": 2},
            {"subject": "Science", "topic": "Physics", "difficulty": 3, "time": 4},
            {"subject": "Mathematics", "topic": "Algebra", "difficulty": 1, "time": 2},
            {"subject": "Mathematics", "topic": "Statistics", "difficulty": 3, "time": 4},
            {"subject": "Science", "topic": "Chemistry", "difficulty": 5, "time": 8},
            {"subject": "General", "topic": "History", "difficulty": 2, "time": 3},
            {"subject": "Language", "topic": "Grammar", "difficulty": 1, "time": 1},
            {"subject": "Mathematics", "topic": "Geometry", "difficulty": 4, "time": 5},
        ]

        for i, meta in enumerate(items_data):
            lo = LearningObject(bank_id=bank.id, created_by=admin.id)
            db.add(lo)
            db.commit()
            db.refresh(lo)

            v = ItemVersion(
                learning_object_id=lo.id,
                version_number=1,
                status=ItemStatus.APPROVED,
                question_type=QuestionType.MULTIPLE_CHOICE,
                content={"text": f"{meta['topic']} Question {i+1}?"},
                options={"choices": [{"id": "A", "text": "Correct Answer", "is_correct": True}, {"id": "B", "text": "Wrong Answer", "is_correct": False}]},
                metadata_tags={
                    "subject": meta["subject"],
                    "topic": meta["topic"],
                    "difficulty": meta["difficulty"],
                    "estimated_time_mins": meta["time"]
                },
                created_by=admin.id
            )
            db.add(v)
            
        db.commit()
        print("Database seeded for E2E tests (Users preserved).")
        
    except Exception as e:
        db.rollback()
        print(f"Error during seeding: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed()

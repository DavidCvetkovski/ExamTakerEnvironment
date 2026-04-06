ulimport os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models import User, ItemBank, LearningObject, ItemVersion, ItemStatus, QuestionType
import uuid

POSTGRES_USER = os.environ.get("POSTGRES_USER", "postgres")
POSTGRES_PASSWORD = os.environ.get("POSTGRES_PASSWORD", "password")
POSTGRES_DB = os.environ.get("POSTGRES_DB", "openvision")
POSTGRES_HOST = os.environ.get("POSTGRES_HOST", "localhost")
POSTGRES_PORT = os.environ.get("POSTGRES_PORT", "5432")

SQLALCHEMY_DATABASE_URL = f"postgresql+psycopg://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"

engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def verify():
    print("--- Starting Stage 1 Database Verification ---")
    db = SessionLocal()
    try:
        # Create mock User
        user = User(email=f"instructor_{uuid.uuid4().hex[:6]}@vu.nl")
        db.add(user)
        db.commit()
        db.refresh(user)
        print(f"✅ Created User: {user.email}")

        # Create mock ItemBank
        bank = ItemBank(name="Calculus 101 Bank", created_by=user.id)
        db.add(bank)
        db.commit()
        db.refresh(bank)
        print(f"✅ Created ItemBank: {bank.name}")

        # Create mock LearningObject
        lo = LearningObject(bank_id=bank.id, created_by=user.id)
        db.add(lo)
        db.commit()
        db.refresh(lo)
        print(f"✅ Created Immutable LearningObject UUID: {lo.id}")

        # Create mock ItemVersion (Version 1)
        item_v1 = ItemVersion(
            learning_object_id=lo.id,
            version_number=1,
            status=ItemStatus.DRAFT,
            question_type=QuestionType.MULTIPLE_CHOICE,
            content={"raw": "<p>What is the integral of 2x?</p>"},
            options=[
                {"id": "A", "text": "x^2", "is_correct": True},
                {"id": "B", "text": "2", "is_correct": False}
            ],
            metadata_tags={"bloom": "Analysis", "topic": "Integrals"},
            created_by=user.id
        )
        db.add(item_v1)
        db.commit()
        db.refresh(item_v1)
        print(f"✅ Created ItemVersion 1 (DRAFT): UUID {item_v1.id}")

        # Create mock ItemVersion (Version 2)
        item_v2 = ItemVersion(
            learning_object_id=lo.id,
            version_number=2,
            status=ItemStatus.READY_FOR_REVIEW,
            question_type=QuestionType.MULTIPLE_CHOICE,
            content={"raw": "<p>What is the integral of 2x + 1?</p>"},
            options=[
                {"id": "A", "text": "x^2 + x", "is_correct": True},
                {"id": "B", "text": "2", "is_correct": False}
            ],
            metadata_tags={"bloom": "Analysis", "topic": "Integrals"},
            created_by=user.id
        )
        db.add(item_v2)
        db.commit()
        
        # Query it back
        saved_lo = db.query(LearningObject).filter(LearningObject.id == lo.id).first()
        print(f"\n🔍 Query Verification Validation:")
        print(f"   LearningObject ID: {saved_lo.id}")
        print(f"   Total Versions Found: {len(saved_lo.versions)}")
        
        for v in saved_lo.versions:
            print(f"     => Version {v.version_number}: Status {v.status.name} | Stem: {v.content['raw']}")
        
        print("\n🎉 Stage 1 Verification Complete. Database Relational Model is functional.")

    except Exception as e:
        print(f"❌ Verification Failed: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    verify()

"""
Seed script: Creates test users (ADMIN, CONSTRUCTOR, REVIEWER), an ItemBank,
and a LearningObject. Prints the LearningObject UUID for the frontend to use.
"""
import os
from datetime import datetime, timedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models import Course, CourseEnrollment, ItemBank, LearningObject, ScheduledExamSession, TestDefinition, User
from app.models.user import UserRole
from app.core.security import hash_password

POSTGRES_USER = os.environ.get("POSTGRES_USER", "postgres")
POSTGRES_PASSWORD = os.environ.get("POSTGRES_PASSWORD", "password")
POSTGRES_DB = os.environ.get("POSTGRES_DB", "openvision")
POSTGRES_HOST = os.environ.get("POSTGRES_HOST", "localhost")
POSTGRES_PORT = os.environ.get("POSTGRES_PORT", "5432")

SQLALCHEMY_DATABASE_URL = f"postgresql+psycopg://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"
engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

SEED_USERS = [
    {"email": "admin@vu.nl",       "password": "adminpass123",  "role": UserRole.ADMIN},
    {"email": "prof@vu.nl",        "password": "profpass123",   "role": UserRole.CONSTRUCTOR},
    {"email": "reviewer@vu.nl",    "password": "reviewpass123", "role": UserRole.REVIEWER},
    {"email": "student@vu.nl",     "password": "studpass123",   "role": UserRole.STUDENT},
]


def seed():
    db = SessionLocal()

    # Check if seed already exists
    existing = db.query(User).filter(User.email == "admin@vu.nl").first()
    if existing:
        lo = db.query(LearningObject).first()
        print(f"Seed data already exists.")
        if lo:
            print(f"LearningObject ID: {lo.id}")
        db.close()
        return

    # Create users
    created_users = {}
    for u in SEED_USERS:
        user = User(
            email=u["email"],
            hashed_password=hash_password(u["password"]),
            role=u["role"],
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        created_users[u["role"]] = user
        print(f"  ✅ Created {u['role'].value}: {u['email']} / {u['password']}")

    # Create ItemBank (owned by constructor)
    bank = ItemBank(name="Seed Test Bank", created_by=created_users[UserRole.CONSTRUCTOR].id)
    db.add(bank)
    db.commit()
    db.refresh(bank)

    # Create LearningObject
    lo = LearningObject(bank_id=bank.id, created_by=created_users[UserRole.CONSTRUCTOR].id)
    db.add(lo)
    db.commit()
    db.refresh(lo)

    course = Course(
        code="SEED-101",
        title="Seed Course",
        created_by=created_users[UserRole.CONSTRUCTOR].id,
    )
    db.add(course)
    db.commit()
    db.refresh(course)

    enrollment = CourseEnrollment(
        course_id=course.id,
        student_id=created_users[UserRole.STUDENT].id,
        is_active=True,
    )
    db.add(enrollment)

    blueprint = TestDefinition(
        title="Seed Blueprint",
        description="Seed scheduled exam blueprint",
        created_by=created_users[UserRole.CONSTRUCTOR].id,
        blocks=[{"title": "Section 1", "rules": []}],
        duration_minutes=60,
        shuffle_questions=False,
    )
    db.add(blueprint)
    db.commit()
    db.refresh(blueprint)

    scheduled = ScheduledExamSession(
        course_id=course.id,
        test_definition_id=blueprint.id,
        created_by=created_users[UserRole.CONSTRUCTOR].id,
        starts_at=datetime.utcnow() + timedelta(days=1),
        ends_at=datetime.utcnow() + timedelta(days=1, minutes=60),
    )
    db.add(scheduled)
    db.commit()

    print(f"\n✅ Seed complete.")
    print(f"   LearningObject ID: {lo.id}")
    db.close()


if __name__ == "__main__":
    seed()

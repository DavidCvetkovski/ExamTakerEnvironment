from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.api.api import api_router
from app.core.database import SessionLocal, Base, engine
from app.models import User, UserRole
from app.core.security import hash_password

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables if they don't exist
    Base.metadata.create_all(bind=engine)
    
    # Check for default accounts
    db = SessionLocal()
    try:
        defaults = [
            ("admin_e2e@vu.nl", UserRole.ADMIN, "adminpass123"),
            ("constructor_e2e@vu.nl", UserRole.CONSTRUCTOR, "conpass123"),
            ("student_e2e@vu.nl", UserRole.STUDENT, "studentpass123"),
        ]
        
        for email, role, password in defaults:
            user = db.query(User).filter(User.email == email).first()
            if not user:
                new_user = User(
                    email=email,
                    hashed_password=hash_password(password),
                    role=role
                )
                db.add(new_user)
        db.commit()
    finally:
        db.close()
    yield

app = FastAPI(
    title="OpenVision Ecosystem",
    version="0.1.0",
    lifespan=lifespan
)

app.include_router(api_router, prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "TestVision Replica Backend"}

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.api.api import api_router
from app.models import User, UserRole
from app.core.security import hash_password

from app.core.prisma_db import connect_prisma, disconnect_prisma, prisma
from uuid import UUID

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. Connect Prisma
    await connect_prisma()
    
    # 2. Check for default accounts using Prisma
    defaults = [
        ("admin_e2e@vu.nl", UserRole.ADMIN, "adminpass123"),
        ("constructor_e2e@vu.nl", UserRole.CONSTRUCTOR, "conpass123"),
        ("student_e2e@vu.nl", UserRole.STUDENT, "studentpass123"),
    ]
    
    for email, role, password in defaults:
        user = await prisma.users.find_unique(where={"email": email})
        if not user:
            await prisma.users.create(
                data={
                    "id": str(UUID(int=hash(email) & 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF)), # Deterministic UUID for defaults
                    "email": email,
                    "hashed_password": hash_password(password),
                    "role": role,
                    "is_active": True,
                    "provision_time_multiplier": 1.0
                }
            )
    yield
    # 3. Disconnect Prisma
    await disconnect_prisma()

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

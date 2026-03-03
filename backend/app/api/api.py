from fastapi import APIRouter
from app.api.endpoints import items, auth, tests, sessions

api_router = APIRouter()
api_router.include_router(items.router)
api_router.include_router(auth.router)
api_router.include_router(tests.router, prefix="/tests", tags=["tests"])
api_router.include_router(sessions.router, prefix="/sessions", tags=["sessions"])

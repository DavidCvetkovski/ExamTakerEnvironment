from fastapi import APIRouter
from app.api.endpoints import (
    auth,
    courses,
    grading,
    interactions,
    items,
    scheduled_sessions,
    sessions,
    student_sessions,
    tests,
)

api_router = APIRouter()
api_router.include_router(items.router)
api_router.include_router(auth.router)
api_router.include_router(courses.router)
api_router.include_router(tests.router, prefix="/tests", tags=["tests"])
api_router.include_router(sessions.router, prefix="/sessions", tags=["sessions"])
api_router.include_router(interactions.router, prefix="/sessions", tags=["interactions"])
api_router.include_router(scheduled_sessions.router)
api_router.include_router(student_sessions.router)
api_router.include_router(grading.router, prefix="/grading", tags=["grading"])

from fastapi import APIRouter
from app.api.endpoints import (
    accommodations,
    analytics,
    auth,
    courses,
    grading,
    import_endpoints,
    interactions,
    items,
    lti,
    preferences,
    scheduled_sessions,
    sessions,
    sis,
    student_sessions,
    tests,
    users,
)

api_router = APIRouter()
api_router.include_router(items.router)
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(preferences.router)
api_router.include_router(courses.router)
api_router.include_router(tests.router, prefix="/tests", tags=["tests"])
api_router.include_router(sessions.router, prefix="/sessions", tags=["sessions"])
api_router.include_router(interactions.router, prefix="/sessions", tags=["interactions"])
api_router.include_router(scheduled_sessions.router)
api_router.include_router(student_sessions.router)
api_router.include_router(grading.router, prefix="/grading", tags=["grading"])
api_router.include_router(analytics.router, prefix="/analytics", tags=["analytics"])
api_router.include_router(import_endpoints.router, prefix="/import", tags=["import"])
api_router.include_router(accommodations.router)
api_router.include_router(lti.router)
api_router.include_router(sis.router)

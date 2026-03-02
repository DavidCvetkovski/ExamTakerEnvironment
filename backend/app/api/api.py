from fastapi import APIRouter
from app.api.endpoints import items, auth

api_router = APIRouter()
api_router.include_router(items.router)
api_router.include_router(auth.router)

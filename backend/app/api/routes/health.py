"""
Health Check Route (/api/health).
"""

from fastapi import APIRouter
from backend.app.ml.model import model_engine

router = APIRouter()


@router.get("/health")
def health_check():
    if not model_engine.loaded:
        model_engine.load()
    return {
        "status": "healthy",
        "active_model": model_engine.active_model,
        "models_available": list(model_engine.bundle.get("models", {}).keys()),
    }

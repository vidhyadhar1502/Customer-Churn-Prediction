"""
Analytics & Model Insights Routes (/api/analytics, /api/model/metrics, /api/model/feature-importance, /api/model/config).
"""

from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from backend.app.ml.model import model_engine
from backend.app.services.analytics_service import (
    get_dashboard_analytics,
    get_model_metrics_payload,
)

router = APIRouter()


class ModelConfigUpdateSchema(BaseModel):
    active_model: Optional[str] = None
    risk_threshold_low: Optional[float] = Field(default=None, ge=0.05, le=0.55)
    risk_threshold_high: Optional[float] = Field(default=None, ge=0.45, le=0.95)


@router.get("/analytics")
def fetch_dashboard_analytics():
    return get_dashboard_analytics()


@router.get("/model/metrics")
def fetch_model_metrics(model: Optional[str] = Query(default=None)):
    return get_model_metrics_payload(model_key=model)


@router.get("/model/feature-importance")
def fetch_feature_importance(model: Optional[str] = Query(default=None)):
    if not model_engine.loaded:
        model_engine.load()
    target = model if model in model_engine.bundle["models"] else model_engine.active_model
    m_info = model_engine.bundle["models"][target]
    return {
        "model": target,
        "model_name": m_info["name"],
        "features": m_info["feature_importance"],
    }


@router.put("/model/config")
def update_model_configuration(body: ModelConfigUpdateSchema):
    if not model_engine.loaded:
        model_engine.load()
    if body.active_model:
        if body.active_model not in model_engine.bundle["models"]:
            raise HTTPException(status_code=400, detail=f"Unsupported model '{body.active_model}'.")
        model_engine.active_model = body.active_model

    new_low = body.risk_threshold_low if body.risk_threshold_low is not None else model_engine.risk_low
    new_high = body.risk_threshold_high if body.risk_threshold_high is not None else model_engine.risk_high
    if new_low >= new_high:
        raise HTTPException(status_code=400, detail="Low risk threshold must be strictly less than High risk threshold.")
    model_engine.risk_low = round(new_low, 2)
    model_engine.risk_high = round(new_high, 2)

    return {
        "active_model": model_engine.active_model,
        "thresholds": {
            "low": model_engine.risk_low,
            "high": model_engine.risk_high,
        },
    }

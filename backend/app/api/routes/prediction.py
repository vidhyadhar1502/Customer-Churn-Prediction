"""
Prediction Routes (/api/predict, /api/predict/batch, /api/predictions).
"""

from typing import Optional
from fastapi import APIRouter, File, HTTPException, Query, UploadFile

from backend.app.schemas.customer import CustomerBaseSchema
from backend.app.services.prediction_service import (
    query_prediction_history,
    run_batch_prediction,
    run_single_prediction,
)
from backend.app.utils.config import settings
from backend.app.utils.validation import parse_and_validate_csv, validate_customer_payload

router = APIRouter()


@router.post("/predict")
def predict_single_customer(payload: CustomerBaseSchema, model: Optional[str] = Query(default=None)):
    raw_dict = payload.model_dump()
    is_valid, errors = validate_customer_payload(raw_dict)
    if not is_valid:
        raise HTTPException(status_code=422, detail="; ".join(errors))
    try:
        return run_single_prediction(raw_dict, model_override=model, persist=True)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Prediction execution failed: {str(exc)}")


@router.post("/predict/batch")
async def predict_batch_customers(
    file: UploadFile = File(...),
    model: Optional[str] = Query(default=None),
):
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Invalid file format. Please upload a .csv file.")
    content = await file.read()
    rows, errors = parse_and_validate_csv(content, max_bytes=settings.max_csv_upload_bytes)
    if errors:
        raise HTTPException(status_code=422, detail="; ".join(errors))
    try:
        return run_batch_prediction(rows, model_override=model)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Batch prediction failed: {str(exc)}")


@router.get("/predictions")
def list_prediction_history(
    risk_level: str = Query(default=""),
    prediction: str = Query(default=""),
    source: str = Query(default=""),
    date_from: str = Query(default=""),
    search: str = Query(default=""),
    limit: int = Query(default=100, ge=1, le=500),
):
    items = query_prediction_history(
        risk_level=risk_level,
        prediction_filter=prediction,
        source=source,
        date_from=date_from,
        search=search,
        limit=limit,
    )
    return {"items": items, "total": len(items)}

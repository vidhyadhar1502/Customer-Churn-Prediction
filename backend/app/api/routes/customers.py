"""
Customers Route (/api/customers, /api/customers/{customer_id}).
"""

from fastapi import APIRouter, HTTPException, Query
from backend.app.services.customer_service import get_customer_by_id, query_customers

router = APIRouter()


@router.get("/customers")
def list_customers(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=15, ge=5, le=100),
    search: str = Query(default=""),
    risk_level: str = Query(default=""),
    contract: str = Query(default=""),
    prediction: str = Query(default=""),
    sort_by: str = Query(default="churn_probability"),
    sort_order: str = Query(default="desc"),
):
    return query_customers(
        page=page,
        page_size=page_size,
        search=search,
        risk_level=risk_level,
        contract=contract,
        prediction_filter=prediction,
        sort_by=sort_by,
        sort_order=sort_order,
    )


@router.get("/customers/{customer_id}")
def get_customer_detail(customer_id: str):
    cust = get_customer_by_id(customer_id)
    if not cust:
        raise HTTPException(status_code=404, detail=f"Customer '{customer_id}' not found.")
    return cust

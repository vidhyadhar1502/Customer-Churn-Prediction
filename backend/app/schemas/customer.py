"""
Pydantic Schemas for Customer Input and Customer Database Records.
"""

from typing import Literal, Optional
from pydantic import BaseModel, Field, field_validator


class CustomerBaseSchema(BaseModel):
    customer_id: Optional[str] = Field(default="CUST-NEW", description="Unique customer identifier")
    gender: Literal["Male", "Female"] = Field(default="Female")
    senior_citizen: int = Field(default=0, ge=0, le=1)
    partner: Literal["Yes", "No"] = Field(default="No")
    dependents: Literal["Yes", "No"] = Field(default="No")
    tenure: int = Field(..., ge=0, le=120, description="Number of months customer has stayed with the company")
    phone_service: Literal["Yes", "No"] = Field(default="Yes")
    multiple_lines: Literal["Yes", "No", "No phone service"] = Field(default="No")
    internet_service: Literal["DSL", "Fiber optic", "No"] = Field(...)
    online_security: Literal["Yes", "No", "No internet service"] = Field(default="No")
    online_backup: Literal["Yes", "No", "No internet service"] = Field(default="No")
    device_protection: Literal["Yes", "No", "No internet service"] = Field(default="No")
    tech_support: Literal["Yes", "No", "No internet service"] = Field(default="No")
    streaming_tv: Literal["Yes", "No", "No internet service"] = Field(default="No")
    streaming_movies: Literal["Yes", "No", "No internet service"] = Field(default="No")
    contract: Literal["Month-to-month", "One year", "Two year"] = Field(...)
    paperless_billing: Literal["Yes", "No"] = Field(default="Yes")
    payment_method: Literal[
        "Electronic check",
        "Mailed check",
        "Bank transfer (automatic)",
        "Credit card (automatic)",
    ] = Field(default="Electronic check")
    monthly_charges: float = Field(..., ge=0.0, le=1000.0)
    total_charges: Optional[float] = Field(default=None, ge=0.0, le=150000.0)

    @field_validator("total_charges", mode="before")
    @classmethod
    def sanitize_total_charges(cls, v, info):
        if v is None or (isinstance(v, str) and v.strip() == ""):
            return None
        return float(v)


class CustomerRecordResponse(CustomerBaseSchema):
    id: int
    churn_probability: float
    risk_level: Literal["LOW", "MEDIUM", "HIGH"]
    prediction: int
    prediction_label: str
    actual_churn: Optional[str] = None
    created_at: str

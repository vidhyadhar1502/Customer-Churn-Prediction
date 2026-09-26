"""
Pydantic Schemas for Single Prediction, Batch Prediction, Explainability, and Model Metrics.
"""

from typing import Any, Dict, List, Literal
from pydantic import BaseModel, Field


class FeatureContributionItem(BaseModel):
    feature: str
    value: str
    impact_score: float = Field(..., description="Approximate log-odds contribution to churn probability")
    direction: Literal["positive", "negative"] = Field(
        ..., description="positive = increases churn risk; negative = reduces churn risk"
    )
    summary: str


class PredictionResponseSchema(BaseModel):
    customer_id: str
    prediction: int = Field(..., description="1 for Churn, 0 for No Churn")
    prediction_label: str = Field(..., description="High Churn Risk / Moderate Churn Risk / Low Churn Risk")
    churn_probability: float = Field(..., ge=0.0, le=1.0)
    risk_level: Literal["LOW", "MEDIUM", "HIGH"]
    model_used: str
    threshold_config: Dict[str, float]
    explanations: List[FeatureContributionItem]
    positive_factors: List[str]
    negative_factors: List[str]
    recommendations: List[str]
    disclaimer: str
    timestamp: str


class BatchPredictionResponseSchema(BaseModel):
    total_processed: int
    high_risk_count: int
    medium_risk_count: int
    low_risk_count: int
    predicted_churners: int
    average_probability: float
    model_used: str
    results: List[Dict[str, Any]]

"""
FastAPI Application Entrypoint for RetainIQ Customer Churn Prediction API.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.api.routes import analytics, customers, health, prediction
from backend.app.ml.model import model_engine
from backend.app.services.customer_service import init_and_seed_database
from backend.app.utils.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    model_engine.load()
    init_and_seed_database()
    yield


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="Production REST API for Telco Customer Churn Prediction, Batch Scoring, and Explainable ML Insights.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api", tags=["Health"])
app.include_router(prediction.router, prefix="/api", tags=["Prediction"])
app.include_router(customers.router, prefix="/api", tags=["Customers"])
app.include_router(analytics.router, prefix="/api", tags=["Analytics & Model Insights"])

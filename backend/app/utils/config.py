"""
Centralized Backend Configuration loaded from environment variables.
Risk thresholds and active model selection are configurable without hardcoding.
"""

import os
from dataclasses import dataclass, field
from typing import List


@dataclass
class Settings:
    app_name: str = os.getenv("APP_NAME", "RetainIQ Customer Churn Prediction API")
    app_env: str = os.getenv("APP_ENV", "development")
    host: str = os.getenv("HOST", "0.0.0.0")
    port: int = int(os.getenv("FASTAPI_PORT", os.getenv("PORT", "8000")))

    base_dir: str = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    database_path: str = os.getenv(
        "SQLITE_DB_PATH",
        os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "data", "churn.db"),
    )
    model_path: str = os.getenv(
        "MODEL_PATH",
        os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "models", "churn_model.pkl"),
    )
    preprocessor_path: str = os.getenv(
        "PREPROCESSOR_PATH",
        os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "models", "preprocessor.pkl"),
    )
    artifacts_path: str = os.getenv(
        "ARTIFACTS_PATH",
        os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "models", "model_artifacts.json"),
    )
    dataset_path: str = os.getenv(
        "DATASET_PATH",
        os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "data", "customer_data.csv"),
    )

    active_model: str = os.getenv("DEFAULT_MODEL_TYPE", "logistic_regression")
    risk_threshold_low: float = float(os.getenv("RISK_THRESHOLD_LOW", "0.30"))
    risk_threshold_high: float = float(os.getenv("RISK_THRESHOLD_HIGH", "0.70"))
    max_csv_upload_bytes: int = int(os.getenv("MAX_CSV_UPLOAD_BYTES", str(5 * 1024 * 1024)))
    random_seed: int = int(os.getenv("RANDOM_SEED", "42"))
    cors_origins: List[str] = field(
        default_factory=lambda: [
            origin.strip()
            for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:5173").split(",")
            if origin.strip()
        ]
    )


settings = Settings()

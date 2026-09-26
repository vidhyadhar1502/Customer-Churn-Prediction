"""
Model Manager for Loading Serialized Models and Performing Single/Batch Inference.
Loads `churn_model.pkl` and `preprocessor.pkl` at startup (never trains inside API requests).
"""

import json
import math
import os
import pickle
from datetime import datetime, timezone
from typing import Any, Dict, List

from backend.app.ml.explainer import generate_local_explanation
from backend.app.ml.preprocessing import TelcoChurnPreprocessor, normalize_input_record
from backend.app.utils.config import settings


def _sigmoid(z: float) -> float:
    if z >= 0:
        return 1.0 / (1.0 + math.exp(-min(z, 40.0)))
    ez = math.exp(max(z, -40.0))
    return ez / (1.0 + ez)


def _eval_tree(tree: Dict[str, Any], xi: List[float]) -> float:
    node = tree
    while not node.get("leaf", True):
        if xi[node["feat"]] <= node["thresh"]:
            node = node["left"]
        else:
            node = node["right"]
    return float(node["val"])


class ChurnModelEngine:
    def __init__(self) -> None:
        self.bundle: Dict[str, Any] = {}
        self.preprocessor: TelcoChurnPreprocessor = TelcoChurnPreprocessor()
        self.active_model: str = settings.active_model
        self.risk_low: float = settings.risk_threshold_low
        self.risk_high: float = settings.risk_threshold_high
        self.loaded: bool = False

    def load(self) -> None:
        if os.path.exists(settings.model_path):
            with open(settings.model_path, "rb") as f:
                self.bundle = pickle.load(f)
        elif os.path.exists(settings.artifacts_path):
            with open(settings.artifacts_path, "r", encoding="utf-8") as f:
                self.bundle = json.load(f)
        else:
            raise FileNotFoundError(
                f"Trained model file not found at {settings.model_path}. Run `python3 ml/train.py` first."
            )

        self.preprocessor = TelcoChurnPreprocessor.from_dict(self.bundle["preprocessor"])
        if self.active_model not in self.bundle.get("models", {}):
            self.active_model = self.bundle.get("active_model", "logistic_regression")
        self.loaded = True

    def classify_risk(self, probability: float) -> str:
        if probability < self.risk_low:
            return "LOW"
        elif probability <= self.risk_high:
            return "MEDIUM"
        return "HIGH"

    def predict_one(self, raw_payload: Dict[str, Any], model_override: str = None) -> Dict[str, Any]:
        if not self.loaded:
            self.load()

        model_key = model_override if model_override in self.bundle["models"] else self.active_model
        model_data = self.bundle["models"][model_key]

        norm_cust = normalize_input_record(raw_payload)
        x_vec = self.preprocessor.transform_single(norm_cust)

        if model_key == "logistic_regression":
            z = float(model_data["bias"]) + sum(w * xj for w, xj in zip(model_data["weights"], x_vec))
            prob = round(_sigmoid(z), 4)
        elif model_key == "random_forest":
            trees = model_data["trees"]
            avg_p = sum(_eval_tree(t, x_vec) for t in trees) / max(1, len(trees))
            prob = round(max(0.01, min(0.99, avg_p)), 4)
        else:
            score = float(model_data["init_log_odds"])
            lr = float(model_data["learning_rate"])
            for t in model_data["trees"]:
                score += lr * 3.8 * _eval_tree(t, x_vec)
            prob = round(_sigmoid(score), 4)

        prediction = 1 if prob >= 0.50 else 0
        risk_level = self.classify_risk(prob)
        pred_label = (
            "High Churn Risk"
            if risk_level == "HIGH"
            else "Moderate Churn Risk"
            if risk_level == "MEDIUM"
            else "Low Churn Risk"
        )

        lr_weights = self.bundle["models"]["logistic_regression"]["weights"]
        explanations, pos_factors, neg_factors, recommendations = generate_local_explanation(
            norm_cust,
            x_vec,
            self.preprocessor.feature_names,
            lr_weights,
            self.bundle.get("human_feature_labels", {}),
        )

        return {
            "customer_id": norm_cust["customerID"],
            "prediction": prediction,
            "prediction_label": pred_label,
            "churn_probability": prob,
            "risk_level": risk_level,
            "model_used": model_key,
            "threshold_config": {
                "low_max": self.risk_low,
                "high_min": self.risk_high,
                "classification_cutoff": 0.50,
            },
            "explanations": explanations,
            "positive_factors": pos_factors,
            "negative_factors": neg_factors,
            "recommendations": recommendations,
            "disclaimer": (
                "Feature contributions represent standardized log-odds approximations from the trained "
                "model rather than exact causal effects. Recommended actions are decision-support "
                "heuristics and do not guarantee customer retention."
            ),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "normalized_customer": norm_cust,
        }


model_engine = ChurnModelEngine()

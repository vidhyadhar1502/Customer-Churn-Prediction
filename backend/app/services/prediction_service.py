"""
Prediction Service for Single Customer Scoring, Batch CSV Scoring, and Prediction History Persistence.
"""

import json
from typing import Any, Dict, List, Optional

from backend.app.ml.model import model_engine
from backend.app.services.customer_service import get_db_connection


def run_single_prediction(payload: Dict[str, Any], model_override: Optional[str] = None, persist: bool = True) -> Dict[str, Any]:
    result = model_engine.predict_one(payload, model_override=model_override)
    norm = result.pop("normalized_customer", {})

    if persist:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO predictions (
                customer_id, probability, prediction, risk_level, model_used,
                source, explanations_json, recommendations_json, customer_snapshot_json, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                result["customer_id"],
                result["churn_probability"],
                result["prediction"],
                result["risk_level"],
                result["model_used"],
                "single",
                json.dumps(result["explanations"]),
                json.dumps(result["recommendations"]),
                json.dumps(norm),
                result["timestamp"],
            ),
        )
        conn.commit()
        conn.close()

    return result


def run_batch_prediction(rows: List[Dict[str, Any]], model_override: Optional[str] = None) -> Dict[str, Any]:
    results = []
    high_cnt = 0
    med_cnt = 0
    low_cnt = 0
    churn_cnt = 0
    prob_sum = 0.0

    conn = get_db_connection()
    cur = conn.cursor()

    for idx, row in enumerate(rows, start=1):
        if not row.get("customerID") and not row.get("customer_id"):
            row["customer_id"] = f"BATCH-{idx:04d}"
        pred = model_engine.predict_one(row, model_override=model_override)
        norm = pred.pop("normalized_customer", {})

        prob = pred["churn_probability"]
        prob_sum += prob
        if pred["prediction"] == 1:
            churn_cnt += 1
        if pred["risk_level"] == "HIGH":
            high_cnt += 1
        elif pred["risk_level"] == "MEDIUM":
            med_cnt += 1
        else:
            low_cnt += 1

        results.append({
            "customer_id": pred["customer_id"],
            "tenure": norm.get("tenure", 0),
            "contract": norm.get("Contract", "Month-to-month"),
            "internet_service": norm.get("InternetService", "Fiber optic"),
            "monthly_charges": norm.get("MonthlyCharges", 0.0),
            "total_charges": norm.get("TotalCharges", 0.0),
            "churn_probability": prob,
            "prediction": pred["prediction"],
            "prediction_label": pred["prediction_label"],
            "risk_level": pred["risk_level"],
            "top_factor": pred["positive_factors"][0] if pred["positive_factors"] else (pred["negative_factors"][0] if pred["negative_factors"] else "Balanced profile"),
            "recommended_action": pred["recommendations"][0] if pred["recommendations"] else "Standard retention monitoring",
        })

        # Persist batch predictions up to first 100 rows to avoid bloating history on massive files
        if idx <= 100:
            cur.execute(
                """
                INSERT INTO predictions (
                    customer_id, probability, prediction, risk_level, model_used,
                    source, explanations_json, recommendations_json, customer_snapshot_json, timestamp
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    pred["customer_id"],
                    prob,
                    pred["prediction"],
                    pred["risk_level"],
                    pred["model_used"],
                    "batch",
                    json.dumps(pred["explanations"]),
                    json.dumps(pred["recommendations"]),
                    json.dumps(norm),
                    pred["timestamp"],
                ),
            )

    conn.commit()
    conn.close()

    total = max(1, len(results))
    return {
        "total_processed": len(results),
        "high_risk_count": high_cnt,
        "medium_risk_count": med_cnt,
        "low_risk_count": low_cnt,
        "predicted_churners": churn_cnt,
        "average_probability": round(prob_sum / total, 4),
        "model_used": model_override or model_engine.active_model,
        "results": results,
    }


def query_prediction_history(
    risk_level: str = "",
    prediction_filter: str = "",
    source: str = "",
    date_from: str = "",
    search: str = "",
    limit: int = 100,
) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cur = conn.cursor()

    clauses = []
    params: List[Any] = []

    if risk_level in ("LOW", "MEDIUM", "HIGH"):
        clauses.append("risk_level = ?")
        params.append(risk_level)

    if prediction_filter in ("0", "1"):
        clauses.append("prediction = ?")
        params.append(int(prediction_filter))

    if source in ("single", "batch"):
        clauses.append("source = ?")
        params.append(source)

    if date_from.strip():
        clauses.append("timestamp >= ?")
        params.append(date_from.strip())

    if search.strip():
        clauses.append("customer_id LIKE ?")
        params.append(f"%{search.strip()}%")

    where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    cur.execute(
        f"SELECT * FROM predictions {where_sql} ORDER BY timestamp DESC, id DESC LIMIT ?",
        [*params, limit],
    )
    rows = []
    for r in cur.fetchall():
        d = dict(r)
        d["explanations"] = json.loads(d.pop("explanations_json") or "[]")
        d["recommendations"] = json.loads(d.pop("recommendations_json") or "[]")
        d["customer_snapshot"] = json.loads(d.pop("customer_snapshot_json") or "{}")
        rows.append(d)

    conn.close()
    return rows

"""
Analytics & Model Insights Service.
Computes real cohort aggregations from the SQLite `customers` database and retrieves
actual trained model performance metrics, confusion matrix, and feature importance.
"""

from typing import Any, Dict

from backend.app.ml.model import model_engine
from backend.app.services.customer_service import get_db_connection


def get_dashboard_analytics() -> Dict[str, Any]:
    if not model_engine.loaded:
        model_engine.load()

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT
            COUNT(*) as total_customers,
            SUM(CASE WHEN prediction = 1 THEN 1 ELSE 0 END) as predicted_churners,
            AVG(churn_probability) as avg_churn_probability,
            SUM(CASE WHEN risk_level = 'HIGH' THEN 1 ELSE 0 END) as high_risk_customers,
            SUM(CASE WHEN risk_level = 'MEDIUM' THEN 1 ELSE 0 END) as medium_risk_customers,
            SUM(CASE WHEN risk_level = 'LOW' THEN 1 ELSE 0 END) as low_risk_customers,
            SUM(CASE WHEN prediction = 1 THEN monthly_charges ELSE 0 END) as monthly_revenue_at_risk
        FROM customers
        """
    )
    summary = dict(cur.fetchone())

    # 1. Churn vs Non-Churn
    total_c = summary["total_customers"] or 1
    pred_churn = summary["predicted_churners"] or 0
    pred_retain = total_c - pred_churn
    churn_vs_non_churn = [
        {"name": "Retained (No Churn)", "count": pred_retain, "percentage": round(pred_retain * 100.0 / total_c, 1)},
        {"name": "Predicted Churn", "count": pred_churn, "percentage": round(pred_churn * 100.0 / total_c, 1)},
    ]

    # 2. Churn probability distribution (10 decile buckets)
    cur.execute("SELECT churn_probability FROM customers")
    probs = [float(r["churn_probability"]) for r in cur.fetchall()]
    buckets = [0] * 10
    for p in probs:
        b_idx = min(9, max(0, int(p * 10)))
        buckets[b_idx] += 1

    probability_distribution = [
        {
            "range": f"{i*10}–{(i+1)*10}%",
            "count": buckets[i],
            "risk_zone": "LOW" if (i + 1) * 0.1 <= model_engine.risk_low else ("HIGH" if i * 0.1 >= model_engine.risk_high else "MEDIUM"),
        }
        for i in range(10)
    ]

    # 3. Churn by Contract Type
    cur.execute(
        """
        SELECT
            contract,
            COUNT(*) as total,
            SUM(CASE WHEN prediction = 1 THEN 1 ELSE 0 END) as churners,
            AVG(churn_probability) as avg_prob
        FROM customers
        GROUP BY contract
        ORDER BY avg_prob DESC
        """
    )
    churn_by_contract = [
        {
            "contract": r["contract"],
            "total": r["total"],
            "churners": r["churners"],
            "retained": r["total"] - r["churners"],
            "churn_rate": round((r["churners"] * 100.0) / max(1, r["total"]), 1),
            "avg_probability": round(float(r["avg_prob"]) * 100.0, 1),
        }
        for r in cur.fetchall()
    ]

    # 4. Churn by Tenure Cohort
    cur.execute(
        """
        SELECT
            CASE
                WHEN tenure <= 6 THEN '0–6 Months'
                WHEN tenure <= 12 THEN '7–12 Months'
                WHEN tenure <= 24 THEN '13–24 Months'
                WHEN tenure <= 48 THEN '25–48 Months'
                ELSE '49–72 Months'
            END as tenure_cohort,
            COUNT(*) as total,
            SUM(CASE WHEN prediction = 1 THEN 1 ELSE 0 END) as churners,
            AVG(churn_probability) as avg_prob
        FROM customers
        GROUP BY tenure_cohort
        """
    )
    cohort_order = {"0–6 Months": 1, "7–12 Months": 2, "13–24 Months": 3, "25–48 Months": 4, "49–72 Months": 5}
    raw_tenure = [dict(r) for r in cur.fetchall()]
    raw_tenure.sort(key=lambda x: cohort_order.get(x["tenure_cohort"], 99))
    churn_by_tenure = [
        {
            "cohort": r["tenure_cohort"],
            "total": r["total"],
            "churners": r["churners"],
            "churn_rate": round((r["churners"] * 100.0) / max(1, r["total"]), 1),
            "avg_probability": round(float(r["avg_prob"]) * 100.0, 1),
        }
        for r in raw_tenure
    ]

    # 5. Churn by Monthly Charges Bracket
    cur.execute(
        """
        SELECT
            CASE
                WHEN monthly_charges < 35 THEN '$18–$35'
                WHEN monthly_charges < 55 THEN '$35–$55'
                WHEN monthly_charges < 75 THEN '$55–$75'
                WHEN monthly_charges < 95 THEN '$75–$95'
                ELSE '$95–$120'
            END as charge_bracket,
            COUNT(*) as total,
            SUM(CASE WHEN prediction = 1 THEN 1 ELSE 0 END) as churners,
            AVG(churn_probability) as avg_prob
        FROM customers
        GROUP BY charge_bracket
        """
    )
    bracket_order = {"$18–$35": 1, "$35–$55": 2, "$55–$75": 3, "$75–$95": 4, "$95–$120": 5}
    raw_charges = [dict(r) for r in cur.fetchall()]
    raw_charges.sort(key=lambda x: bracket_order.get(x["charge_bracket"], 99))
    churn_by_monthly_charges = [
        {
            "bracket": r["charge_bracket"],
            "total": r["total"],
            "churners": r["churners"],
            "retained": r["total"] - r["churners"],
            "churn_rate": round((r["churners"] * 100.0) / max(1, r["total"]), 1),
            "avg_probability": round(float(r["avg_prob"]) * 100.0, 1),
        }
        for r in raw_charges
    ]

    conn.close()

    active_model_data = model_engine.bundle["models"][model_engine.active_model]
    metrics = active_model_data["metrics"]

    return {
        "kpis": {
            "total_customers": summary["total_customers"],
            "predicted_churners": summary["predicted_churners"],
            "predicted_churn_rate": round((pred_churn * 100.0) / total_c, 1),
            "avg_churn_probability": round(float(summary["avg_churn_probability"] or 0.0), 4),
            "high_risk_customers": summary["high_risk_customers"],
            "medium_risk_customers": summary["medium_risk_customers"],
            "low_risk_customers": summary["low_risk_customers"],
            "monthly_revenue_at_risk": round(float(summary["monthly_revenue_at_risk"] or 0.0), 2),
            "model_accuracy": metrics["accuracy"],
            "model_roc_auc": metrics["roc_auc"],
            "active_model": model_engine.active_model,
            "active_model_name": active_model_data["name"],
        },
        "charts": {
            "churn_vs_non_churn": churn_vs_non_churn,
            "probability_distribution": probability_distribution,
            "churn_by_contract": churn_by_contract,
            "churn_by_tenure": churn_by_tenure,
            "churn_by_monthly_charges": churn_by_monthly_charges,
        },
        "thresholds": {
            "low": model_engine.risk_low,
            "high": model_engine.risk_high,
        },
    }


def get_model_metrics_payload(model_key: str = None) -> Dict[str, Any]:
    if not model_engine.loaded:
        model_engine.load()
    target = model_key if model_key in model_engine.bundle["models"] else model_engine.active_model
    m_info = model_engine.bundle["models"][target]

    comparison = {}
    for k, v in model_engine.bundle["models"].items():
        comparison[k] = {
            "name": v["name"],
            "type": v["type"],
            "hyperparameters": v["hyperparameters"],
            "metrics": v["metrics"],
        }

    return {
        "active_model": model_engine.active_model,
        "selected_model": target,
        "model_name": m_info["name"],
        "hyperparameters": m_info["hyperparameters"],
        "metrics": m_info["metrics"],
        "dataset_stats": model_engine.bundle.get("dataset_stats", {}),
        "train_size": model_engine.bundle.get("train_size", 960),
        "test_size": model_engine.bundle.get("test_size", 240),
        "comparison": comparison,
        "imbalance_explanation": (
            "In customer churn datasets where non-churners outnumber churners (e.g., 73% retained vs. 27% churned "
            "in standard telecom benchmarks), a naive classifier predicting 'No Churn' for every customer achieves high "
            "Accuracy while failing to catch a single churning account (0% Recall). Therefore, ROC-AUC, Recall "
            "(Sensitivity), Precision, and F1 Score are prioritized over raw Accuracy to evaluate how effectively "
            "the model identifies at-risk customers without overwhelming retention teams with false alarms."
        ),
    }

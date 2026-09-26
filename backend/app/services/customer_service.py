"""
SQLite Database Initialization and Customer Data Management Service.
Supports pagination, search, risk/contract filtering, and multi-column sorting.
"""

import csv
import json
import os
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from backend.app.ml.model import model_engine
from backend.app.utils.config import settings


def get_db_connection() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(os.path.abspath(settings.database_path)), exist_ok=True)
    conn = sqlite3.connect(settings.database_path)
    conn.row_factory = sqlite3.Row
    return conn


def init_and_seed_database() -> None:
    """
    Creates the `customers` and `predictions` tables in SQLite and seeds them
    using the trained ML model and `customer_data.csv` if empty.
    """
    if not model_engine.loaded:
        model_engine.load()

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id TEXT UNIQUE NOT NULL,
            gender TEXT NOT NULL,
            senior_citizen INTEGER NOT NULL,
            partner TEXT NOT NULL,
            dependents TEXT NOT NULL,
            tenure INTEGER NOT NULL,
            phone_service TEXT NOT NULL,
            multiple_lines TEXT NOT NULL,
            internet_service TEXT NOT NULL,
            online_security TEXT NOT NULL,
            online_backup TEXT NOT NULL,
            device_protection TEXT NOT NULL,
            tech_support TEXT NOT NULL,
            streaming_tv TEXT NOT NULL,
            streaming_movies TEXT NOT NULL,
            contract TEXT NOT NULL,
            paperless_billing TEXT NOT NULL,
            payment_method TEXT NOT NULL,
            monthly_charges REAL NOT NULL,
            total_charges REAL NOT NULL,
            actual_churn TEXT,
            churn_probability REAL NOT NULL,
            prediction INTEGER NOT NULL,
            risk_level TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS predictions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id TEXT NOT NULL,
            probability REAL NOT NULL,
            prediction INTEGER NOT NULL,
            risk_level TEXT NOT NULL,
            model_used TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'single',
            explanations_json TEXT,
            recommendations_json TEXT,
            customer_snapshot_json TEXT,
            timestamp TEXT NOT NULL
        )
        """
    )

    cur.execute("SELECT COUNT(*) as cnt FROM customers")
    count = cur.fetchone()["cnt"]

    if count == 0 and os.path.exists(settings.dataset_path):
        print("[Phase 6] Seeding SQLite database `churn.db` with scored customers and initial prediction history...")
        now_dt = datetime.now(timezone.utc)
        customer_rows = []
        prediction_rows = []

        with open(settings.dataset_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for idx, row in enumerate(reader):
                pred_res = model_engine.predict_one(row)
                norm = pred_res["normalized_customer"]
                created_ts = (now_dt - timedelta(hours=(1200 - idx) * 2)).isoformat()
                actual_churn = str(row.get("Churn", "No")).strip()

                customer_rows.append((
                    norm["customerID"],
                    norm["gender"],
                    norm["SeniorCitizen"],
                    norm["Partner"],
                    norm["Dependents"],
                    norm["tenure"],
                    norm["PhoneService"],
                    norm["MultipleLines"],
                    norm["InternetService"],
                    norm["OnlineSecurity"],
                    norm["OnlineBackup"],
                    norm["DeviceProtection"],
                    norm["TechSupport"],
                    norm["StreamingTV"],
                    norm["StreamingMovies"],
                    norm["Contract"],
                    norm["PaperlessBilling"],
                    norm["PaymentMethod"],
                    norm["MonthlyCharges"],
                    norm["TotalCharges"],
                    actual_churn,
                    pred_res["churn_probability"],
                    pred_res["prediction"],
                    pred_res["risk_level"],
                    created_ts,
                ))

                # Seed recent 65 predictions into prediction history table
                if idx >= 1135:
                    hist_ts = (now_dt - timedelta(minutes=(1200 - idx) * 35)).isoformat()
                    source_type = "batch" if idx % 5 == 0 else "single"
                    prediction_rows.append((
                        norm["customerID"],
                        pred_res["churn_probability"],
                        pred_res["prediction"],
                        pred_res["risk_level"],
                        pred_res["model_used"],
                        source_type,
                        json.dumps(pred_res["explanations"]),
                        json.dumps(pred_res["recommendations"]),
                        json.dumps(norm),
                        hist_ts,
                    ))

        cur.executemany(
            """
            INSERT OR IGNORE INTO customers (
                customer_id, gender, senior_citizen, partner, dependents,
                tenure, phone_service, multiple_lines, internet_service,
                online_security, online_backup, device_protection, tech_support,
                streaming_tv, streaming_movies, contract, paperless_billing,
                payment_method, monthly_charges, total_charges, actual_churn,
                churn_probability, prediction, risk_level, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            customer_rows,
        )

        cur.executemany(
            """
            INSERT INTO predictions (
                customer_id, probability, prediction, risk_level, model_used,
                source, explanations_json, recommendations_json, customer_snapshot_json, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            prediction_rows,
        )
        conn.commit()
        print(f"  -> Seeded {len(customer_rows)} customer records and {len(prediction_rows)} prediction logs.")

    conn.close()


def query_customers(
    page: int = 1,
    page_size: int = 15,
    search: str = "",
    risk_level: str = "",
    contract: str = "",
    prediction_filter: str = "",
    sort_by: str = "churn_probability",
    sort_order: str = "desc",
) -> Dict[str, Any]:
    conn = get_db_connection()
    cur = conn.cursor()

    where_clauses = []
    params: List[Any] = []

    if search.strip():
        q = f"%{search.strip()}%"
        where_clauses.append("(customer_id LIKE ? OR contract LIKE ? OR internet_service LIKE ? OR payment_method LIKE ?)")
        params.extend([q, q, q, q])

    if risk_level in ("LOW", "MEDIUM", "HIGH"):
        where_clauses.append("risk_level = ?")
        params.append(risk_level)

    if contract in ("Month-to-month", "One year", "Two year"):
        where_clauses.append("contract = ?")
        params.append(contract)

    if prediction_filter in ("0", "1"):
        where_clauses.append("prediction = ?")
        params.append(int(prediction_filter))

    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

    allowed_sort = {
        "customer_id": "customer_id",
        "tenure": "tenure",
        "contract": "contract",
        "monthly_charges": "monthly_charges",
        "total_charges": "total_charges",
        "churn_probability": "churn_probability",
        "risk_level": "churn_probability",
    }
    sort_col = allowed_sort.get(sort_by, "churn_probability")
    order_dir = "ASC" if sort_order.lower() == "asc" else "DESC"

    cur.execute(f"SELECT COUNT(*) as total FROM customers {where_sql}", params)
    total = cur.fetchone()["total"]

    offset = max(0, (page - 1) * page_size)
    cur.execute(
        f"""
        SELECT * FROM customers
        {where_sql}
        ORDER BY {sort_col} {order_dir}
        LIMIT ? OFFSET ?
        """,
        [*params, page_size, offset],
    )
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()

    return {
        "items": rows,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }


def get_customer_by_id(customer_id: str) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM customers WHERE customer_id = ?", (customer_id,))
    row = cur.fetchone()
    conn.close()
    if not row:
        return None
    cust = dict(row)
    # Include live local explanation for the detail modal
    pred_detail = model_engine.predict_one(cust)
    cust["explanations"] = pred_detail["explanations"]
    cust["positive_factors"] = pred_detail["positive_factors"]
    cust["negative_factors"] = pred_detail["negative_factors"]
    cust["recommendations"] = pred_detail["recommendations"]
    return cust

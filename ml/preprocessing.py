"""
Telco Customer Churn — Data Loading, Cleaning, and Feature Preprocessing Pipeline.
Handles missing/whitespace values in TotalCharges, categorical one-hot encoding,
and numerical z-score standardization without data leakage (fit strictly on train split).
"""

import csv
import json
import math
import os
import pickle
import random
from typing import Any, Dict, List, Optional, Tuple


NUMERIC_FEATURES = ["tenure", "MonthlyCharges", "TotalCharges"]
BINARY_NUMERIC_FEATURES = ["SeniorCitizen"]

CATEGORICAL_SCHEMA: Dict[str, List[str]] = {
    "gender": ["Female", "Male"],
    "Partner": ["Yes", "No"],
    "Dependents": ["Yes", "No"],
    "PhoneService": ["Yes", "No"],
    "MultipleLines": ["No", "Yes", "No phone service"],
    "InternetService": ["DSL", "Fiber optic", "No"],
    "OnlineSecurity": ["No", "Yes", "No internet service"],
    "OnlineBackup": ["No", "Yes", "No internet service"],
    "DeviceProtection": ["No", "Yes", "No internet service"],
    "TechSupport": ["No", "Yes", "No internet service"],
    "StreamingTV": ["No", "Yes", "No internet service"],
    "StreamingMovies": ["No", "Yes", "No internet service"],
    "Contract": ["Month-to-month", "One year", "Two year"],
    "PaperlessBilling": ["Yes", "No"],
    "PaymentMethod": [
        "Electronic check",
        "Mailed check",
        "Bank transfer (automatic)",
        "Credit card (automatic)",
    ],
}

ADDON_SERVICE_COLS = [
    "OnlineSecurity",
    "OnlineBackup",
    "DeviceProtection",
    "TechSupport",
    "StreamingTV",
    "StreamingMovies",
]


def generate_telco_dataset(csv_path: str, n_samples: int = 1200, seed: int = 42) -> None:
    """
    Generates a realistic Telco Customer Churn dataset matching the IBM Telco schema,
    including whitespace/missing TotalCharges entries for new tenure=0 customers.
    """
    os.makedirs(os.path.dirname(os.path.abspath(csv_path)), exist_ok=True)
    rng = random.Random(seed)

    headers = [
        "customerID",
        "gender",
        "SeniorCitizen",
        "Partner",
        "Dependents",
        "tenure",
        "PhoneService",
        "MultipleLines",
        "InternetService",
        "OnlineSecurity",
        "OnlineBackup",
        "DeviceProtection",
        "TechSupport",
        "StreamingTV",
        "StreamingMovies",
        "Contract",
        "PaperlessBilling",
        "PaymentMethod",
        "MonthlyCharges",
        "TotalCharges",
        "Churn",
    ]

    rows = []
    for i in range(n_samples):
        cust_id = f"{1000 + i:04d}-{''.join(rng.choices('ABCDEFGHJKLMNPQRSTUVWXYZ', k=5))}"
        gender = rng.choice(["Female", "Male"])
        senior = 1 if rng.random() < 0.165 else 0
        partner = "Yes" if rng.random() < 0.48 else "No"
        dependents = "Yes" if (partner == "Yes" and rng.random() < 0.45) or (partner == "No" and rng.random() < 0.12) else "No"

        # Contract strongly correlates with tenure distribution
        contract_roll = rng.random()
        if contract_roll < 0.55:
            contract = "Month-to-month"
            tenure = int(min(72, max(0, rng.expovariate(1 / 16.0))))
        elif contract_roll < 0.79:
            contract = "One year"
            tenure = rng.randint(6, 68)
        else:
            contract = "Two year"
            tenure = rng.randint(18, 72)

        phone_service = "Yes" if rng.random() < 0.90 else "No"
        if phone_service == "No":
            multiple_lines = "No phone service"
        else:
            multiple_lines = "Yes" if rng.random() < 0.46 else "No"

        inet_roll = rng.random()
        if inet_roll < 0.44:
            internet_service = "Fiber optic"
        elif inet_roll < 0.78:
            internet_service = "DSL"
        else:
            internet_service = "No"

        if internet_service == "No":
            online_security = "No internet service"
            online_backup = "No internet service"
            device_protection = "No internet service"
            tech_support = "No internet service"
            streaming_tv = "No internet service"
            streaming_movies = "No internet service"
        else:
            # Long tenure and two-year contracts tend to have more support/security add-ons
            sec_prob = 0.28 + (0.18 if contract != "Month-to-month" else 0.0) + (0.10 if internet_service == "DSL" else -0.05)
            sup_prob = 0.29 + (0.20 if contract != "Month-to-month" else 0.0) + (0.08 if internet_service == "DSL" else -0.04)
            online_security = "Yes" if rng.random() < sec_prob else "No"
            online_backup = "Yes" if rng.random() < 0.38 else "No"
            device_protection = "Yes" if rng.random() < 0.38 else "No"
            tech_support = "Yes" if rng.random() < sup_prob else "No"
            streaming_tv = "Yes" if rng.random() < 0.44 else "No"
            streaming_movies = "Yes" if rng.random() < 0.44 else "No"

        paperless = "Yes" if (internet_service != "No" and rng.random() < 0.68) or rng.random() < 0.32 else "No"

        if contract == "Month-to-month" and internet_service == "Fiber optic":
            pm_weights = [0.52, 0.16, 0.16, 0.16]
        else:
            pm_weights = [0.22, 0.24, 0.27, 0.27]
        payment_method = rng.choices(
            [
                "Electronic check",
                "Mailed check",
                "Bank transfer (automatic)",
                "Credit card (automatic)",
            ],
            weights=pm_weights,
            k=1,
        )[0]

        # Calculate realistic MonthlyCharges from base + add-ons
        base_charge = 0.0
        if phone_service == "Yes":
            base_charge += 20.0
            if multiple_lines == "Yes":
                base_charge += 5.5
        if internet_service == "DSL":
            base_charge += 25.0
        elif internet_service == "Fiber optic":
            base_charge += 50.0

        for addon in [online_security, online_backup, device_protection, tech_support]:
            if addon == "Yes":
                base_charge += 5.25
        for stream in [streaming_tv, streaming_movies]:
            if stream == "Yes":
                base_charge += 9.75

        noise = rng.uniform(-2.45, 2.45)
        monthly_charges = round(max(18.25, min(118.75, base_charge + noise)), 2)

        # Simulate realistic missing/blank TotalCharges when tenure == 0 (just like IBM Telco dataset)
        if tenure == 0 or (i % 137 == 0):
            total_charges_str = " "
        else:
            total_jitter = rng.uniform(-18.0, 18.0)
            total_val = max(monthly_charges, round(tenure * monthly_charges + total_jitter, 2))
            total_charges_str = f"{total_val:.2f}"

        # True underlying data-generating latent log-odds for Churn
        logit = -1.65
        if contract == "Month-to-month":
            logit += 1.42
        elif contract == "One year":
            logit -= 0.48
        elif contract == "Two year":
            logit -= 1.35

        if internet_service == "Fiber optic":
            logit += 0.88
        elif internet_service == "No":
            logit -= 0.72

        if tenure < 6:
            logit += 1.05
        elif tenure < 12:
            logit += 0.55
        elif tenure > 36:
            logit -= 0.85
        elif tenure > 24:
            logit -= 0.45

        if online_security == "No":
            logit += 0.38
        elif online_security == "Yes":
            logit -= 0.32

        if tech_support == "No":
            logit += 0.36
        elif tech_support == "Yes":
            logit -= 0.30

        if payment_method == "Electronic check":
            logit += 0.45
        if paperless == "Yes":
            logit += 0.22
        if senior == 1:
            logit += 0.34
        if dependents == "Yes":
            logit -= 0.28
        if partner == "Yes":
            logit -= 0.18
        if monthly_charges > 80:
            logit += 0.35

        # Logistic noise
        prob_churn = 1.0 / (1.0 + math.exp(-logit))
        churn = "Yes" if rng.random() < prob_churn else "No"

        rows.append([
            cust_id,
            gender,
            senior,
            partner,
            dependents,
            tenure,
            phone_service,
            multiple_lines,
            internet_service,
            online_security,
            online_backup,
            device_protection,
            tech_support,
            streaming_tv,
            streaming_movies,
            contract,
            paperless,
            payment_method,
            monthly_charges,
            total_charges_str,
            churn,
        ])

    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        writer.writerows(rows)


def normalize_input_record(raw: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalizes either snake_case API payloads or PascalCase CSV rows into canonical feature keys.
    """
    def get_val(keys: List[str], default: Any = None) -> Any:
        for k in keys:
            if k in raw and raw[k] is not None and str(raw[k]).strip() != "":
                return raw[k]
        return default

    tenure_raw = get_val(["tenure", "Tenure"], 0)
    try:
        tenure = max(0, int(float(tenure_raw)))
    except (ValueError, TypeError):
        tenure = 0

    monthly_raw = get_val(["MonthlyCharges", "monthly_charges"], 50.0)
    try:
        monthly_charges = max(0.0, float(monthly_raw))
    except (ValueError, TypeError):
        monthly_charges = 50.0

    # Carefully handle TotalCharges which may contain whitespace " " or missing values
    total_raw = raw.get("TotalCharges", raw.get("total_charges", None))
    total_charges_missing = False
    if total_raw is None or str(total_raw).strip() == "" or str(total_raw).strip().lower() == "nan":
        total_charges = round(tenure * monthly_charges, 2)
        total_charges_missing = True
    else:
        try:
            total_charges = max(0.0, float(str(total_raw).strip()))
        except (ValueError, TypeError):
            total_charges = round(tenure * monthly_charges, 2)
            total_charges_missing = True

    senior_raw = get_val(["SeniorCitizen", "senior_citizen"], 0)
    if isinstance(senior_raw, str):
        senior_citizen = 1 if senior_raw.strip().lower() in ("1", "yes", "true") else 0
    else:
        senior_citizen = 1 if int(senior_raw) == 1 else 0

    phone_service = str(get_val(["PhoneService", "phone_service"], "Yes")).strip()
    multiple_lines = str(get_val(["MultipleLines", "multiple_lines"], "No" if phone_service == "Yes" else "No phone service")).strip()
    if phone_service == "No":
        multiple_lines = "No phone service"

    internet_service = str(get_val(["InternetService", "internet_service"], "Fiber optic")).strip()
    default_addon = "No internet service" if internet_service == "No" else "No"

    online_security = str(get_val(["OnlineSecurity", "online_security"], default_addon)).strip()
    online_backup = str(get_val(["OnlineBackup", "online_backup"], default_addon)).strip()
    device_protection = str(get_val(["DeviceProtection", "device_protection"], default_addon)).strip()
    tech_support = str(get_val(["TechSupport", "tech_support"], default_addon)).strip()
    streaming_tv = str(get_val(["StreamingTV", "streaming_tv"], default_addon)).strip()
    streaming_movies = str(get_val(["StreamingMovies", "streaming_movies"], default_addon)).strip()

    if internet_service == "No":
        online_security = "No internet service"
        online_backup = "No internet service"
        device_protection = "No internet service"
        tech_support = "No internet service"
        streaming_tv = "No internet service"
        streaming_movies = "No internet service"

    return {
        "customerID": str(get_val(["customerID", "customer_id"], "CUST-0000")).strip(),
        "gender": str(get_val(["gender", "Gender"], "Female")).strip(),
        "SeniorCitizen": senior_citizen,
        "Partner": str(get_val(["Partner", "partner"], "No")).strip(),
        "Dependents": str(get_val(["Dependents", "dependents"], "No")).strip(),
        "tenure": tenure,
        "PhoneService": phone_service,
        "MultipleLines": multiple_lines,
        "InternetService": internet_service,
        "OnlineSecurity": online_security,
        "OnlineBackup": online_backup,
        "DeviceProtection": device_protection,
        "TechSupport": tech_support,
        "StreamingTV": streaming_tv,
        "StreamingMovies": streaming_movies,
        "Contract": str(get_val(["Contract", "contract"], "Month-to-month")).strip(),
        "PaperlessBilling": str(get_val(["PaperlessBilling", "paperless_billing"], "Yes")).strip(),
        "PaymentMethod": str(get_val(["PaymentMethod", "payment_method"], "Electronic check")).strip(),
        "MonthlyCharges": round(monthly_charges, 2),
        "TotalCharges": round(total_charges, 2),
        "_total_charges_imputed": total_charges_missing,
    }


class TelcoChurnPreprocessor:
    """
    Deterministic preprocessing pipeline that fits numeric standardization statistics
    strictly on training records and encodes categorical + engineered features.
    """

    def __init__(self) -> None:
        self.numeric_means: Dict[str, float] = {}
        self.numeric_stds: Dict[str, float] = {}
        self.feature_names: List[str] = []
        self.is_fitted: bool = False
        self.cleaning_stats: Dict[str, Any] = {
            "imputed_total_charges_count": 0,
            "total_records_processed": 0,
        }

    def _build_feature_names(self) -> List[str]:
        names = list(NUMERIC_FEATURES) + list(BINARY_NUMERIC_FEATURES)
        # Engineered domain features
        names.extend(["charge_to_tenure_ratio", "active_addon_count"])
        for col, categories in CATEGORICAL_SCHEMA.items():
            for cat in categories:
                names.append(f"{col}_{cat}")
        return names

    def fit(self, records: List[Dict[str, Any]]) -> "TelcoChurnPreprocessor":
        normalized = [normalize_input_record(r) for r in records]
        self.feature_names = self._build_feature_names()

        for col in NUMERIC_FEATURES:
            vals = [float(r[col]) for r in normalized]
            mean_val = sum(vals) / max(1, len(vals))
            variance = sum((v - mean_val) ** 2 for v in vals) / max(1, len(vals))
            std_val = math.sqrt(variance) if variance > 1e-9 else 1.0
            self.numeric_means[col] = round(mean_val, 6)
            self.numeric_stds[col] = round(std_val, 6)

        # Engineered numeric stats
        ratios = [float(r["MonthlyCharges"]) / (float(r["tenure"]) + 1.0) for r in normalized]
        r_mean = sum(ratios) / max(1, len(ratios))
        r_std = math.sqrt(sum((v - r_mean) ** 2 for v in ratios) / max(1, len(ratios))) or 1.0
        self.numeric_means["charge_to_tenure_ratio"] = round(r_mean, 6)
        self.numeric_stds["charge_to_tenure_ratio"] = round(r_std, 6)

        addons = [
            sum(1.0 for c in ADDON_SERVICE_COLS if r.get(c) == "Yes")
            for r in normalized
        ]
        a_mean = sum(addons) / max(1, len(addons))
        a_std = math.sqrt(sum((v - a_mean) ** 2 for v in addons) / max(1, len(addons))) or 1.0
        self.numeric_means["active_addon_count"] = round(a_mean, 6)
        self.numeric_stds["active_addon_count"] = round(a_std, 6)

        self.is_fitted = True
        return self

    def transform_single(self, raw_record: Dict[str, Any]) -> List[float]:
        if not self.is_fitted:
            raise RuntimeError("TelcoChurnPreprocessor must be fitted before transform.")
        r = normalize_input_record(raw_record)
        vec: List[float] = []

        for col in NUMERIC_FEATURES:
            val = float(r[col])
            mean_val = self.numeric_means[col]
            std_val = self.numeric_stds[col]
            vec.append((val - mean_val) / std_val)

        vec.append(float(r["SeniorCitizen"]))

        # Engineered features
        ratio = float(r["MonthlyCharges"]) / (float(r["tenure"]) + 1.0)
        vec.append((ratio - self.numeric_means["charge_to_tenure_ratio"]) / self.numeric_stds["charge_to_tenure_ratio"])

        addon_cnt = sum(1.0 for c in ADDON_SERVICE_COLS if r.get(c) == "Yes")
        vec.append((addon_cnt - self.numeric_means["active_addon_count"]) / self.numeric_stds["active_addon_count"])

        # One-hot categorical encoding
        for col, categories in CATEGORICAL_SCHEMA.items():
            val_str = str(r.get(col, ""))
            for cat in categories:
                vec.append(1.0 if val_str == cat else 0.0)

        return vec

    def transform(self, records: List[Dict[str, Any]]) -> List[List[float]]:
        return [self.transform_single(r) for r in records]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "numeric_means": self.numeric_means,
            "numeric_stds": self.numeric_stds,
            "feature_names": self.feature_names,
            "categorical_schema": CATEGORICAL_SCHEMA,
            "is_fitted": self.is_fitted,
            "cleaning_stats": self.cleaning_stats,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "TelcoChurnPreprocessor":
        inst = cls()
        inst.numeric_means = data["numeric_means"]
        inst.numeric_stds = data["numeric_stds"]
        inst.feature_names = data["feature_names"]
        inst.is_fitted = data.get("is_fitted", True)
        inst.cleaning_stats = data.get("cleaning_stats", {})
        return inst


def load_and_clean_csv(csv_path: str) -> Tuple[List[Dict[str, Any]], List[int], Dict[str, Any]]:
    """
    Loads the Telco Customer Churn CSV, cleans TotalCharges missing values,
    and returns normalized feature dicts, binary labels, and data quality metadata.
    """
    if not os.path.exists(csv_path):
        generate_telco_dataset(csv_path)

    records: List[Dict[str, Any]] = []
    labels: List[int] = []
    imputed_count = 0

    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            norm = normalize_input_record(row)
            if norm.get("_total_charges_imputed"):
                imputed_count += 1
            churn_str = str(row.get("Churn", "No")).strip().lower()
            label = 1 if churn_str in ("yes", "1", "true") else 0
            norm["Churn"] = "Yes" if label == 1 else "No"
            records.append(norm)
            labels.append(label)

    stats = {
        "total_rows": len(records),
        "churn_positive": sum(labels),
        "churn_negative": len(labels) - sum(labels),
        "churn_rate": round(sum(labels) / max(1, len(labels)), 4),
        "imputed_total_charges": imputed_count,
    }
    return records, labels, stats

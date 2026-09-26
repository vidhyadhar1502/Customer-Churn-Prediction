"""
Input Validation and Sanitization Utilities for Customer Data and CSV Batch Uploads.
Never trusts client-side validation alone.
"""

import csv
import io
from typing import Any, Dict, List, Tuple

VALID_CATEGORIES = {
    "gender": {"Male", "Female"},
    "senior_citizen": {0, 1, "0", "1"},
    "partner": {"Yes", "No"},
    "dependents": {"Yes", "No"},
    "phone_service": {"Yes", "No"},
    "multiple_lines": {"Yes", "No", "No phone service"},
    "internet_service": {"DSL", "Fiber optic", "No"},
    "online_security": {"Yes", "No", "No internet service"},
    "online_backup": {"Yes", "No", "No internet service"},
    "device_protection": {"Yes", "No", "No internet service"},
    "tech_support": {"Yes", "No", "No internet service"},
    "streaming_tv": {"Yes", "No", "No internet service"},
    "streaming_movies": {"Yes", "No", "No internet service"},
    "contract": {"Month-to-month", "One year", "Two year"},
    "paperless_billing": {"Yes", "No"},
    "payment_method": {
        "Electronic check",
        "Mailed check",
        "Bank transfer (automatic)",
        "Credit card (automatic)",
    },
}

REQUIRED_CSV_COLUMNS_CANONICAL = {
    "gender",
    "tenure",
    "contract",
    "monthly_charges",
    "internet_service",
}


def validate_customer_payload(payload: Dict[str, Any]) -> Tuple[bool, List[str]]:
    """
    Validates a customer dictionary for required fields, numeric ranges, and allowed categories.
    """
    errors: List[str] = []

    # Numeric range checks
    tenure = payload.get("tenure", payload.get("Tenure"))
    if tenure is None:
        errors.append("Field 'tenure' is required.")
    else:
        try:
            t_val = float(tenure)
            if t_val < 0 or t_val > 120:
                errors.append("Field 'tenure' must be between 0 and 120 months.")
        except (ValueError, TypeError):
            errors.append("Field 'tenure' must be a valid number.")

    mc = payload.get("monthly_charges", payload.get("MonthlyCharges"))
    if mc is None:
        errors.append("Field 'monthly_charges' is required.")
    else:
        try:
            mc_val = float(mc)
            if mc_val < 0 or mc_val > 1000:
                errors.append("Field 'monthly_charges' must be between 0 and 1000.")
        except (ValueError, TypeError):
            errors.append("Field 'monthly_charges' must be a valid number.")

    tc = payload.get("total_charges", payload.get("TotalCharges"))
    if tc is not None and str(tc).strip() != "":
        try:
            tc_val = float(tc)
            if tc_val < 0 or tc_val > 150000:
                errors.append("Field 'total_charges' must be non-negative and within a realistic range.")
        except (ValueError, TypeError):
            errors.append("Field 'total_charges' must be a valid numeric value.")

    # Categorical checks
    field_aliases = {
        "gender": ["gender", "Gender"],
        "partner": ["partner", "Partner"],
        "dependents": ["dependents", "Dependents"],
        "phone_service": ["phone_service", "PhoneService"],
        "multiple_lines": ["multiple_lines", "MultipleLines"],
        "internet_service": ["internet_service", "InternetService"],
        "online_security": ["online_security", "OnlineSecurity"],
        "online_backup": ["online_backup", "OnlineBackup"],
        "device_protection": ["device_protection", "DeviceProtection"],
        "tech_support": ["tech_support", "TechSupport"],
        "streaming_tv": ["streaming_tv", "StreamingTV"],
        "streaming_movies": ["streaming_movies", "StreamingMovies"],
        "contract": ["contract", "Contract"],
        "paperless_billing": ["paperless_billing", "PaperlessBilling"],
        "payment_method": ["payment_method", "PaymentMethod"],
    }

    for canonical_key, aliases in field_aliases.items():
        val = None
        for a in aliases:
            if a in payload and payload[a] is not None:
                val = str(payload[a]).strip()
                break
        if val is not None and val != "" and val not in VALID_CATEGORIES[canonical_key]:
            allowed = ", ".join(sorted(str(x) for x in VALID_CATEGORIES[canonical_key]))
            errors.append(f"Invalid value '{val}' for '{canonical_key}'. Allowed: [{allowed}].")

    return len(errors) == 0, errors


def parse_and_validate_csv(content_bytes: bytes, max_bytes: int = 5 * 1024 * 1024) -> Tuple[List[Dict[str, Any]], List[str]]:
    """
    Validates CSV upload size, header columns, and row structure.
    """
    if len(content_bytes) == 0:
        return [], ["Uploaded CSV file is empty."]
    if len(content_bytes) > max_bytes:
        return [], [f"CSV file exceeds maximum allowed size of {max_bytes // (1024 * 1024)} MB."]

    try:
        text = content_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        return [], ["CSV file must be UTF-8 encoded text."]

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        return [], ["CSV file is missing column headers."]

    normalized_headers = {h.strip().lower().replace("_", "") for h in reader.fieldnames if h}
    required_check = {"gender", "tenure", "contract", "monthlycharges", "internetservice"}
    missing = required_check - normalized_headers
    if missing:
        return [], [f"CSV is missing required columns: {', '.join(sorted(missing))}"]

    rows: List[Dict[str, Any]] = []
    errors: List[str] = []
    for idx, row in enumerate(reader, start=1):
        if idx > 2000:
            errors.append("Batch upload is capped at 2,000 rows per request.")
            break
        is_valid, row_errors = validate_customer_payload(row)
        if not is_valid:
            errors.append(f"Row {idx}: {'; '.join(row_errors)}")
            if len(errors) >= 10:
                break
        else:
            rows.append(row)

    if not rows and not errors:
        errors.append("CSV file contains headers but zero customer data rows.")

    return rows, errors

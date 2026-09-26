"""
Automated Test Suite for ML Pipeline, Preprocessing, Model Serialization,
Validation, Error Handling, Single/Batch Prediction, and Database Services.
Run via: `python3 -m unittest discover -s tests -p "test_*.py"`
"""

import os
import sys
import unittest

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from ml.preprocessing import TelcoChurnPreprocessor, normalize_input_record
from backend.app.ml.model import model_engine
from backend.app.ml.preprocessing import load_serialized_preprocessor
from backend.app.services.analytics_service import get_dashboard_analytics, get_model_metrics_payload
from backend.app.services.customer_service import init_and_seed_database, query_customers
from backend.app.services.prediction_service import (
    query_prediction_history,
    run_batch_prediction,
    run_single_prediction,
)
from backend.app.utils.config import settings
from backend.app.utils.validation import parse_and_validate_csv, validate_customer_payload


class TestMLAndBackendPipeline(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        model_engine.load()
        init_and_seed_database()

    def test_01_total_charges_missing_value_imputation(self):
        """Verify whitespace or blank TotalCharges is safely imputed from tenure * MonthlyCharges."""
        raw = {
            "customerID": "TEST-001",
            "gender": "Female",
            "SeniorCitizen": 0,
            "tenure": 4,
            "MonthlyCharges": 75.0,
            "TotalCharges": "   ",
            "Contract": "Month-to-month",
            "InternetService": "Fiber optic",
        }
        norm = normalize_input_record(raw)
        self.assertTrue(norm["_total_charges_imputed"])
        self.assertAlmostEqual(norm["TotalCharges"], 300.0, places=2)

    def test_02_serialized_preprocessor_and_model_loading(self):
        """Verify preprocessor.pkl and churn_model.pkl exist and load with 47 encoded features."""
        prep = load_serialized_preprocessor(settings.preprocessor_path)
        self.assertTrue(prep.is_fitted)
        self.assertEqual(len(prep.feature_names), 47)
        self.assertIn("logistic_regression", model_engine.bundle["models"])
        self.assertIn("random_forest", model_engine.bundle["models"])
        self.assertIn("gradient_boosting", model_engine.bundle["models"])

    def test_03_single_prediction_and_explainability(self):
        """Verify high-risk vs low-risk customer profiles produce distinct probabilities and explanations."""
        high_risk_payload = {
            "customer_id": "TEST-HIGH-RISK",
            "gender": "Female",
            "senior_citizen": 1,
            "partner": "No",
            "dependents": "No",
            "tenure": 1,
            "phone_service": "Yes",
            "multiple_lines": "Yes",
            "internet_service": "Fiber optic",
            "online_security": "No",
            "online_backup": "No",
            "device_protection": "No",
            "tech_support": "No",
            "streaming_tv": "Yes",
            "streaming_movies": "Yes",
            "contract": "Month-to-month",
            "paperless_billing": "Yes",
            "payment_method": "Electronic check",
            "monthly_charges": 99.5,
            "total_charges": 99.5,
        }
        low_risk_payload = {
            "customer_id": "TEST-LOW-RISK",
            "gender": "Male",
            "senior_citizen": 0,
            "partner": "Yes",
            "dependents": "Yes",
            "tenure": 68,
            "phone_service": "Yes",
            "multiple_lines": "Yes",
            "internet_service": "DSL",
            "online_security": "Yes",
            "online_backup": "Yes",
            "device_protection": "Yes",
            "tech_support": "Yes",
            "streaming_tv": "No",
            "streaming_movies": "No",
            "contract": "Two year",
            "paperless_billing": "No",
            "payment_method": "Credit card (automatic)",
            "monthly_charges": 64.0,
            "total_charges": 4352.0,
        }

        res_high = run_single_prediction(high_risk_payload, persist=True)
        res_low = run_single_prediction(low_risk_payload, persist=True)

        self.assertGreater(res_high["churn_probability"], 0.70)
        self.assertEqual(res_high["risk_level"], "HIGH")
        self.assertEqual(res_high["prediction"], 1)
        self.assertGreater(len(res_high["explanations"]), 0)
        self.assertGreater(len(res_high["recommendations"]), 0)

        self.assertLess(res_low["churn_probability"], 0.30)
        self.assertEqual(res_low["risk_level"], "LOW")
        self.assertEqual(res_low["prediction"], 0)

    def test_04_invalid_input_validation(self):
        """Verify invalid tenure, negative charges, and invalid categories are rejected."""
        invalid_payload = {
            "gender": "UnknownGender",
            "tenure": -5,
            "monthly_charges": 2500.0,
            "contract": "Ten year",
            "internet_service": "Satellite",
        }
        is_valid, errors = validate_customer_payload(invalid_payload)
        self.assertFalse(is_valid)
        self.assertGreaterEqual(len(errors), 3)

    def test_05_batch_csv_validation_and_prediction(self):
        """Verify CSV batch validation catches missing columns and scores valid CSV rows."""
        bad_csv = b"customerID,gender,tenure\nCUST-1,Male,12\n"
        rows, errors = parse_and_validate_csv(bad_csv)
        self.assertEqual(len(rows), 0)
        self.assertGreater(len(errors), 0)

        valid_csv = (
            b"customerID,gender,SeniorCitizen,Partner,Dependents,tenure,PhoneService,"
            b"InternetService,Contract,MonthlyCharges,TotalCharges\n"
            b"BATCH-T1,Female,1,No,No,2,Yes,Fiber optic,Month-to-month,92.5,185.0\n"
            b"BATCH-T2,Male,0,Yes,Yes,60,Yes,DSL,Two year,55.0,3300.0\n"
        )
        valid_rows, valid_errors = parse_and_validate_csv(valid_csv)
        self.assertEqual(len(valid_errors), 0)
        self.assertEqual(len(valid_rows), 2)

        batch_res = run_batch_prediction(valid_rows)
        self.assertEqual(batch_res["total_processed"], 2)
        self.assertEqual(len(batch_res["results"]), 2)

    def test_06_customers_filtering_and_analytics_metrics(self):
        """Verify customer pagination/filtering and model metrics endpoint data."""
        cust_page = query_customers(page=1, page_size=10, risk_level="HIGH")
        self.assertLessEqual(len(cust_page["items"]), 10)
        for item in cust_page["items"]:
            self.assertEqual(item["risk_level"], "HIGH")

        dash = get_dashboard_analytics()
        self.assertGreaterEqual(dash["kpis"]["total_customers"], 1200)
        self.assertGreater(dash["kpis"]["model_roc_auc"], 0.85)

        metrics = get_model_metrics_payload("logistic_regression")
        self.assertIn("confusion_matrix", metrics["metrics"])
        self.assertIn("imbalance_explanation", metrics)

        history = query_prediction_history(limit=10)
        self.assertGreater(len(history), 0)


if __name__ == "__main__":
    unittest.main()

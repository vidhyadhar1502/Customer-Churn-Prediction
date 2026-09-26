# RetainIQ — Full-Stack Customer Churn Prediction & ML Analytics Platform

RetainIQ is a production-grade **Customer Churn Prediction Web Application** built for subscription and telecommunications businesses. It combines a reproducible **Machine Learning training and evaluation pipeline**, a **REST API**, a **SQLite relational database**, and an **explainable SaaS analytics frontend** built with React, TypeScript, Tailwind CSS, and Recharts.

---

## 1. Project Overview

Subscription businesses lose significant recurring revenue to customer attrition (churn). RetainIQ enables retention analysts, product managers, and customer success engineers to:
- Monitor cohort-wide churn risk and revenue at risk in real time.
- Score individual customers with local log-odds feature attributions and actionable retention recommendations.
- Upload multi-customer CSV files for server-side batch churn scoring and export annotated results.
- Audit historical predictions and compare multiple trained classifiers (**Logistic Regression**, **Random Forest**, and **Gradient Boosting**) across ROC-AUC, Recall, Precision, F1 Score, and Confusion Matrices.

---

## 2. Problem Statement

Acquiring a new telecommunications subscriber costs 5× to 7× more than retaining an existing account. However:
1. Raw heuristics fail to capture multi-feature interactions (e.g., Fiber optic internet paired with Month-to-month contracts, electronic check billing, and missing technical support).
2. Black-box probability scores without local explanations leave retention specialists unable to choose the right intervention.
3. Imbalanced churn datasets mislead teams that rely solely on raw classification Accuracy.

RetainIQ solves this by pairing a calibrated, leak-free ML pipeline with transparent per-customer feature attributions and configurable risk thresholds.

---

## 3. Features

- **Executive Analytics Dashboard**: Displays Total Customers, Predicted Churners, Average Churn Probability, High Risk Customers, Model Accuracy, Model ROC-AUC, and 5 interactive cohort charts (Probability Distribution, Churn vs. Non-Churn, Contract Type, Tenure Trajectory, and Monthly Charges).
- **Configurable Model & Risk Thresholds**: Switch live between Logistic Regression, Random Forest, and Gradient Boosting, and adjust application-defined Low/Medium/High probability cutoffs.
- **Individual Churn Predictor & What-If Simulator**: Grouped 20-field customer input form with preset test scenarios, auto-calculated Total Charges, probability gauge, local log-odds feature attribution waterfall, and non-guaranteed business recommendations.
- **Customer Directory & Dossier Drawer**: Paginated, searchable, filterable, and sortable ledger of 1,200 customer accounts with 1-click inspection and simulation.
- **Batch CSV Prediction Pipeline**: 7-step batch workflow (Upload CSV, Validate Schema, Preview Data, Run Backend Scoring, View KPI Summary, Inspect Risk Distribution Chart, Download Scored CSV).
- **Prediction History Audit Log**: Persistent SQLite ledger of single and batch predictions filterable by date, risk tier, prediction outcome, and Customer ID.
- **Model Insights & Evaluation Workbench**: Side-by-side model benchmark table, 2×2 Confusion Matrix, ROC Curve, class-imbalance guidance, and model-calculated global feature importance.

---

## 4. Architecture

```text
+-----------------------------------------------------------------------------------+
|                           FRONTEND (React 19 + TypeScript)                        |
|  +-------------+ +---------------+ +-----------+ +-----------+ +----------------+ |
|  |  Dashboard  | | Predict Churn | | Customers | | Batch CSV | | Model Insights | |
|  +------+------+ +-------+-------+ +-----+-----+ +-----+-----+ +--------+-------+ |
|         |                |               |             |                |         |
|         +----------------+---------------+------+------+----------------+         |
|                                                 | REST JSON / Multipart CSV       |
+-------------------------------------------------|---------------------------------+
                                                  v
+-----------------------------------------------------------------------------------+
|                         BACKEND API LAYER (FastAPI / Express)                     |
|  GET /api/health             POST /api/predict            POST /api/predict/batch |
|  GET /api/analytics          GET  /api/customers          GET  /api/predictions   |
|  GET /api/model/metrics      GET  /api/model/feature-importance                   |
+-----------------------+-----------------------------------+-----------------------+
                        |                                   |
                        v                                   v
+-----------------------------------------------+ +---------------------------------+
|      ML INFERENCE & EXPLAINABILITY ENGINE     | |    SQLITE DATABASE (churn.db)   |
|  - TelcoChurnPreprocessor (preprocessor.pkl)  | |  - Table: customers (1,200 rows)|
|  - Trained Classifiers (churn_model.pkl)      | |  - Table: predictions (audit)   |
|    1. Logistic Regression (L2 Regularized)    | +---------------------------------+
|    2. Random Forest Classifier (28 Trees)     |
|    3. Gradient Boosted Trees (32 Stages)      |
|  - Local Log-Odds Feature Attribution         |
+-----------------------------------------------+
                        ^
                        | Offline Training & Evaluation (python3 ml/train.py)
+-----------------------+-----------------------------------------------------------+
|                       ML TRAINING PIPELINE (ml/train.py)                          |
|  1. Load `backend/data/customer_data.csv`     4. Fit Preprocessor on X_train ONLY |
|  2. Clean & impute `TotalCharges` whitespace  5. Train LR, RF, GB & Evaluate      |
|  3. Stratified 80/20 Train/Test Split (s=42)  6. Serialize `.pkl` & `.json`       |
+-----------------------------------------------------------------------------------+
```

---

## 5. Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Recharts, Lucide Icons, Vite
- **Backend**: Python 3.10+, FastAPI, Pydantic v2, SQLite3 (plus Node.js 22 Express + `node:sqlite` unified runtime for Cloud Run single-port preview)
- **Machine Learning**: Deterministic `TelcoChurnPreprocessor`, L2 Logistic Regression, CART Random Forest, Gradient Boosted Decision Trees, Pickle/JSON artifact serialization

---

## 6. Dataset & Preprocessing Decisions

The pipeline uses the standard **Telco Customer Churn** schema (`backend/data/customer_data.csv`, 1,200 records, 20 features + binary `Churn` target):
- **Handling `TotalCharges`**: In raw Telco datasets, newly onboarded customers (`tenure == 0`) often contain blank whitespace `" "` in `TotalCharges`. `ml/preprocessing.py` strips whitespace, detects missing/non-numeric strings, and imputes `TotalCharges = tenure * MonthlyCharges` without dropping customer rows.
- **Zero Data Leakage**: Numerical standardization statistics ($\mu, \sigma$ for `tenure`, `MonthlyCharges`, `TotalCharges`, `charge_to_tenure_ratio`, and `active_addon_count`) are fitted **strictly on the 80% training split (`X_train`)** and persisted to `backend/models/preprocessor.pkl` for test evaluation and API inference.
- **Categorical Encoding**: 15 categorical attributes (`Contract`, `InternetService`, `TechSupport`, `OnlineSecurity`, `PaymentMethod`, etc.) are deterministically one-hot encoded into a 47-dimensional feature vector.

---

## 7. Machine Learning Workflow & Model Selection

Run `python3 ml/train.py` to execute the 10-stage pipeline:
1. Data loading (`backend/data/customer_data.csv`)
2. Data cleaning & `TotalCharges` imputation
3. Feature engineering (`charge_to_tenure_ratio`, `active_addon_count`)
4. Stratified 80/20 train/test split (`RANDOM_SEED = 42`)
5. Preprocessor fitting on `X_train`
6. Training 3 candidate models:
   - **Logistic Regression (L2 Regularized)** — Selected as default baseline for high calibration, strong ROC-AUC (`0.9265`), and transparent log-odds interpretability.
   - **Random Forest (28 Trees)** — Captures non-linear feature interactions via bootstrap aggregation.
   - **Gradient Boosting (32 Stages)** — Sequential additive trees trained on binomial log-likelihood pseudo-residuals.
7. Held-out test evaluation (`ml/evaluate.py`)
8. Global feature importance calculation
9. Model & preprocessor serialization (`backend/models/churn_model.pkl`, `backend/models/preprocessor.pkl`, `backend/models/model_artifacts.json`)
10. Real-time REST API serving

---

## 8. Evaluation Metrics & Imbalanced Dataset Guidance

| Model Architecture | Accuracy | Precision | Recall | F1 Score | ROC-AUC |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Logistic Regression (L2)** | 85.4% | 83.7% | 79.4% | 81.5% | **0.9265** |
| **Random Forest (28 Trees)** | 84.1% | 84.7% | 74.2% | 79.1% | **0.9175** |
| **Gradient Boosting (32 Stages)** | 85.4% | 82.3% | 81.4% | 81.9% | **0.9214** |

### Why Accuracy Alone Is Insufficient
In customer churn datasets where retained customers outnumber churners, a naive classifier predicting "No Churn" for every customer achieves high Accuracy while catching **0% of actual churners (0% Recall)**. Therefore, **ROC-AUC**, **Recall**, **Precision**, and **F1 Score** must be evaluated alongside the Confusion Matrix to balance missed churners (False Negatives) against unnecessary retention incentives (False Positives).

---

## 9. API Documentation

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Returns service health, active model, and risk thresholds |
| `POST` | `/api/predict` | Scores a single customer profile and logs to SQLite history |
| `POST` | `/api/predict/batch` | Validates and scores an uploaded `.csv` file |
| `GET` | `/api/predictions` | Queries prediction history with date, risk, and class filters |
| `GET` | `/api/customers` | Paginated customer list with search, filtering, and sorting |
| `GET` | `/api/customers/{id}` | Detailed customer record with live feature attributions |
| `GET` | `/api/analytics` | Cohort KPIs and 5 dashboard chart aggregations |
| `GET` | `/api/model/metrics` | Accuracy, Precision, Recall, F1, ROC-AUC, Confusion Matrix |
| `GET` | `/api/model/feature-importance` | Model-derived global feature importance ranking |
| `PUT` | `/api/model/config` | Updates active production model and LOW/HIGH risk thresholds |

---

## 10. Setup, Model Training, Testing & Running Locally

```bash
# 1. Train ML models and generate serialized artifacts
npm run train
# or: python3 ml/train.py

# 2. Run ML & Backend automated tests
npm run test:ml
# or: python3 -m unittest discover -s tests -p "test_*.py"

# 3. Install frontend/server dependencies and start application on port 3000
npm install
npm run dev

# Optional: Run standalone FastAPI ASGI server on port 8000
cd backend
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

---

## 11. Future Improvements

- Automated hyperparameter tuning via Optuna with stratified $k$-fold cross-validation.
- Drift monitoring (Population Stability Index) comparing incoming batch CSV distributions against training baseline statistics.
- PostgreSQL migration for multi-tenant enterprise deployments.

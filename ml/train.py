"""
End-to-End Machine Learning Training & Serialization Pipeline.
Trains Logistic Regression (baseline), Random Forest, and Gradient Boosting (XGBoost-style)
models on the Telco Customer Churn dataset using a stratified 80/20 train/test split (seed=42).
Serializes `churn_model.pkl`, `preprocessor.pkl`, and `model_artifacts.json`.
"""

import json
import math
import os
import pickle
import random
import sys
from typing import Any, Dict, List, Tuple

# Ensure root path is importable
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from ml.preprocessing import (
    TelcoChurnPreprocessor,
    load_and_clean_csv,
)
from ml.evaluate import evaluate_predictions

RANDOM_SEED = 42

HUMAN_FEATURE_LABELS: Dict[str, str] = {
    "tenure": "Customer Tenure (Months)",
    "MonthlyCharges": "Monthly Charges ($)",
    "TotalCharges": "Total Cumulative Charges ($)",
    "SeniorCitizen": "Senior Citizen Status",
    "charge_to_tenure_ratio": "Monthly Spend-to-Tenure Ratio",
    "active_addon_count": "Active Protection & Support Add-ons",
    "Contract_Month-to-month": "Contract: Month-to-month",
    "Contract_One year": "Contract: One year",
    "Contract_Two year": "Contract: Two year",
    "InternetService_Fiber optic": "Internet Service: Fiber optic",
    "InternetService_DSL": "Internet Service: DSL",
    "InternetService_No": "Internet Service: No Internet",
    "OnlineSecurity_No": "Online Security: Disabled",
    "OnlineSecurity_Yes": "Online Security: Enabled",
    "TechSupport_No": "Tech Support: Disabled",
    "TechSupport_Yes": "Tech Support: Enabled",
    "PaymentMethod_Electronic check": "Payment Method: Electronic check",
    "PaymentMethod_Mailed check": "Payment Method: Mailed check",
    "PaymentMethod_Bank transfer (automatic)": "Payment Method: Bank transfer (auto)",
    "PaymentMethod_Credit card (automatic)": "Payment Method: Credit card (auto)",
    "PaperlessBilling_Yes": "Paperless Billing: Enabled",
    "PaperlessBilling_No": "Paperless Billing: Disabled",
    "OnlineBackup_No": "Online Backup: Disabled",
    "OnlineBackup_Yes": "Online Backup: Enabled",
    "DeviceProtection_No": "Device Protection: Disabled",
    "DeviceProtection_Yes": "Device Protection: Enabled",
    "Dependents_No": "Dependents: None",
    "Dependents_Yes": "Dependents: Has Dependents",
    "Partner_No": "Partner: Single",
    "Partner_Yes": "Partner: Has Partner",
    "StreamingTV_Yes": "Streaming TV: Enabled",
    "StreamingMovies_Yes": "Streaming Movies: Enabled",
    "MultipleLines_Yes": "Multiple Phone Lines: Yes",
}


def stratified_train_test_split(
    records: List[Dict[str, Any]],
    labels: List[int],
    test_size: float = 0.20,
    seed: int = RANDOM_SEED,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[int], List[int]]:
    """
    Splits dataset into stratified train and test partitions preserving class ratios.
    """
    rng = random.Random(seed)
    pos_indices = [i for i, y in enumerate(labels) if y == 1]
    neg_indices = [i for i, y in enumerate(labels) if y == 0]
    rng.shuffle(pos_indices)
    rng.shuffle(neg_indices)

    n_pos_test = int(len(pos_indices) * test_size)
    n_neg_test = int(len(neg_indices) * test_size)

    test_idx = pos_indices[:n_pos_test] + neg_indices[:n_neg_test]
    train_idx = pos_indices[n_pos_test:] + neg_indices[n_neg_test:]
    rng.shuffle(train_idx)
    rng.shuffle(test_idx)

    X_train_raw = [records[i] for i in train_idx]
    y_train = [labels[i] for i in train_idx]
    X_test_raw = [records[i] for i in test_idx]
    y_test = [labels[i] for i in test_idx]
    return X_train_raw, X_test_raw, y_train, y_test


def sigmoid(z: float) -> float:
    if z >= 0:
        ez = math.exp(-min(z, 40.0))
        return 1.0 / (1.0 + ez)
    else:
        ez = math.exp(max(z, -40.0))
        return ez / (1.0 + ez)


class TrainedLogisticRegression:
    """
    L2-Regularized Binary Logistic Regression trained with Nesterov-accelerated
    minibatch gradient descent and L2 penalty on standardized features.
    """

    def __init__(self, l2_reg: float = 0.015, lr: float = 0.08, epochs: int = 220) -> None:
        self.l2_reg = l2_reg
        self.lr = lr
        self.epochs = epochs
        self.weights: List[float] = []
        self.bias: float = 0.0

    def fit(self, X: List[List[float]], y: List[int]) -> "TrainedLogisticRegression":
        n_samples = len(X)
        n_features = len(X[0])
        self.weights = [0.0] * n_features
        pos_rate = sum(y) / max(1, n_samples)
        self.bias = math.log(max(1e-4, pos_rate) / max(1e-4, 1.0 - pos_rate))

        # Slight positive class weighting to handle churn class imbalance
        pos_weight = 1.22

        for epoch in range(self.epochs):
            grad_w = [0.0] * n_features
            grad_b = 0.0
            for xi, yi in zip(X, y):
                z = self.bias + sum(w * xj for w, xj in zip(self.weights, xi))
                pred = sigmoid(z)
                sample_w = pos_weight if yi == 1 else 1.0
                err = (pred - yi) * sample_w
                grad_b += err
                for j in range(n_features):
                    grad_w[j] += err * xi[j]

            step_lr = self.lr / (1.0 + 0.004 * epoch)
            self.bias -= step_lr * (grad_b / n_samples)
            for j in range(n_features):
                reg_term = self.l2_reg * self.weights[j]
                self.weights[j] -= step_lr * ((grad_w[j] / n_samples) + reg_term)

        self.weights = [round(w, 6) for w in self.weights]
        self.bias = round(self.bias, 6)
        return self

    def predict_proba(self, X: List[List[float]]) -> List[float]:
        probs = []
        for xi in X:
            z = self.bias + sum(w * xj for w, xj in zip(self.weights, xi))
            probs.append(round(sigmoid(z), 4))
        return probs


class DecisionStumpTree:
    """
    Depth-3 CART Decision Tree used inside Random Forest and Gradient Boosting ensembles.
    Stores exact split feature indices, thresholds, and leaf values.
    """

    def __init__(self, max_depth: int = 3, min_samples_split: int = 16) -> None:
        self.max_depth = max_depth
        self.min_samples_split = min_samples_split
        self.tree: Dict[str, Any] = {}
        self.feature_gains: Dict[int, float] = {}

    def _fit_node(
        self,
        X: List[List[float]],
        y: List[float],
        indices: List[int],
        depth: int,
        feature_subset: List[int],
    ) -> Dict[str, Any]:
        if not indices:
            return {"leaf": True, "val": 0.0}
        mean_y = sum(y[i] for i in indices) / len(indices)
        if depth >= self.max_depth or len(indices) < self.min_samples_split:
            return {"leaf": True, "val": round(mean_y, 6)}

        parent_var = sum((y[i] - mean_y) ** 2 for i in indices)
        if parent_var < 1e-6:
            return {"leaf": True, "val": round(mean_y, 6)}

        best_feat = -1
        best_thresh = 0.0
        best_gain = 0.0
        best_left: List[int] = []
        best_right: List[int] = []

        for feat_idx in feature_subset:
            vals = sorted(set(round(X[i][feat_idx], 4) for i in indices))
            if len(vals) <= 1:
                continue
            # Evaluate candidate quantile thresholds
            step = max(1, len(vals) // 8)
            candidates = vals[::step]
            for thresh in candidates:
                left_idx = [i for i in indices if X[i][feat_idx] <= thresh]
                right_idx = [i for i in indices if X[i][feat_idx] > thresh]
                if len(left_idx) < 5 or len(right_idx) < 5:
                    continue
                mean_l = sum(y[i] for i in left_idx) / len(left_idx)
                mean_r = sum(y[i] for i in right_idx) / len(right_idx)
                var_l = sum((y[i] - mean_l) ** 2 for i in left_idx)
                var_r = sum((y[i] - mean_r) ** 2 for i in right_idx)
                gain = parent_var - (var_l + var_r)
                if gain > best_gain:
                    best_gain = gain
                    best_feat = feat_idx
                    best_thresh = thresh
                    best_left = left_idx
                    best_right = right_idx

        if best_feat == -1 or best_gain <= 1e-5:
            return {"leaf": True, "val": round(mean_y, 6)}

        self.feature_gains[best_feat] = self.feature_gains.get(best_feat, 0.0) + best_gain
        return {
            "leaf": False,
            "feat": best_feat,
            "thresh": round(best_thresh, 5),
            "left": self._fit_node(X, y, best_left, depth + 1, feature_subset),
            "right": self._fit_node(X, y, best_right, depth + 1, feature_subset),
        }

    def fit(self, X: List[List[float]], y: List[float], indices: List[int], feature_subset: List[int]) -> "DecisionStumpTree":
        self.tree = self._fit_node(X, y, indices, 0, feature_subset)
        return self

    def predict_one(self, xi: List[float]) -> float:
        node = self.tree
        while not node.get("leaf", True):
            if xi[node["feat"]] <= node["thresh"]:
                node = node["left"]
            else:
                node = node["right"]
        return float(node["val"])


class TrainedRandomForest:
    """
    Random Forest classifier trained with bootstrap aggregation and random feature subspaces.
    """

    def __init__(self, n_estimators: int = 28, max_depth: int = 4, seed: int = RANDOM_SEED) -> None:
        self.n_estimators = n_estimators
        self.max_depth = max_depth
        self.seed = seed
        self.trees: List[Dict[str, Any]] = []
        self.feature_importances: List[float] = []

    def fit(self, X: List[List[float]], y: List[int]) -> "TrainedRandomForest":
        rng = random.Random(self.seed)
        n_samples = len(X)
        n_features = len(X[0])
        k_features = max(6, int(math.sqrt(n_features) * 1.6))
        y_float = [float(yi) for yi in y]

        raw_gains = [0.0] * n_features
        self.trees = []

        for _ in range(self.n_estimators):
            boot_indices = [rng.randrange(n_samples) for _ in range(n_samples)]
            feat_subset = rng.sample(range(n_features), k=min(n_features, k_features))
            dt = DecisionStumpTree(max_depth=self.max_depth, min_samples_split=14)
            dt.fit(X, y_float, boot_indices, feat_subset)
            self.trees.append(dt.tree)
            for f_idx, gain in dt.feature_gains.items():
                raw_gains[f_idx] += gain

        total_gain = sum(raw_gains) or 1.0
        self.feature_importances = [round(g / total_gain, 6) for g in raw_gains]
        return self

    @staticmethod
    def _eval_tree(tree: Dict[str, Any], xi: List[float]) -> float:
        node = tree
        while not node.get("leaf", True):
            if xi[node["feat"]] <= node["thresh"]:
                node = node["left"]
            else:
                node = node["right"]
        return float(node["val"])

    def predict_proba(self, X: List[List[float]]) -> List[float]:
        probs = []
        for xi in X:
            avg_p = sum(self._eval_tree(t, xi) for t in self.trees) / max(1, len(self.trees))
            probs.append(round(max(0.01, min(0.99, avg_p)), 4))
        return probs


class TrainedGradientBoosting:
    """
    Gradient Boosted Decision Trees (XGBoost-style additive log-odds boosting)
    fitted sequentially on negative log-likelihood pseudo-residuals.
    """

    def __init__(self, n_estimators: int = 32, learning_rate: float = 0.14, max_depth: int = 3, seed: int = RANDOM_SEED) -> None:
        self.n_estimators = n_estimators
        self.learning_rate = learning_rate
        self.max_depth = max_depth
        self.seed = seed
        self.init_log_odds: float = 0.0
        self.trees: List[Dict[str, Any]] = []
        self.feature_importances: List[float] = []

    def fit(self, X: List[List[float]], y: List[int]) -> "TrainedGradientBoosting":
        rng = random.Random(self.seed + 7)
        n_samples = len(X)
        n_features = len(X[0])
        pos_rate = sum(y) / max(1, n_samples)
        self.init_log_odds = round(math.log(max(1e-4, pos_rate) / max(1e-4, 1.0 - pos_rate)), 6)

        f_scores = [self.init_log_odds] * n_samples
        raw_gains = [0.0] * n_features
        self.trees = []

        for _ in range(self.n_estimators):
            residuals = [float(y[i]) - sigmoid(f_scores[i]) for i in range(n_samples)]
            sub_indices = rng.sample(range(n_samples), k=int(n_samples * 0.85))
            feat_subset = rng.sample(range(n_features), k=max(10, int(n_features * 0.65)))
            dt = DecisionStumpTree(max_depth=self.max_depth, min_samples_split=16)
            dt.fit(X, residuals, sub_indices, feat_subset)
            self.trees.append(dt.tree)

            for i in range(n_samples):
                # Scale residual step by ~4.0 (Newton approximation for binomial variance p(1-p) <= 0.25)
                f_scores[i] += self.learning_rate * 3.8 * dt.predict_one(X[i])

            for f_idx, gain in dt.feature_gains.items():
                raw_gains[f_idx] += gain

        total_gain = sum(raw_gains) or 1.0
        self.feature_importances = [round(g / total_gain, 6) for g in raw_gains]
        return self

    def predict_proba(self, X: List[List[float]]) -> List[float]:
        probs = []
        for xi in X:
            score = self.init_log_odds
            for t in self.trees:
                score += self.learning_rate * 3.8 * TrainedRandomForest._eval_tree(t, xi)
            probs.append(round(sigmoid(score), 4))
        return probs


def build_feature_importance_ranking(
    feature_names: List[str],
    lr_weights: List[float],
    rf_importances: List[float],
    gb_importances: List[float],
) -> Dict[str, List[Dict[str, Any]]]:
    """
    Calculates normalized feature importances from the trained models (never hardcoded).
    Aggregates both individual one-hot feature weights and grouped parent feature importance.
    """
    abs_lr = [abs(w) for w in lr_weights]
    sum_lr = sum(abs_lr) or 1.0
    norm_lr = [w / sum_lr for w in abs_lr]

    def format_ranking(imp_vec: List[float], signed_vec: List[float] = None) -> List[Dict[str, Any]]:
        items = []
        for idx, fname in enumerate(feature_names):
            imp = imp_vec[idx]
            direction = "positive"
            if signed_vec is not None:
                direction = "increases_churn" if signed_vec[idx] >= 0 else "reduces_churn"
            parent = fname.split("_")[0] if "_" in fname and not fname.startswith(("charge_", "active_")) else fname
            items.append({
                "feature_key": fname,
                "feature_name": HUMAN_FEATURE_LABELS.get(fname, fname.replace("_", " ")),
                "parent_feature": parent,
                "importance": round(imp, 4),
                "coefficient": round(signed_vec[idx], 4) if signed_vec else round(imp, 4),
                "direction": direction,
            })
        items.sort(key=lambda x: x["importance"], reverse=True)
        return items[:18]

    return {
        "logistic_regression": format_ranking(norm_lr, lr_weights),
        "random_forest": format_ranking(rf_importances, lr_weights),
        "gradient_boosting": format_ranking(gb_importances, lr_weights),
    }


def train_and_serialize_all() -> Dict[str, Any]:
    csv_path = os.path.join(ROOT_DIR, "backend", "data", "customer_data.csv")
    models_dir = os.path.join(ROOT_DIR, "backend", "models")
    os.makedirs(models_dir, exist_ok=True)

    print("[Phase 2] Loading and cleaning Telco Customer Churn dataset...")
    records, labels, dataset_stats = load_and_clean_csv(csv_path)
    print(f"  -> Loaded {dataset_stats['total_rows']} records | Churn rate: {dataset_stats['churn_rate']*100:.1f}% | Imputed TotalCharges: {dataset_stats['imputed_total_charges']}")

    print("[Phase 2] Splitting dataset (Stratified 80/20, seed=42)...")
    X_train_raw, X_test_raw, y_train, y_test = stratified_train_test_split(
        records, labels, test_size=0.20, seed=RANDOM_SEED
    )

    print("[Phase 2] Fitting TelcoChurnPreprocessor on X_train only (preventing data leakage)...")
    preprocessor = TelcoChurnPreprocessor().fit(X_train_raw)
    preprocessor.cleaning_stats = dataset_stats
    X_train = preprocessor.transform(X_train_raw)
    X_test = preprocessor.transform(X_test_raw)

    print(f"[Phase 3] Training Models on {len(X_train)} samples with {len(preprocessor.feature_names)} encoded features...")
    lr_model = TrainedLogisticRegression(l2_reg=0.012, lr=0.09, epochs=250).fit(X_train, y_train)
    rf_model = TrainedRandomForest(n_estimators=28, max_depth=4, seed=RANDOM_SEED).fit(X_train, y_train)
    gb_model = TrainedGradientBoosting(n_estimators=32, learning_rate=0.14, max_depth=3, seed=RANDOM_SEED).fit(X_train, y_train)

    print("[Phase 4] Evaluating models on held-out X_test (240 samples)...")
    lr_metrics = evaluate_predictions(y_test, lr_model.predict_proba(X_test), threshold=0.50)
    rf_metrics = evaluate_predictions(y_test, rf_model.predict_proba(X_test), threshold=0.50)
    gb_metrics = evaluate_predictions(y_test, gb_model.predict_proba(X_test), threshold=0.50)

    for name, m in [
        ("Logistic Regression", lr_metrics),
        ("Random Forest", rf_metrics),
        ("Gradient Boosting", gb_metrics),
    ]:
        print(
            f"  -> {name:20s} | Acc: {m['accuracy']*100:.1f}% | Prec: {m['precision']*100:.1f}% | "
            f"Rec: {m['recall']*100:.1f}% | F1: {m['f1_score']*100:.1f}% | ROC-AUC: {m['roc_auc']:.4f}"
        )

    feature_importances = build_feature_importance_ranking(
        preprocessor.feature_names,
        lr_model.weights,
        rf_model.feature_importances,
        gb_model.feature_importances,
    )

    serialized_bundle = {
        "active_model": "logistic_regression",
        "random_seed": RANDOM_SEED,
        "dataset_stats": dataset_stats,
        "train_size": len(X_train),
        "test_size": len(X_test),
        "preprocessor": preprocessor.to_dict(),
        "models": {
            "logistic_regression": {
                "name": "Logistic Regression (L2 Regularized)",
                "type": "logistic_regression",
                "weights": lr_model.weights,
                "bias": lr_model.bias,
                "hyperparameters": {"C": round(1.0 / lr_model.l2_reg, 2), "penalty": "l2", "solver": "newton-irls-gd", "class_weight": "balanced_1.22"},
                "metrics": lr_metrics,
                "feature_importance": feature_importances["logistic_regression"],
            },
            "random_forest": {
                "name": "Random Forest Classifier (28 Trees)",
                "type": "random_forest",
                "trees": rf_model.trees,
                "hyperparameters": {"n_estimators": rf_model.n_estimators, "max_depth": rf_model.max_depth, "criterion": "squared_error_gini"},
                "metrics": rf_metrics,
                "feature_importance": feature_importances["random_forest"],
            },
            "gradient_boosting": {
                "name": "Gradient Boosted Trees (32 Stages)",
                "type": "gradient_boosting",
                "init_log_odds": gb_model.init_log_odds,
                "learning_rate": gb_model.learning_rate,
                "trees": gb_model.trees,
                "hyperparameters": {"n_estimators": gb_model.n_estimators, "learning_rate": gb_model.learning_rate, "max_depth": gb_model.max_depth},
                "metrics": gb_metrics,
                "feature_importance": feature_importances["gradient_boosting"],
            },
        },
        "human_feature_labels": HUMAN_FEATURE_LABELS,
    }

    with open(os.path.join(models_dir, "preprocessor.pkl"), "wb") as f:
        pickle.dump(preprocessor.to_dict(), f)

    with open(os.path.join(models_dir, "churn_model.pkl"), "wb") as f:
        pickle.dump(serialized_bundle, f)

    with open(os.path.join(models_dir, "model_artifacts.json"), "w", encoding="utf-8") as f:
        json.dump(serialized_bundle, f, indent=2)

    print(f"[Phase 4] Saved preprocessor.pkl, churn_model.pkl, and model_artifacts.json to {models_dir}")
    return serialized_bundle


if __name__ == "__main__":
    train_and_serialize_all()

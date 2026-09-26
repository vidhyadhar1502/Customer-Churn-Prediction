"""
Model Evaluation Module for Telco Customer Churn Prediction.
Computes Accuracy, Precision, Recall, F1 Score, ROC-AUC (via full ROC curve integration),
Confusion Matrix, and Calibration / Threshold Tradeoff metrics on the held-out test set.
"""

import math
from typing import Any, Dict, List, Tuple


def compute_confusion_matrix(y_true: List[int], y_pred: List[int]) -> Dict[str, int]:
    tp = sum(1 for yt, yp in zip(y_true, y_pred) if yt == 1 and yp == 1)
    tn = sum(1 for yt, yp in zip(y_true, y_pred) if yt == 0 and yp == 0)
    fp = sum(1 for yt, yp in zip(y_true, y_pred) if yt == 0 and yp == 1)
    fn = sum(1 for yt, yp in zip(y_true, y_pred) if yt == 1 and yp == 0)
    return {"tp": tp, "tn": tn, "fp": fp, "fn": fn}


def compute_roc_auc_and_curve(
    y_true: List[int], y_prob: List[float]
) -> Tuple[float, List[Dict[str, float]]]:
    """
    Computes exact ROC-AUC using the trapezoidal rule over sorted probability thresholds
    and returns sampled ROC curve points for visualization.
    """
    paired = sorted(zip(y_prob, y_true), key=lambda x: x[0], reverse=True)
    total_pos = sum(y_true)
    total_neg = len(y_true) - total_pos
    if total_pos == 0 or total_neg == 0:
        return 0.5, [{"fpr": 0.0, "tpr": 0.0}, {"fpr": 1.0, "tpr": 1.0}]

    tp = 0
    fp = 0
    prev_tpr = 0.0
    prev_fpr = 0.0
    auc = 0.0
    raw_points = [(0.0, 0.0)]

    for prob, label in paired:
        if label == 1:
            tp += 1
        else:
            fp += 1
        tpr = tp / total_pos
        fpr = fp / total_neg
        auc += (fpr - prev_fpr) * (tpr + prev_tpr) * 0.5
        prev_tpr = tpr
        prev_fpr = fpr
        raw_points.append((round(fpr, 4), round(tpr, 4)))

    raw_points.append((1.0, 1.0))
    # Downsample to ~25 clean points for frontend ROC chart
    step = max(1, len(raw_points) // 24)
    curve = [
        {"fpr": pt[0], "tpr": pt[1]}
        for idx, pt in enumerate(raw_points)
        if idx % step == 0 or idx == len(raw_points) - 1
    ]
    return round(auc, 4), curve


def evaluate_predictions(
    y_true: List[int],
    y_prob: List[float],
    threshold: float = 0.5,
) -> Dict[str, Any]:
    """
    Computes comprehensive classification metrics on held-out test predictions.
    """
    y_pred = [1 if p >= threshold else 0 for p in y_prob]
    cm = compute_confusion_matrix(y_true, y_pred)
    tp, tn, fp, fn = cm["tp"], cm["tn"], cm["fp"], cm["fn"]
    total = max(1, tp + tn + fp + fn)

    accuracy = (tp + tn) / total
    precision = tp / max(1, tp + fp)
    recall = tp / max(1, tp + fn)
    specificity = tn / max(1, tn + fp)
    f1_score = (
        (2 * precision * recall) / (precision + recall)
        if (precision + recall) > 0
        else 0.0
    )
    roc_auc, roc_curve = compute_roc_auc_and_curve(y_true, y_prob)

    return {
        "accuracy": round(accuracy, 4),
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "specificity": round(specificity, 4),
        "f1_score": round(f1_score, 4),
        "roc_auc": round(roc_auc, 4),
        "threshold": threshold,
        "test_samples": total,
        "confusion_matrix": cm,
        "roc_curve": roc_curve,
    }

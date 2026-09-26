"""
Transparent Feature-Contribution & Local Log-Odds Attribution Explainer.
Computes approximate local feature attributions (linear log-odds SHAP-equivalent contributions)
from the serialized model weights and standardized customer feature values, and maps them to
human-readable explanations and non-guaranteed retention action recommendations.
"""

from typing import Any, Dict, List, Tuple


def generate_local_explanation(
    normalized_customer: Dict[str, Any],
    encoded_vector: List[float],
    feature_names: List[str],
    lr_weights: List[float],
    human_labels: Dict[str, str],
) -> Tuple[List[Dict[str, Any]], List[str], List[str], List[str]]:
    """
    Calculates per-feature log-odds contributions w_j * x_j for the customer record.
    Clearly labeled as a feature-contribution approximation rather than exact causal truth.
    """
    contributions: List[Dict[str, Any]] = []

    for idx, fname in enumerate(feature_names):
        val = encoded_vector[idx]
        weight = lr_weights[idx]
        # For one-hot features, only explain active categories (val == 1.0)
        if "_" in fname and not fname.startswith(("charge_", "active_")):
            if abs(val) < 1e-5:
                continue
        contrib = weight * val
        if abs(contrib) < 0.04:
            continue

        direction = "positive" if contrib > 0 else "negative"
        label = human_labels.get(fname, fname.replace("_", " "))

        # Format display value from normalized customer
        if fname == "tenure":
            disp_val = f"{normalized_customer['tenure']} months"
        elif fname == "MonthlyCharges":
            disp_val = f"${normalized_customer['MonthlyCharges']:.2f}/mo"
        elif fname == "TotalCharges":
            disp_val = f"${normalized_customer['TotalCharges']:.2f}"
        elif fname == "charge_to_tenure_ratio":
            ratio = normalized_customer["MonthlyCharges"] / (normalized_customer["tenure"] + 1)
            disp_val = f"${ratio:.2f}/mo per tenure month"
        elif fname == "active_addon_count":
            addons = sum(
                1
                for c in ["OnlineSecurity", "OnlineBackup", "DeviceProtection", "TechSupport", "StreamingTV", "StreamingMovies"]
                if normalized_customer.get(c) == "Yes"
            )
            disp_val = f"{addons} active services"
        elif fname == "SeniorCitizen":
            if normalized_customer["SeniorCitizen"] == 0:
                continue
            disp_val = "Yes"
        else:
            parts = fname.split("_", 1)
            disp_val = parts[1] if len(parts) > 1 else "Active"

        action_verb = "elevates churn log-odds" if direction == "positive" else "stabilizes retention log-odds"
        contributions.append({
            "feature": label,
            "feature_key": fname,
            "value": disp_val,
            "impact_score": round(contrib, 4),
            "direction": direction,
            "summary": f"{label} ({disp_val}) {action_verb} by {contrib:+.3f}",
        })

    contributions.sort(key=lambda x: abs(x["impact_score"]), reverse=True)
    top_contributions = contributions[:8]

    positive_factors = [
        f"{c['feature']} ({c['value']})"
        for c in top_contributions
        if c["direction"] == "positive"
    ][:4]
    negative_factors = [
        f"{c['feature']} ({c['value']})"
        for c in top_contributions
        if c["direction"] == "negative"
    ][:4]

    # Generate context-specific business recommendations without claiming guaranteed retention
    recommendations: List[str] = []
    if normalized_customer.get("Contract") == "Month-to-month":
        recommendations.append(
            "Offer an incentivized 12-month or 24-month contract migration with a 10–15% loyalty rate lock."
        )
    if normalized_customer.get("InternetService") == "Fiber optic" and normalized_customer.get("TechSupport") == "No":
        recommendations.append(
            "Bundle complimentary 90-day priority Technical Support and Online Security to reduce service friction."
        )
    if float(normalized_customer.get("MonthlyCharges", 0)) >= 75.0:
        recommendations.append(
            "Conduct a personalized plan optimization audit to align monthly billing tier with usage."
        )
    if int(normalized_customer.get("tenure", 0)) <= 12:
        recommendations.append(
            "Enroll account in the Early-Tenure Onboarding Touchpoint sequence (30/60/90-day check-ins)."
        )
    if normalized_customer.get("PaymentMethod") == "Electronic check":
        recommendations.append(
            "Offer a $5/month autopay bill credit for switching from Electronic Check to automatic bank or card billing."
        )
    if not recommendations:
        recommendations.append(
            "Maintain standard quarterly account health review and loyalty reward eligibility."
        )

    return top_contributions, positive_factors, negative_factors, recommendations

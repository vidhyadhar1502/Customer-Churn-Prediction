export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type ModelType = 'logistic_regression' | 'random_forest' | 'gradient_boosting';

export interface CustomerInput {
  customer_id: string;
  gender: 'Male' | 'Female';
  senior_citizen: number;
  partner: 'Yes' | 'No';
  dependents: 'Yes' | 'No';
  tenure: number;
  phone_service: 'Yes' | 'No';
  multiple_lines: 'Yes' | 'No' | 'No phone service';
  internet_service: 'DSL' | 'Fiber optic' | 'No';
  online_security: 'Yes' | 'No' | 'No internet service';
  online_backup: 'Yes' | 'No' | 'No internet service';
  device_protection: 'Yes' | 'No' | 'No internet service';
  tech_support: 'Yes' | 'No' | 'No internet service';
  streaming_tv: 'Yes' | 'No' | 'No internet service';
  streaming_movies: 'Yes' | 'No' | 'No internet service';
  contract: 'Month-to-month' | 'One year' | 'Two year';
  paperless_billing: 'Yes' | 'No';
  payment_method:
    | 'Electronic check'
    | 'Mailed check'
    | 'Bank transfer (automatic)'
    | 'Credit card (automatic)';
  monthly_charges: number;
  total_charges: number;
}

export interface FeatureContribution {
  feature: string;
  feature_key?: string;
  value: string;
  impact_score: number;
  direction: 'positive' | 'negative';
  summary: string;
}

export interface PredictionResult {
  customer_id: string;
  prediction: number;
  prediction_label: string;
  churn_probability: number;
  risk_level: RiskLevel;
  model_used: string;
  threshold_config: {
    low_max: number;
    high_min: number;
    classification_cutoff: number;
  };
  explanations: FeatureContribution[];
  positive_factors: string[];
  negative_factors: string[];
  recommendations: string[];
  disclaimer: string;
  timestamp: string;
}

export interface CustomerRecord extends CustomerInput {
  id: number;
  actual_churn?: string;
  churn_probability: number;
  prediction: number;
  risk_level: RiskLevel;
  created_at: string;
  explanations?: FeatureContribution[];
  positive_factors?: string[];
  negative_factors?: string[];
  recommendations?: string[];
}

export interface PaginatedCustomersResponse {
  items: CustomerRecord[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface DashboardAnalyticsResponse {
  kpis: {
    total_customers: number;
    predicted_churners: number;
    predicted_churn_rate: number;
    avg_churn_probability: number;
    high_risk_customers: number;
    medium_risk_customers: number;
    low_risk_customers: number;
    monthly_revenue_at_risk: number;
    model_accuracy: number;
    model_roc_auc: number;
    active_model: ModelType;
    active_model_name: string;
  };
  charts: {
    churn_vs_non_churn: Array<{ name: string; count: number; percentage: number }>;
    probability_distribution: Array<{ range: string; count: number; risk_zone: RiskLevel }>;
    churn_by_contract: Array<{
      contract: string;
      total: number;
      churners: number;
      retained: number;
      churn_rate: number;
      avg_probability: number;
    }>;
    churn_by_tenure: Array<{
      cohort: string;
      total: number;
      churners: number;
      churn_rate: number;
      avg_probability: number;
    }>;
    churn_by_monthly_charges: Array<{
      bracket: string;
      total: number;
      churners: number;
      retained: number;
      churn_rate: number;
      avg_probability: number;
    }>;
  };
  thresholds: {
    low: number;
    high: number;
  };
}

export interface ConfusionMatrixData {
  tp: number;
  tn: number;
  fp: number;
  fn: number;
}

export interface ModelMetricsDetail {
  accuracy: number;
  precision: number;
  recall: number;
  specificity: number;
  f1_score: number;
  roc_auc: number;
  threshold: number;
  test_samples: number;
  confusion_matrix: ConfusionMatrixData;
  roc_curve: Array<{ fpr: number; tpr: number }>;
}

export interface ModelInsightsResponse {
  active_model: ModelType;
  selected_model: ModelType;
  model_name: string;
  hyperparameters: Record<string, any>;
  metrics: ModelMetricsDetail;
  dataset_stats: {
    total_rows: number;
    churn_positive: number;
    churn_negative: number;
    churn_rate: number;
    imputed_total_charges: number;
  };
  train_size: number;
  test_size: number;
  comparison: Record<
    ModelType,
    {
      name: string;
      type: ModelType;
      hyperparameters: Record<string, any>;
      metrics: ModelMetricsDetail;
    }
  >;
  imbalance_explanation: string;
}

export interface FeatureImportanceItem {
  feature_key: string;
  feature_name: string;
  parent_feature: string;
  importance: number;
  coefficient: number;
  direction: 'increases_churn' | 'reduces_churn' | 'positive';
}

export interface FeatureImportanceResponse {
  model: ModelType;
  model_name: string;
  features: FeatureImportanceItem[];
}

export interface BatchPredictionRowResult {
  customer_id: string;
  gender?: string;
  tenure: number;
  contract: string;
  internet_service: string;
  monthly_charges: number;
  total_charges: number;
  churn_probability: number;
  prediction: number;
  prediction_label: string;
  risk_level: RiskLevel;
  top_factor: string;
  recommended_action: string;
}

export interface BatchPredictionResponse {
  total_processed: number;
  high_risk_count: number;
  medium_risk_count: number;
  low_risk_count: number;
  predicted_churners: number;
  average_probability: number;
  model_used: string;
  results: BatchPredictionRowResult[];
}

export interface PredictionHistoryItem {
  id: number;
  customer_id: string;
  probability: number;
  prediction: number;
  risk_level: RiskLevel;
  model_used: string;
  source: 'single' | 'batch' | 'seed';
  timestamp: string;
  explanations: FeatureContribution[];
  recommendations: string[];
  customer_snapshot: Record<string, any>;
}

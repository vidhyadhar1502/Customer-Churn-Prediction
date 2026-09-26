import React, { useState, useEffect } from 'react';
import {
  CustomerInput,
  ModelType,
  PredictionResult,
} from '../types/churn';
import { apiService } from '../services/api';
import { CUSTOMER_PRESETS, validateCustomerForm } from '../utils/validation';
import { Calculator, Play, RotateCcw, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react';

interface PredictChurnPageProps {
  initialCustomer?: CustomerInput | null;
  activeModel: ModelType;
  onPredictionComplete?: () => void;
}

export const PredictChurnPage: React.FC<PredictChurnPageProps> = ({
  initialCustomer,
  activeModel,
  onPredictionComplete,
}) => {
  const [formData, setFormData] = useState<CustomerInput>(
    initialCustomer || CUSTOMER_PRESETS.high_risk.data
  );
  const [selectedModel, setSelectedModel] = useState<ModelType>(activeModel);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [result, setResult] = useState<PredictionResult | null>(null);

  useEffect(() => {
    setSelectedModel(activeModel);
  }, [activeModel]);

  useEffect(() => {
    if (initialCustomer) {
      setFormData(initialCustomer);
      handleRunPrediction(initialCustomer, selectedModel);
    }
  }, [initialCustomer]);

  const handleFieldChange = <K extends keyof CustomerInput>(field: K, value: CustomerInput[K]) => {
    setFormData((prev) => {
      const updated = { ...prev, [field]: value };

      // Keep dependent service fields consistent with PhoneService and InternetService
      if (field === 'phone_service' && value === 'No') {
        updated.multiple_lines = 'No phone service';
      } else if (field === 'phone_service' && value === 'Yes' && prev.multiple_lines === 'No phone service') {
        updated.multiple_lines = 'No';
      }

      if (field === 'internet_service' && value === 'No') {
        updated.online_security = 'No internet service';
        updated.online_backup = 'No internet service';
        updated.device_protection = 'No internet service';
        updated.tech_support = 'No internet service';
        updated.streaming_tv = 'No internet service';
        updated.streaming_movies = 'No internet service';
      } else if (field === 'internet_service' && value !== 'No' && prev.internet_service === 'No') {
        updated.online_security = 'No';
        updated.online_backup = 'No';
        updated.device_protection = 'No';
        updated.tech_support = 'No';
        updated.streaming_tv = 'No';
        updated.streaming_movies = 'No';
      }

      return updated;
    });
    setValidationErrors((prev) => {
      const copy = { ...prev };
      delete copy[field as string];
      return copy;
    });
  };

  const handleAutoCalculateTotalCharges = () => {
    const computed = Number((formData.tenure * formData.monthly_charges).toFixed(2));
    handleFieldChange('total_charges', computed);
  };

  const handleRunPrediction = async (payloadToScore: CustomerInput, modelToUse: ModelType) => {
    const errors = validateCustomerForm(payloadToScore);
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    setLoading(true);
    setApiError(null);
    try {
      const res = await apiService.predictSingle(payloadToScore, modelToUse);
      setResult(res);
      if (onPredictionComplete) onPredictionComplete();
    } catch (err: any) {
      setApiError(err?.message || 'Failed to execute churn prediction.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleRunPrediction(formData, selectedModel);
  };

  const handleLoadPreset = (presetKey: string) => {
    const preset = CUSTOMER_PRESETS[presetKey];
    if (preset) {
      setFormData(preset.data);
      setValidationErrors({});
      handleRunPrediction(preset.data, selectedModel);
    }
  };

  const internetDisabled = formData.internet_service === 'No';

  return (
    <div className="space-y-8">
      {/* Header & Preset Selector Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Individual Customer Churn Prediction & Attribution
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Score individual subscriber profiles against the serialized ML pipeline and inspect local feature contributions.
          </p>
        </div>

        {/* Interactive Preset Scenario Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500 mr-1">Test Profiles:</span>
          {Object.entries(CUSTOMER_PRESETS).map(([key, preset]) => (
            <button
              key={key}
              type="button"
              onClick={() => handleLoadPreset(key)}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-colors whitespace-nowrap"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left 7 Columns: Structured Customer Input Form */}
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-7 bg-white border border-slate-200 rounded-xl divide-y divide-slate-200"
        >
          {/* Section 01: Personal Information */}
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">01. Personal Information</h2>
              <span className="text-xs text-slate-500">Account Demographics</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Customer ID *
                </label>
                <input
                  type="text"
                  value={formData.customer_id}
                  onChange={(e) => handleFieldChange('customer_id', e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-indigo-600 focus:bg-white"
                  placeholder="CUST-8941"
                />
                {validationErrors.customer_id && (
                  <p className="text-xs text-rose-600 mt-1">{validationErrors.customer_id}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Gender</label>
                <select
                  value={formData.gender}
                  onChange={(e) => handleFieldChange('gender', e.target.value as 'Male' | 'Female')}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-indigo-600"
                >
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Senior Citizen (65+)
                </label>
                <select
                  value={formData.senior_citizen}
                  onChange={(e) => handleFieldChange('senior_citizen', Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-indigo-600"
                >
                  <option value={0}>No (0)</option>
                  <option value={1}>Yes (1)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Partner</label>
                <select
                  value={formData.partner}
                  onChange={(e) => handleFieldChange('partner', e.target.value as 'Yes' | 'No')}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-indigo-600"
                >
                  <option value="No">No</option>
                  <option value="Yes">Yes</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Dependents</label>
                <select
                  value={formData.dependents}
                  onChange={(e) => handleFieldChange('dependents', e.target.value as 'Yes' | 'No')}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-indigo-600"
                >
                  <option value="No">No</option>
                  <option value="Yes">Yes</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 02: Service Information */}
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">02. Service Information</h2>
              <span className="text-xs text-slate-500">Tenure, Connectivity & Protection Add-Ons</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Tenure (Months) *
                </label>
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={formData.tenure}
                  onChange={(e) => handleFieldChange('tenure', parseInt(e.target.value || '0', 10))}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-indigo-600 focus:bg-white"
                />
                {validationErrors.tenure && (
                  <p className="text-xs text-rose-600 mt-1">{validationErrors.tenure}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Phone Service</label>
                <select
                  value={formData.phone_service}
                  onChange={(e) => handleFieldChange('phone_service', e.target.value as 'Yes' | 'No')}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-indigo-600"
                >
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Multiple Lines</label>
                <select
                  value={formData.multiple_lines}
                  disabled={formData.phone_service === 'No'}
                  onChange={(e) =>
                    handleFieldChange('multiple_lines', e.target.value as CustomerInput['multiple_lines'])
                  }
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 disabled:opacity-50 focus:outline-none focus:border-indigo-600"
                >
                  <option value="No">No</option>
                  <option value="Yes">Yes</option>
                  <option value="No phone service">No phone service</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Internet Service</label>
                <select
                  value={formData.internet_service}
                  onChange={(e) =>
                    handleFieldChange('internet_service', e.target.value as CustomerInput['internet_service'])
                  }
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-indigo-600"
                >
                  <option value="Fiber optic">Fiber optic</option>
                  <option value="DSL">DSL</option>
                  <option value="No">No</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-1">
              {(
                [
                  ['online_security', 'Online Security'],
                  ['online_backup', 'Online Backup'],
                  ['device_protection', 'Device Protection'],
                  ['tech_support', 'Tech Support'],
                  ['streaming_tv', 'Streaming TV'],
                  ['streaming_movies', 'Streaming Movies'],
                ] as const
              ).map(([fieldKey, label]) => (
                <div key={fieldKey}>
                  <label className="block text-xs font-medium text-slate-700 mb-1">{label}</label>
                  <select
                    value={formData[fieldKey]}
                    disabled={internetDisabled}
                    onChange={(e) => handleFieldChange(fieldKey, e.target.value as any)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 disabled:opacity-50 focus:outline-none focus:border-indigo-600"
                  >
                    <option value="No">No</option>
                    <option value="Yes">Yes</option>
                    <option value="No internet service">No internet service</option>
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Section 03: Billing Information */}
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">03. Billing & Contract Information</h2>
              <span className="text-xs text-slate-500">Commitment Term & Revenue Metrics</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Contract Term</label>
                <select
                  value={formData.contract}
                  onChange={(e) =>
                    handleFieldChange('contract', e.target.value as CustomerInput['contract'])
                  }
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-indigo-600"
                >
                  <option value="Month-to-month">Month-to-month</option>
                  <option value="One year">One year</option>
                  <option value="Two year">Two year</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Paperless Billing
                </label>
                <select
                  value={formData.paperless_billing}
                  onChange={(e) =>
                    handleFieldChange('paperless_billing', e.target.value as 'Yes' | 'No')
                  }
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-indigo-600"
                >
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Payment Method</label>
                <select
                  value={formData.payment_method}
                  onChange={(e) =>
                    handleFieldChange('payment_method', e.target.value as CustomerInput['payment_method'])
                  }
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-indigo-600"
                >
                  <option value="Electronic check">Electronic check</option>
                  <option value="Mailed check">Mailed check</option>
                  <option value="Bank transfer (automatic)">Bank transfer (automatic)</option>
                  <option value="Credit card (automatic)">Credit card (automatic)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Monthly Charges ($) *
                </label>
                <input
                  type="number"
                  step="0.05"
                  min={0}
                  max={1000}
                  value={formData.monthly_charges}
                  onChange={(e) =>
                    handleFieldChange('monthly_charges', parseFloat(e.target.value || '0'))
                  }
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-indigo-600 focus:bg-white"
                />
                {validationErrors.monthly_charges && (
                  <p className="text-xs text-rose-600 mt-1">{validationErrors.monthly_charges}</p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-slate-700">
                    Total Charges ($) *
                  </label>
                  <button
                    type="button"
                    onClick={handleAutoCalculateTotalCharges}
                    className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
                    title="Calculate Tenure × Monthly Charges"
                  >
                    <Calculator className="w-3 h-3" />
                    Auto-calc
                  </button>
                </div>
                <input
                  type="number"
                  step="0.05"
                  min={0}
                  max={150000}
                  value={formData.total_charges}
                  onChange={(e) =>
                    handleFieldChange('total_charges', parseFloat(e.target.value || '0'))
                  }
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-indigo-600 focus:bg-white"
                />
                {validationErrors.total_charges && (
                  <p className="text-xs text-rose-600 mt-1">{validationErrors.total_charges}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Inference Model
                </label>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value as ModelType)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-indigo-600"
                >
                  <option value="logistic_regression">Logistic Regression</option>
                  <option value="random_forest">Random Forest</option>
                  <option value="gradient_boosting">Gradient Boosting</option>
                </select>
              </div>
            </div>
          </div>

          {/* Submit Footer */}
          <div className="p-6 bg-slate-50/60 flex items-center justify-between rounded-b-xl">
            <button
              type="button"
              onClick={() => handleLoadPreset('high_risk')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Form
            </button>

            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-xs"
            >
              <Play className="w-4 h-4 fill-current" />
              {loading ? 'Running Model Inference...' : 'Predict Churn'}
            </button>
          </div>
        </form>

        {/* Right 5 Columns: Explainable Prediction Result Card */}
        <div className="lg:col-span-5 space-y-6">
          {apiError && (
            <div className="bg-white border border-rose-200 rounded-xl p-5 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Prediction Error</h3>
                <p className="text-xs text-slate-600 mt-1">{apiError}</p>
              </div>
            </div>
          )}

          {!result && !loading && (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-3">
              <h3 className="text-base font-semibold text-slate-900">Ready for Inference</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                Configure the customer attributes on the left or select one of the quick-load test profiles, then click{' '}
                <strong className="text-slate-800">Predict Churn</strong> to compute real-time churn probability and feature attributions.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => handleRunPrediction(formData, selectedModel)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
                >
                  Score Current Profile Now
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {loading && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 animate-pulse">
              <div className="h-5 w-44 bg-slate-200 rounded" />
              <div className="h-12 w-32 bg-slate-200 rounded" />
              <div className="h-3 w-full bg-slate-100 rounded" />
              <div className="space-y-2 pt-4">
                <div className="h-4 w-full bg-slate-100 rounded" />
                <div className="h-4 w-5/6 bg-slate-100 rounded" />
                <div className="h-4 w-4/6 bg-slate-100 rounded" />
              </div>
            </div>
          )}

          {result && !loading && (
            <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-200">
              {/* Primary Prediction & Probability Header */}
              <div className="p-6 space-y-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-mono text-slate-500">
                    {result.customer_id} · {result.model_used.replace(/_/g, ' ')}
                  </span>
                  <span
                    className={`text-xs font-mono font-semibold ${
                      result.risk_level === 'HIGH'
                        ? 'text-rose-700'
                        : result.risk_level === 'MEDIUM'
                        ? 'text-amber-700'
                        : 'text-emerald-700'
                    }`}
                  >
                    RISK LEVEL: {result.risk_level}
                  </span>
                </div>

                <div className="flex items-baseline justify-between pt-1">
                  <div>
                    <p className="text-xs text-slate-500">Prediction Outcome</p>
                    <h2
                      className={`text-2xl font-semibold tracking-tight mt-0.5 ${
                        result.risk_level === 'HIGH'
                          ? 'text-rose-700'
                          : result.risk_level === 'MEDIUM'
                          ? 'text-amber-700'
                          : 'text-emerald-700'
                      }`}
                    >
                      {result.prediction_label}
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Binary Class: {result.prediction === 1 ? '1 (Churn Likely)' : '0 (Retention Likely)'}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-xs text-slate-500">Churn Probability</p>
                    <p className="text-3xl font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                      {(result.churn_probability * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>

                {/* Probability Risk Gauge Bar */}
                <div className="space-y-1.5 pt-2">
                  <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden relative">
                    <div
                      className={`h-full transition-all duration-200 rounded-full ${
                        result.risk_level === 'HIGH'
                          ? 'bg-rose-600'
                          : result.risk_level === 'MEDIUM'
                          ? 'bg-amber-500'
                          : 'bg-emerald-600'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(2, result.churn_probability * 100))}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] font-mono tabular-nums text-slate-400">
                    <span>0% (Low)</span>
                    <span>{(result.threshold_config.low_max * 100).toFixed(0)}% Cutoff</span>
                    <span>{(result.threshold_config.high_min * 100).toFixed(0)}% Cutoff</span>
                    <span>100% (High)</span>
                  </div>
                </div>
              </div>

              {/* Key Contributing Factors (Positive vs Negative Drivers) */}
              <div className="p-6 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Key Contributing Factors (Approximate Log-Odds Attribution)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Standardized feature contributions relative to training baseline
                  </p>
                </div>

                <div className="space-y-2.5">
                  {result.explanations.slice(0, 6).map((item, idx) => {
                    const isPos = item.direction === 'positive';
                    const barWidth = Math.min(100, Math.max(12, Math.abs(item.impact_score) * 75));
                    return (
                      <div key={idx} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-slate-800 truncate pr-2">
                            {item.feature}: <span className="text-slate-500 font-normal">{item.value}</span>
                          </span>
                          <span
                            className={`font-mono tabular-nums font-semibold shrink-0 ${
                              isPos ? 'text-rose-700' : 'text-emerald-700'
                            }`}
                          >
                            {isPos ? '+' : ''}
                            {item.impact_score.toFixed(3)} log-odds
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${isPos ? 'bg-rose-500' : 'bg-emerald-600'}`}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-100">
                  <div>
                    <p className="text-xs font-semibold text-rose-700 mb-1.5">
                      Churn Risk Accelerators (+)
                    </p>
                    {result.positive_factors.length > 0 ? (
                      <ul className="space-y-1 text-xs text-slate-600">
                        {result.positive_factors.map((f, i) => (
                          <li key={i} className="leading-snug">
                            • {f}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-slate-400">No major risk accelerators detected.</p>
                    )}
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-emerald-700 mb-1.5">
                      Protective Retention Factors (–)
                    </p>
                    {result.negative_factors.length > 0 ? (
                      <ul className="space-y-1 text-xs text-slate-600">
                        {result.negative_factors.map((f, i) => (
                          <li key={i} className="leading-snug">
                            • {f}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-slate-400">No protective buffers active.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Recommended Business Action */}
              <div className="p-6 space-y-3 bg-slate-50/50 rounded-b-xl">
                <h3 className="text-sm font-semibold text-slate-900">
                  Recommended Business Actions
                </h3>
                <ul className="space-y-2">
                  {result.recommendations.map((rec, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-700 leading-relaxed">
                      <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-slate-500 pt-2 border-t border-slate-200/80 leading-normal">
                  Note: {result.disclaimer}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

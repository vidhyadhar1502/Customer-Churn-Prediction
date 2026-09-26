import React, { useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  Cell,
  PieChart,
  Pie,
  Legend,
} from 'recharts';
import {
  DashboardAnalyticsResponse,
  ModelType,
} from '../types/churn';
import { SlidersHorizontal, ArrowUpRight, RefreshCw } from 'lucide-react';

interface DashboardPageProps {
  analytics: DashboardAnalyticsResponse | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onUpdateConfig: (config: {
    active_model?: ModelType;
    risk_threshold_low?: number;
    risk_threshold_high?: number;
  }) => Promise<void>;
  onNavigate: (page: 'predict' | 'customers' | 'batch' | 'insights') => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  analytics,
  loading,
  error,
  onRefresh,
  onUpdateConfig,
  onNavigate,
}) => {
  const [configOpen, setConfigOpen] = useState(false);
  const [lowThreshold, setLowThreshold] = useState<number>(analytics?.thresholds.low ?? 0.3);
  const [highThreshold, setHighThreshold] = useState<number>(analytics?.thresholds.high ?? 0.7);
  const [selectedModel, setSelectedModel] = useState<ModelType>(
    analytics?.kpis.active_model ?? 'logistic_regression'
  );
  const [savingConfig, setSavingConfig] = useState(false);

  React.useEffect(() => {
    if (analytics) {
      setLowThreshold(analytics.thresholds.low);
      setHighThreshold(analytics.thresholds.high);
      setSelectedModel(analytics.kpis.active_model);
    }
  }, [analytics]);

  const handleApplyConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      await onUpdateConfig({
        active_model: selectedModel,
        risk_threshold_low: lowThreshold,
        risk_threshold_high: highThreshold,
      });
      setConfigOpen(false);
    } finally {
      setSavingConfig(false);
    }
  };

  if (loading && !analytics) {
    return (
      <div className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 animate-pulse">
          <div className="h-6 w-64 bg-slate-200 rounded mb-4" />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6 pt-4 border-t border-slate-100">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-3 w-24 bg-slate-200 rounded" />
                <div className="h-7 w-20 bg-slate-200 rounded" />
              </div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-xl p-6 h-80 animate-pulse">
              <div className="h-4 w-48 bg-slate-200 rounded mb-6" />
              <div className="h-56 bg-slate-100 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <div className="bg-white border border-rose-200 rounded-xl p-8 text-center">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">Unable to Load Cohort Analytics</h2>
        <p className="text-sm text-slate-600 max-w-md mx-auto mb-6">
          {error || 'The analytics service did not return a valid payload.'}
        </p>
        <button
          onClick={onRefresh}
          className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  const { kpis, charts, thresholds } = analytics;

  return (
    <div className="space-y-8">
      {/* Executive Header & Model/Threshold Configuration Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Executive Churn Analytics & Risk Overview
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-slate-500">
            <span>Active Model: {kpis.active_model_name}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              Risk Thresholds: LOW &lt; {(thresholds.low * 100).toFixed(0)}% / MEDIUM{' '}
              {(thresholds.low * 100).toFixed(0)}–{(thresholds.high * 100).toFixed(0)}% / HIGH &gt;{' '}
              {(thresholds.high * 100).toFixed(0)}%
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              Monthly Revenue at Risk: ${kpis.monthly_revenue_at_risk.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setConfigOpen(!configOpen)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
            Configure Model & Risk Thresholds
          </button>
          <button
            onClick={onRefresh}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
            Refresh
          </button>
          <button
            onClick={() => onNavigate('predict')}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors whitespace-nowrap"
          >
            Score Individual Customer
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Collapsible Model & Risk Threshold Config Panel */}
      {configOpen && (
        <form
          onSubmit={handleApplyConfig}
          className="bg-white border border-indigo-200 rounded-xl p-6 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Inference Model & Application-Defined Risk Thresholds
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Risk tiers (LOW, MEDIUM, HIGH) are configurable application decision thresholds rather than fixed industry standards.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Production Inference Model
              </label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value as ModelType)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-indigo-600"
              >
                <option value="logistic_regression">Logistic Regression (L2 Baseline)</option>
                <option value="random_forest">Random Forest Classifier (28 Trees)</option>
                <option value="gradient_boosting">Gradient Boosted Trees (32 Stages)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Low Risk Upper Bound (<span className="font-mono tabular-nums">{(lowThreshold * 100).toFixed(0)}%</span>)
              </label>
              <input
                type="range"
                min={0.15}
                max={0.45}
                step={0.05}
                value={lowThreshold}
                onChange={(e) => setLowThreshold( parseFloat(e.target.value) )}
                className="w-full accent-indigo-600"
              />
              <div className="flex justify-between text-xs font-mono text-slate-400 mt-1">
                <span>15%</span>
                <span>Default: 30%</span>
                <span>45%</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                High Risk Lower Bound (<span className="font-mono tabular-nums">{(highThreshold * 100).toFixed(0)}%</span>)
              </label>
              <input
                type="range"
                min={0.55}
                max={0.85}
                step={0.05}
                value={highThreshold}
                onChange={(e) => setHighThreshold( parseFloat(e.target.value) )}
                className="w-full accent-indigo-600"
              />
              <div className="flex justify-between text-xs font-mono text-slate-400 mt-1">
                <span>55%</span>
                <span>Default: 70%</span>
                <span>85%</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setConfigOpen(false)}
              className="px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingConfig}
              className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {savingConfig ? 'Applying Configuration...' : 'Apply & Re-Classify Cohort'}
            </button>
          </div>
        </form>
      )}

      {/* Primary 6-Metric KPI Strip (Single-Elevation Structure with Hairline Dividers) */}
      <section className="bg-white border border-slate-200 rounded-xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
          <div className="p-5">
            <p className="text-xs font-medium text-slate-500">Total Customers</p>
            <p className="text-2xl font-semibold font-mono tabular-nums text-slate-900 mt-2">
              {kpis.total_customers.toLocaleString()}
            </p>
            <p className="text-xs text-slate-500 mt-1">Active database accounts</p>
          </div>

          <div className="p-5">
            <p className="text-xs font-medium text-slate-500">Predicted Churners</p>
            <p className="text-2xl font-semibold font-mono tabular-nums text-amber-700 mt-2">
              {kpis.predicted_churners.toLocaleString()}
            </p>
            <p className="text-xs text-slate-500 font-mono tabular-nums mt-1">
              {kpis.predicted_churn_rate.toFixed(1)}% of total base
            </p>
          </div>

          <div className="p-5">
            <p className="text-xs font-medium text-slate-500">Average Churn Prob.</p>
            <p className="text-2xl font-semibold font-mono tabular-nums text-slate-900 mt-2">
              {(kpis.avg_churn_probability * 100).toFixed(1)}%
            </p>
            <p className="text-xs text-slate-500 mt-1">Cohort mean score</p>
          </div>

          <div className="p-5">
            <p className="text-xs font-medium text-slate-500">High Risk Customers</p>
            <p className="text-2xl font-semibold font-mono tabular-nums text-rose-700 mt-2">
              {kpis.high_risk_customers.toLocaleString()}
            </p>
            <p className="text-xs text-slate-500 font-mono tabular-nums mt-1">
              Prob &gt; {(thresholds.high * 100).toFixed(0)}% threshold
            </p>
          </div>

          <div className="p-5">
            <p className="text-xs font-medium text-slate-500">Model Accuracy</p>
            <p className="text-2xl font-semibold font-mono tabular-nums text-slate-900 mt-2">
              {(kpis.model_accuracy * 100).toFixed(1)}%
            </p>
            <p className="text-xs text-slate-500 mt-1">Held-out test split (n=240)</p>
          </div>

          <div className="p-5">
            <p className="text-xs font-medium text-slate-500">Model ROC-AUC</p>
            <p className="text-2xl font-semibold font-mono tabular-nums text-indigo-700 mt-2">
              {kpis.model_roc_auc.toFixed(4)}
            </p>
            <p className="text-xs text-slate-500 mt-1">Rank discrimination score</p>
          </div>
        </div>
      </section>

      {/* Row 1 Charts: Churn Probability Distribution & Churn vs Non-Churn */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Churn Probability Distribution (7 cols) */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                01. Churn Probability Distribution Across Customer Base
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Decile histogram colored by configured risk classification zones (Low, Medium, High)
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-600 font-mono">
              <span className="text-emerald-700">LOW</span>
              <span>·</span>
              <span className="text-amber-700">MEDIUM</span>
              <span>·</span>
              <span className="text-rose-700">HIGH</span>
            </div>
          </div>

          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.probability_distribution} margin={{ top: 8, right: 12, left: -12, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="range" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#f8fafc',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="count" name="Customers" radius={[4, 4, 0, 0]}>
                  {charts.probability_distribution.map((entry, index) => {
                    const fill =
                      entry.risk_zone === 'HIGH'
                        ? '#dc2626'
                        : entry.risk_zone === 'MEDIUM'
                        ? '#d97706'
                        : '#0d9488';
                    return <Cell key={`cell-${index}`} fill={fill} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Churn vs Non-Churn Breakdown (5 cols) */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              02. Predicted Churn vs. Non-Churn Split
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Binary classification at p ≥ 0.50 cutoff alongside risk tier segmentation
            </p>
          </div>

          <div className="h-56 my-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={charts.churn_vs_non_churn}
                  cx="50%"
                  cy="50%"
                  innerRadius={58}
                  outerRadius={82}
                  paddingAngle={3}
                  dataKey="count"
                  nameKey="name"
                >
                  <Cell fill="#0f172a" />
                  <Cell fill="#e11d48" />
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#f8fafc',
                    fontSize: '12px',
                  }}
                />
                <Legend verticalAlign="bottom" height={28} iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-3 divide-x divide-slate-200 border-t border-slate-200 pt-4 text-center">
            <div>
              <p className="text-xs text-slate-500">Low Risk</p>
              <p className="text-sm font-semibold font-mono tabular-nums text-emerald-700 mt-0.5">
                {kpis.low_risk_customers} ({((kpis.low_risk_customers * 100) / kpis.total_customers).toFixed(1)}%)
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Medium Risk</p>
              <p className="text-sm font-semibold font-mono tabular-nums text-amber-700 mt-0.5">
                {kpis.medium_risk_customers} ({((kpis.medium_risk_customers * 100) / kpis.total_customers).toFixed(1)}%)
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">High Risk</p>
              <p className="text-sm font-semibold font-mono tabular-nums text-rose-700 mt-0.5">
                {kpis.high_risk_customers} ({((kpis.high_risk_customers * 100) / kpis.total_customers).toFixed(1)}%)
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Row 2 Charts: Contract Type, Tenure Cohort, and Monthly Charges */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Churn by Contract Type */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="mb-5">
            <h2 className="text-base font-semibold text-slate-900">03. Churn Rate by Contract Type</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Month-to-month contracts exhibit the highest structural attrition
            </p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.churn_by_contract} margin={{ top: 8, right: 8, left: -16, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="contract" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis unit="%" tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#f8fafc',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="churn_rate" name="Predicted Churn Rate (%)" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                <Bar dataKey="avg_probability" name="Mean Churn Prob (%)" fill="#94a3b8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Churn by Tenure Cohort */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="mb-5">
            <h2 className="text-base font-semibold text-slate-900">04. Churn Trajectory by Tenure</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Early-lifecycle subscribers (0–12 months) face acute churn vulnerability
            </p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={charts.churn_by_tenure} margin={{ top: 8, right: 10, left: -16, bottom: 5 }}>
                <defs>
                  <linearGradient id="tenureGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#e11d48" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#e11d48" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="cohort" tick={{ fontSize: 10, fill: '#64748b' }} />
                <YAxis unit="%" tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#f8fafc',
                    fontSize: '12px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="churn_rate"
                  name="Predicted Churn Rate (%)"
                  stroke="#e11d48"
                  strokeWidth={2}
                  fill="url(#tenureGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Churn by Monthly Charges */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="mb-5">
            <h2 className="text-base font-semibold text-slate-900">05. Churn by Monthly Charges</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Higher monthly billing tiers ($75–$120/mo) correlate with elevated churn risk
            </p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.churn_by_monthly_charges} margin={{ top: 8, right: 8, left: -16, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="bracket" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis unit="%" tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#f8fafc',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="churn_rate" name="Churn Rate (%)" fill="#0f172a" radius={[4, 4, 0, 0]} />
                <Bar dataKey="avg_probability" name="Avg Probability (%)" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

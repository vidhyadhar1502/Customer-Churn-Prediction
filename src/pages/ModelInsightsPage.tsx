import React, { useState, useEffect, useCallback } from 'react';
import {
  FeatureImportanceResponse,
  ModelInsightsResponse,
  ModelType,
} from '../types/churn';
import { apiService } from '../services/api';
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
} from 'recharts';
import { CheckCircle2, Info } from 'lucide-react';

interface ModelInsightsPageProps {
  onModelActivated?: (model: ModelType) => void;
}

export const ModelInsightsPage: React.FC<ModelInsightsPageProps> = ({
  onModelActivated,
}) => {
  const [selectedModel, setSelectedModel] = useState<ModelType>('logistic_regression');
  const [metricsData, setMetricsData] = useState<ModelInsightsResponse | null>(null);
  const [importanceData, setImportanceData] = useState<FeatureImportanceResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [activating, setActivating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchModelInsights = useCallback(async (modelKey: ModelType) => {
    setLoading(true);
    setError(null);
    try {
      const [mRes, fRes] = await Promise.all([
        apiService.getModelMetrics(modelKey),
        apiService.getFeatureImportance(modelKey),
      ]);
      setMetricsData(mRes);
      setImportanceData(fRes);
    } catch (err: any) {
      setError(err?.message || 'Failed to load model evaluation insights.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchModelInsights(selectedModel);
  }, [selectedModel, fetchModelInsights]);

  const handleSetAsProductionModel = async () => {
    setActivating(true);
    try {
      await apiService.updateModelConfig({ active_model: selectedModel });
      await fetchModelInsights(selectedModel);
      if (onModelActivated) onModelActivated(selectedModel);
    } finally {
      setActivating(false);
    }
  };

  if (loading && !metricsData) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-24 bg-white border border-slate-200 rounded-xl p-6" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-80 bg-white border border-slate-200 rounded-xl p-6" />
          <div className="h-80 bg-white border border-slate-200 rounded-xl p-6" />
        </div>
      </div>
    );
  }

  if (error || !metricsData || !importanceData) {
    return (
      <div className="bg-white border border-rose-200 rounded-xl p-8 text-center">
        <p className="text-sm text-rose-600 mb-4">{error}</p>
        <button
          onClick={() => fetchModelInsights(selectedModel)}
          className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 rounded-lg"
        >
          Retry
        </button>
      </div>
    );
  }

  const { metrics, comparison, dataset_stats } = metricsData;
  const cm = metrics.confusion_matrix;
  const totalTest = cm.tp + cm.tn + cm.fp + cm.fn;

  const topFeaturesChart = importanceData.features.slice(0, 12).map((f) => ({
    name: f.feature_name.length > 28 ? f.feature_name.slice(0, 26) + '…' : f.feature_name,
    fullName: f.feature_name,
    importancePct: Number((f.importance * 100).toFixed(2)),
    direction: f.direction,
    coefficient: f.coefficient,
  }));

  return (
    <div className="space-y-8">
      {/* Header & Model Comparison Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Model Performance, Confusion Matrix & Feature Importance
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-slate-500">
            <span>Stratified Train/Test Split: {metricsData.train_size} train / {metricsData.test_size} test</span>
            <span>·</span>
            <span>Imputed Missing TotalCharges: {dataset_stats.imputed_total_charges} records</span>
            <span>·</span>
            <span>Reproducible Seed: 42</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Interactive Segmented Model Selector */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(
              [
                ['logistic_regression', 'Logistic Regression'],
                ['random_forest', 'Random Forest'],
                ['gradient_boosting', 'Gradient Boosting'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedModel(key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  selectedModel === key
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {metricsData.active_model === selectedModel ? (
            <span className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Active Production Model
            </span>
          ) : (
            <button
              type="button"
              disabled={activating}
              onClick={handleSetAsProductionModel}
              className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {activating ? 'Activating...' : 'Set as Active Production Model'}
            </button>
          )}
        </div>
      </div>

      {/* Primary Evaluation Metrics Strip */}
      <section className="bg-white border border-slate-200 rounded-xl">
        <div className="grid grid-cols-2 sm:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
          <div className="p-5">
            <p className="text-xs font-medium text-slate-500">ROC-AUC Score</p>
            <p className="text-2xl font-semibold font-mono tabular-nums text-indigo-700 mt-2">
              {metrics.roc_auc.toFixed(4)}
            </p>
            <p className="text-xs text-slate-500 mt-1">Primary ranking metric</p>
          </div>
          <div className="p-5">
            <p className="text-xs font-medium text-slate-500">F1 Score</p>
            <p className="text-2xl font-semibold font-mono tabular-nums text-slate-900 mt-2">
              {(metrics.f1_score * 100).toFixed(1)}%
            </p>
            <p className="text-xs text-slate-500 mt-1">Precision-Recall harmonic mean</p>
          </div>
          <div className="p-5">
            <p className="text-xs font-medium text-slate-500">Recall (Sensitivity)</p>
            <p className="text-2xl font-semibold font-mono tabular-nums text-slate-900 mt-2">
              {(metrics.recall * 100).toFixed(1)}%
            </p>
            <p className="text-xs text-slate-500 mt-1">True churners captured</p>
          </div>
          <div className="p-5">
            <p className="text-xs font-medium text-slate-500">Precision</p>
            <p className="text-2xl font-semibold font-mono tabular-nums text-slate-900 mt-2">
              {(metrics.precision * 100).toFixed(1)}%
            </p>
            <p className="text-xs text-slate-500 mt-1">Positive predictive value</p>
          </div>
          <div className="p-5">
            <p className="text-xs font-medium text-slate-500">Overall Accuracy</p>
            <p className="text-2xl font-semibold font-mono tabular-nums text-slate-900 mt-2">
              {(metrics.accuracy * 100).toFixed(1)}%
            </p>
            <p className="text-xs text-slate-500 mt-1">At p = 0.50 cutoff</p>
          </div>
        </div>
      </section>

      {/* Why Accuracy Alone Is Insufficient on Imbalanced Churn Datasets */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex items-start gap-4">
        <Info className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
        <div className="space-y-1.5">
          <h2 className="text-sm font-semibold text-slate-900">
            Why Accuracy Alone Should Not Be Used as the Primary Metric for Imbalanced Churn Datasets
          </h2>
          <p className="text-xs text-slate-600 leading-relaxed max-w-4xl">
            {metricsData.imbalance_explanation}
          </p>
        </div>
      </div>

      {/* Confusion Matrix & ROC Curve */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 2x2 Confusion Matrix (6 cols) */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                01. Test Set Confusion Matrix (n = {totalTest})
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Evaluated on held-out 20% test partition using {metricsData.model_name}
              </p>
            </div>
            <span className="text-xs font-mono text-slate-500">Cutoff = 0.50</span>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-1">
            {/* True Negative */}
            <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Actual: Retained (0)</span>
                <span>Predicted: Retained (0)</span>
              </div>
              <p className="text-2xl font-semibold font-mono tabular-nums text-slate-900 mt-3">
                {cm.tn}{' '}
                <span className="text-xs font-normal text-slate-500">
                  ({((cm.tn * 100) / totalTest).toFixed(1)}%)
                </span>
              </p>
              <p className="text-xs font-medium text-emerald-700 mt-1">
                True Negatives (Correctly Retained)
              </p>
            </div>

            {/* False Positive */}
            <div className="p-5 bg-amber-50/40 border border-amber-200 rounded-xl">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Actual: Retained (0)</span>
                <span>Predicted: Churn (1)</span>
              </div>
              <p className="text-2xl font-semibold font-mono tabular-nums text-amber-800 mt-3">
                {cm.fp}{' '}
                <span className="text-xs font-normal text-slate-500">
                  ({((cm.fp * 100) / totalTest).toFixed(1)}%)
                </span>
              </p>
              <p className="text-xs font-medium text-amber-700 mt-1">
                False Positives (Unnecessary Outreach Cost)
              </p>
            </div>

            {/* False Negative */}
            <div className="p-5 bg-rose-50/40 border border-rose-200 rounded-xl">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Actual: Churn (1)</span>
                <span>Predicted: Retained (0)</span>
              </div>
              <p className="text-2xl font-semibold font-mono tabular-nums text-rose-800 mt-3">
                {cm.fn}{' '}
                <span className="text-xs font-normal text-slate-500">
                  ({((cm.fn * 100) / totalTest).toFixed(1)}%)
                </span>
              </p>
              <p className="text-xs font-medium text-rose-700 mt-1">
                False Negatives (Missed Churners — High Cost)
              </p>
            </div>

            {/* True Positive */}
            <div className="p-5 bg-indigo-50/40 border border-indigo-200 rounded-xl">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Actual: Churn (1)</span>
                <span>Predicted: Churn (1)</span>
              </div>
              <p className="text-2xl font-semibold font-mono tabular-nums text-indigo-900 mt-3">
                {cm.tp}{' '}
                <span className="text-xs font-normal text-slate-500">
                  ({((cm.tp * 100) / totalTest).toFixed(1)}%)
                </span>
              </p>
              <p className="text-xs font-medium text-indigo-700 mt-1">
                True Positives (Caught Churners)
              </p>
            </div>
          </div>
        </div>

        {/* ROC Curve Chart (6 cols) */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                02. Receiver Operating Characteristic (ROC) Curve
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                True Positive Rate (Sensitivity) vs. False Positive Rate across probability thresholds
              </p>
            </div>
            <span className="text-xs font-mono font-semibold text-indigo-700">
              AUC = {metrics.roc_auc.toFixed(4)}
            </span>
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metrics.roc_curve} margin={{ top: 8, right: 12, left: -16, bottom: 5 }}>
                <defs>
                  <linearGradient id="rocFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="fpr"
                  type="number"
                  domain={[0, 1]}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  label={{ value: 'False Positive Rate (FPR)', position: 'insideBottom', offset: -2, fontSize: 11 }}
                />
                <YAxis
                  dataKey="tpr"
                  type="number"
                  domain={[0, 1]}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                />
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
                  dataKey="tpr"
                  name="True Positive Rate"
                  stroke="#4f46e5"
                  strokeWidth={2.5}
                  fill="url(#rocFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Calculated Feature Importance Chart & Table */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              03. Calculated Global Feature Importance ({importanceData.model_name})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Derived directly from the serialized model parameters trained on `customer_data.csv` (never hardcoded)
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="text-rose-700">Increases Churn Risk (+)</span>
            <span>·</span>
            <span className="text-emerald-700">Reduces Churn Risk (–)</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-7 h-96">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={topFeaturesChart}
                layout="vertical"
                margin={{ top: 5, right: 20, left: 30, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" unit="%" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={185}
                  tick={{ fontSize: 11, fill: '#334155' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#f8fafc',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="importancePct" name="Relative Importance (%)" radius={[0, 4, 4, 0]}>
                  {topFeaturesChart.map((entry, idx) => (
                    <Cell
                      key={idx}
                      fill={entry.direction === 'increases_churn' ? '#e11d48' : '#0d9488'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="lg:col-span-5 overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                  <th className="py-2.5 px-3">Rank</th>
                  <th className="py-2.5 px-3">Feature</th>
                  <th className="py-2.5 px-3 text-right">Importance</th>
                  <th className="py-2.5 px-3 text-right">Log-Odds Wt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {importanceData.features.slice(0, 10).map((f, i) => (
                  <tr key={f.feature_key} className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-mono text-slate-400">
                      {String(i + 1).padStart(2, '0')}
                    </td>
                    <td className="py-2 px-3 font-medium text-slate-800">{f.feature_name}</td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-900">
                      {(f.importance * 100).toFixed(2)}%
                    </td>
                    <td
                      className={`py-2 px-3 text-right font-mono tabular-nums font-semibold ${
                        f.direction === 'increases_churn' ? 'text-rose-700' : 'text-emerald-700'
                      }`}
                    >
                      {f.coefficient >= 0 ? '+' : ''}
                      {f.coefficient.toFixed(3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Multi-Model Comparison Matrix */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">
            04. Cross-Model Benchmark Comparison (Held-Out Test Split)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Side-by-side comparison of candidate classifiers trained on the same preprocessed training matrix
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                <th className="py-3 px-4">Model Architecture</th>
                <th className="py-3 px-4 text-right">Accuracy</th>
                <th className="py-3 px-4 text-right">Precision</th>
                <th className="py-3 px-4 text-right">Recall</th>
                <th className="py-3 px-4 text-right">F1 Score</th>
                <th className="py-3 px-4 text-right">ROC-AUC</th>
                <th className="py-3 px-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {Object.entries(comparison).map(([mKey, mObj]) => (
                <tr key={mKey} className="hover:bg-slate-50">
                  <td className="py-3 px-4 font-medium text-slate-900">{mObj.name}</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                    {(mObj.metrics.accuracy * 100).toFixed(1)}%
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                    {(mObj.metrics.precision * 100).toFixed(1)}%
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                    {(mObj.metrics.recall * 100).toFixed(1)}%
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                    {(mObj.metrics.f1_score * 100).toFixed(1)}%
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-indigo-700">
                    {mObj.metrics.roc_auc.toFixed(4)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono">
                    {metricsData.active_model === mKey ? (
                      <span className="text-emerald-700 font-semibold">ACTIVE</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setSelectedModel(mKey as ModelType)}
                        className="text-indigo-600 hover:underline"
                      >
                        Inspect
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import {
  BatchPredictionResponse,
  ModelType,
} from '../types/churn';
import { apiService } from '../services/api';
import { SAMPLE_BATCH_CSV_CONTENT } from '../utils/validation';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import {
  Upload,
  FileSpreadsheet,
  Play,
  Download,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

interface BatchPredictionPageProps {
  activeModel: ModelType;
  onBatchComplete?: () => void;
}

export const BatchPredictionPage: React.FC<BatchPredictionPageProps> = ({
  activeModel,
  onBatchComplete,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [columnValidationPassed, setColumnValidationPassed] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(false);
  const [batchResult, setBatchResult] = useState<BatchPredictionResponse | null>(null);
  const [riskFilter, setRiskFilter] = useState<string>('');

  const validateAndPreviewCsvText = (csvText: string, fileObj: File) => {
    setValidationError(null);
    setBatchResult(null);

    const lines = csvText
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length < 2) {
      setValidationError('CSV file must contain a header row and at least one customer data row.');
      setColumnValidationPassed(false);
      return;
    }

    const headers = lines[0].split(',').map((h) => h.trim());
    const normHeaders = headers.map((h) => h.toLowerCase().replace(/_/g, ''));
    const required = ['gender', 'tenure', 'contract', 'monthlycharges', 'internetservice'];
    const missing = required.filter((r) => !normHeaders.includes(r));

    if (missing.length > 0) {
      setValidationError(
        `CSV column validation failed. Missing required columns: ${missing.join(', ')}`
      );
      setColumnValidationPassed(false);
      return;
    }

    const sampleRows = lines.slice(1, 9).map((line) => line.split(',').map((c) => c.trim()));
    setSelectedFile(fileObj);
    setPreviewHeaders(headers);
    setPreviewRows(sampleRows);
    setColumnValidationPassed(true);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setValidationError('Invalid file extension. Please upload a valid .csv file.');
      setColumnValidationPassed(false);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setValidationError('CSV file exceeds the 5 MB security upload limit.');
      setColumnValidationPassed(false);
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = String(evt.target?.result || '');
      validateAndPreviewCsvText(content, file);
    };
    reader.readAsText(file);
  };

  const handleLoadSampleBatch = () => {
    const blob = new Blob([SAMPLE_BATCH_CSV_CONTENT], { type: 'text/csv;charset=utf-8;' });
    const sampleFile = new File([blob], 'sample_telco_cohort_15.csv', { type: 'text/csv' });
    validateAndPreviewCsvText(SAMPLE_BATCH_CSV_CONTENT, sampleFile);
  };

  const handleRunBatchScoring = async () => {
    if (!selectedFile || !columnValidationPassed) return;
    setLoading(true);
    setValidationError(null);
    try {
      const res = await apiService.predictBatchCsv(selectedFile, activeModel);
      setBatchResult(res);
      if (onBatchComplete) onBatchComplete();
    } catch (err: any) {
      setValidationError(err?.message || 'Batch prediction request failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadResultsCsv = () => {
    if (!batchResult) return;
    const headers = [
      'customer_id',
      'tenure',
      'contract',
      'internet_service',
      'monthly_charges',
      'total_charges',
      'churn_probability',
      'prediction',
      'risk_level',
      'top_factor',
      'recommended_action',
    ];
    const csvLines = [
      headers.join(','),
      ...batchResult.results.map((r) =>
        [
          r.customer_id,
          r.tenure,
          `"${r.contract}"`,
          `"${r.internet_service}"`,
          r.monthly_charges.toFixed(2),
          r.total_charges.toFixed(2),
          r.churn_probability.toFixed(4),
          r.prediction,
          r.risk_level,
          `"${r.top_factor.replace(/"/g, '""')}"`,
          `"${r.recommended_action.replace(/"/g, '""')}"`,
        ].join(',')
      ),
    ];

    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `retainiq_batch_predictions_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredResults = batchResult
    ? batchResult.results.filter((r) => (!riskFilter ? true : r.risk_level === riskFilter))
    : [];

  const riskChartData = batchResult
    ? [
        { tier: 'Low Risk', count: batchResult.low_risk_count, color: '#0d9488' },
        { tier: 'Medium Risk', count: batchResult.medium_risk_count, color: '#d97706' },
        { tier: 'High Risk', count: batchResult.high_risk_count, color: '#dc2626' },
      ]
    : [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Batch CSV Churn Scoring Pipeline
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Upload a multi-customer CSV dataset, validate schema columns, preview records, and execute server-side ML batch inference.
          </p>
        </div>

        <button
          type="button"
          onClick={handleLoadSampleBatch}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors whitespace-nowrap"
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          Load Sample Telco Batch CSV (15 Accounts)
        </button>
      </div>

      {/* Step 1 & 2: Upload & Schema Validation Box */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              01. Upload Customer CSV & Validate Schema
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Maximum file size: 5 MB · Required columns: gender, tenure, Contract, MonthlyCharges, InternetService
            </p>
          </div>

          {selectedFile && columnValidationPassed && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="w-4 h-4" />
              <span>Schema Validated: {selectedFile.name}</span>
            </div>
          )}
        </div>

        <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-xl p-8 hover:border-indigo-500 hover:bg-slate-50/60 cursor-pointer transition-colors">
          <Upload className="w-6 h-6 text-slate-400 mb-2" />
          <span className="text-xs font-medium text-slate-700">
            Click to select a .csv file from your computer
          </span>
          <span className="text-[11px] text-slate-400 mt-1">
            Or click "Load Sample Telco Batch CSV" above to test immediately
          </span>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileUpload}
            className="hidden"
          />
        </label>

        {validationError && (
          <div className="p-4 border border-rose-200 bg-rose-50/50 rounded-lg flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <p className="text-xs text-rose-700">{validationError}</p>
          </div>
        )}

        {/* Step 3 & 4: Preview Uploaded CSV & Run Batch Scoring */}
        {selectedFile && columnValidationPassed && (
          <div className="space-y-4 pt-4 border-t border-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold text-slate-900">
                  02. Data Preview (First {previewRows.length} Rows)
                </h3>
                <p className="text-xs text-slate-500">
                  Verify column alignment before dispatching to `/api/predict/batch`
                </p>
              </div>

              <button
                type="button"
                disabled={loading}
                onClick={handleRunBatchScoring}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                {loading ? 'Processing Batch on Backend...' : 'Run Batch Predictions'}
              </button>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                    {previewHeaders.slice(0, 9).map((h, i) => (
                      <th key={i} className="py-2 px-3 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {previewRows.map((row, rIdx) => (
                    <tr key={rIdx}>
                      {row.slice(0, 9).map((cell, cIdx) => (
                        <td key={cIdx} className="py-2 px-3 font-mono text-slate-700 whitespace-nowrap">
                          {cell || '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Step 5, 6 & 7: Batch Prediction Results, Risk Distribution & CSV Export */}
      {batchResult && (
        <div className="space-y-6">
          {/* Batch Summary KPI Strip */}
          <div className="bg-white border border-slate-200 rounded-xl">
            <div className="grid grid-cols-2 sm:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
              <div className="p-5">
                <p className="text-xs text-slate-500">Records Scored</p>
                <p className="text-2xl font-semibold font-mono tabular-nums text-slate-900 mt-1">
                  {batchResult.total_processed}
                </p>
              </div>
              <div className="p-5">
                <p className="text-xs text-slate-500">Predicted Churners</p>
                <p className="text-2xl font-semibold font-mono tabular-nums text-rose-700 mt-1">
                  {batchResult.predicted_churners}
                </p>
              </div>
              <div className="p-5">
                <p className="text-xs text-slate-500">High Risk Count</p>
                <p className="text-2xl font-semibold font-mono tabular-nums text-rose-700 mt-1">
                  {batchResult.high_risk_count}
                </p>
              </div>
              <div className="p-5">
                <p className="text-xs text-slate-500">Medium / Low Risk</p>
                <p className="text-2xl font-semibold font-mono tabular-nums text-slate-900 mt-1">
                  {batchResult.medium_risk_count} / {batchResult.low_risk_count}
                </p>
              </div>
              <div className="p-5">
                <p className="text-xs text-slate-500">Mean Batch Prob.</p>
                <p className="text-2xl font-semibold font-mono tabular-nums text-indigo-700 mt-1">
                  {(batchResult.average_probability * 100).toFixed(1)}%
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Risk Distribution Chart (4 cols) */}
            <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-6">
              <h3 className="text-sm font-semibold text-slate-900">
                03. Batch Risk Tier Distribution
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 mb-4">
                Model: {batchResult.model_used.replace(/_/g, ' ')}
              </p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={riskChartData} margin={{ top: 8, right: 8, left: -18, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="tier" tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
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
                      {riskChartData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Scored Results Table & Download Button (8 cols) */}
            <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                  {(
                    [
                      ['', 'All Results'],
                      ['HIGH', 'High Risk'],
                      ['MEDIUM', 'Medium Risk'],
                      ['LOW', 'Low Risk'],
                    ] as const
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setRiskFilter(val)}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                        riskFilter === val
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleDownloadResultsCsv}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Prediction Results (.CSV)
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                      <th className="py-2.5 px-4">Customer ID</th>
                      <th className="py-2.5 px-4 text-right">Tenure</th>
                      <th className="py-2.5 px-4">Contract</th>
                      <th className="py-2.5 px-4 text-right">Monthly</th>
                      <th className="py-2.5 px-4 text-right">Probability</th>
                      <th className="py-2.5 px-4">Risk</th>
                      <th className="py-2.5 px-4">Primary Driver & Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredResults.map((r) => (
                      <tr key={r.customer_id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-4 font-mono font-medium text-slate-900 whitespace-nowrap">
                          {r.customer_id}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                          {r.tenure}m
                        </td>
                        <td className="py-2.5 px-4 text-slate-700 whitespace-nowrap">{r.contract}</td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                          ${r.monthly_charges.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                          {(r.churn_probability * 100).toFixed(1)}%
                        </td>
                        <td className="py-2.5 px-4 font-mono font-semibold whitespace-nowrap">
                          <span
                            className={
                              r.risk_level === 'HIGH'
                                ? 'text-rose-700'
                                : r.risk_level === 'MEDIUM'
                                ? 'text-amber-700'
                                : 'text-emerald-700'
                            }
                          >
                            {r.risk_level}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-slate-600 max-w-xs truncate" title={r.recommended_action}>
                          <span className="text-slate-900 font-medium">{r.top_factor}</span>
                          <span className="mx-1 text-slate-300">·</span>
                          <span>{r.recommended_action}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

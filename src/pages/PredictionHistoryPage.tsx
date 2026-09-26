import React, { useState, useEffect, useCallback } from 'react';
import { PredictionHistoryItem } from '../types/churn';
import { apiService } from '../services/api';
import { Search, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

export const PredictionHistoryPage: React.FC = () => {
  const [items, setItems] = useState<PredictionHistoryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState<string>('');
  const [riskFilter, setRiskFilter] = useState<string>('');
  const [predictionFilter, setPredictionFilter] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiService.getPredictionHistory({
        risk_level: riskFilter,
        prediction: predictionFilter,
        date_from: dateFrom ? new Date(dateFrom).toISOString() : '',
        search,
        limit: 100,
      });
      setItems(res.items);
    } catch (err: any) {
      setError(err?.message || 'Failed to load prediction history.');
    } finally {
      setLoading(false);
    }
  }, [riskFilter, predictionFilter, dateFrom, search]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Prediction Audit Log & Inference History
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Chronological ledger of single and batch churn predictions persisted in the SQLite database.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchHistory}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
          Refresh Audit Log
        </button>
      </div>

      {/* Filters Toolbar (Date, Risk, Prediction, Customer ID) */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by Customer ID..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-indigo-600 focus:bg-white"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-500 whitespace-nowrap">From Date:</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-3 py-1.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-indigo-600"
            />
            {dateFrom && (
              <button
                type="button"
                onClick={() => setDateFrom('')}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Risk Segmented Control */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(
              [
                ['', 'All Risks'],
                ['HIGH', 'High'],
                ['MEDIUM', 'Medium'],
                ['LOW', 'Low'],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setRiskFilter(val)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  riskFilter === val
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Prediction Class Filter */}
          <select
            value={predictionFilter}
            onChange={(e) => setPredictionFilter(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-indigo-600"
          >
            <option value="">All Predictions</option>
            <option value="1">Predicted Churn (1)</option>
            <option value="0">Predicted Retained (0)</option>
          </select>
        </div>
      </div>

      {/* Prediction History Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {error ? (
          <div className="p-8 text-center">
            <p className="text-sm text-rose-600 mb-3">{error}</p>
            <button
              onClick={fetchHistory}
              className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 rounded-lg"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                  <th className="py-3 px-4">Customer ID</th>
                  <th className="py-3 px-4">Timestamp (UTC)</th>
                  <th className="py-3 px-4">Source · Model</th>
                  <th className="py-3 px-4 text-right">Churn Probability</th>
                  <th className="py-3 px-4">Prediction</th>
                  <th className="py-3 px-4">Risk Level</th>
                  <th className="py-3 px-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {loading
                  ? Array.from({ length: 8 }).map((_, idx) => (
                      <tr key={idx} className="animate-pulse">
                        <td className="py-3 px-4"><div className="h-4 w-24 bg-slate-100 rounded" /></td>
                        <td className="py-3 px-4"><div className="h-4 w-36 bg-slate-100 rounded" /></td>
                        <td className="py-3 px-4"><div className="h-4 w-32 bg-slate-100 rounded" /></td>
                        <td className="py-3 px-4"><div className="h-4 w-16 bg-slate-100 rounded ml-auto" /></td>
                        <td className="py-3 px-4"><div className="h-4 w-20 bg-slate-100 rounded" /></td>
                        <td className="py-3 px-4"><div className="h-4 w-14 bg-slate-100 rounded" /></td>
                        <td className="py-3 px-4"><div className="h-4 w-12 bg-slate-100 rounded ml-auto" /></td>
                      </tr>
                    ))
                  : items.map((item) => {
                      const isExpanded = expandedId === item.id;
                      const formattedDate = new Date(item.timestamp).toLocaleString('en-US', {
                        month: 'short',
                        day: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      });

                      return (
                        <React.Fragment key={item.id}>
                          <tr
                            onClick={() => setExpandedId(isExpanded ? null : item.id)}
                            className="hover:bg-slate-50 cursor-pointer transition-colors"
                          >
                            <td className="py-2.5 px-4 font-mono font-medium text-slate-900 whitespace-nowrap">
                              {item.customer_id}
                            </td>
                            <td className="py-2.5 px-4 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                              {formattedDate}
                            </td>
                            <td className="py-2.5 px-4 text-slate-600 whitespace-nowrap">
                              <span className="capitalize">{item.source}</span>
                              <span className="mx-1.5 text-slate-300">·</span>
                              <span className="font-mono text-[11px]">{item.model_used}</span>
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                              {(Number(item.probability) * 100).toFixed(1)}%
                            </td>
                            <td className="py-2.5 px-4 whitespace-nowrap">
                              <span
                                className={`font-medium ${
                                  item.prediction === 1 ? 'text-rose-700' : 'text-slate-600'
                                }`}
                              >
                                {item.prediction === 1 ? 'Churn (1)' : 'No Churn (0)'}
                              </span>
                            </td>
                            <td className="py-2.5 px-4 font-mono font-semibold whitespace-nowrap">
                              <span
                                className={
                                  item.risk_level === 'HIGH'
                                    ? 'text-rose-700'
                                    : item.risk_level === 'MEDIUM'
                                    ? 'text-amber-700'
                                    : 'text-emerald-700'
                                }
                              >
                                {item.risk_level}
                              </span>
                            </td>
                            <td className="py-2.5 px-4 text-right text-indigo-600 whitespace-nowrap">
                              <span className="inline-flex items-center gap-1 font-medium">
                                {isExpanded ? 'Hide' : 'Explain'}
                                {isExpanded ? (
                                  <ChevronUp className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                )}
                              </span>
                            </td>
                          </tr>

                          {isExpanded && (
                            <tr className="bg-slate-50/80">
                              <td colSpan={7} className="p-4 border-t border-slate-200/60">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                  <div>
                                    <p className="text-xs font-semibold text-slate-900 mb-2">
                                      Stored Feature Attribution (Approximate Log-Odds)
                                    </p>
                                    <div className="space-y-1.5">
                                      {item.explanations.slice(0, 4).map((exp, i) => (
                                        <div key={i} className="flex items-center justify-between text-xs">
                                          <span className="text-slate-700">
                                            {exp.feature} ({exp.value})
                                          </span>
                                          <span
                                            className={`font-mono tabular-nums font-semibold ${
                                              exp.direction === 'positive'
                                                ? 'text-rose-700'
                                                : 'text-emerald-700'
                                            }`}
                                          >
                                            {exp.direction === 'positive' ? '+' : ''}
                                            {exp.impact_score.toFixed(3)}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>

                                  <div>
                                    <p className="text-xs font-semibold text-slate-900 mb-2">
                                      Recommended Retention Actions
                                    </p>
                                    <ul className="space-y-1 text-xs text-slate-600">
                                      {item.recommendations.map((rec, i) => (
                                        <li key={i}>• {rec}</li>
                                      ))}
                                    </ul>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}

                {!loading && items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-xs text-slate-500">
                      No prediction logs match the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

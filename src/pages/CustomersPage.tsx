import React, { useState, useEffect, useCallback } from 'react';
import {
  CustomerInput,
  CustomerRecord,
  PaginatedCustomersResponse,
} from '../types/churn';
import { apiService } from '../services/api';
import {
  Search,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  X,
  ArrowUpRight,
} from 'lucide-react';

interface CustomersPageProps {
  onSelectCustomerForSimulator: (customer: CustomerInput) => void;
}

export const CustomersPage: React.FC<CustomersPageProps> = ({
  onSelectCustomerForSimulator,
}) => {
  const [data, setData] = useState<PaginatedCustomersResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState<number>(1);
  const [pageSize] = useState<number>(15);
  const [search, setSearch] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [riskFilter, setRiskFilter] = useState<string>('');
  const [contractFilter, setContractFilter] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('churn_probability');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 220);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiService.getCustomers({
        page,
        page_size: pageSize,
        search: debouncedSearch,
        risk_level: riskFilter,
        contract: contractFilter,
        sort_by: sortBy,
        sort_order: sortOrder,
      });
      setData(res);
    } catch (err: any) {
      setError(err?.message || 'Failed to load customer records.');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedSearch, riskFilter, contractFilter, sortBy, sortOrder]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
    setPage(1);
  };

  const handleInspectCustomer = async (customerId: string) => {
    setDetailLoading(true);
    try {
      const detail = await apiService.getCustomerById(customerId);
      setSelectedCustomer(detail);
    } catch {
      // Fallback if detail fetch fails
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSimulateCustomer = (c: CustomerRecord) => {
    onSelectCustomerForSimulator({
      customer_id: c.customer_id,
      gender: c.gender,
      senior_citizen: c.senior_citizen,
      partner: c.partner,
      dependents: c.dependents,
      tenure: c.tenure,
      phone_service: c.phone_service,
      multiple_lines: c.multiple_lines,
      internet_service: c.internet_service,
      online_security: c.online_security,
      online_backup: c.online_backup,
      device_protection: c.device_protection,
      tech_support: c.tech_support,
      streaming_tv: c.streaming_tv,
      streaming_movies: c.streaming_movies,
      contract: c.contract,
      paperless_billing: c.paperless_billing,
      payment_method: c.payment_method,
      monthly_charges: c.monthly_charges,
      total_charges: c.total_charges,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Customer Account Directory & Cohort Risk Ledger
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Search, filter, and sort scored subscriber accounts. Click any row to inspect local ML feature attributions.
          </p>
        </div>
        {data && (
          <div className="text-xs font-mono tabular-nums text-slate-600">
            Showing {(data.page - 1) * data.page_size + (data.items.length > 0 ? 1 : 0)}–
            {(data.page - 1) * data.page_size + data.items.length} of {data.total.toLocaleString()} accounts
          </div>
        )}
      </div>

      {/* Filter & Search Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by Customer ID, contract, internet, or payment..."
            className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-indigo-600 focus:bg-white"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Interactive Segmented Risk Filter Controls */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(
              [
                ['', 'All Tiers'],
                ['HIGH', 'High Risk'],
                ['MEDIUM', 'Medium Risk'],
                ['LOW', 'Low Risk'],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => {
                  setRiskFilter(val);
                  setPage(1);
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  riskFilter === val
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Contract Filter Dropdown */}
          <select
            value={contractFilter}
            onChange={(e) => {
              setContractFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-indigo-600"
          >
            <option value="">All Contract Terms</option>
            <option value="Month-to-month">Month-to-month</option>
            <option value="One year">One year</option>
            <option value="Two year">Two year</option>
          </select>
        </div>
      </div>

      {/* High-Density Customer Data Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {error ? (
          <div className="p-8 text-center">
            <p className="text-sm text-rose-600 mb-3">{error}</p>
            <button
              onClick={fetchCustomers}
              className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 rounded-lg"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold text-slate-500">
                  <th className="py-3 px-4">
                    <button
                      type="button"
                      onClick={() => handleSort('customer_id')}
                      className="inline-flex items-center gap-1 hover:text-slate-900"
                    >
                      Customer ID
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => handleSort('tenure')}
                      className="inline-flex items-center gap-1 hover:text-slate-900"
                    >
                      Tenure
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-3 px-4">
                    <button
                      type="button"
                      onClick={() => handleSort('contract')}
                      className="inline-flex items-center gap-1 hover:text-slate-900"
                    >
                      Contract & Service
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => handleSort('monthly_charges')}
                      className="inline-flex items-center gap-1 hover:text-slate-900"
                    >
                      Monthly Charges
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => handleSort('churn_probability')}
                      className="inline-flex items-center gap-1 hover:text-slate-900"
                    >
                      Churn Probability
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-3 px-4">Risk Level</th>
                  <th className="py-3 px-4">Prediction</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {loading
                  ? Array.from({ length: 10 }).map((_, idx) => (
                      <tr key={idx} className="animate-pulse">
                        <td className="py-3 px-4"><div className="h-4 w-24 bg-slate-100 rounded" /></td>
                        <td className="py-3 px-4"><div className="h-4 w-12 bg-slate-100 rounded ml-auto" /></td>
                        <td className="py-3 px-4"><div className="h-4 w-36 bg-slate-100 rounded" /></td>
                        <td className="py-3 px-4"><div className="h-4 w-16 bg-slate-100 rounded ml-auto" /></td>
                        <td className="py-3 px-4"><div className="h-4 w-16 bg-slate-100 rounded ml-auto" /></td>
                        <td className="py-3 px-4"><div className="h-4 w-14 bg-slate-100 rounded" /></td>
                        <td className="py-3 px-4"><div className="h-4 w-20 bg-slate-100 rounded" /></td>
                        <td className="py-3 px-4"><div className="h-4 w-16 bg-slate-100 rounded ml-auto" /></td>
                      </tr>
                    ))
                  : data?.items.map((cust) => (
                      <tr
                        key={cust.customer_id}
                        onClick={() => handleInspectCustomer(cust.customer_id)}
                        className="hover:bg-slate-50/90 cursor-pointer transition-colors"
                      >
                        <td className="py-2.5 px-4 font-mono font-medium text-slate-900 whitespace-nowrap">
                          {cust.customer_id}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                          {cust.tenure} mo
                        </td>
                        <td className="py-2.5 px-4 text-slate-600 whitespace-nowrap">
                          <span className="text-slate-900 font-medium">{cust.contract}</span>
                          <span className="mx-1.5 text-slate-300">·</span>
                          <span>{cust.internet_service}</span>
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                          ${Number(cust.monthly_charges).toFixed(2)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                          {(Number(cust.churn_probability) * 100).toFixed(1)}%
                        </td>
                        <td className="py-2.5 px-4 font-mono font-semibold whitespace-nowrap">
                          <span
                            className={
                              cust.risk_level === 'HIGH'
                                ? 'text-rose-700'
                                : cust.risk_level === 'MEDIUM'
                                ? 'text-amber-700'
                                : 'text-emerald-700'
                            }
                          >
                            {cust.risk_level}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 whitespace-nowrap">
                          <span
                            className={`font-medium ${
                              cust.prediction === 1 ? 'text-rose-700' : 'text-slate-600'
                            }`}
                          >
                            {cust.prediction === 1 ? 'Churn (1)' : 'No Churn (0)'}
                          </span>
                        </td>
                        <td
                          className="py-2.5 px-4 text-right whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => handleInspectCustomer(cust.customer_id)}
                            className="text-xs font-medium text-indigo-600 hover:text-indigo-800 mr-3"
                          >
                            Inspect
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSimulateCustomer(cust)}
                            className="text-xs font-medium text-slate-600 hover:text-slate-900"
                          >
                            Simulate
                          </button>
                        </td>
                      </tr>
                    ))}

                {!loading && data?.items.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-xs text-slate-500">
                      No customer records match the current search or filter criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {data && data.total_pages > 1 && (
          <div className="px-4 py-3 border-t border-slate-200 bg-slate-50/50 flex items-center justify-between">
            <span className="text-xs font-mono tabular-nums text-slate-500">
              Page {data.page} of {data.total_pages}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={data.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Previous
              </button>
              <button
                type="button"
                disabled={data.page >= data.total_pages}
                onClick={() => setPage((p) => Math.min(data.total_pages, p + 1))}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40"
              >
                Next
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Customer Detail Drawer / Modal */}
      {(selectedCustomer || detailLoading) && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex justify-end">
          <div className="w-full max-w-xl bg-white h-full overflow-y-auto border-l border-slate-200 p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Customer Profile & Attribution Dossier
                </h2>
                {selectedCustomer && (
                  <p className="text-xs font-mono text-slate-500 mt-0.5">
                    Account ID: {selectedCustomer.customer_id}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedCustomer(null)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {detailLoading && !selectedCustomer ? (
              <div className="space-y-4 animate-pulse">
                <div className="h-20 bg-slate-100 rounded-lg" />
                <div className="h-40 bg-slate-100 rounded-lg" />
              </div>
            ) : (
              selectedCustomer && (
                <div className="space-y-6">
                  {/* Top Summary */}
                  <div className="grid grid-cols-3 divide-x divide-slate-200 border border-slate-200 rounded-xl p-4 text-center">
                    <div>
                      <p className="text-xs text-slate-500">Churn Probability</p>
                      <p className="text-xl font-semibold font-mono tabular-nums text-slate-900 mt-1">
                        {(selectedCustomer.churn_probability * 100).toFixed(1)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Risk Level</p>
                      <p
                        className={`text-xl font-semibold font-mono mt-1 ${
                          selectedCustomer.risk_level === 'HIGH'
                            ? 'text-rose-700'
                            : selectedCustomer.risk_level === 'MEDIUM'
                            ? 'text-amber-700'
                            : 'text-emerald-700'
                        }`}
                      >
                        {selectedCustomer.risk_level}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Monthly Spend</p>
                      <p className="text-xl font-semibold font-mono tabular-nums text-slate-900 mt-1">
                        ${Number(selectedCustomer.monthly_charges).toFixed(2)}
                      </p>
                    </div>
                  </div>

                  {/* Account Specifications */}
                  <div>
                    <h3 className="text-xs font-semibold text-slate-900 mb-3">
                      Account & Service Configuration
                    </h3>
                    <div className="grid grid-cols-2 gap-y-2.5 gap-x-6 text-xs border-t border-slate-200 pt-3">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Gender / Senior:</span>
                        <span className="font-medium text-slate-900">
                          {selectedCustomer.gender} · {selectedCustomer.senior_citizen ? 'Senior' : 'Non-Senior'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Partner / Dependents:</span>
                        <span className="font-medium text-slate-900">
                          {selectedCustomer.partner} / {selectedCustomer.dependents}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Tenure:</span>
                        <span className="font-mono tabular-nums font-medium text-slate-900">
                          {selectedCustomer.tenure} months
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Contract:</span>
                        <span className="font-medium text-slate-900">{selectedCustomer.contract}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Internet Service:</span>
                        <span className="font-medium text-slate-900">{selectedCustomer.internet_service}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Tech Support:</span>
                        <span className="font-medium text-slate-900">{selectedCustomer.tech_support}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Online Security:</span>
                        <span className="font-medium text-slate-900">{selectedCustomer.online_security}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Payment Method:</span>
                        <span className="font-medium text-slate-900">{selectedCustomer.payment_method}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Total Charges:</span>
                        <span className="font-mono tabular-nums font-medium text-slate-900">
                          ${Number(selectedCustomer.total_charges).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Paperless Billing:</span>
                        <span className="font-medium text-slate-900">{selectedCustomer.paperless_billing}</span>
                      </div>
                    </div>
                  </div>

                  {/* Feature Contributions */}
                  {selectedCustomer.explanations && selectedCustomer.explanations.length > 0 && (
                    <div className="border-t border-slate-200 pt-4 space-y-3">
                      <h3 className="text-xs font-semibold text-slate-900">
                        Top Contributing Factors (Log-Odds Approximation)
                      </h3>
                      <div className="space-y-2">
                        {selectedCustomer.explanations.slice(0, 5).map((exp, i) => (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <span className="text-slate-700">
                              {exp.feature} <span className="text-slate-400">({exp.value})</span>
                            </span>
                            <span
                              className={`font-mono tabular-nums font-semibold ${
                                exp.direction === 'positive' ? 'text-rose-700' : 'text-emerald-700'
                              }`}
                            >
                              {exp.direction === 'positive' ? '+' : ''}
                              {exp.impact_score.toFixed(3)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recommendations */}
                  {selectedCustomer.recommendations && selectedCustomer.recommendations.length > 0 && (
                    <div className="border-t border-slate-200 pt-4 space-y-2">
                      <h3 className="text-xs font-semibold text-slate-900">
                        Recommended Business Actions
                      </h3>
                      <ul className="space-y-1.5 text-xs text-slate-600">
                        {selectedCustomer.recommendations.map((rec, i) => (
                          <li key={i}>• {rec}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedCustomer(null)}
                      className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const c = selectedCustomer;
                        setSelectedCustomer(null);
                        handleSimulateCustomer(c);
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
                    >
                      Load into What-If Predictor
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
};

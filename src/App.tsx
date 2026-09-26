import React, { useState, useEffect, useCallback } from 'react';
import {
  CustomerInput,
  DashboardAnalyticsResponse,
  ModelType,
} from './types/churn';
import { apiService } from './services/api';
import { DashboardPage } from './pages/DashboardPage';
import { PredictChurnPage } from './pages/PredictChurnPage';
import { CustomersPage } from './pages/CustomersPage';
import { BatchPredictionPage } from './pages/BatchPredictionPage';
import { PredictionHistoryPage } from './pages/PredictionHistoryPage';
import { ModelInsightsPage } from './pages/ModelInsightsPage';
import {
  LayoutDashboard,
  Sliders,
  Users,
  FileSpreadsheet,
  History,
  BarChart3,
  Menu,
  X,
} from 'lucide-react';

type NavPage = 'dashboard' | 'predict' | 'customers' | 'batch' | 'history' | 'insights';

const NAV_ITEMS: Array<{ id: NavPage; label: string; shortLabel: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'dashboard', label: 'Analytics Dashboard', shortLabel: 'Dashboard', icon: LayoutDashboard },
  { id: 'predict', label: 'Predict Churn', shortLabel: 'Predict', icon: Sliders },
  { id: 'customers', label: 'Customer Directory', shortLabel: 'Customers', icon: Users },
  { id: 'batch', label: 'Batch CSV Scoring', shortLabel: 'Batch CSV', icon: FileSpreadsheet },
  { id: 'history', label: 'Prediction History', shortLabel: 'History', icon: History },
  { id: 'insights', label: 'Model Insights', shortLabel: 'Model Insights', icon: BarChart3 },
];

export default function App() {
  const [activePage, setActivePage] = useState<NavPage>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  const [analytics, setAnalytics] = useState<DashboardAnalyticsResponse | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState<boolean>(true);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  const [simulatorCustomer, setSimulatorCustomer] = useState<CustomerInput | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3800);
  };

  const fetchDashboard = useCallback(async () => {
    setLoadingAnalytics(true);
    setAnalyticsError(null);
    try {
      const data = await apiService.getDashboardAnalytics();
      setAnalytics(data);
    } catch (err: any) {
      setAnalyticsError(err?.message || 'Unable to connect to backend API.');
    } finally {
      setLoadingAnalytics(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const handleUpdateConfig = async (config: {
    active_model?: ModelType;
    risk_threshold_low?: number;
    risk_threshold_high?: number;
  }) => {
    const res = await apiService.updateModelConfig(config);
    await fetchDashboard();
    showToast(
      `Updated active model to ${res.active_model_name} (LOW < ${(res.thresholds.low * 100).toFixed(0)}%, HIGH > ${(res.thresholds.high * 100).toFixed(0)}%)`
    );
  };

  const handleSelectCustomerForSimulator = (customer: CustomerInput) => {
    setSimulatorCustomer(customer);
    setActivePage('predict');
    showToast(`Loaded customer ${customer.customer_id} into What-If Predictor`);
  };

  const activeModel: ModelType = analytics?.kpis.active_model || 'logistic_regression';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-6 h-14 flex items-center justify-between">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#dashboard"
          onClick={(e) => {
            e.preventDefault();
            setActivePage('dashboard');
          }}
          className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap"
        >
          RetainIQ ML
        </a>

        {/* Zone 2: Clean text navigation links (max 5 visible on desktop, 6th on xl) */}
        <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-600">
          {NAV_ITEMS.map((item, idx) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActivePage(item.id)}
              className={`${idx >= 5 ? 'hidden xl:inline-block' : ''} py-1 transition-colors whitespace-nowrap ${
                activePage === item.id
                  ? 'text-indigo-600 font-semibold underline underline-offset-8 decoration-2'
                  : 'hover:text-slate-900'
              }`}
            >
              {item.shortLabel}
            </button>
          ))}
        </nav>

        {/* Zone 3: 1-2 Primary Actions */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setActivePage('batch')}
            className="hidden sm:inline-block px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            Batch CSV
          </button>
          <button
            type="button"
            onClick={() => setActivePage('predict')}
            className="px-3.5 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors whitespace-nowrap"
          >
            + New Prediction
          </button>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-1.5 text-slate-600 hover:text-slate-900"
            aria-label="Toggle navigation"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Workspace Body: Left Sidebar + Main Viewport */}
      <div className="flex-1 flex">
        {/* Desktop Sidebar (248px) */}
        <aside className="hidden lg:flex w-62 shrink-0 bg-white border-r border-slate-200 flex-col justify-between p-4">
          <div className="space-y-1">
            <p className="px-3 py-2 text-[11px] font-semibold text-slate-400">
              ML Workbench Navigation
            </p>
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activePage === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActivePage(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-700 font-semibold'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          {/* Quiet Sidebar Model Summary */}
          <div className="p-3.5 border-t border-slate-200 space-y-1.5 text-xs">
            <p className="font-medium text-slate-800">Serialized Pipeline</p>
            <p className="text-slate-500 font-mono text-[11px] truncate">
              {analytics?.kpis.active_model_name || 'Logistic Regression (L2)'}
            </p>
            <p className="text-slate-400 font-mono tabular-nums text-[11px]">
              ROC-AUC: {analytics ? analytics.kpis.model_roc_auc.toFixed(4) : '0.9265'} · Seed: 42
            </p>
          </div>
        </aside>

        {/* Mobile Slide-Down Navigation */}
        {mobileMenuOpen && (
          <div className="fixed inset-x-0 top-14 z-40 bg-white border-b border-slate-200 p-4 lg:hidden space-y-1 shadow-lg">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activePage === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActivePage(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs font-medium rounded-lg ${
                    isActive ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-700'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Main Content Viewport */}
        <main className="flex-1 min-w-0 p-6 lg:p-8 max-w-[1440px] mx-auto w-full">
          {activePage === 'dashboard' && (
            <DashboardPage
              analytics={analytics}
              loading={loadingAnalytics}
              error={analyticsError}
              onRefresh={fetchDashboard}
              onUpdateConfig={handleUpdateConfig}
              onNavigate={(p) => setActivePage(p)}
            />
          )}

          {activePage === 'predict' && (
            <PredictChurnPage
              initialCustomer={simulatorCustomer}
              activeModel={activeModel}
              onPredictionComplete={() => {
                fetchDashboard();
                showToast('Prediction logged to SQLite audit history');
              }}
            />
          )}

          {activePage === 'customers' && (
            <CustomersPage
              onSelectCustomerForSimulator={handleSelectCustomerForSimulator}
            />
          )}

          {activePage === 'batch' && (
            <BatchPredictionPage
              activeModel={activeModel}
              onBatchComplete={() => {
                fetchDashboard();
                showToast('Batch CSV predictions completed and logged');
              }}
            />
          )}

          {activePage === 'history' && <PredictionHistoryPage />}

          {activePage === 'insights' && (
            <ModelInsightsPage
              onModelActivated={(model) => {
                fetchDashboard();
                showToast(`Switched production model to ${model.replace(/_/g, ' ')}`);
              }}
            />
          )}
        </main>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-lg shadow-lg text-xs font-medium flex items-center gap-3">
          <span>{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-slate-400 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

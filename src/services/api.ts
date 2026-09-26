import {
  BatchPredictionResponse,
  CustomerInput,
  CustomerRecord,
  DashboardAnalyticsResponse,
  FeatureImportanceResponse,
  ModelInsightsResponse,
  ModelType,
  PaginatedCustomersResponse,
  PredictionHistoryItem,
  PredictionResult,
} from '../types/churn';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    let errorDetail = `HTTP ${response.status}: ${response.statusText}`;
    try {
      const errBody = await response.json();
      if (errBody?.detail) {
        errorDetail = Array.isArray(errBody.detail)
          ? errBody.detail.map((e: any) => e.msg || JSON.stringify(e)).join('; ')
          : String(errBody.detail);
      }
    } catch {
      // Ignore JSON parse error on fallback
    }
    throw new Error(errorDetail);
  }

  return response.json() as Promise<T>;
}

export const apiService = {
  checkHealth(): Promise<{
    status: string;
    active_model: ModelType;
    models_available: ModelType[];
    thresholds: { low: number; high: number };
  }> {
    return requestJson(`${API_BASE}/health`);
  },

  getDashboardAnalytics(): Promise<DashboardAnalyticsResponse> {
    return requestJson(`${API_BASE}/analytics`);
  },

  predictSingle(payload: CustomerInput, model?: ModelType): Promise<PredictionResult> {
    const query = model ? `?model=${encodeURIComponent(model)}` : '';
    return requestJson(`${API_BASE}/predict${query}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async predictBatchCsv(file: File, model?: ModelType): Promise<BatchPredictionResponse> {
    const query = model ? `?model=${encodeURIComponent(model)}` : '';
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/predict/batch${query}`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      let errorDetail = `Batch Upload Error (${response.status})`;
      try {
        const errBody = await response.json();
        if (errBody?.detail) errorDetail = String(errBody.detail);
      } catch {
        // Fallback
      }
      throw new Error(errorDetail);
    }

    return response.json() as Promise<BatchPredictionResponse>;
  },

  getCustomers(params: {
    page?: number;
    page_size?: number;
    search?: string;
    risk_level?: string;
    contract?: string;
    prediction?: string;
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
  }): Promise<PaginatedCustomersResponse> {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v) !== '') {
        searchParams.set(k, String(v));
      }
    });
    return requestJson(`${API_BASE}/customers?${searchParams.toString()}`);
  },

  getCustomerById(customerId: string): Promise<CustomerRecord> {
    return requestJson(`${API_BASE}/customers/${encodeURIComponent(customerId)}`);
  },

  getPredictionHistory(params: {
    risk_level?: string;
    prediction?: string;
    source?: string;
    date_from?: string;
    search?: string;
    limit?: number;
  }): Promise<{ items: PredictionHistoryItem[]; total: number }> {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v) !== '') {
        searchParams.set(k, String(v));
      }
    });
    return requestJson(`${API_BASE}/predictions?${searchParams.toString()}`);
  },

  getModelMetrics(model?: ModelType): Promise<ModelInsightsResponse> {
    const query = model ? `?model=${encodeURIComponent(model)}` : '';
    return requestJson(`${API_BASE}/model/metrics${query}`);
  },

  getFeatureImportance(model?: ModelType): Promise<FeatureImportanceResponse> {
    const query = model ? `?model=${encodeURIComponent(model)}` : '';
    return requestJson(`${API_BASE}/model/feature-importance${query}`);
  },

  updateModelConfig(config: {
    active_model?: ModelType;
    risk_threshold_low?: number;
    risk_threshold_high?: number;
  }): Promise<{
    active_model: ModelType;
    active_model_name: string;
    thresholds: { low: number; high: number };
  }> {
    return requestJson(`${API_BASE}/model/config`, {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  },
};

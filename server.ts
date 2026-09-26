import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { execFileSync } from 'child_process';
import { DatabaseSync } from 'node:sqlite';
import { createServer as createViteServer } from 'vite';

const ROOT_DIR = process.cwd();
const DB_PATH = path.join(ROOT_DIR, 'backend', 'data', 'churn.db');
const ARTIFACTS_PATH = path.join(ROOT_DIR, 'backend', 'models', 'model_artifacts.json');
const DATASET_PATH = path.join(ROOT_DIR, 'backend', 'data', 'customer_data.csv');

// Ensure ML pipeline artifacts and SQLite DB exist on startup
function ensurePipelineInitialized() {
  if (!fs.existsSync(ARTIFACTS_PATH)) {
    console.log('[Startup] Training ML models via ml/train.py...');
    execFileSync('python3', [path.join(ROOT_DIR, 'ml', 'train.py')], { stdio: 'inherit' });
  }
  if (!fs.existsSync(DB_PATH)) {
    console.log('[Startup] Seeding SQLite database via backend/app/services/customer_service.py...');
    execFileSync(
      'python3',
      [
        '-c',
        "import sys; sys.path.insert(0, '.'); from backend.app.services.customer_service import init_and_seed_database; init_and_seed_database()",
      ],
      { stdio: 'inherit' }
    );
  }
}

ensurePipelineInitialized();

// Load serialized model artifacts produced by ml/train.py
let modelBundle = JSON.parse(fs.readFileSync(ARTIFACTS_PATH, 'utf-8'));
let activeModelKey: string = process.env.DEFAULT_MODEL_TYPE || modelBundle.active_model || 'logistic_regression';
let riskThresholdLow: number = parseFloat(process.env.RISK_THRESHOLD_LOW || '0.30');
let riskThresholdHigh: number = parseFloat(process.env.RISK_THRESHOLD_HIGH || '0.70');

const db = new DatabaseSync(DB_PATH);

// Mathematical helpers matching backend/app/ml/model.py & preprocessing.py
const NUMERIC_FEATURES = ['tenure', 'MonthlyCharges', 'TotalCharges'];
const ADDON_SERVICE_COLS = [
  'OnlineSecurity',
  'OnlineBackup',
  'DeviceProtection',
  'TechSupport',
  'StreamingTV',
  'StreamingMovies',
];

const VALID_CATEGORIES: Record<string, Set<string>> = {
  gender: new Set(['Male', 'Female']),
  partner: new Set(['Yes', 'No']),
  dependents: new Set(['Yes', 'No']),
  phone_service: new Set(['Yes', 'No']),
  multiple_lines: new Set(['Yes', 'No', 'No phone service']),
  internet_service: new Set(['DSL', 'Fiber optic', 'No']),
  online_security: new Set(['Yes', 'No', 'No internet service']),
  online_backup: new Set(['Yes', 'No', 'No internet service']),
  device_protection: new Set(['Yes', 'No', 'No internet service']),
  tech_support: new Set(['Yes', 'No', 'No internet service']),
  streaming_tv: new Set(['Yes', 'No', 'No internet service']),
  streaming_movies: new Set(['Yes', 'No', 'No internet service']),
  contract: new Set(['Month-to-month', 'One year', 'Two year']),
  paperless_billing: new Set(['Yes', 'No']),
  payment_method: new Set([
    'Electronic check',
    'Mailed check',
    'Bank transfer (automatic)',
    'Credit card (automatic)',
  ]),
};

function sigmoid(z: number): number {
  if (z >= 0) {
    return 1.0 / (1.0 + Math.exp(-Math.min(z, 40.0)));
  }
  const ez = Math.exp(Math.max(z, -40.0));
  return ez / (1.0 + ez);
}

interface TreeNode {
  leaf: boolean;
  val?: number;
  feat?: number;
  thresh?: number;
  left?: TreeNode;
  right?: TreeNode;
}

function evalTree(tree: TreeNode, xi: number[]): number {
  let node = tree;
  while (!node.leaf) {
    const fIdx = node.feat ?? 0;
    const thresh = node.thresh ?? 0;
    node = xi[fIdx] <= thresh ? (node.left as TreeNode) : (node.right as TreeNode);
  }
  return Number(node.val ?? 0);
}

function getVal(raw: Record<string, any>, keys: string[], fallback: any = null): any {
  for (const k of keys) {
    if (raw[k] !== undefined && raw[k] !== null && String(raw[k]).trim() !== '') {
      return raw[k];
    }
  }
  return fallback;
}

function normalizeCustomerInput(raw: Record<string, any>) {
  const tenureRaw = getVal(raw, ['tenure', 'Tenure'], 0);
  const tenureParsed = parseInt(String(tenureRaw), 10);
  const tenure = Number.isNaN(tenureParsed) ? 0 : Math.max(0, tenureParsed);

  const mcRaw = getVal(raw, ['MonthlyCharges', 'monthly_charges'], 50.0);
  const mcParsed = parseFloat(String(mcRaw));
  const monthlyCharges = Number.isNaN(mcParsed) ? 50.0 : Math.max(0, mcParsed);

  const tcRaw = raw.TotalCharges ?? raw.total_charges ?? null;
  let totalCharges: number;
  let totalChargesImputed = false;
  if (tcRaw === null || tcRaw === undefined || String(tcRaw).trim() === '' || String(tcRaw).trim().toLowerCase() === 'nan') {
    totalCharges = Number((tenure * monthlyCharges).toFixed(2));
    totalChargesImputed = true;
  } else {
    const tcParsed = parseFloat(String(tcRaw).trim());
    if (Number.isNaN(tcParsed) || tcParsed < 0) {
      totalCharges = Number((tenure * monthlyCharges).toFixed(2));
      totalChargesImputed = true;
    } else {
      totalCharges = Number(tcParsed.toFixed(2));
    }
  }

  const seniorRaw = getVal(raw, ['SeniorCitizen', 'senior_citizen'], 0);
  const seniorCitizen =
    typeof seniorRaw === 'string'
      ? ['1', 'yes', 'true'].includes(seniorRaw.trim().toLowerCase())
        ? 1
        : 0
      : Number(seniorRaw) === 1
      ? 1
      : 0;

  const phoneService = String(getVal(raw, ['PhoneService', 'phone_service'], 'Yes')).trim();
  let multipleLines = String(
    getVal(raw, ['MultipleLines', 'multiple_lines'], phoneService === 'Yes' ? 'No' : 'No phone service')
  ).trim();
  if (phoneService === 'No') multipleLines = 'No phone service';

  const internetService = String(getVal(raw, ['InternetService', 'internet_service'], 'Fiber optic')).trim();
  const defaultAddon = internetService === 'No' ? 'No internet service' : 'No';

  let onlineSecurity = String(getVal(raw, ['OnlineSecurity', 'online_security'], defaultAddon)).trim();
  let onlineBackup = String(getVal(raw, ['OnlineBackup', 'online_backup'], defaultAddon)).trim();
  let deviceProtection = String(getVal(raw, ['DeviceProtection', 'device_protection'], defaultAddon)).trim();
  let techSupport = String(getVal(raw, ['TechSupport', 'tech_support'], defaultAddon)).trim();
  let streamingTV = String(getVal(raw, ['StreamingTV', 'streaming_tv'], defaultAddon)).trim();
  let streamingMovies = String(getVal(raw, ['StreamingMovies', 'streaming_movies'], defaultAddon)).trim();

  if (internetService === 'No') {
    onlineSecurity = 'No internet service';
    onlineBackup = 'No internet service';
    deviceProtection = 'No internet service';
    techSupport = 'No internet service';
    streamingTV = 'No internet service';
    streamingMovies = 'No internet service';
  }

  return {
    customerID: String(getVal(raw, ['customerID', 'customer_id'], 'CUST-0000')).trim(),
    gender: String(getVal(raw, ['gender', 'Gender'], 'Female')).trim(),
    SeniorCitizen: seniorCitizen,
    Partner: String(getVal(raw, ['Partner', 'partner'], 'No')).trim(),
    Dependents: String(getVal(raw, ['Dependents', 'dependents'], 'No')).trim(),
    tenure,
    PhoneService: phoneService,
    MultipleLines: multipleLines,
    InternetService: internetService,
    OnlineSecurity: onlineSecurity,
    OnlineBackup: onlineBackup,
    DeviceProtection: deviceProtection,
    TechSupport: techSupport,
    StreamingTV: streamingTV,
    StreamingMovies: streamingMovies,
    Contract: String(getVal(raw, ['Contract', 'contract'], 'Month-to-month')).trim(),
    PaperlessBilling: String(getVal(raw, ['PaperlessBilling', 'paperless_billing'], 'Yes')).trim(),
    PaymentMethod: String(getVal(raw, ['PaymentMethod', 'payment_method'], 'Electronic check')).trim(),
    MonthlyCharges: Number(monthlyCharges.toFixed(2)),
    TotalCharges: Number(totalCharges.toFixed(2)),
    _total_charges_imputed: totalChargesImputed,
  };
}

function validateCustomerPayload(payload: Record<string, any>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  const tenure = payload.tenure ?? payload.Tenure;
  if (tenure === undefined || tenure === null || String(tenure).trim() === '') {
    errors.push("Field 'tenure' is required.");
  } else {
    const tVal = Number(tenure);
    if (Number.isNaN(tVal) || tVal < 0 || tVal > 120) {
      errors.push("Field 'tenure' must be a number between 0 and 120 months.");
    }
  }

  const mc = payload.monthly_charges ?? payload.MonthlyCharges;
  if (mc === undefined || mc === null || String(mc).trim() === '') {
    errors.push("Field 'monthly_charges' is required.");
  } else {
    const mcVal = Number(mc);
    if (Number.isNaN(mcVal) || mcVal < 0 || mcVal > 1000) {
      errors.push("Field 'monthly_charges' must be between $0 and $1,000.");
    }
  }

  const tc = payload.total_charges ?? payload.TotalCharges;
  if (tc !== undefined && tc !== null && String(tc).trim() !== '') {
    const tcVal = Number(tc);
    if (Number.isNaN(tcVal) || tcVal < 0 || tcVal > 150000) {
      errors.push("Field 'total_charges' must be a valid non-negative number.");
    }
  }

  const fieldAliases: Record<string, string[]> = {
    gender: ['gender', 'Gender'],
    partner: ['partner', 'Partner'],
    dependents: ['dependents', 'Dependents'],
    phone_service: ['phone_service', 'PhoneService'],
    multiple_lines: ['multiple_lines', 'MultipleLines'],
    internet_service: ['internet_service', 'InternetService'],
    online_security: ['online_security', 'OnlineSecurity'],
    online_backup: ['online_backup', 'OnlineBackup'],
    device_protection: ['device_protection', 'DeviceProtection'],
    tech_support: ['tech_support', 'TechSupport'],
    streaming_tv: ['streaming_tv', 'StreamingTV'],
    streaming_movies: ['streaming_movies', 'StreamingMovies'],
    contract: ['contract', 'Contract'],
    paperless_billing: ['paperless_billing', 'PaperlessBilling'],
    payment_method: ['payment_method', 'PaymentMethod'],
  };

  for (const [canonicalKey, aliases] of Object.entries(fieldAliases)) {
    let val: string | null = null;
    for (const a of aliases) {
      if (payload[a] !== undefined && payload[a] !== null && String(payload[a]).trim() !== '') {
        val = String(payload[a]).trim();
        break;
      }
    }
    if (val !== null && !VALID_CATEGORIES[canonicalKey].has(val)) {
      errors.push(
        `Invalid value '${val}' for '${canonicalKey}'. Allowed: [${Array.from(VALID_CATEGORIES[canonicalKey]).join(', ')}]`
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

function transformSingleRecord(norm: ReturnType<typeof normalizeCustomerInput>): number[] {
  const prep = modelBundle.preprocessor;
  const vec: number[] = [];

  for (const col of NUMERIC_FEATURES) {
    const val = Number((norm as any)[col]);
    const mean = prep.numeric_means[col];
    const std = prep.numeric_stds[col];
    vec.push((val - mean) / std);
  }

  vec.push(Number(norm.SeniorCitizen));

  const ratio = norm.MonthlyCharges / (norm.tenure + 1.0);
  vec.push((ratio - prep.numeric_means.charge_to_tenure_ratio) / prep.numeric_stds.charge_to_tenure_ratio);

  const addonCnt = ADDON_SERVICE_COLS.reduce((acc, c) => acc + ((norm as any)[c] === 'Yes' ? 1 : 0), 0);
  vec.push((addonCnt - prep.numeric_means.active_addon_count) / prep.numeric_stds.active_addon_count);

  const schema: Record<string, string[]> = prep.categorical_schema;
  for (const [col, categories] of Object.entries(schema)) {
    const valStr = String((norm as any)[col] ?? '');
    for (const cat of categories) {
      vec.push(valStr === cat ? 1.0 : 0.0);
    }
  }

  return vec;
}

function classifyRisk(probability: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (probability < riskThresholdLow) return 'LOW';
  if (probability <= riskThresholdHigh) return 'MEDIUM';
  return 'HIGH';
}

function predictCustomer(rawPayload: Record<string, any>, modelOverride?: string) {
  const modelKey =
    modelOverride && modelBundle.models[modelOverride] ? modelOverride : activeModelKey;
  const modelData = modelBundle.models[modelKey];
  const norm = normalizeCustomerInput(rawPayload);
  const xVec = transformSingleRecord(norm);

  let prob = 0.5;
  if (modelKey === 'logistic_regression') {
    let z = Number(modelData.bias);
    const weights: number[] = modelData.weights;
    for (let i = 0; i < weights.length; i++) {
      z += weights[i] * xVec[i];
    }
    prob = Number(sigmoid(z).toFixed(4));
  } else if (modelKey === 'random_forest') {
    const trees: TreeNode[] = modelData.trees;
    const sumP = trees.reduce((acc, t) => acc + evalTree(t, xVec), 0);
    const avgP = sumP / Math.max(1, trees.length);
    prob = Number(Math.max(0.01, Math.min(0.99, avgP)).toFixed(4));
  } else {
    let score = Number(modelData.init_log_odds);
    const lr = Number(modelData.learning_rate);
    const trees: TreeNode[] = modelData.trees;
    for (const t of trees) {
      score += lr * 3.8 * evalTree(t, xVec);
    }
    prob = Number(sigmoid(score).toFixed(4));
  }

  const prediction = prob >= 0.5 ? 1 : 0;
  const riskLevel = classifyRisk(prob);
  const predictionLabel =
    riskLevel === 'HIGH'
      ? 'High Churn Risk'
      : riskLevel === 'MEDIUM'
      ? 'Moderate Churn Risk'
      : 'Low Churn Risk';

  // Local feature attribution using standardized log-odds contributions
  const featureNames: string[] = modelBundle.preprocessor.feature_names;
  const lrWeights: number[] = modelBundle.models.logistic_regression.weights;
  const humanLabels: Record<string, string> = modelBundle.human_feature_labels || {};

  const contributions: Array<{
    feature: string;
    feature_key: string;
    value: string;
    impact_score: number;
    direction: 'positive' | 'negative';
    summary: string;
  }> = [];

  for (let idx = 0; idx < featureNames.length; idx++) {
    const fname = featureNames[idx];
    const val = xVec[idx];
    const weight = lrWeights[idx];

    if (fname.includes('_') && !fname.startsWith('charge_') && !fname.startsWith('active_')) {
      if (Math.abs(val) < 1e-5) continue;
    }
    const contrib = weight * val;
    if (Math.abs(contrib) < 0.04) continue;

    const direction: 'positive' | 'negative' = contrib > 0 ? 'positive' : 'negative';
    const label = humanLabels[fname] || fname.replace(/_/g, ' ');

    let dispVal = 'Active';
    if (fname === 'tenure') dispVal = `${norm.tenure} months`;
    else if (fname === 'MonthlyCharges') dispVal = `$${norm.MonthlyCharges.toFixed(2)}/mo`;
    else if (fname === 'TotalCharges') dispVal = `$${norm.TotalCharges.toFixed(2)}`;
    else if (fname === 'charge_to_tenure_ratio') {
      const r = norm.MonthlyCharges / (norm.tenure + 1);
      dispVal = `$${r.toFixed(2)}/mo per tenure month`;
    } else if (fname === 'active_addon_count') {
      const cnt = ADDON_SERVICE_COLS.reduce((a, c) => a + ((norm as any)[c] === 'Yes' ? 1 : 0), 0);
      dispVal = `${cnt} active services`;
    } else if (fname === 'SeniorCitizen') {
      if (norm.SeniorCitizen === 0) continue;
      dispVal = 'Yes';
    } else {
      const parts = fname.split('_');
      dispVal = parts.slice(1).join('_') || 'Active';
    }

    const verb = direction === 'positive' ? 'elevates churn log-odds' : 'stabilizes retention log-odds';
    contributions.push({
      feature: label,
      feature_key: fname,
      value: dispVal,
      impact_score: Number(contrib.toFixed(4)),
      direction,
      summary: `${label} (${dispVal}) ${verb} by ${contrib >= 0 ? '+' : ''}${contrib.toFixed(3)}`,
    });
  }

  contributions.sort((a, b) => Math.abs(b.impact_score) - Math.abs(a.impact_score));
  const topExplanations = contributions.slice(0, 8);

  const positiveFactors = topExplanations
    .filter((c) => c.direction === 'positive')
    .slice(0, 4)
    .map((c) => `${c.feature} (${c.value})`);
  const negativeFactors = topExplanations
    .filter((c) => c.direction === 'negative')
    .slice(0, 4)
    .map((c) => `${c.feature} (${c.value})`);

  const recommendations: string[] = [];
  if (norm.Contract === 'Month-to-month') {
    recommendations.push(
      'Offer an incentivized 12-month or 24-month contract migration with a 10–15% loyalty rate lock.'
    );
  }
  if (norm.InternetService === 'Fiber optic' && norm.TechSupport === 'No') {
    recommendations.push(
      'Bundle complimentary 90-day priority Technical Support and Online Security to reduce service friction.'
    );
  }
  if (norm.MonthlyCharges >= 75.0) {
    recommendations.push(
      'Conduct a personalized plan optimization audit to align monthly billing tier with usage.'
    );
  }
  if (norm.tenure <= 12) {
    recommendations.push(
      'Enroll account in the Early-Tenure Onboarding Touchpoint sequence (30/60/90-day check-ins).'
    );
  }
  if (norm.PaymentMethod === 'Electronic check') {
    recommendations.push(
      'Offer a $5/month autopay bill credit for switching from Electronic Check to automatic bank or card billing.'
    );
  }
  if (recommendations.length === 0) {
    recommendations.push(
      'Maintain standard quarterly account health review and loyalty reward eligibility.'
    );
  }

  return {
    customer_id: norm.customerID,
    prediction,
    prediction_label: predictionLabel,
    churn_probability: prob,
    risk_level: riskLevel,
    model_used: modelKey,
    threshold_config: {
      low_max: riskThresholdLow,
      high_min: riskThresholdHigh,
      classification_cutoff: 0.5,
    },
    explanations: topExplanations,
    positive_factors: positiveFactors,
    negative_factors: negativeFactors,
    recommendations,
    disclaimer:
      'Feature contributions represent standardized log-odds approximations from the trained model rather than exact causal effects. Recommended actions are decision-support heuristics and do not guarantee customer retention.',
    timestamp: new Date().toISOString(),
    normalized_customer: norm,
  };
}

// Simple RFC-4180 CSV parser supporting quoted fields
function parseCsvText(csvText: string): Array<Record<string, string>> {
  const lines = csvText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  };

  const headers = parseLine(lines[0].replace(/^\uFEFF/, ''));
  const records: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseLine(lines[i]);
    if (vals.length === 1 && vals[0] === '') continue;
    const rowObj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rowObj[h] = vals[idx] ?? '';
    });
    records.push(rowObj);
  }
  return records;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
  });

  // 1. Health Endpoint
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      active_model: activeModelKey,
      models_available: Object.keys(modelBundle.models),
      thresholds: { low: riskThresholdLow, high: riskThresholdHigh },
    });
  });

  // 2. Single Prediction Endpoint
  app.post('/api/predict', (req: Request, res: Response) => {
    try {
      const payload = req.body || {};
      const modelOverride = typeof req.query.model === 'string' ? req.query.model : undefined;
      const { valid, errors } = validateCustomerPayload(payload);
      if (!valid) {
        res.status(422).json({ detail: errors.join(' ') });
        return;
      }

      const result = predictCustomer(payload, modelOverride);
      const norm = result.normalized_customer;

      const insertStmt = db.prepare(`
        INSERT INTO predictions (
          customer_id, probability, prediction, risk_level, model_used,
          source, explanations_json, recommendations_json, customer_snapshot_json, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      insertStmt.run(
        result.customer_id,
        result.churn_probability,
        result.prediction,
        result.risk_level,
        result.model_used,
        'single',
        JSON.stringify(result.explanations),
        JSON.stringify(result.recommendations),
        JSON.stringify(norm),
        result.timestamp
      );

      const { normalized_customer, ...responsePayload } = result;
      res.json(responsePayload);
    } catch (err: any) {
      res.status(500).json({ detail: err?.message || 'Prediction execution failed.' });
    }
  });

  // 3. Batch Prediction Endpoint (accepts multipart CSV file OR JSON rows)
  app.post('/api/predict/batch', upload.single('file'), (req: Request, res: Response) => {
    try {
      const modelOverride = typeof req.query.model === 'string' ? req.query.model : undefined;
      let rows: Array<Record<string, any>> = [];

      if (req.file) {
        if (!req.file.originalname.toLowerCase().endsWith('.csv')) {
          res.status(400).json({ detail: 'Invalid file format. Please upload a valid .csv file.' });
          return;
        }
        const csvText = req.file.buffer.toString('utf-8');
        rows = parseCsvText(csvText);
      } else if (Array.isArray(req.body?.rows)) {
        rows = req.body.rows;
      } else {
        res.status(400).json({ detail: 'Please provide a CSV file upload or rows array.' });
        return;
      }

      if (rows.length === 0) {
        res.status(422).json({ detail: 'Uploaded CSV contains zero customer records.' });
        return;
      }
      if (rows.length > 2000) {
        res.status(422).json({ detail: 'Batch prediction is limited to 2,000 rows per upload.' });
        return;
      }

      // Validate column presence on first row
      const firstRowKeys = Object.keys(rows[0]).map((k) => k.toLowerCase().replace(/_/g, ''));
      const requiredKeys = ['gender', 'tenure', 'contract', 'monthlycharges', 'internetservice'];
      const missingCols = requiredKeys.filter((rk) => !firstRowKeys.includes(rk));
      if (missingCols.length > 0) {
        res.status(422).json({
          detail: `CSV is missing required Telco schema columns: ${missingCols.join(', ')}`,
        });
        return;
      }

      const rowErrors: string[] = [];
      for (let i = 0; i < rows.length; i++) {
        const v = validateCustomerPayload(rows[i]);
        if (!v.valid) {
          rowErrors.push(`Row ${i + 1}: ${v.errors.join('; ')}`);
          if (rowErrors.length >= 8) break;
        }
      }
      if (rowErrors.length > 0) {
        res.status(422).json({ detail: rowErrors.join(' | ') });
        return;
      }

      let highCnt = 0;
      let medCnt = 0;
      let lowCnt = 0;
      let churnCnt = 0;
      let probSum = 0;

      const insertStmt = db.prepare(`
        INSERT INTO predictions (
          customer_id, probability, prediction, risk_level, model_used,
          source, explanations_json, recommendations_json, customer_snapshot_json, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const results = rows.map((row, idx) => {
        if (!row.customerID && !row.customer_id) {
          row.customer_id = `BATCH-${String(idx + 1).padStart(4, '0')}`;
        }
        const pred = predictCustomer(row, modelOverride);
        const norm = pred.normalized_customer;

        probSum += pred.churn_probability;
        if (pred.prediction === 1) churnCnt++;
        if (pred.risk_level === 'HIGH') highCnt++;
        else if (pred.risk_level === 'MEDIUM') medCnt++;
        else lowCnt++;

        if (idx < 100) {
          insertStmt.run(
            pred.customer_id,
            pred.churn_probability,
            pred.prediction,
            pred.risk_level,
            pred.model_used,
            'batch',
            JSON.stringify(pred.explanations),
            JSON.stringify(pred.recommendations),
            JSON.stringify(norm),
            pred.timestamp
          );
        }

        return {
          customer_id: pred.customer_id,
          gender: norm.gender,
          tenure: norm.tenure,
          contract: norm.Contract,
          internet_service: norm.InternetService,
          monthly_charges: norm.MonthlyCharges,
          total_charges: norm.TotalCharges,
          churn_probability: pred.churn_probability,
          prediction: pred.prediction,
          prediction_label: pred.prediction_label,
          risk_level: pred.risk_level,
          top_factor:
            pred.positive_factors[0] ||
            pred.negative_factors[0] ||
            'Balanced customer profile',
          recommended_action:
            pred.recommendations[0] || 'Standard account monitoring',
        };
      });

      res.json({
        total_processed: results.length,
        high_risk_count: highCnt,
        medium_risk_count: medCnt,
        low_risk_count: lowCnt,
        predicted_churners: churnCnt,
        average_probability: Number((probSum / Math.max(1, results.length)).toFixed(4)),
        model_used: modelOverride || activeModelKey,
        results,
      });
    } catch (err: any) {
      res.status(500).json({ detail: err?.message || 'Batch prediction failed.' });
    }
  });

  // 4. Prediction History Endpoint
  app.get('/api/predictions', (req: Request, res: Response) => {
    try {
      const riskLevel = typeof req.query.risk_level === 'string' ? req.query.risk_level : '';
      const prediction = typeof req.query.prediction === 'string' ? req.query.prediction : '';
      const source = typeof req.query.source === 'string' ? req.query.source : '';
      const dateFrom = typeof req.query.date_from === 'string' ? req.query.date_from : '';
      const search = typeof req.query.search === 'string' ? req.query.search : '';
      const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit || '100'), 10) || 100));

      const clauses: string[] = [];
      const params: any[] = [];

      if (['LOW', 'MEDIUM', 'HIGH'].includes(riskLevel)) {
        clauses.push('risk_level = ?');
        params.push(riskLevel);
      }
      if (['0', '1'].includes(prediction)) {
        clauses.push('prediction = ?');
        params.push(Number(prediction));
      }
      if (['single', 'batch'].includes(source)) {
        clauses.push('source = ?');
        params.push(source);
      }
      if (dateFrom.trim()) {
        clauses.push('timestamp >= ?');
        params.push(dateFrom.trim());
      }
      if (search.trim()) {
        clauses.push('customer_id LIKE ?');
        params.push(`%${search.trim()}%`);
      }

      const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      const stmt = db.prepare(
        `SELECT * FROM predictions ${whereSql} ORDER BY timestamp DESC, id DESC LIMIT ?`
      );
      const rawRows = stmt.all(...params, limit) as Array<Record<string, any>>;

      const items = rawRows.map((r) => ({
        id: r.id,
        customer_id: r.customer_id,
        probability: r.probability,
        prediction: r.prediction,
        risk_level: r.risk_level,
        model_used: r.model_used,
        source: r.source,
        timestamp: r.timestamp,
        explanations: JSON.parse(r.explanations_json || '[]'),
        recommendations: JSON.parse(r.recommendations_json || '[]'),
        customer_snapshot: JSON.parse(r.customer_snapshot_json || '{}'),
      }));

      res.json({ items, total: items.length });
    } catch (err: any) {
      res.status(500).json({ detail: err?.message || 'Failed to query prediction history.' });
    }
  });

  // 5. Customers List Endpoint (with search, filter, sort, pagination)
  app.get('/api/customers', (req: Request, res: Response) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
      const pageSize = Math.min(100, Math.max(5, parseInt(String(req.query.page_size || '15'), 10) || 15));
      const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
      const riskLevel = typeof req.query.risk_level === 'string' ? req.query.risk_level : '';
      const contract = typeof req.query.contract === 'string' ? req.query.contract : '';
      const prediction = typeof req.query.prediction === 'string' ? req.query.prediction : '';
      const sortBy = typeof req.query.sort_by === 'string' ? req.query.sort_by : 'churn_probability';
      const sortOrder = typeof req.query.sort_order === 'string' && req.query.sort_order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

      const clauses: string[] = [];
      const params: any[] = [];

      if (search) {
        const q = `%${search}%`;
        clauses.push('(customer_id LIKE ? OR contract LIKE ? OR internet_service LIKE ? OR payment_method LIKE ?)');
        params.push(q, q, q, q);
      }
      if (['LOW', 'MEDIUM', 'HIGH'].includes(riskLevel)) {
        clauses.push('risk_level = ?');
        params.push(riskLevel);
      }
      if (['Month-to-month', 'One year', 'Two year'].includes(contract)) {
        clauses.push('contract = ?');
        params.push(contract);
      }
      if (['0', '1'].includes(prediction)) {
        clauses.push('prediction = ?');
        params.push(Number(prediction));
      }

      const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      const allowedSort: Record<string, string> = {
        customer_id: 'customer_id',
        tenure: 'tenure',
        contract: 'contract',
        monthly_charges: 'monthly_charges',
        total_charges: 'total_charges',
        churn_probability: 'churn_probability',
        risk_level: 'churn_probability',
      };
      const sortCol = allowedSort[sortBy] || 'churn_probability';

      const countStmt = db.prepare(`SELECT COUNT(*) as total FROM customers ${whereSql}`);
      const countRes = countStmt.get(...params) as { total: number };
      const total = Number(countRes?.total || 0);

      const offset = (page - 1) * pageSize;
      const dataStmt = db.prepare(
        `SELECT * FROM customers ${whereSql} ORDER BY ${sortCol} ${sortOrder} LIMIT ? OFFSET ?`
      );
      const items = dataStmt.all(...params, pageSize, offset);

      res.json({
        items,
        total,
        page,
        page_size: pageSize,
        total_pages: Math.max(1, Math.ceil(total / pageSize)),
      });
    } catch (err: any) {
      res.status(500).json({ detail: err?.message || 'Failed to load customers.' });
    }
  });

  // 6. Single Customer Detail Endpoint
  app.get('/api/customers/:customerId', (req: Request, res: Response) => {
    try {
      const stmt = db.prepare('SELECT * FROM customers WHERE customer_id = ?');
      const cust = stmt.get(req.params.customerId) as Record<string, any> | undefined;
      if (!cust) {
        res.status(404).json({ detail: `Customer '${req.params.customerId}' not found.` });
        return;
      }
      const livePred = predictCustomer(cust);
      res.json({
        ...cust,
        explanations: livePred.explanations,
        positive_factors: livePred.positive_factors,
        negative_factors: livePred.negative_factors,
        recommendations: livePred.recommendations,
      });
    } catch (err: any) {
      res.status(500).json({ detail: err?.message || 'Failed to fetch customer detail.' });
    }
  });

  // 7. Dashboard Analytics Endpoint
  app.get('/api/analytics', (_req: Request, res: Response) => {
    try {
      const summary = db
        .prepare(
          `
          SELECT
            COUNT(*) as total_customers,
            SUM(CASE WHEN prediction = 1 THEN 1 ELSE 0 END) as predicted_churners,
            AVG(churn_probability) as avg_churn_probability,
            SUM(CASE WHEN risk_level = 'HIGH' THEN 1 ELSE 0 END) as high_risk_customers,
            SUM(CASE WHEN risk_level = 'MEDIUM' THEN 1 ELSE 0 END) as medium_risk_customers,
            SUM(CASE WHEN risk_level = 'LOW' THEN 1 ELSE 0 END) as low_risk_customers,
            SUM(CASE WHEN prediction = 1 THEN monthly_charges ELSE 0 END) as monthly_revenue_at_risk
          FROM customers
        `
        )
        .get() as Record<string, any>;

      const totalC = Number(summary.total_customers || 1);
      const predChurn = Number(summary.predicted_churners || 0);
      const predRetain = totalC - predChurn;

      const churnVsNonChurn = [
        {
          name: 'Retained (No Churn)',
          count: predRetain,
          percentage: Number(((predRetain * 100.0) / totalC).toFixed(1)),
        },
        {
          name: 'Predicted Churn',
          count: predChurn,
          percentage: Number(((predChurn * 100.0) / totalC).toFixed(1)),
        },
      ];

      const probs = db.prepare('SELECT churn_probability FROM customers').all() as Array<{
        churn_probability: number;
      }>;
      const buckets = new Array(10).fill(0);
      for (const r of probs) {
        const idx = Math.min(9, Math.max(0, Math.floor(Number(r.churn_probability) * 10)));
        buckets[idx]++;
      }
      const probabilityDistribution = buckets.map((count, i) => ({
        range: `${i * 10}–${(i + 1) * 10}%`,
        count,
        risk_zone:
          (i + 1) * 0.1 <= riskThresholdLow
            ? 'LOW'
            : i * 0.1 >= riskThresholdHigh
            ? 'HIGH'
            : 'MEDIUM',
      }));

      const contractRows = db
        .prepare(
          `
          SELECT
            contract,
            COUNT(*) as total,
            SUM(CASE WHEN prediction = 1 THEN 1 ELSE 0 END) as churners,
            AVG(churn_probability) as avg_prob
          FROM customers
          GROUP BY contract
          ORDER BY avg_prob DESC
        `
        )
        .all() as Array<Record<string, any>>;

      const churnByContract = contractRows.map((r) => ({
        contract: r.contract,
        total: Number(r.total),
        churners: Number(r.churners),
        retained: Number(r.total) - Number(r.churners),
        churn_rate: Number(((Number(r.churners) * 100.0) / Math.max(1, Number(r.total))).toFixed(1)),
        avg_probability: Number((Number(r.avg_prob) * 100.0).toFixed(1)),
      }));

      const tenureRows = db
        .prepare(
          `
          SELECT
            CASE
              WHEN tenure <= 6 THEN '0–6 Months'
              WHEN tenure <= 12 THEN '7–12 Months'
              WHEN tenure <= 24 THEN '13–24 Months'
              WHEN tenure <= 48 THEN '25–48 Months'
              ELSE '49–72 Months'
            END as tenure_cohort,
            COUNT(*) as total,
            SUM(CASE WHEN prediction = 1 THEN 1 ELSE 0 END) as churners,
            AVG(churn_probability) as avg_prob
          FROM customers
          GROUP BY tenure_cohort
        `
        )
        .all() as Array<Record<string, any>>;

      const cohortOrder: Record<string, number> = {
        '0–6 Months': 1,
        '7–12 Months': 2,
        '13–24 Months': 3,
        '25–48 Months': 4,
        '49–72 Months': 5,
      };
      tenureRows.sort((a, b) => (cohortOrder[a.tenure_cohort] || 99) - (cohortOrder[b.tenure_cohort] || 99));

      const churnByTenure = tenureRows.map((r) => ({
        cohort: r.tenure_cohort,
        total: Number(r.total),
        churners: Number(r.churners),
        churn_rate: Number(((Number(r.churners) * 100.0) / Math.max(1, Number(r.total))).toFixed(1)),
        avg_probability: Number((Number(r.avg_prob) * 100.0).toFixed(1)),
      }));

      const chargeRows = db
        .prepare(
          `
          SELECT
            CASE
              WHEN monthly_charges < 35 THEN '$18–$35'
              WHEN monthly_charges < 55 THEN '$35–$55'
              WHEN monthly_charges < 75 THEN '$55–$75'
              WHEN monthly_charges < 95 THEN '$75–$95'
              ELSE '$95–$120'
            END as charge_bracket,
            COUNT(*) as total,
            SUM(CASE WHEN prediction = 1 THEN 1 ELSE 0 END) as churners,
            AVG(churn_probability) as avg_prob
          FROM customers
          GROUP BY charge_bracket
        `
        )
        .all() as Array<Record<string, any>>;

      const bracketOrder: Record<string, number> = {
        '$18–$35': 1,
        '$35–$55': 2,
        '$55–$75': 3,
        '$75–$95': 4,
        '$95–$120': 5,
      };
      chargeRows.sort((a, b) => (bracketOrder[a.charge_bracket] || 99) - (bracketOrder[b.charge_bracket] || 99));

      const churnByMonthlyCharges = chargeRows.map((r) => ({
        bracket: r.charge_bracket,
        total: Number(r.total),
        churners: Number(r.churners),
        retained: Number(r.total) - Number(r.churners),
        churn_rate: Number(((Number(r.churners) * 100.0) / Math.max(1, Number(r.total))).toFixed(1)),
        avg_probability: Number((Number(r.avg_prob) * 100.0).toFixed(1)),
      }));

      const activeModelData = modelBundle.models[activeModelKey];
      const metrics = activeModelData.metrics;

      res.json({
        kpis: {
          total_customers: totalC,
          predicted_churners: predChurn,
          predicted_churn_rate: Number(((predChurn * 100.0) / totalC).toFixed(1)),
          avg_churn_probability: Number(Number(summary.avg_churn_probability || 0).toFixed(4)),
          high_risk_customers: Number(summary.high_risk_customers || 0),
          medium_risk_customers: Number(summary.medium_risk_customers || 0),
          low_risk_customers: Number(summary.low_risk_customers || 0),
          monthly_revenue_at_risk: Number(Number(summary.monthly_revenue_at_risk || 0).toFixed(2)),
          model_accuracy: metrics.accuracy,
          model_roc_auc: metrics.roc_auc,
          active_model: activeModelKey,
          active_model_name: activeModelData.name,
        },
        charts: {
          churn_vs_non_churn: churnVsNonChurn,
          probability_distribution: probabilityDistribution,
          churn_by_contract: churnByContract,
          churn_by_tenure: churnByTenure,
          churn_by_monthly_charges: churnByMonthlyCharges,
        },
        thresholds: {
          low: riskThresholdLow,
          high: riskThresholdHigh,
        },
      });
    } catch (err: any) {
      res.status(500).json({ detail: err?.message || 'Failed to compute dashboard analytics.' });
    }
  });

  // 8. Model Evaluation Metrics Endpoint
  app.get('/api/model/metrics', (req: Request, res: Response) => {
    const requested = typeof req.query.model === 'string' ? req.query.model : undefined;
    const target = requested && modelBundle.models[requested] ? requested : activeModelKey;
    const mInfo = modelBundle.models[target];

    const comparison: Record<string, any> = {};
    for (const [k, v] of Object.entries<any>(modelBundle.models)) {
      comparison[k] = {
        name: v.name,
        type: v.type,
        hyperparameters: v.hyperparameters,
        metrics: v.metrics,
      };
    }

    res.json({
      active_model: activeModelKey,
      selected_model: target,
      model_name: mInfo.name,
      hyperparameters: mInfo.hyperparameters,
      metrics: mInfo.metrics,
      dataset_stats: modelBundle.dataset_stats,
      train_size: modelBundle.train_size,
      test_size: modelBundle.test_size,
      comparison,
      imbalance_explanation:
        "In customer churn datasets where non-churners outnumber churners (e.g., 73% retained vs. 27% churned in standard telecom benchmarks), a naive classifier predicting 'No Churn' for every customer achieves high Accuracy while failing to catch a single churning account (0% Recall). Therefore, ROC-AUC, Recall (Sensitivity), Precision, and F1 Score are prioritized over raw Accuracy to evaluate how effectively the model identifies at-risk customers without overwhelming retention teams with false alarms.",
    });
  });

  // 9. Model Feature Importance Endpoint
  app.get('/api/model/feature-importance', (req: Request, res: Response) => {
    const requested = typeof req.query.model === 'string' ? req.query.model : undefined;
    const target = requested && modelBundle.models[requested] ? requested : activeModelKey;
    const mInfo = modelBundle.models[target];
    res.json({
      model: target,
      model_name: mInfo.name,
      features: mInfo.feature_importance,
    });
  });

  // 10. Model & Risk Threshold Configuration Endpoint
  app.put('/api/model/config', (req: Request, res: Response) => {
    const { active_model, risk_threshold_low, risk_threshold_high } = req.body || {};
    if (active_model) {
      if (!modelBundle.models[active_model]) {
        res.status(400).json({ detail: `Unsupported model type '${active_model}'.` });
        return;
      }
      activeModelKey = active_model;
    }

    const newLow = risk_threshold_low !== undefined ? Number(risk_threshold_low) : riskThresholdLow;
    const newHigh = risk_threshold_high !== undefined ? Number(risk_threshold_high) : riskThresholdHigh;

    if (Number.isNaN(newLow) || Number.isNaN(newHigh) || newLow < 0.05 || newHigh > 0.95 || newLow >= newHigh) {
      res.status(400).json({
        detail: 'Risk thresholds must satisfy 0.05 <= LOW < HIGH <= 0.95.',
      });
      return;
    }

    riskThresholdLow = Number(newLow.toFixed(2));
    riskThresholdHigh = Number(newHigh.toFixed(2));

    // Update customer table risk levels to reflect newly configured thresholds
    db.prepare(
      `
      UPDATE customers
      SET risk_level = CASE
        WHEN churn_probability < ? THEN 'LOW'
        WHEN churn_probability <= ? THEN 'MEDIUM'
        ELSE 'HIGH'
      END
    `
    ).run(riskThresholdLow, riskThresholdHigh);

    res.json({
      active_model: activeModelKey,
      active_model_name: modelBundle.models[activeModelKey].name,
      thresholds: {
        low: riskThresholdLow,
        high: riskThresholdHigh,
      },
    });
  });

  // Mount Vite dev middleware or static production build
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(ROOT_DIR, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`RetainIQ Full-Stack ML Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();

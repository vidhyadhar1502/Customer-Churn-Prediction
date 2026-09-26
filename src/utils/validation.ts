import { CustomerInput } from '../types/churn';

export const CUSTOMER_PRESETS: Record<string, { label: string; description: string; data: CustomerInput }> = {
  high_risk: {
    label: 'High-Risk Fiber Account',
    description: 'Month-to-month contract · 3m tenure · Fiber optic · No Tech Support',
    data: {
      customer_id: 'CUST-8941-HR',
      gender: 'Female',
      senior_citizen: 1,
      partner: 'No',
      dependents: 'No',
      tenure: 3,
      phone_service: 'Yes',
      multiple_lines: 'Yes',
      internet_service: 'Fiber optic',
      online_security: 'No',
      online_backup: 'No',
      device_protection: 'No',
      tech_support: 'No',
      streaming_tv: 'Yes',
      streaming_movies: 'Yes',
      contract: 'Month-to-month',
      paperless_billing: 'Yes',
      payment_method: 'Electronic check',
      monthly_charges: 98.5,
      total_charges: 295.5,
    },
  },
  medium_risk: {
    label: 'Mid-Risk DSL Subscriber',
    description: 'Month-to-month contract · 14m tenure · DSL · Partial add-ons',
    data: {
      customer_id: 'CUST-4420-MR',
      gender: 'Male',
      senior_citizen: 0,
      partner: 'Yes',
      dependents: 'No',
      tenure: 14,
      phone_service: 'Yes',
      multiple_lines: 'No',
      internet_service: 'DSL',
      online_security: 'No',
      online_backup: 'Yes',
      device_protection: 'No',
      tech_support: 'No',
      streaming_tv: 'Yes',
      streaming_movies: 'No',
      contract: 'Month-to-month',
      paperless_billing: 'Yes',
      payment_method: 'Mailed check',
      monthly_charges: 61.25,
      total_charges: 857.5,
    },
  },
  low_risk: {
    label: 'Low-Risk Enterprise / Family Plan',
    description: 'Two-year contract · 56m tenure · Full Security & Tech Support',
    data: {
      customer_id: 'CUST-1098-LR',
      gender: 'Female',
      senior_citizen: 0,
      partner: 'Yes',
      dependents: 'Yes',
      tenure: 56,
      phone_service: 'Yes',
      multiple_lines: 'Yes',
      internet_service: 'DSL',
      online_security: 'Yes',
      online_backup: 'Yes',
      device_protection: 'Yes',
      tech_support: 'Yes',
      streaming_tv: 'No',
      streaming_movies: 'No',
      contract: 'Two year',
      paperless_billing: 'No',
      payment_method: 'Credit card (automatic)',
      monthly_charges: 68.4,
      total_charges: 3830.4,
    },
  },
};

export function validateCustomerForm(input: CustomerInput): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!input.customer_id || input.customer_id.trim().length < 2) {
    errors.customer_id = 'Customer ID is required (minimum 2 characters).';
  }
  if (Number.isNaN(Number(input.tenure)) || input.tenure < 0 || input.tenure > 120) {
    errors.tenure = 'Tenure must be an integer between 0 and 120 months.';
  }
  if (
    Number.isNaN(Number(input.monthly_charges)) ||
    input.monthly_charges < 10 ||
    input.monthly_charges > 500
  ) {
    errors.monthly_charges = 'Monthly charges must be between $10.00 and $500.00.';
  }
  if (
    Number.isNaN(Number(input.total_charges)) ||
    input.total_charges < 0 ||
    input.total_charges > 100000
  ) {
    errors.total_charges = 'Total charges must be between $0.00 and $100,000.00.';
  }

  return errors;
}

export const SAMPLE_BATCH_CSV_CONTENT = `customerID,gender,SeniorCitizen,Partner,Dependents,tenure,PhoneService,MultipleLines,InternetService,OnlineSecurity,OnlineBackup,DeviceProtection,TechSupport,StreamingTV,StreamingMovies,Contract,PaperlessBilling,PaymentMethod,MonthlyCharges,TotalCharges
BATCH-9001,Female,1,No,No,2,Yes,Yes,Fiber optic,No,No,No,No,Yes,Yes,Month-to-month,Yes,Electronic check,96.40,192.80
BATCH-9002,Male,0,Yes,Yes,62,Yes,Yes,DSL,Yes,Yes,Yes,Yes,No,No,Two year,No,Credit card (automatic),67.85,4206.70
BATCH-9003,Female,0,No,No,5,Yes,No,Fiber optic,No,No,No,No,Yes,No,Month-to-month,Yes,Electronic check,81.20,406.00
BATCH-9004,Male,0,Yes,No,24,Yes,No,DSL,Yes,Yes,No,Yes,No,No,One year,No,Bank transfer (automatic),61.50,1476.00
BATCH-9005,Female,1,No,No,1,Yes,No,Fiber optic,No,No,No,No,No,No,Month-to-month,Yes,Electronic check,70.75,70.75
BATCH-9006,Male,0,Yes,Yes,48,Yes,Yes,No,No internet service,No internet service,No internet service,No internet service,No internet service,No internet service,Two year,No,Mailed check,25.10,1204.80
BATCH-9007,Female,0,Yes,No,11,Yes,Yes,Fiber optic,No,Yes,No,No,Yes,Yes,Month-to-month,Yes,Electronic check,99.15,1090.65
BATCH-9008,Male,0,No,No,19,Yes,No,DSL,No,No,Yes,No,No,Yes,One year,Yes,Mailed check,59.90,1138.10
BATCH-9009,Female,1,Yes,No,4,Yes,Yes,Fiber optic,No,No,No,No,Yes,No,Month-to-month,Yes,Electronic check,86.30,345.20
BATCH-9010,Male,0,Yes,Yes,70,Yes,Yes,Fiber optic,Yes,Yes,Yes,Yes,Yes,Yes,Two year,Yes,Bank transfer (automatic),113.65,7955.50
BATCH-9011,Female,0,No,No,8,No,No phone service,DSL,No,No,No,No,Yes,Yes,Month-to-month,Yes,Electronic check,45.20,361.60
BATCH-9012,Male,0,Yes,Yes,37,Yes,No,DSL,Yes,No,Yes,Yes,No,No,One year,No,Credit card (automatic),60.45,2236.65
BATCH-9013,Female,1,No,No,3,Yes,No,Fiber optic,No,No,Yes,No,Yes,Yes,Month-to-month,Yes,Electronic check,94.80,284.40
BATCH-9014,Male,0,No,No,15,Yes,No,No,No internet service,No internet service,No internet service,No internet service,No internet service,No internet service,One year,No,Mailed check,20.05,300.75
BATCH-9015,Female,0,Yes,No,6,Yes,Yes,Fiber optic,No,No,No,No,No,Yes,Month-to-month,Yes,Electronic check,84.90,509.40`;

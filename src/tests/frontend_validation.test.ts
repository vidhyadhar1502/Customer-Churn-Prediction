import { CUSTOMER_PRESETS, validateCustomerForm } from '../utils/validation';

/**
 * Frontend validation and preset integrity test suite.
 */
export function runFrontendValidationTests(): { passed: number; failed: number; details: string[] } {
  const details: string[] = [];
  let passed = 0;
  let failed = 0;

  const assert = (condition: boolean, name: string) => {
    if (condition) {
      passed++;
      details.push(`PASS: ${name}`);
    } else {
      failed++;
      details.push(`FAIL: ${name}`);
    }
  };

  // Test 1: Valid preset passes validation
  const highRiskErrors = validateCustomerForm(CUSTOMER_PRESETS.high_risk.data);
  assert(Object.keys(highRiskErrors).length === 0, 'High-risk preset passes form validation');

  // Test 2: Out-of-range tenure fails validation
  const badTenure = { ...CUSTOMER_PRESETS.low_risk.data, tenure: 180 };
  const tenureErrors = validateCustomerForm(badTenure);
  assert(Boolean(tenureErrors.tenure), 'Out-of-range tenure (>120) triggers validation error');

  // Test 3: Negative monthly charges fail validation
  const badCharges = { ...CUSTOMER_PRESETS.low_risk.data, monthly_charges: -25 };
  const chargeErrors = validateCustomerForm(badCharges);
  assert(Boolean(chargeErrors.monthly_charges), 'Negative monthly charges trigger validation error');

  // Test 4: Empty customer_id fails validation
  const emptyId = { ...CUSTOMER_PRESETS.medium_risk.data, customer_id: ' ' };
  const idErrors = validateCustomerForm(emptyId);
  assert(Boolean(idErrors.customer_id), 'Blank customer_id triggers validation error');

  return { passed, failed, details };
}

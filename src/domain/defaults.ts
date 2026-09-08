import { DEFAULT_AC_LIMIT } from './limits';
import type { CalculatorInput } from './types';

export const DEFAULT_INPUT: CalculatorInput = {
  entityType: 'business',
  prePercent: 50,
  salesPercent: 100,
  businessSharePercent: 100,

  category: 'operating',
  amountMode: 'gross',
  amount: 0,
  vatRatePercent: 23,
  interestNet: 0,

  powertrain: 'emissionHigh',
  limitOverride: null,
  vehicleValue: 0,
  acLimit: DEFAULT_AC_LIMIT,
  insuredValue: 0,
  depreciationRatePercent: 20,
};

export const VAT_RATES = [23, 8, 5, 0];

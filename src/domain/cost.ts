import { limitRatio, statutoryLimit } from './limits';
import { formatRate, round2 } from './money';
import type {
  CalculatorInput,
  CostLine,
  DepreciationInfo,
  LimitInfo,
  VatBreakdown,
} from './types';

/** Część wydatków eksploatacyjnych stanowiąca koszt przy użytku mieszanym. */
export const OPERATING_COST_FACTOR = 0.75;

export interface CostResult {
  costBase: number;
  kup: number;
  nkup: number;
  lines: CostLine[];
  limit: LimitInfo | null;
  depreciation: DepreciationInfo | null;
  legalBasis: string[];
  warnings: string[];
}

function resolveLimit(input: CalculatorInput, vehicleValue: number): LimitInfo {
  const overridden = input.limitOverride !== null;
  const value = overridden ? (input.limitOverride as number) : statutoryLimit(input.powertrain);
  return { value, vehicleValue, ratio: limitRatio(value, vehicleValue), overridden };
}

function operating(vat: VatBreakdown): CostResult {
  const costBase = round2(vat.net + vat.nonDeductible);
  const kup = round2(costBase * OPERATING_COST_FACTOR);
  const nkup = round2(costBase - kup);
  return {
    costBase,
    kup,
    nkup,
    lines: [
      { label: 'Podstawa: netto + VAT niepodlegający odliczeniu', amount: costBase, kind: 'info' },
      { label: 'Koszt uzyskania przychodu — 75% podstawy', amount: kup, kind: 'kup' },
      { label: 'Wyłączone z kosztów — 25% podstawy', amount: nkup, kind: 'nkup' },
    ],
    limit: null,
    depreciation: null,
    legalBasis: [
      'art. 23 ust. 1 pkt 46a ustawy o PIT / art. 16 ust. 1 pkt 51 ustawy o CIT — 25% wydatków eksploatacyjnych nie stanowi kosztu',
      'art. 23 ust. 5a ustawy o PIT / art. 16 ust. 5a ustawy o CIT — podstawa obejmuje VAT niepodlegający odliczeniu',
    ],
    warnings: [],
  };
}

function leasing(input: CalculatorInput, vat: VatBreakdown): CostResult {
  const interestNet = Math.min(round2(input.interestNet), vat.net);
  const capitalNet = round2(vat.net - interestNet);
  // VAT nieodliczony dzielimy proporcjonalnie do części kapitałowej i odsetkowej raty.
  const capitalVat = vat.net > 0 ? round2((vat.nonDeductible * capitalNet) / vat.net) : 0;
  const interestVat = round2(vat.nonDeductible - capitalVat);

  const capitalBase = round2(capitalNet + capitalVat);
  const interestBase = round2(interestNet + interestVat);
  const costBase = round2(capitalBase + interestBase);

  const limit = resolveLimit(input, input.vehicleValue);
  const capitalKup = round2(capitalBase * limit.ratio);
  const capitalNkup = round2(capitalBase - capitalKup);

  const lines: CostLine[] = [
    { label: 'Podstawa: netto + VAT niepodlegający odliczeniu', amount: costBase, kind: 'info' },
    {
      label: 'Część kapitałowa w kosztach',
      amount: capitalKup,
      kind: 'kup',
      note: `proporcja ${formatRate(limit.ratio)} — limit do wartości pojazdu`,
    },
  ];
  if (capitalNkup > 0) {
    lines.push({
      label: 'Część kapitałowa ponad limit',
      amount: capitalNkup,
      kind: 'nkup',
      note: 'nadwyżka wartości pojazdu ponad limit',
    });
  }
  if (interestBase > 0) {
    lines.push({
      label: 'Część odsetkowa w kosztach',
      amount: interestBase,
      kind: 'kup',
      note: 'nie podlega limitowi wartości pojazdu ani regule 75%',
    });
  }

  const warnings: string[] = [];
  if (input.vehicleValue <= 0) {
    warnings.push(
      'Nie podano wartości samochodu z umowy — limit nie został zastosowany, cała część kapitałowa trafiła do kosztów.',
    );
  }
  if (interestNet === 0 && input.interestNet === 0) {
    warnings.push(
      'Nie wskazano części odsetkowej raty — całą ratę potraktowano jako kapitałową, czyli objętą limitem.',
    );
  }

  return {
    costBase,
    kup: round2(capitalKup + interestBase),
    nkup: capitalNkup,
    lines,
    limit,
    depreciation: null,
    legalBasis: [
      'art. 23 ust. 1 pkt 47a ustawy o PIT / art. 16 ust. 1 pkt 49a ustawy o CIT — limit dla opłat leasingowych i najmu',
      'art. 23 ust. 5c ustawy o PIT / art. 16 ust. 5c ustawy o CIT — wartość samochodu obejmuje VAT niepodlegający odliczeniu',
    ],
    warnings,
  };
}

function purchase(input: CalculatorInput, vat: VatBreakdown): CostResult {
  const initialValue = round2(vat.net + vat.nonDeductible);
  const limit = resolveLimit(input, initialValue);
  const rate = input.depreciationRatePercent / 100;

  const annual = round2(initialValue * rate);
  const annualKup = round2(annual * limit.ratio);
  const monthly = round2(annual / 12);
  const monthlyKup = round2(monthly * limit.ratio);

  const depreciation: DepreciationInfo = {
    initialValue,
    ratePercent: input.depreciationRatePercent,
    annual,
    annualKup,
    annualNkup: round2(annual - annualKup),
    monthly,
    monthlyKup,
    monthlyNkup: round2(monthly - monthlyKup),
    lifetimeNkup: round2(initialValue - initialValue * limit.ratio),
  };

  return {
    costBase: initialValue,
    // Sam zakup nie jest kosztem — kosztem są dopiero odpisy amortyzacyjne.
    kup: 0,
    nkup: 0,
    lines: [
      {
        label: 'Wartość początkowa: netto + VAT niepodlegający odliczeniu',
        amount: initialValue,
        kind: 'info',
      },
      {
        label: 'Odpis roczny stanowiący koszt',
        amount: depreciation.annualKup,
        kind: 'kup',
        note: `${input.depreciationRatePercent}% wartości początkowej, proporcja ${formatRate(limit.ratio)}`,
      },
      {
        label: 'Odpis roczny wyłączony z kosztów',
        amount: depreciation.annualNkup,
        kind: 'nkup',
      },
      {
        label: 'Odpis miesięczny stanowiący koszt',
        amount: depreciation.monthlyKup,
        kind: 'kup',
      },
    ],
    limit,
    depreciation,
    legalBasis: [
      'art. 23 ust. 1 pkt 4 ustawy o PIT / art. 16 ust. 1 pkt 4 ustawy o CIT — limit odpisów amortyzacyjnych',
      'art. 22g ust. 3 ustawy o PIT / art. 16g ust. 3 ustawy o CIT — wartość początkowa obejmuje VAT niepodlegający odliczeniu',
    ],
    warnings: [],
  };
}

function insuranceAC(input: CalculatorInput, vat: VatBreakdown): CostResult {
  const costBase = round2(vat.net + vat.nonDeductible);
  const ratio = limitRatio(input.acLimit, input.insuredValue);
  const kup = round2(costBase * ratio);
  const nkup = round2(costBase - kup);

  const warnings: string[] = [];
  if (input.insuredValue <= 0) {
    warnings.push(
      'Nie podano wartości pojazdu przyjętej dla celów ubezpieczenia — limit nie został zastosowany.',
    );
  }

  return {
    costBase,
    kup,
    nkup,
    lines: [
      { label: 'Składka', amount: costBase, kind: 'info' },
      {
        label: 'Składka w kosztach',
        amount: kup,
        kind: 'kup',
        note: `proporcja ${formatRate(ratio)} — limit do wartości ubezpieczenia`,
      },
      { label: 'Składka ponad limit', amount: nkup, kind: 'nkup' },
    ],
    limit: {
      value: input.acLimit,
      vehicleValue: input.insuredValue,
      ratio,
      overridden: input.acLimit !== 150_000,
    },
    depreciation: null,
    legalBasis: [
      'art. 23 ust. 1 pkt 47 ustawy o PIT / art. 16 ust. 1 pkt 49 ustawy o CIT — limit składek na dobrowolne ubezpieczenia majątkowe',
      'art. 43 ust. 1 pkt 37 ustawy o VAT — usługi ubezpieczeniowe zwolnione z VAT',
    ],
    warnings,
  };
}

function insuranceOC(vat: VatBreakdown): CostResult {
  const costBase = round2(vat.net + vat.nonDeductible);
  return {
    costBase,
    kup: costBase,
    nkup: 0,
    lines: [
      { label: 'Składka', amount: costBase, kind: 'info' },
      {
        label: 'Składka w kosztach',
        amount: costBase,
        kind: 'kup',
        note: 'ubezpieczenia obowiązkowe i osobowe nie podlegają limitowi ani regule 75%',
      },
    ],
    limit: null,
    depreciation: null,
    legalBasis: ['art. 43 ust. 1 pkt 37 ustawy o VAT — usługi ubezpieczeniowe zwolnione z VAT'],
    warnings: [],
  };
}

export function calculateCost(input: CalculatorInput, vat: VatBreakdown): CostResult {
  switch (input.category) {
    case 'operating':
      return operating(vat);
    case 'leasing':
      return leasing(input, vat);
    case 'purchase':
      return purchase(input, vat);
    case 'insuranceAC':
      return insuranceAC(input, vat);
    case 'insuranceOC':
      return insuranceOC(vat);
  }
}

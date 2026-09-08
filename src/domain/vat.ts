import { round2 } from './money';
import type { AmountMode, CalculatorInput, VatBreakdown, VatStep } from './types';

/** Ograniczenie odliczenia dla pojazdu używanego do celów mieszanych (art. 86a ust. 1). */
export const MIXED_USE_FACTOR = 0.5;

export function splitAmount(
  mode: AmountMode,
  amount: number,
  vatRatePercent: number,
): { net: number; vat: number; gross: number } {
  const rate = vatRatePercent / 100;
  if (mode === 'net') {
    const net = round2(amount);
    const vat = round2(net * rate);
    return { net, vat, gross: round2(net + vat) };
  }
  const gross = round2(amount);
  const net = round2(gross / (1 + rate));
  return { net, vat: round2(gross - net), gross };
}

/**
 * Wskaźnik odliczenia podatku naliczonego.
 *
 * Zwykły podatnik odlicza 50% (art. 86a ust. 1).
 * Organizacja stosuje kolejno prewspółczynnik (art. 86 ust. 2a), proporcję
 * sprzedaży (art. 90 ust. 2) i dopiero na końcu ograniczenie 50%.
 */
export function deductionRate(input: CalculatorInput): { rate: number; steps: VatStep[] } {
  if (input.entityType === 'business') {
    return {
      rate: MIXED_USE_FACTOR,
      steps: [
        {
          label: 'Użytek mieszany — art. 86a ust. 1',
          detail: '50% podatku naliczonego',
        },
      ],
    };
  }

  const pre = input.prePercent / 100;
  const sales = input.salesPercent / 100;
  const steps: VatStep[] = [
    {
      label: 'Prewspółczynnik — art. 86 ust. 2a',
      detail: `${input.prePercent}% podatku przypada na działalność gospodarczą`,
    },
  ];
  if (input.salesPercent < 100) {
    steps.push({
      label: 'Proporcja sprzedaży — art. 90 ust. 2',
      detail: `${input.salesPercent}% sprzedaży opodatkowanej`,
    });
  }
  steps.push({
    label: 'Użytek mieszany — art. 86a ust. 1',
    detail: '50% podatku pozostałego po powyższych wskaźnikach',
  });

  return { rate: pre * sales * MIXED_USE_FACTOR, steps };
}

export function calculateVat(input: CalculatorInput): VatBreakdown {
  const { net, vat, gross } = splitAmount(input.amountMode, input.amount, input.vatRatePercent);
  const { rate, steps } = deductionRate(input);
  const deductible = round2(vat * rate);
  return {
    net,
    vat,
    gross,
    deductionRate: rate,
    deductible,
    // Reszta z odejmowania, żeby obie części zawsze sumowały się do podatku z faktury.
    nonDeductible: round2(vat - deductible),
    steps: vat > 0 ? steps : [],
  };
}

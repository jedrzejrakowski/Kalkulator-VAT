import { ulamek } from './grosze';
import { round2 } from './money';
import type { AmountMode, CalculatorInput, VatBreakdown, VatStep } from './types';

/** Ograniczenie odliczenia dla pojazdu używanego do celów mieszanych (art. 86a ust. 1). */
export const MIXED_USE_FACTOR = 0.5;

export function splitAmount(
  mode: AmountMode,
  amount: number,
  vatRatePercent: number,
): { net: number; vat: number; gross: number } {
  // Stawkę trzymamy w procentach i dzielimy przez 100 w jednym rachunku z kwotą,
  // zamiast mnożyć przez gotowy ułamek — 0,23 w pamięci nie jest dokładnie 0,23.
  if (mode === 'net') {
    const net = round2(amount);
    const vat = ulamek([net, vatRatePercent], [100]);
    return { net, vat, gross: round2(net + vat) };
  }
  const gross = round2(amount);
  const net = ulamek([gross, 100], [100 + vatRatePercent]);
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

/**
 * Kwota odliczenia liczona z procentów, a nie z gotowego wskaźnika.
 *
 * Wskaźnik organizacji to iloczyn trzech ułamków, w pamięci już niedokładny:
 * 0,73 × 0,88 × 0,5 daje 0,32119999…, a nie 0,3212. Mnożenie podatku przez
 * taki wskaźnik mogło przesunąć kwotę odliczenia o grosz — dlatego podatek,
 * procenty i ograniczenie 50% idą do jednego rachunku.
 */
function deductibleAmount(vat: number, input: CalculatorInput): number {
  if (input.entityType === 'business') return ulamek([vat, MIXED_USE_FACTOR]);
  return ulamek([vat, input.prePercent, input.salesPercent, MIXED_USE_FACTOR], [100, 100]);
}

export function calculateVat(input: CalculatorInput): VatBreakdown {
  const { net, vat, gross } = splitAmount(input.amountMode, input.amount, input.vatRatePercent);
  const { rate, steps } = deductionRate(input);
  const deductible = deductibleAmount(vat, input);
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

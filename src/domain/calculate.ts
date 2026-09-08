import { calculateCost } from './cost';
import { formatPln } from './money';
import { round2 } from './money';
import { calculateVat } from './vat';
import type { CalculationResult, CalculatorInput, CostLine } from './types';

function bookingNotes(input: CalculatorInput, result: Omit<CalculationResult, 'booking'>): string[] {
  const notes: string[] = [];
  const { vat } = result;

  notes.push(`Zobowiązanie wobec kontrahenta: ${formatPln(vat.gross)} (kwota brutto z faktury).`);

  if (vat.vat > 0) {
    notes.push(
      `VAT naliczony do odliczenia: ${formatPln(vat.deductible)} — ujmij w ewidencji zakupu i w JPK_V7.`,
    );
    notes.push(
      `VAT niepodlegający odliczeniu: ${formatPln(vat.nonDeductible)} — zwiększa wartość kosztu lub wartość początkową, nie trafia do ewidencji VAT.`,
    );
  } else {
    notes.push('Faktura bez VAT do odliczenia — usługa zwolniona z podatku.');
  }

  switch (input.category) {
    case 'operating':
      notes.push(
        `Na konto kosztów rodzajowych: ${formatPln(result.costBase)}, z czego ${formatPln(result.kup + result.statutory)} stanowi koszt podatkowy, a ${formatPln(result.nkup)} wyksięguj jako koszt niestanowiący kosztu uzyskania przychodu.`,
      );
      break;
    case 'leasing':
      notes.push(
        `Ratę zaksięguj w kwocie ${formatPln(result.costBase)}; poza kosztami podatkowymi pozostaje ${formatPln(result.nkup)} części kapitałowej ponad limit.`,
      );
      break;
    case 'purchase':
      notes.push(
        `Wprowadź samochód do ewidencji środków trwałych w wartości początkowej ${formatPln(result.costBase)}.`,
      );
      if (result.depreciation) {
        notes.push(
          `Miesięczny odpis amortyzacyjny: ${formatPln(result.depreciation.monthly)}, z czego kosztem podatkowym jest ${formatPln(result.depreciation.monthlyKup)}.`,
        );
        if (result.depreciation.lifetimeNkup > 0) {
          notes.push(
            `Przez cały okres amortyzacji poza kosztami pozostanie ${formatPln(result.depreciation.lifetimeNkup)} — to nadwyżka wartości pojazdu ponad limit.`,
          );
        }
      }
      break;
    case 'insuranceAC':
      notes.push(
        `Składkę zaksięguj w kwocie ${formatPln(result.costBase)}; ${formatPln(result.nkup)} nie stanowi kosztu uzyskania przychodu.`,
      );
      break;
    case 'insuranceOC':
      notes.push(`Składkę w całości, czyli ${formatPln(result.costBase)}, zaliczasz do kosztów.`);
      break;
  }

  if (input.entityType === 'ngo' && result.statutory > 0) {
    notes.push(
      `Alokacja: ${formatPln(result.kup)} przypada na działalność gospodarczą, a ${formatPln(result.statutory)} na działalność statutową — ta część nie wchodzi do wyniku podatkowego działalności gospodarczej.`,
    );
  }

  return notes;
}

export function calculate(input: CalculatorInput): CalculationResult {
  const vat = calculateVat(input);
  const cost = calculateCost(input, vat);

  const lines: CostLine[] = [...cost.lines];
  const warnings: string[] = [...cost.warnings];

  // Organizacja dzieli koszt między działalność gospodarczą i statutową według
  // własnej polityki rachunkowości — kalkulator tylko wykonuje wskazany podział.
  let kup = cost.kup;
  let statutory = 0;
  if (input.entityType === 'ngo' && input.businessSharePercent < 100) {
    const share = input.businessSharePercent / 100;
    const business = round2(cost.kup * share);
    statutory = round2(cost.kup - business);
    kup = business;
    if (statutory > 0) {
      lines.push({
        label: 'Część przypisana do działalności statutowej',
        amount: statutory,
        kind: 'statutory',
        note: `${100 - input.businessSharePercent}% kosztu podatkowego`,
      });
    }
  }

  const legalBasis = [
    input.entityType === 'business'
      ? 'art. 86a ust. 1 ustawy o VAT — 50% podatku naliczonego przy użytku mieszanym'
      : 'art. 86 ust. 2a oraz art. 86a ust. 1 ustawy o VAT — prewspółczynnik, a następnie ograniczenie do 50%',
    ...cost.legalBasis,
  ];
  if (input.entityType === 'ngo' && input.salesPercent < 100) {
    legalBasis.splice(1, 0, 'art. 90 ust. 2 ustawy o VAT — proporcja sprzedaży opodatkowanej');
  }

  if (input.entityType === 'ngo') {
    if (!Number.isInteger(input.prePercent) || !Number.isInteger(input.salesPercent)) {
      warnings.push(
        'Prewspółczynnik i proporcję sprzedaży zaokrągla się w górę do pełnych procentów (art. 86 ust. 2g i art. 90 ust. 4 ustawy o VAT).',
      );
    }
  }

  const partial: Omit<CalculationResult, 'booking'> = {
    vat,
    costBase: cost.costBase,
    kup,
    nkup: cost.nkup,
    statutory,
    lines,
    legalBasis,
    warnings,
    limit: cost.limit,
    depreciation: cost.depreciation,
  };

  return { ...partial, booking: bookingNotes(input, partial) };
}

import { calculateCost, type Czesc, type PodstawaKosztu } from './cost';
import { formatPln } from './money';
import { ulamek } from './grosze';
import { round2 } from './money';
import { calculateVat } from './vat';
import type {
  Allocation,
  AllocationPart,
  CalculationResult,
  CalculatorInput,
  CostLine,
  Rozbicie,
  RozbicieCzesci,
  VatBreakdown,
} from './types';
import type { CostResult } from './cost';

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
        `Na konto kosztów rodzajowych: ${formatPln(result.costBase)}, z czego ${formatPln(result.kup)} stanowi koszt podatkowy, a ${formatPln(result.nkup)} wyksięguj jako koszt niestanowiący kosztu uzyskania przychodu.`,
      );
      break;
    case 'leasing':
      notes.push(
        `Ratę zaksięguj w kwocie ${formatPln(result.costBase)}; poza kosztami podatkowymi pozostaje ${formatPln(result.nkup)} — część kapitałowa ponad limit i 25% części odsetkowej.`,
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

  if (result.allocation && result.statutory > 0) {
    notes.push(
      `Alokacja: ${formatPln(result.allocation.business.total)} przypada na działalność gospodarczą (koszt podatkowy ${formatPln(result.kup)}, poza kosztami ${formatPln(result.nkup)}), a ${formatPln(result.statutory)} na działalność statutową — ${
        input.statutoryLimits && result.rozbicie
          ? `według wariantu B ta część też przechodzi przez limity: w kosztach ${formatPln(result.rozbicie.razem.statutowaWKosztach)}, ponad limity ${formatPln(result.rozbicie.razem.statutowaPozaKosztami)}.`
          : 'według wariantu A bez limitów.'
      }`,
    );
  }

  return notes;
}

/** Część faktury (kapitał albo odsetki) ze swoim VAT-em. */
interface Skladnik {
  net: number;
  vat: number;
  deductible: number;
}

/**
 * Rozbicie faktury na część główną i odsetkową raty leasingowej.
 *
 * VAT i kwotę odliczenia dzielimy proporcjonalnie do netto; odsetki dostają
 * resztę z odejmowania, żeby obie części zawsze sumowały się do faktury.
 */
function skladniki(input: CalculatorInput, vat: VatBreakdown): { glowna: Skladnik; odsetki: Skladnik } {
  const intNet = input.category === 'leasing' ? Math.max(0, Math.min(round2(input.interestNet), vat.net)) : 0;
  const capNet = round2(vat.net - intNet);
  const naKapital = (kwota: number) => (vat.net > 0 ? ulamek([kwota, capNet], [vat.net]) : kwota);
  const capVat = naKapital(vat.vat);
  const capDed = naKapital(vat.deductible);
  return {
    glowna: { net: capNet, vat: capVat, deductible: capDed },
    odsetki: { net: intNet, vat: round2(vat.vat - capVat), deductible: round2(vat.deductible - capDed) },
  };
}

/**
 * Podział organizacji: część statutowa i gospodarcza, osobno dla każdej części faktury.
 *
 * Netto dzielimy udziałem z polityki rachunkowości. VAT idzie za swoim źródłem:
 * część statutowa nie ma prawa do odliczenia, więc dostaje cały podatek
 * przypadający na nią według prewspółczynnika; gospodarcza — resztę, której
 * nie odliczono. Połówkę grosza zaokrąglamy na korzyść części statutowej,
 * a gospodarcza dostaje resztę.
 */
function podziel(s: Skladnik, input: CalculatorInput): { statutory: Czesc; business: Czesc } {
  const udzialStatutowy = Number((100 - input.businessSharePercent).toFixed(6));
  const statNet = ulamek([s.net, udzialStatutowy], [100]);
  const statVat = ulamek([s.vat, 100 - input.prePercent], [100]);
  return {
    statutory: { net: statNet, nonDeductible: statVat },
    business: { net: round2(s.net - statNet), nonDeductible: round2(s.vat - statVat - s.deductible) },
  };
}

function czesc(glowna: Czesc, odsetki: Czesc): AllocationPart {
  const net = round2(glowna.net + odsetki.net);
  const vat = round2(glowna.nonDeductible + odsetki.nonDeductible);
  return { net, vat, total: round2(net + vat), odsetki: round2(odsetki.net + odsetki.nonDeductible) };
}

/**
 * Co trafia do rachunku podatkowego działalności gospodarczej, a co do statutowej.
 *
 * Kolejność ma znaczenie: najpierw podział, potem limity. Część statutowa nie
 * jest kosztem podatkowym, więc ani limit wartości pojazdu, ani reguła 75% jej
 * nie dotyczą — liczone od całości obcinałyby ją, a część gospodarczą zawyżały.
 * Zakupu nie dzielimy — kosztem są dopiero odpisy amortyzacyjne.
 */
function rozdziel(
  input: CalculatorInput,
  vat: VatBreakdown,
): { podstawa: PodstawaKosztu; statutowa: PodstawaKosztu | null; allocation: Allocation | null } {
  const { glowna, odsetki } = skladniki(input, vat);
  const bezPodzialu = (s: Skladnik): Czesc => ({ net: s.net, nonDeductible: round2(s.vat - s.deductible) });

  if (input.entityType !== 'ngo' || input.category === 'purchase') {
    return {
      podstawa: { glowna: bezPodzialu(glowna), odsetki: bezPodzialu(odsetki) },
      statutowa: null,
      allocation: null,
    };
  }

  const g = podziel(glowna, input);
  const o = podziel(odsetki, input);
  return {
    podstawa: { glowna: g.business, odsetki: o.business },
    statutowa: { glowna: g.statutory, odsetki: o.statutory },
    allocation: { statutory: czesc(g.statutory, o.statutory), business: czesc(g.business, o.business) },
  };
}

/** Koszt i wyłączenie osobno dla części głównej i odsetek. */
const czesciKosztu = (c: CostResult) =>
  c.czesci ?? { kapital: { kup: c.kup, nkup: c.nkup }, odsetki: { kup: 0, nkup: 0 } };

/**
 * Wydatek rozpisany do dekretu: część statutowa, koszt podatkowy i wyłączenie,
 * przy leasingu osobno dla kapitału i odsetek. W wariancie B część statutowa
 * też dzieli się na tę w kosztach i tę ponad limity (`kosztStatutowy`).
 */
function rozbicie(
  input: CalculatorInput,
  vat: VatBreakdown,
  cost: CostResult,
  kosztStatutowy: CostResult | null,
  allocation: Allocation | null,
): Rozbicie | null {
  if (input.category === 'purchase') return null;
  const czesci = czesciKosztu(cost);
  const stat = kosztStatutowy ? czesciKosztu(kosztStatutowy) : null;
  const statOdsetki = allocation ? allocation.statutory.odsetki : 0;
  const statGlowna = allocation ? round2(allocation.statutory.total - statOdsetki) : 0;
  const wiersz = (
    statutowa: number,
    statNkup: number,
    kup: number,
    nkup: number,
  ): RozbicieCzesci => ({
    statutowa,
    statutowaWKosztach: round2(statutowa - statNkup),
    statutowaPozaKosztami: statNkup,
    kup,
    nkup,
    razem: round2(statutowa + kup + nkup),
  });
  const glowna = wiersz(statGlowna, stat?.kapital.nkup ?? 0, czesci.kapital.kup, czesci.kapital.nkup);
  const odsetki = wiersz(statOdsetki, stat?.odsetki.nkup ?? 0, czesci.odsetki.kup, czesci.odsetki.nkup);
  return {
    glowna,
    odsetki,
    razem: wiersz(
      round2(glowna.statutowa + odsetki.statutowa),
      round2(glowna.statutowaPozaKosztami + odsetki.statutowaPozaKosztami),
      round2(glowna.kup + odsetki.kup),
      round2(glowna.nkup + odsetki.nkup),
    ),
    vatOdliczony: vat.deductible,
    brutto: vat.gross,
  };
}

export function calculate(input: CalculatorInput): CalculationResult {
  const vat = calculateVat(input);
  const { podstawa, statutowa, allocation } = rozdziel(input, vat);
  const cost = calculateCost(input, podstawa);
  // Wariant B: te same limity także na części statutowej. Koszt podatkowy
  // działalności gospodarczej się nie zmienia, więc liczymy ją osobno.
  const kosztStatutowy = statutowa && input.statutoryLimits ? calculateCost(input, statutowa) : null;
  const rozpisane = rozbicie(input, vat, cost, kosztStatutowy, allocation);

  const warnings: string[] = [...cost.warnings];
  const statutory = allocation ? allocation.statutory.total : 0;

  // W organizacji linie kosztu opisują już tylko część gospodarczą — statutowa
  // idzie osobną linią; w wariancie B z podziałem na koszty i wyłączenia.
  const lines: CostLine[] = cost.lines.map((l, i) =>
    allocation && i === 0 && l.kind === 'info' ? { ...l, label: `${l.label} — część gospodarcza` } : l,
  );
  if (allocation && statutory > 0) {
    lines.unshift({
      label: 'Część przypisana do działalności statutowej',
      amount: statutory,
      kind: 'statutory',
      note: `netto ${formatPln(allocation.statutory.net)} + VAT ${formatPln(allocation.statutory.vat)} bez prawa do odliczenia — ${
        kosztStatutowy ? 'limity jak dla części gospodarczej (wariant B)' : 'bez limitów (wariant A)'
      }`,
    });
    const r = rozpisane?.razem;
    if (kosztStatutowy && r) {
      lines.splice(
        1,
        0,
        { label: '— w tym w kosztach', amount: r.statutowaWKosztach, kind: 'statutory' },
        { label: '— w tym ponad limity', amount: r.statutowaPozaKosztami, kind: 'statutory' },
      );
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
    costBase: round2(cost.costBase + statutory),
    kup: cost.kup,
    nkup: cost.nkup,
    statutory,
    lines,
    legalBasis,
    warnings,
    limit: cost.limit,
    depreciation: cost.depreciation,
    allocation,
    rozbicie: rozpisane,
  };

  return { ...partial, booking: bookingNotes(input, partial) };
}

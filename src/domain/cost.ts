import { DEFAULT_AC_LIMIT, limitRatio, statutoryLimit } from './limits';
import { iloczyn, iloraz, ulamek } from './grosze';
import { formatRate, round2 } from './money';
import type { CalculatorInput, CostLine, DepreciationInfo, LimitInfo } from './types';

/** Część wydatków eksploatacyjnych stanowiąca koszt przy użytku mieszanym. */
export const OPERATING_COST_FACTOR = 0.75;

/** Kwota netto i VAT, którego nie odliczono — razem tworzą koszt. */
export interface Czesc {
  net: number;
  nonDeductible: number;
}

/**
 * Podstawa kosztu w działalności gospodarczej, rozbita na część główną
 * (przy leasingu — kapitałową) i odsetkową. W organizacji to już tylko część
 * gospodarcza: część statutowa nie jest kosztem podatkowym i limitom nie podlega.
 */
export interface PodstawaKosztu {
  glowna: Czesc;
  odsetki: Czesc;
}

const suma = (c: Czesc) => round2(c.net + c.nonDeductible);

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

/**
 * Kwota ograniczona proporcją limitu do wartości pojazdu, liczona jednym ruchem.
 *
 * Proporcja w rodzaju 150 000 / 187 501 nie ma skończonego rozwinięcia, więc
 * mnożenie przez gotowy `limit.ratio` mogło przesunąć wynik o grosz. Liczymy
 * kwota × limit ÷ wartość w całości. Warunki są te same co w `limitRatio`:
 * brak wartości albo limit nie mniejszy od wartości oznaczają pełną kwotę.
 */
function wLimicie(kwota: number, limit: number, wartosc: number): number {
  if (wartosc <= 0 || limit >= wartosc) return round2(kwota);
  return ulamek([kwota, limit], [wartosc]);
}

/** Kwota w proporcji limitu pojazdu — wpisanej ręcznie albo wyliczonej z limitu. */
function wProporcji(kwota: number, input: CalculatorInput, limit: LimitInfo): number {
  if (input.ratioOverridePercent !== null) return ulamek([kwota, input.ratioOverridePercent], [100]);
  return wLimicie(kwota, limit.value, limit.vehicleValue);
}

function resolveLimit(input: CalculatorInput, vehicleValue: number): LimitInfo {
  const overridden = input.limitOverride !== null;
  const value = overridden ? (input.limitOverride as number) : statutoryLimit(input.powertrain);
  const ratioOverridden = input.ratioOverridePercent !== null;
  const ratio = ratioOverridden
    ? (input.ratioOverridePercent as number) / 100
    : limitRatio(value, vehicleValue);
  return { value, vehicleValue, ratio, overridden, ratioOverridden };
}

function opisProporcji(limit: LimitInfo): string {
  return `proporcja ${formatRate(limit.ratio)} — ${limit.ratioOverridden ? 'wpisana ręcznie' : 'limit do wartości pojazdu'}`;
}

function operating(p: PodstawaKosztu): CostResult {
  const costBase = suma(p.glowna);
  const kup = iloczyn(costBase, OPERATING_COST_FACTOR);
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

function leasing(input: CalculatorInput, p: PodstawaKosztu): CostResult {
  const capitalBase = suma(p.glowna);
  const interestBase = suma(p.odsetki);
  const costBase = round2(capitalBase + interestBase);

  const limit = resolveLimit(input, input.vehicleValue);
  const capitalKup = wProporcji(capitalBase, input, limit);
  const capitalNkup = round2(capitalBase - capitalKup);
  // Część odsetkowa nie spłaca wartości samochodu, więc limitu wartości nie
  // podlega — ale jest kosztem używania auta, a przy użytku mieszanym te
  // wchodzą do kosztów w 75%. Wyłączenie z reguły 75% dotyczy tylko kapitału.
  const interestKup = iloczyn(interestBase, OPERATING_COST_FACTOR);
  const interestNkup = round2(interestBase - interestKup);

  const lines: CostLine[] = [
    { label: 'Podstawa: netto + VAT niepodlegający odliczeniu', amount: costBase, kind: 'info' },
    {
      label: 'Część kapitałowa w kosztach',
      amount: capitalKup,
      kind: 'kup',
      note: opisProporcji(limit),
    },
  ];
  if (capitalNkup > 0) {
    lines.push({
      label: 'Część kapitałowa ponad limit',
      amount: capitalNkup,
      kind: 'nkup',
      note: limit.ratioOverridden
        ? 'część poza proporcją wpisaną ręcznie'
        : 'nadwyżka wartości pojazdu ponad limit',
    });
  }
  if (interestBase > 0) {
    lines.push({
      label: 'Część odsetkowa w kosztach — 75%',
      amount: interestKup,
      kind: 'kup',
      note: 'bez limitu wartości pojazdu, ale z regułą 75% dla kosztów używania',
    });
    lines.push({
      label: 'Część odsetkowa wyłączona z kosztów — 25%',
      amount: interestNkup,
      kind: 'nkup',
    });
  }

  const warnings: string[] = [];
  if (input.vehicleValue <= 0 && !limit.ratioOverridden) {
    warnings.push(
      'Nie podano wartości samochodu z umowy — limit nie został zastosowany, cała część kapitałowa trafiła do kosztów.',
    );
  }
  if (input.interestNet <= 0) {
    warnings.push(
      'Nie wskazano części odsetkowej raty — całą ratę potraktowano jako kapitałową, czyli objętą limitem.',
    );
  }

  return {
    costBase,
    kup: round2(capitalKup + interestKup),
    nkup: round2(capitalNkup + interestNkup),
    lines,
    limit,
    depreciation: null,
    legalBasis: [
      'art. 23 ust. 1 pkt 47a ustawy o PIT / art. 16 ust. 1 pkt 49a ustawy o CIT — limit dla opłat leasingowych i najmu',
      'art. 23 ust. 1 pkt 46a ustawy o PIT / art. 16 ust. 1 pkt 51 ustawy o CIT — część odsetkowa jako koszt używania: 75% przy użytku mieszanym; część kapitałowa jest z tej reguły wyłączona (objaśnienia podatkowe MF z 9 lipca 2019 r.)',
      'art. 23 ust. 5c ustawy o PIT / art. 16 ust. 5c ustawy o CIT — wartość samochodu obejmuje VAT niepodlegający odliczeniu',
    ],
    warnings,
  };
}

function purchase(input: CalculatorInput, p: PodstawaKosztu): CostResult {
  const initialValue = suma(p.glowna);
  const limit = resolveLimit(input, initialValue);
  const annual = ulamek([initialValue, input.depreciationRatePercent], [100]);
  const annualKup = wProporcji(annual, input, limit);
  const monthly = iloraz(annual, 12);
  const monthlyKup = wProporcji(monthly, input, limit);

  const depreciation: DepreciationInfo = {
    initialValue,
    ratePercent: input.depreciationRatePercent,
    annual,
    annualKup,
    annualNkup: round2(annual - annualKup),
    monthly,
    monthlyKup,
    monthlyNkup: round2(monthly - monthlyKup),
    // Odejmujemy część już zaokrągloną, żeby koszt i nadwyżka sumowały się do wartości.
    lifetimeNkup: round2(initialValue - wProporcji(initialValue, input, limit)),
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
        note: `${input.depreciationRatePercent}% wartości początkowej, ${opisProporcji(limit)}`,
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

function insuranceAC(input: CalculatorInput, p: PodstawaKosztu): CostResult {
  const costBase = suma(p.glowna);
  const ratioOverridden = input.ratioOverridePercent !== null;
  const limit: LimitInfo = {
    value: input.acLimit,
    vehicleValue: input.insuredValue,
    ratio: ratioOverridden
      ? (input.ratioOverridePercent as number) / 100
      : limitRatio(input.acLimit, input.insuredValue),
    overridden: input.acLimit !== DEFAULT_AC_LIMIT,
    ratioOverridden,
  };
  const kup = wProporcji(costBase, input, limit);
  const nkup = round2(costBase - kup);

  const warnings: string[] = [];
  if (input.insuredValue <= 0 && !ratioOverridden) {
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
        note: `proporcja ${formatRate(limit.ratio)} — ${ratioOverridden ? 'wpisana ręcznie' : 'limit do wartości ubezpieczenia'}`,
      },
      { label: 'Składka ponad limit', amount: nkup, kind: 'nkup' },
    ],
    limit,
    depreciation: null,
    legalBasis: [
      'art. 23 ust. 1 pkt 47 ustawy o PIT / art. 16 ust. 1 pkt 49 ustawy o CIT — limit składek na dobrowolne ubezpieczenia majątkowe',
      'art. 43 ust. 1 pkt 37 ustawy o VAT — usługi ubezpieczeniowe zwolnione z VAT',
    ],
    warnings,
  };
}

function insuranceOC(p: PodstawaKosztu): CostResult {
  const costBase = suma(p.glowna);
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

export function calculateCost(input: CalculatorInput, p: PodstawaKosztu): CostResult {
  switch (input.category) {
    case 'operating':
      return operating(p);
    case 'leasing':
      return leasing(input, p);
    case 'purchase':
      return purchase(input, p);
    case 'insuranceAC':
      return insuranceAC(input, p);
    case 'insuranceOC':
      return insuranceOC(p);
  }
}

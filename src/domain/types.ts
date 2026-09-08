/** Typ podmiotu rozliczającego wydatek. */
export type EntityType =
  /** Zwykły podatnik VAT z pełnym prawem do odliczenia — art. 86a: 50%. */
  | 'business'
  /** Fundacja / stowarzyszenie prowadzące działalność gospodarczą i statutową. */
  | 'ngo';

export type ExpenseCategory =
  /** Paliwo, serwis, części, opony, myjnia, parking, autostrady. */
  | 'operating'
  /** Rata leasingu operacyjnego, najmu lub dzierżawy. */
  | 'leasing'
  /** Zakup samochodu — rozliczany przez odpisy amortyzacyjne. */
  | 'purchase'
  /** Dobrowolne ubezpieczenie majątkowe: AC, GAP. */
  | 'insuranceAC'
  /** OC, NNW, assistance. */
  | 'insuranceOC';

/** Grupa limitu wartości pojazdu obowiązująca od 1 stycznia 2026 r. */
export type Powertrain =
  /** Emisja CO2 równa 50 g/km lub wyższa. */
  | 'emissionHigh'
  /** Emisja CO2 poniżej 50 g/km. */
  | 'emissionLow'
  /** Pojazd elektryczny lub napędzany wodorem. */
  | 'zeroEmission';

export type AmountMode = 'net' | 'gross';

export interface CalculatorInput {
  entityType: EntityType;
  /** Prewspółczynnik, art. 86 ust. 2a ustawy o VAT — pełne procenty. */
  prePercent: number;
  /** Proporcja sprzedaży, art. 90 ust. 2 ustawy o VAT — pełne procenty. */
  salesPercent: number;
  /** Udział działalności gospodarczej w koszcie — alokacja własna organizacji. */
  businessSharePercent: number;

  category: ExpenseCategory;
  amountMode: AmountMode;
  amount: number;
  vatRatePercent: number;
  /** Część odsetkowa raty leasingowej w kwocie netto. */
  interestNet: number;

  powertrain: Powertrain;
  /** Ręczne nadpisanie limitu wartości pojazdu; null = limit ustawowy. */
  limitOverride: number | null;
  /** Wartość samochodu przyjęta do proporcji przy leasingu lub najmie. */
  vehicleValue: number;
  /** Limit dla składek AC/GAP. */
  acLimit: number;
  /** Wartość pojazdu przyjęta dla celów ubezpieczenia. */
  insuredValue: number;
  /** Roczna stawka amortyzacji. */
  depreciationRatePercent: number;
}

export interface VatStep {
  label: string;
  detail: string;
}

export interface VatBreakdown {
  net: number;
  vat: number;
  gross: number;
  /** Łączny wskaźnik odliczenia jako ułamek, np. 0.25. */
  deductionRate: number;
  deductible: number;
  nonDeductible: number;
  steps: VatStep[];
}

export type CostKind = 'kup' | 'nkup' | 'statutory' | 'info';

export interface CostLine {
  label: string;
  amount: number;
  kind: CostKind;
  note?: string;
}

export interface LimitInfo {
  /** Limit ustawowy albo wartość nadpisana. */
  value: number;
  /** Wartość pojazdu, do której odnosi się limit. */
  vehicleValue: number;
  /** min(1, limit / wartość pojazdu). */
  ratio: number;
  /** Czy limit został nadpisany ręcznie. */
  overridden: boolean;
}

export interface DepreciationInfo {
  initialValue: number;
  ratePercent: number;
  annual: number;
  annualKup: number;
  annualNkup: number;
  monthly: number;
  monthlyKup: number;
  monthlyNkup: number;
  /** Część wartości początkowej, która nigdy nie stanie się kosztem. */
  lifetimeNkup: number;
}

export interface CalculationResult {
  vat: VatBreakdown;
  /** Podstawa kosztu: netto powiększone o VAT niepodlegający odliczeniu. */
  costBase: number;
  kup: number;
  nkup: number;
  /** Część kosztu przypisana do działalności statutowej organizacji. */
  statutory: number;
  lines: CostLine[];
  booking: string[];
  legalBasis: string[];
  warnings: string[];
  limit: LimitInfo | null;
  depreciation: DepreciationInfo | null;
}

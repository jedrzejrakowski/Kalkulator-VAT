/** Zaokrąglenie do pełnych groszy, odporne na błąd reprezentacji zmiennoprzecinkowej. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

const currency = new Intl.NumberFormat('pl-PL', {
  style: 'currency',
  currency: 'PLN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const plain = new Intl.NumberFormat('pl-PL', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatPln(value: number): string {
  return currency.format(value);
}

export function formatAmount(value: number): string {
  return plain.format(value);
}

/** Wskaźnik jako procent z maksymalnie dwoma miejscami, np. 0.25 -> "25%". */
export function formatRate(rate: number): string {
  const percent = rate * 100;
  const rounded = Math.round(percent * 100) / 100;
  return `${plain.format(rounded).replace(/,00$/, '')}%`;
}

/** Parsuje kwotę wpisaną po polsku: przecinek dziesiętny i spacje jako separator tysięcy. */
export function parseAmount(raw: string): number {
  const normalized = raw
    .replace(/\s| /g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const value = Number(normalized);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

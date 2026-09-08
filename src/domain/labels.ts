import type { ExpenseCategory, EntityType } from './types';

export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  operating: 'Wydatek eksploatacyjny',
  leasing: 'Rata leasingu, najmu lub dzierżawy',
  purchase: 'Zakup samochodu',
  insuranceAC: 'Ubezpieczenie AC lub GAP',
  insuranceOC: 'Ubezpieczenie OC, NNW, assistance',
};

export const CATEGORY_HINTS: Record<ExpenseCategory, string> = {
  operating: 'Paliwo, serwis, części, opony, myjnia, parking, opłaty autostradowe.',
  leasing: 'Leasing operacyjny, najem długoterminowy, dzierżawa. Rata dzieli się na część kapitałową i odsetkową.',
  purchase: 'Nabycie na własność. Kosztem są odpisy amortyzacyjne, a nie sama faktura.',
  insuranceAC: 'Ubezpieczenia dobrowolne, których składka zależy od wartości pojazdu.',
  insuranceOC: 'Ubezpieczenia obowiązkowe i osobowe — poza limitem wartości pojazdu.',
};

export const ENTITY_LABELS: Record<EntityType, string> = {
  business: 'Działalność gospodarcza',
  ngo: 'Fundacja lub stowarzyszenie',
};

/** Czy kategoria wymaga sekcji z limitem wartości pojazdu. */
export function needsVehicleLimit(category: ExpenseCategory): boolean {
  return category === 'leasing' || category === 'purchase' || category === 'insuranceAC';
}

/** Ubezpieczenia są zwolnione z VAT — stawki nie wybiera się ręcznie. */
export function isVatExempt(category: ExpenseCategory): boolean {
  return category === 'insuranceAC' || category === 'insuranceOC';
}

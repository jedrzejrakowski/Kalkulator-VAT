import { describe, expect, it } from 'vitest';
import { round2 } from '../money';
import { calculate } from '../calculate';
import { DEFAULT_INPUT } from '../defaults';
import type { CalculatorInput } from '../types';

/**
 * Faktury fundacji z października 2026 r.: działalność gospodarcza i
 * niegospodarcza po 50%, prewspółczynnik 50%, proporcja limitu 58,44%.
 * Kwoty oczekiwane pochodzą z ręcznego rozliczenia i dekretu tych faktur.
 */
const fundacja = (zmiany: Partial<CalculatorInput>) =>
  calculate({
    ...DEFAULT_INPUT,
    entityType: 'ngo',
    prePercent: 50,
    salesPercent: 100,
    businessSharePercent: 50,
    amountMode: 'net',
    ...zmiany,
  });

describe('rata BNP Paribas Leasing 11854/10/2026/RL/LS w fundacji', () => {
  const r = fundacja({
    category: 'leasing',
    amount: 2216.07,
    vatRatePercent: 23,
    interestNet: 38.39,
    ratioOverridePercent: 58.44,
  });

  it('kwoty faktury i VAT do odliczenia', () => {
    expect(r.vat.vat).toBe(509.7);
    expect(r.vat.gross).toBe(2725.77);
    expect(r.vat.deductible).toBe(127.43);
  });

  it('część statutowa: połowa kapitału i odsetek z całym ich VAT-em, bez limitu', () => {
    // kapitał 1 088,84 + 250,44, odsetki 19,20 + 4,42
    expect(r.allocation!.statutory).toEqual({ net: 1108.04, vat: 254.86, total: 1362.9, odsetki: 23.62 });
    expect(r.statutory).toBe(1362.9);
  });

  it('część gospodarcza: połowa netto i nieodliczona połowa jej VAT-u', () => {
    // kapitał 1 088,84 + 125,21, odsetki 19,19 + 2,20
    expect(r.allocation!.business).toEqual({ net: 1108.03, vat: 127.41, total: 1235.44, odsetki: 21.39 });
  });

  it('limit 58,44% tylko na kapitał części gospodarczej, odsetki w 75%', () => {
    const linia = (etykieta: string) => r.lines.find((l) => l.label.startsWith(etykieta))!.amount;
    expect(linia('Część kapitałowa w kosztach')).toBe(709.49); // 1 214,05 × 58,44%
    expect(linia('Część kapitałowa ponad limit')).toBe(504.56);
    expect(linia('Część odsetkowa w kosztach')).toBe(16.04); // 21,39 × 75%
    expect(linia('Część odsetkowa wyłączona')).toBe(5.35);
    expect(r.kup).toBe(725.53);
    expect(r.nkup).toBe(509.91);
  });

  it('wszystko spina się z fakturą', () => {
    expect(r.costBase).toBe(2598.34);
    expect(Math.round((r.statutory + r.kup + r.nkup + r.vat.deductible) * 100) / 100).toBe(2725.77);
  });

  it('rozbicie do dekretu: kapitał i odsetki osobno, jak na kontach 402 i 751', () => {
    expect(r.rozbicie).toEqual({
      // 402: statutowa 1 339,28 + w kosztach 709,49; ponad limit 504,56 (NKUP)
      kapital: { statutowa: 1339.28, kup: 709.49, nkup: 504.56, razem: 2553.33 },
      // 751: statutowa 23,62 + w kosztach 16,04; 25% wyłączone 5,35 (NKUP)
      odsetki: { statutowa: 23.62, kup: 16.04, nkup: 5.35, razem: 45.01 },
      razem: { statutowa: 1362.9, kup: 725.53, nkup: 509.91, razem: 2598.34 },
      vatOdliczony: 127.43,
      brutto: 2725.77,
    });
    // przeksięgowanie przez 490: 500 = 1 339,28, 501 = 709,49 + 504,56 = 1 214,05
    expect(round2(r.rozbicie!.kapital.kup + r.rozbicie!.kapital.nkup)).toBe(1214.05);
  });
});

describe('paliwo Orlen w fundacji: 75% liczone tylko od części gospodarczej', () => {
  const przypadki = [
    // faktura, netto, statutowa (netto + VAT), VAT odliczony, KUP, NKUP
    { faktura: 'F 33394/4472/26', netto: 370.46, statutowa: 200.05, odliczony: 7.41, kup: 144.48, nkup: 48.16 },
    { faktura: 'F 30830/4401/26', netto: 359.95, statutowa: 194.38, odliczony: 7.2, kup: 140.38, nkup: 46.79 },
    { faktura: 'F 46387/4449/26', netto: 256.91, statutowa: 138.74, odliczony: 5.14, kup: 100.19, nkup: 33.39 },
  ];

  for (const p of przypadki) {
    it(p.faktura, () => {
      const r = fundacja({ category: 'operating', amount: p.netto, vatRatePercent: 8 });
      expect(r.statutory).toBe(p.statutowa);
      expect(r.vat.deductible).toBe(p.odliczony);
      expect(r.kup).toBe(p.kup);
      expect(r.nkup).toBe(p.nkup);
      expect(Math.round((r.statutory + r.kup + r.nkup + r.vat.deductible) * 100) / 100).toBe(r.vat.gross);
    });
  }
});

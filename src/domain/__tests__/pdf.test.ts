import { describe, expect, it } from 'vitest';
import { calculate } from '../calculate';
import { DEFAULT_INPUT } from '../defaults';
import { koduj, plikPdf, szerokosc, zlam } from '../pdf';
import type { CalculatorInput } from '../types';

const rataBnp: CalculatorInput = {
  ...DEFAULT_INPUT,
  entityType: 'ngo',
  prePercent: 50,
  salesPercent: 100,
  businessSharePercent: 50,
  category: 'leasing',
  amountMode: 'net',
  amount: 2216.07,
  vatRatePercent: 23,
  interestNet: 38.39,
  ratioOverridePercent: 58.44,
};

const jakoTekst = (b: Uint8Array) => Array.from(b, (k) => String.fromCharCode(k)).join('');

describe('plik PDF rozliczenia', () => {
  const pdf = jakoTekst(plikPdf(rataBnp, calculate(rataBnp), new Date(2026, 10, 25, 12, 0)));

  it('ma nagłówek, zakończenie i poprawną tablicę odsyłaczy', () => {
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
    const xref = Number(/startxref\n(\d+)/.exec(pdf)![1]);
    expect(pdf.slice(xref, xref + 4)).toBe('xref');
    // Każdy wpis w tablicy wskazuje dokładnie na początek swojego obiektu.
    const wpisy = [...pdf.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    wpisy.forEach((przesuniecie, i) => expect(pdf.slice(przesuniecie).startsWith(`${i + 1} 0 obj`)).toBe(true));
  });

  it('podaje długości strumieni zgodne z treścią', () => {
    for (const m of pdf.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
      const start = m.index! + m[0].length;
      expect(pdf.slice(start + Number(m[1]), start + Number(m[1]) + 10)).toBe('\nendstream');
    }
  });

  it('zawiera dekret i polskie litery w kodowaniu fontu', () => {
    expect(pdf).toContain('(Wn 402-13)');
    expect(pdf).toContain('1492,17');
    // „ł” to kod 178 (ósemkowo 262), „ą” 172 (254) — przez /Differences.
    expect(pdf).toContain('/Differences');
    expect(pdf).toContain('\\262');
  });

  it('ma przynajmniej jedną stronę A4 i numery stron', () => {
    const stron = Number(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/.exec(pdf)![1]);
    expect(stron).toBeGreaterThanOrEqual(1);
    expect(pdf).toContain('/MediaBox [0 0 595.28 841.89]');
    expect(pdf).toContain(`(Strona 1 z ${stron})`);
  });
});

describe('tekst w PDF', () => {
  it('koduje polskie litery i zastępuje znaki spoza fontu', () => {
    expect(koduj('ąćęłńśźż ĄĆĘŁŃŚŹŻ ó')).not.toContain(63);
    expect(koduj('✓')).toEqual([79, 75]); // „OK”
    expect(koduj('CO₂')).toEqual([67, 79, 50]);
  });

  it('łamie długi tekst tak, że każda linia mieści się w kolumnie', () => {
    const t = 'Część kapitałowa ponad limit wyłączona z kosztów — według objaśnień MF z 9 lipca 2019 r.';
    const linie = zlam(t, 'zwykla', 9.5, 120);
    expect(linie.length).toBeGreaterThan(1);
    linie.forEach((l) => expect(szerokosc(l, 'zwykla', 9.5)).toBeLessThanOrEqual(120));
    expect(linie.join(' ')).toBe(t);
  });
});

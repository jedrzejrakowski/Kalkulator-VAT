import { describe, expect, it } from 'vitest';
import { doGroszy, iloczyn, iloraz, ulamek } from '../grosze';

/** Wzorzec: kwota w groszach × licznik ÷ mianownik, połowa w górę, na BigInt. */
const wzorzec = (gr: number, licznik: number, mianownik: number) =>
  Number((BigInt(gr) * BigInt(licznik) * 2n + BigInt(mianownik)) / (2n * BigInt(mianownik))) / 100;

describe('odliczenie połowy VAT', () => {
  it('zaokrągla połówkę grosza w górę', () => {
    // Te kwoty dawały grosz za mało: 4,27 × 0,5 = 2,135 leży w pamięci jako 2,13499…
    expect(iloczyn(4.27, 0.5)).toBe(2.14);
    expect(iloczyn(4.35, 0.5)).toBe(2.18);
    expect(iloczyn(4.77, 0.5)).toBe(2.39);
  });

  it('zgadza się ze wzorcem dla każdej kwoty VAT do 20 000 zł', () => {
    let rozbieznosci = 0;
    for (let gr = 1; gr <= 2_000_000; gr += 1) {
      if (iloczyn(gr / 100, 0.5) !== wzorzec(gr, 1, 2)) rozbieznosci += 1;
    }
    expect(rozbieznosci).toBe(0);
  });
});

describe('odliczenie ćwierci VAT i podział 75%', () => {
  it('zgadza się ze wzorcem przy 25% i 75%', () => {
    let rozbieznosci = 0;
    for (let gr = 1; gr <= 500_000; gr += 1) {
      if (iloczyn(gr / 100, 0.25) !== wzorzec(gr, 1, 4)) rozbieznosci += 1;
      if (iloczyn(gr / 100, 0.75) !== wzorzec(gr, 3, 4)) rozbieznosci += 1;
    }
    expect(rozbieznosci).toBe(0);
  });

  it('naprawia przypadki wyłapane w próbie', () => {
    expect(iloczyn(8.54, 0.25)).toBe(2.14);
    expect(iloczyn(2.9, 0.75)).toBe(2.18);
    expect(iloczyn(4.02, 0.75)).toBe(3.02);
  });
});

describe('ułamek wieloczłonowy', () => {
  it('liczy odliczenie organizacji z procentów, a nie z gotowego wskaźnika', () => {
    // 73% × 88% × ½ = 0,3212, ale 0,73 × 0,88 × 0,5 w pamięci to 0,32119999…
    // Dla VAT 1 000,00 zł: 321,20 zł niezależnie od drogi, ale przy połówkach już nie.
    expect(ulamek([1000, 73, 88], [100, 100, 2])).toBe(321.2);
    expect(ulamek([12.5, 73, 88], [100, 100, 2])).toBe(4.02); // 4,015 → w górę
  });

  it('liczy proporcję limitu do wartości pojazdu jednym ruchem', () => {
    // 10 000 zł × 150 000 ÷ 187 500 = 8 000 zł
    expect(ulamek([10_000, 150_000], [187_500])).toBe(8000);
    // Proporcja bez skończonego rozwinięcia dziesiętnego.
    expect(ulamek([1000, 150_000], [175_000])).toBe(857.14);
    // 150 000 000 ÷ 187 501 = 799,9957… — trzecia cyfra 5, czwarta 7, więc w górę.
    expect(ulamek([1000, 150_000], [187_501])).toBe(800);
  });

  it('zgadza się ze wzorcem dla losowych proporcji limitu', () => {
    let rozbieznosci = 0;
    for (let i = 0; i < 100_000; i += 1) {
      const gr = 1 + Math.floor(Math.random() * 10_000_000);
      const limit = 100_000 + Math.floor(Math.random() * 150_000);
      const wartosc = limit + 1 + Math.floor(Math.random() * 300_000);
      if (ulamek([gr / 100, limit], [wartosc]) !== wzorzec(gr, limit, wartosc)) rozbieznosci += 1;
    }
    expect(rozbieznosci).toBe(0);
  });
});

describe('dzielenie', () => {
  it('wydziela netto z brutto przy 23%', () => {
    // 123,00 × 100 ÷ 123 = 100,00; 1,00 × 100 ÷ 123 = 0,813… → 0,81
    expect(ulamek([123, 100], [123])).toBe(100);
    expect(ulamek([1, 100], [123])).toBe(0.81);
  });

  it('dzieli odpis roczny na miesiące', () => {
    expect(iloraz(1000, 12)).toBe(83.33);
    expect(iloraz(1000.02, 12)).toBe(83.34); // 83,335 → w górę
  });

  it('nie przyjmuje zera w mianowniku', () => {
    expect(() => iloraz(1, 0)).toThrow(RangeError);
  });
});

describe('doGroszy', () => {
  it('zaokrągla sumy i różnice kwot', () => {
    expect(doGroszy(0.1 + 0.2)).toBe(0.3);
    expect(doGroszy(2.135)).toBe(2.14);
  });

  it('czyta zapis wykładniczy', () => {
    expect(doGroszy(1e-7)).toBe(0);
    expect(doGroszy(1e21)).toBe(1e21);
  });

  it('zaokrągla ujemne symetrycznie', () => {
    expect(doGroszy(-2.135)).toBe(-2.14);
    expect(iloczyn(-4.27, 0.5)).toBe(-2.14);
  });
});

import { describe, expect, it } from 'vitest';
import { calculate } from '../calculate';
import { DEFAULT_INPUT } from '../defaults';
import { archiwum, crc32 } from '../zip';
import { plikXlsx } from '../xlsx';
import type { CalculatorInput } from '../types';

/** Odczyt archiwum bez kompresji — wystarczy, żeby sprawdzić, co w nim leży. */
function rozpakuj(zip: Uint8Array): Map<string, string> {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const pliki = new Map<string, string>();
  let i = 0;
  while (v.getUint32(i, true) === 0x04034b50) {
    const rozmiar = v.getUint32(i + 18, true);
    const dl = v.getUint16(i + 26, true);
    const nazwa = new TextDecoder().decode(zip.subarray(i + 30, i + 30 + dl));
    const dane = zip.subarray(i + 30 + dl, i + 30 + dl + rozmiar);
    expect(crc32(dane)).toBe(v.getUint32(i + 14, true));
    pliki.set(nazwa, new TextDecoder().decode(dane));
    i += 30 + dl + rozmiar;
  }
  return pliki;
}

describe('ZIP', () => {
  it('liczy CRC-32 zgodnie ze wzorcem', () => {
    // Wektor kontrolny z definicji CRC-32: „123456789" → CBF43926.
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('zapisuje pliki tak, że dają się odczytać z powrotem', () => {
    const pliki = rozpakuj(archiwum([{ nazwa: 'a.txt', dane: new TextEncoder().encode('zażółć') }]));
    expect(pliki.get('a.txt')).toBe('zażółć');
  });
});

describe('arkusz rozliczenia', () => {
  const arkusz = (zmiany: Partial<CalculatorInput>) => {
    const input = { ...DEFAULT_INPUT, ...zmiany };
    const pliki = rozpakuj(plikXlsx(input, calculate(input), new Date(2026, 9, 13, 17, 45)));
    return { pliki, xml: pliki.get('xl/worksheets/sheet1.xml')! };
  };

  it('zawiera wszystkie części skoroszytu', () => {
    expect([...arkusz({ amount: 1230 }).pliki.keys()].sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/workbook.xml',
      'xl/worksheets/sheet1.xml',
    ]);
  });

  it('zapisuje kwoty i procenty jako liczby, a nie tekst', () => {
    const { xml } = arkusz({ amount: 1230 });
    // Netto 1000 i VAT do odliczenia 115 w formacie kwoty (styl 1).
    expect(xml).toContain('<c r="B10" s="1"><v>1000</v></c>');
    expect(xml).toMatch(/<v>115<\/v>/);
    // Wskaźnik odliczenia 50% jako ułamek w formacie procentu (styl 2).
    expect(xml).toMatch(/<c r="B\d+" s="2"><v>0.5<\/v><\/c>/);
    expect(xml).toContain('Data wyliczenia: 13 października 2026');
  });

  it('przenosi ręczną proporcję co do setnej części procentu', () => {
    const { xml } = arkusz({ category: 'leasing', amount: 2460, ratioOverridePercent: 58.44 });
    expect(xml).toContain('Proporcja zaliczana do kosztów (wpisana ręcznie)');
    expect(xml).toMatch(/s="2"><v>0.5844<\/v>/);
  });

  it('przy leasingu pokazuje kapitał i odsetki jak na fakturze', () => {
    // Faktura 17467/09/2026/RL/LS: kapitał 2178,14 + odsetki 34,78 netto.
    const { xml } = arkusz({ category: 'leasing', amountMode: 'net', amount: 2212.92, interestNet: 34.78 });
    expect(xml).toMatch(/Kapitał \(netto\)<\/t><\/is><\/c><c r="B\d+" s="1"><v>2178.14<\/v>/);
    expect(xml).toMatch(/Odsetki \(netto\)<\/t><\/is><\/c><c r="B\d+" s="1"><v>34.78<\/v>/);
    expect(xml).not.toContain('Kwota z faktury');
  });

  it('pokazuje wskaźniki organizacji tylko dla fundacji', () => {
    expect(arkusz({ amount: 1230 }).xml).not.toContain('Prewspółczynnik');
    const { xml } = arkusz({ amount: 1230, entityType: 'ngo', prePercent: 37 });
    expect(xml).toContain('Prewspółczynnik');
    expect(xml).toMatch(/s="2"><v>0.37<\/v>/);
  });
});

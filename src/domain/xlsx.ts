/**
 * Rozliczenie jako arkusz Excela (.xlsx).
 *
 * Kwoty i procenty zapisujemy jako liczby z formatem, a nie jako tekst, żeby
 * dało się je przenieść do innych wyliczeń. Układ odpowiada panelowi wyniku:
 * dane wejściowe, podatek naliczony, koszt podatkowy, limit, amortyzacja,
 * księgowanie i podstawa prawna. Archiwum składa `zip.ts` — bez biblioteki.
 */
import { CATEGORY_LABELS, ENTITY_LABELS } from './labels';
import { archiwum } from './zip';
import type { CalculationResult, CalculatorInput } from './types';

const KODOWANIE = new TextEncoder();

/** Style z `STYLE` — numery odpowiadają kolejności w `cellXfs`. */
const S = { zwykly: 0, kwota: 1, procent: 2, tytul: 3, naglowek: 4, przypis: 5 } as const;

type Wartosc = { kwota: number } | { procent: number } | { tekst: string };
type Wiersz =
  | { rodzaj: 'tytul' | 'przypis' | 'sekcja' | 'akapit'; tekst: string }
  | { rodzaj: 'pozycja'; tekst: string; wartosc: Wartosc; uwaga?: string };

const xml = (tekst: string) =>
  tekst.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const tekst = (adres: string, t: string, styl: number = S.zwykly) =>
  `<c r="${adres}" t="inlineStr"${styl ? ` s="${styl}"` : ''}><is><t xml:space="preserve">${xml(t)}</t></is></c>`;

function wartosc(adres: string, w: Wartosc): string {
  if ('kwota' in w) return `<c r="${adres}" s="${S.kwota}"><v>${w.kwota}</v></c>`;
  if ('procent' in w) return `<c r="${adres}" s="${S.procent}"><v>${w.procent}</v></c>`;
  return tekst(adres, w.tekst);
}

/** Wiersze arkusza w kolejności panelu wyniku. */
export function wierszeRozliczenia(input: CalculatorInput, result: CalculationResult, kiedy: Date): Wiersz[] {
  const { vat, limit, depreciation } = result;
  const poz = (t: string, w: Wartosc, uwaga?: string): Wiersz => ({ rodzaj: 'pozycja', tekst: t, wartosc: w, uwaga });
  const kwota = (k: number) => ({ kwota: k });
  const procent = (p: number) => ({ procent: p });

  const w: Wiersz[] = [
    { rodzaj: 'tytul', tekst: 'Kalkulator celów mieszanych — samochód osobowy w firmie' },
    {
      rodzaj: 'przypis',
      tekst: `Data wyliczenia: ${kiedy.toLocaleString('pl-PL', { dateStyle: 'long', timeStyle: 'short' })}`,
    },
    { rodzaj: 'sekcja', tekst: 'Dane wejściowe' },
    poz('Podmiot', { tekst: ENTITY_LABELS[input.entityType] }),
  ];
  if (input.entityType === 'ngo') {
    w.push(
      poz('Prewspółczynnik', procent(input.prePercent / 100)),
      poz('Proporcja sprzedaży', procent(input.salesPercent / 100)),
      poz('Udział działalności gospodarczej w koszcie', procent(input.businessSharePercent / 100)),
    );
  }
  w.push(
    poz('Rodzaj wydatku', { tekst: CATEGORY_LABELS[input.category] }),
    poz(`Kwota z faktury (${input.amountMode === 'gross' ? 'brutto' : 'netto'})`, kwota(input.amount)),
    poz('Stawka VAT', procent(input.vatRatePercent / 100)),
  );
  if (input.category === 'leasing') w.push(poz('Część odsetkowa raty (netto)', kwota(input.interestNet)));

  w.push(
    { rodzaj: 'sekcja', tekst: 'Podatek naliczony' },
    poz('Wskaźnik odliczenia', procent(vat.deductionRate)),
    poz('Wartość netto', kwota(vat.net)),
    poz('VAT z faktury', kwota(vat.vat)),
    poz('VAT do odliczenia', kwota(vat.deductible)),
    poz('VAT bez prawa do odliczenia', kwota(vat.nonDeductible), 'powiększa wartość kosztu'),
    poz('Kwota brutto', kwota(vat.gross)),
    ...vat.steps.map((s) => poz(s.label, { tekst: s.detail })),
    { rodzaj: 'sekcja', tekst: 'Koszt podatkowy' },
    ...result.lines.map((l) => poz(l.label, kwota(l.amount), l.note)),
  );

  if (limit) {
    w.push(
      { rodzaj: 'sekcja', tekst: 'Limit wartości pojazdu' },
      poz(`Limit${limit.overridden ? ' (wpisany ręcznie)' : ' ustawowy'}`, kwota(limit.value)),
      poz('Wartość pojazdu', limit.vehicleValue > 0 ? kwota(limit.vehicleValue) : { tekst: 'nie podano' }),
      poz(
        `Proporcja zaliczana do kosztów${limit.ratioOverridden ? ' (wpisana ręcznie)' : ''}`,
        procent(limit.ratio),
      ),
    );
  }

  if (depreciation) {
    w.push(
      { rodzaj: 'sekcja', tekst: 'Amortyzacja' },
      poz('Wartość początkowa', kwota(depreciation.initialValue)),
      poz(`Odpis roczny (${depreciation.ratePercent}%)`, kwota(depreciation.annual)),
      poz('— w tym koszt podatkowy', kwota(depreciation.annualKup)),
      poz('Odpis miesięczny', kwota(depreciation.monthly)),
      poz('— w tym koszt podatkowy', kwota(depreciation.monthlyKup)),
      poz('— w tym poza kosztami', kwota(depreciation.monthlyNkup)),
      poz('Nadwyżka ponad limit', kwota(depreciation.lifetimeNkup), 'nigdy nie stanie się kosztem'),
    );
  }

  w.push(
    { rodzaj: 'sekcja', tekst: 'Jak to zaksięgować' },
    ...result.warnings.map((t): Wiersz => ({ rodzaj: 'akapit', tekst: `Uwaga: ${t}` })),
    ...result.booking.map((t): Wiersz => ({ rodzaj: 'akapit', tekst: t })),
    { rodzaj: 'sekcja', tekst: 'Podstawa prawna' },
    ...result.legalBasis.map((t): Wiersz => ({ rodzaj: 'akapit', tekst: t })),
    {
      rodzaj: 'przypis',
      tekst: 'Wynik jest wyliczeniem pomocniczym, nie poradą podatkową — przy nietypowych umowach sprawdź stan prawny na dzień poniesienia wydatku.',
    },
  );
  return w;
}

function arkuszXml(wiersze: Wiersz[]): string {
  const dane = wiersze
    .map((w, i) => {
      const nr = i + 1;
      if (w.rodzaj !== 'pozycja') {
        const styl = { tytul: S.tytul, przypis: S.przypis, sekcja: S.naglowek, akapit: S.zwykly }[w.rodzaj];
        return `<row r="${nr}">${tekst(`A${nr}`, w.tekst, styl)}</row>`;
      }
      const uwaga = w.uwaga ? tekst(`C${nr}`, w.uwaga, S.przypis) : '';
      return `<row r="${nr}">${tekst(`A${nr}`, w.tekst)}${wartosc(`B${nr}`, w.wartosc)}${uwaga}</row>`;
    })
    .join('');

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<dimension ref="A1:C${wiersze.length}"/>` +
    '<cols><col min="1" max="1" width="52" customWidth="1"/>' +
    '<col min="2" max="2" width="20" customWidth="1"/>' +
    '<col min="3" max="3" width="48" customWidth="1"/></cols>' +
    `<sheetData>${dane}</sheetData>` +
    '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>' +
    '</worksheet>'
  );
}

const STYLE =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="4">' +
  '<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="14"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><sz val="9"/><color rgb="FF595959"/><name val="Calibri"/><family val="2"/></font>' +
  '</fonts>' +
  '<fills count="3">' +
  '<fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/><bgColor indexed="64"/></patternFill></fill>' +
  '</fills>' +
  '<borders count="2">' +
  '<border><left/><right/><top/><bottom/><diagonal/></border>' +
  '<border><left/><right/><top/><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border>' +
  '</borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="6">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' + // zwykły
  '<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' + // kwota: 1 234,56
  '<xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' + // procent: 58,44%
  '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' + // tytuł
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' + // sekcja
  '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>' + // przypis
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

const TYPY =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
  '</Types>';

const RELACJE_GLOWNE =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  '</Relationships>';

const SKOROSZYT =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
  '<sheets><sheet name="Rozliczenie" sheetId="1" r:id="rId1"/></sheets>' +
  '</workbook>';

const RELACJE_SKOROSZYTU =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  '</Relationships>';

export const TYP_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function plikXlsx(input: CalculatorInput, result: CalculationResult, kiedy: Date = new Date()): Uint8Array {
  const plik = (nazwa: string, tresc: string) => ({ nazwa, dane: KODOWANIE.encode(tresc) });
  return archiwum(
    [
      plik('[Content_Types].xml', TYPY),
      plik('_rels/.rels', RELACJE_GLOWNE),
      plik('xl/workbook.xml', SKOROSZYT),
      plik('xl/_rels/workbook.xml.rels', RELACJE_SKOROSZYTU),
      plik('xl/styles.xml', STYLE),
      plik('xl/worksheets/sheet1.xml', arkuszXml(wierszeRozliczenia(input, result, kiedy))),
    ],
    kiedy,
  );
}

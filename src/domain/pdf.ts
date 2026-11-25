/**
 * Rozliczenie jako plik PDF.
 *
 * Te same wiersze co w arkuszu Excela (`wierszeRozliczenia`), złożone na
 * stronach A4: tytuł, data, sekcje na szarym tle, pozycje w trzech
 * kolumnach (opis, kwota, uwaga) i akapity. Plik składamy sami, bez
 * biblioteki — jak arkusz w `xlsx.ts`. Czcionka to standardowa Helvetica,
 * której nie trzeba osadzać; polskie litery dostaje przez /Differences.
 */
import { DOMYSLNY_PLAN_KONT, type PlanKont } from './dekret';
import { formatPln, formatRate } from './money';
import { KODY, ROZNICE, SZEROKOSCI } from './pdfMetryki';
import { wierszeRozliczenia, type Wartosc, type Wiersz } from './xlsx';
import type { CalculationResult, CalculatorInput } from './types';

export const TYP_PDF = 'application/pdf';

type Krój = keyof typeof SZEROKOSCI;

/** Znaki, których Helvetica nie ma — zastępujemy je najbliższym odpowiednikiem. */
const ZAMIENNIKI: Record<string, string> = {
  '✓': 'OK',
  '₂': '2',
  ' ': ' ',
  ' ': ' ',
  '≥': '>=',
  '≤': '<=',
  '→': '->',
  '−': '-',
};

/** Tekst jako kody bajtów w kodowaniu fontu. */
export function koduj(tekst: string): number[] {
  const kody: number[] = [];
  for (const znak of tekst) {
    const zamiennik = ZAMIENNIKI[znak];
    if (zamiennik !== undefined) {
      kody.push(...koduj(zamiennik));
      continue;
    }
    const c = znak.codePointAt(0)!;
    if (c >= 32 && c <= 126) kody.push(c);
    else if (KODY[znak] !== undefined) kody.push(KODY[znak]);
    else kody.push(63); // „?” zamiast znaku, którego font nie zna
  }
  return kody;
}

export function szerokosc(tekst: string, kroj: Krój, rozmiar: number): number {
  const tabela = SZEROKOSCI[kroj];
  return (koduj(tekst).reduce((s, k) => s + tabela[k], 0) * rozmiar) / 1000;
}

/** Łamie tekst na linie mieszczące się w zadanej szerokości. */
export function zlam(tekst: string, kroj: Krój, rozmiar: number, maks: number): string[] {
  const linie: string[] = [];
  for (const akapit of tekst.split('\n')) {
    let linia = '';
    for (const slowo of akapit.split(' ')) {
      const proba = linia ? `${linia} ${slowo}` : slowo;
      if (szerokosc(proba, kroj, rozmiar) <= maks) {
        linia = proba;
        continue;
      }
      if (linia) linie.push(linia);
      // Słowo dłuższe niż cała kolumna dzielimy po znakach.
      let reszta = slowo;
      while (szerokosc(reszta, kroj, rozmiar) > maks && reszta.length > 1) {
        let n = reszta.length - 1;
        while (n > 1 && szerokosc(reszta.slice(0, n), kroj, rozmiar) > maks) n--;
        linie.push(reszta.slice(0, n));
        reszta = reszta.slice(n);
      }
      linia = reszta;
    }
    linie.push(linia);
  }
  return linie;
}

/** Ciąg znaków PDF w nawiasach: bajty powyżej ASCII jako kody ósemkowe. */
function ciag(tekst: string): string {
  let wynik = '(';
  for (const k of koduj(tekst)) {
    if (k === 40 || k === 41 || k === 92) wynik += `\\${String.fromCharCode(k)}`;
    else if (k < 127) wynik += String.fromCharCode(k);
    else wynik += `\\${k.toString(8).padStart(3, '0')}`;
  }
  return `${wynik})`;
}

/** Tekst w metadanych pliku: UTF-16 z BOM, zapisany szesnastkowo. */
function ciagMetadanych(tekst: string): string {
  let hex = 'FEFF';
  for (let i = 0; i < tekst.length; i++) hex += tekst.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
  return `<${hex}>`;
}

// --- układ strony (punkty) ---
const STRONA = { szer: 595.28, wys: 841.89 };
const MARGINES = { lewy: 42, prawy: 42, gora: 48, dol: 54 };
const SZER = STRONA.szer - MARGINES.lewy - MARGINES.prawy;
const KOLUMNY = { opis: 215, kwota: 125, odstep: 12 };
const UWAGA_X = MARGINES.lewy + KOLUMNY.opis + KOLUMNY.odstep + KOLUMNY.kwota + KOLUMNY.odstep;
const UWAGA_SZER = MARGINES.lewy + SZER - UWAGA_X;
const KWOTA_PRAWA = MARGINES.lewy + KOLUMNY.opis + KOLUMNY.odstep + KOLUMNY.kwota;

const KOLOR = {
  tekst: '0.106 0.122 0.153 rg',
  szary: '0.35 0.35 0.35 rg',
  akcent: '0.122 0.373 0.545',
  tloSekcji: '0.949 0.949 0.949 rg',
  linia: '0.886 0.902 0.918 RG',
};

const ROZMIAR = { tytul: 16, sekcja: 10, tekst: 9, uwaga: 7.8, przypis: 8.2, stopka: 7.5 };
const interlinia = (r: number) => r * 1.3;

function wartoscTekst(w: Wartosc): string {
  if ('kwota' in w) return formatPln(w.kwota);
  if ('procent' in w) return formatRate(w.procent);
  return w.tekst;
}

class Strony {
  strony: string[][] = [[]];
  y = STRONA.wys - MARGINES.gora;

  get biezaca() {
    return this.strony[this.strony.length - 1];
  }

  /** Nowa strona, jeśli zostało mniej miejsca niż `potrzeba`. */
  zmiesc(potrzeba: number) {
    if (this.y - potrzeba < MARGINES.dol) {
      this.strony.push([]);
      this.y = STRONA.wys - MARGINES.gora;
    }
  }

  tekst(x: number, y: number, t: string, kroj: Krój, rozmiar: number, kolor = KOLOR.tekst) {
    const font = kroj === 'gruba' ? 'F2' : 'F1';
    this.biezaca.push(`BT ${kolor} /${font} ${rozmiar} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td ${ciag(t)} Tj ET`);
  }

  tekstDoPrawej(prawa: number, y: number, t: string, kroj: Krój, rozmiar: number, kolor = KOLOR.tekst) {
    this.tekst(prawa - szerokosc(t, kroj, rozmiar), y, t, kroj, rozmiar, kolor);
  }

  prostokat(x: number, y: number, w: number, h: number, kolor: string) {
    this.biezaca.push(`${kolor} ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
  }

  kreska(y: number, kolor = KOLOR.linia, grubosc = 0.5) {
    this.biezaca.push(
      `${kolor} ${grubosc} w ${MARGINES.lewy} ${y.toFixed(2)} m ${(MARGINES.lewy + SZER).toFixed(2)} ${y.toFixed(2)} l S`,
    );
  }
}

/** Akapit tekstu na całą szerokość. */
function akapit(s: Strony, t: string, kroj: Krój, rozmiar: number, kolor: string, odstep: number) {
  const lh = interlinia(rozmiar);
  const linie = zlam(t, kroj, rozmiar, SZER);
  // Krótki akapit przenosimy w całości na następną stronę, zamiast go dzielić.
  if (linie.length <= 6) s.zmiesc(linie.length * lh);
  for (const linia of linie) {
    s.zmiesc(lh);
    s.y -= lh;
    s.tekst(MARGINES.lewy, s.y + lh * 0.24, linia, kroj, rozmiar, kolor);
  }
  s.y -= odstep;
}

function sekcja(s: Strony, t: string) {
  const wys = 17;
  // Nagłówek sekcji nie zostaje sam na dole strony.
  s.zmiesc(wys + 10 + 2 * interlinia(ROZMIAR.tekst));
  s.y -= 10;
  s.prostokat(MARGINES.lewy, s.y - wys, SZER, wys, KOLOR.tloSekcji);
  s.tekst(MARGINES.lewy + 6, s.y - wys + 5.5, t, 'gruba', ROZMIAR.sekcja);
  s.y -= wys + 2;
}

function pozycja(s: Strony, w: Extract<Wiersz, { rodzaj: 'pozycja' }>) {
  const lh = interlinia(ROZMIAR.tekst);
  const lhU = interlinia(ROZMIAR.uwaga);
  const opis = zlam(w.tekst, 'zwykla', ROZMIAR.tekst, KOLUMNY.opis);
  const wartosc = zlam(wartoscTekst(w.wartosc), 'zwykla', ROZMIAR.tekst, KOLUMNY.kwota);
  const uwaga = w.uwaga ? zlam(w.uwaga, 'zwykla', ROZMIAR.uwaga, UWAGA_SZER) : [];
  const wys = Math.max(opis.length * lh, wartosc.length * lh, uwaga.length * lhU) + 5;
  s.zmiesc(wys);
  const gora = s.y - 2.5;
  opis.forEach((l, i) => s.tekst(MARGINES.lewy, gora - (i + 1) * lh + lh * 0.24, l, 'zwykla', ROZMIAR.tekst));
  wartosc.forEach((l, i) =>
    s.tekstDoPrawej(KWOTA_PRAWA, gora - (i + 1) * lh + lh * 0.24, l, 'zwykla', ROZMIAR.tekst),
  );
  uwaga.forEach((l, i) =>
    s.tekst(UWAGA_X, gora - (i + 1) * lhU + lhU * 0.2, l, 'zwykla', ROZMIAR.uwaga, KOLOR.szary),
  );
  s.y -= wys;
  s.kreska(s.y);
}

function uloz(wiersze: Wiersz[]): string[][] {
  const s = new Strony();
  for (const w of wiersze) {
    switch (w.rodzaj) {
      case 'tytul':
        s.zmiesc(30);
        s.y -= ROZMIAR.tytul;
        s.tekst(MARGINES.lewy, s.y, w.tekst, 'gruba', ROZMIAR.tytul);
        s.y -= 8;
        s.kreska(s.y, `${KOLOR.akcent} RG`, 1.5);
        s.y -= 6;
        break;
      case 'przypis':
        akapit(s, w.tekst, 'zwykla', ROZMIAR.przypis, KOLOR.szary, 4);
        break;
      case 'akapit':
        akapit(s, w.tekst, 'zwykla', ROZMIAR.tekst, KOLOR.tekst, 3);
        break;
      case 'sekcja':
        sekcja(s, w.tekst);
        break;
      case 'pozycja':
        pozycja(s, w);
        break;
    }
  }
  // Stopka z numerem strony.
  const n = s.strony.length;
  s.strony.forEach((polecenia, i) => {
    const y = MARGINES.dol - 24;
    const font = (t: string, x: number) =>
      `BT ${KOLOR.szary} /F1 ${ROZMIAR.stopka} Tf ${x.toFixed(2)} ${y} Td ${ciag(t)} Tj ET`;
    const nr = `Strona ${i + 1} z ${n}`;
    polecenia.push(
      font('Kalkulator celów mieszanych — samochód osobowy w firmie', MARGINES.lewy),
      font(nr, MARGINES.lewy + SZER - szerokosc(nr, 'zwykla', ROZMIAR.stopka)),
    );
  });
  return s.strony;
}

/** Data w formacie PDF: D:RRRRMMDDGGmmSS. */
function dataPdf(d: Date): string {
  const p = (x: number) => String(x).padStart(2, '0');
  return `D:${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** Składa obiekty w plik PDF z tablicą odsyłaczy. */
function zloz(strony: string[][], kiedy: Date): Uint8Array {
  const obiekty: string[] = [];
  // push zwraca nową długość, czyli numer obiektu liczony od 1.
  const dodaj = (tresc: string) => obiekty.push(tresc);

  const katalog = dodaj('');
  const drzewo = dodaj('');
  const kodowanie = dodaj(`<< /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences ${ROZNICE} >>`);
  const f1 = dodaj(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding ${kodowanie} 0 R >>`);
  const f2 = dodaj(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding ${kodowanie} 0 R >>`);
  const info = dodaj(
    `<< /Title ${ciagMetadanych('Rozliczenie — samochód osobowy w firmie')} /Producer ${ciagMetadanych(
      'Kalkulator celów mieszanych',
    )} /CreationDate (${dataPdf(kiedy)}) >>`,
  );

  const kids: number[] = [];
  for (const polecenia of strony) {
    const strumien = polecenia.join('\n');
    const tresc = dodaj(`<< /Length ${strumien.length} >>\nstream\n${strumien}\nendstream`);
    kids.push(
      dodaj(
        `<< /Type /Page /Parent ${drzewo} 0 R /MediaBox [0 0 ${STRONA.szer} ${STRONA.wys}] ` +
          `/Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${tresc} 0 R >>`,
      ),
    );
  }
  obiekty[katalog - 1] = `<< /Type /Catalog /Pages ${drzewo} 0 R >>`;
  obiekty[drzewo - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;

  // Wszystkie znaki mają kody < 256, więc długość w znakach = długość w bajtach.
  let plik = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const przesuniecia: number[] = [];
  obiekty.forEach((tresc, i) => {
    przesuniecia.push(plik.length);
    plik += `${i + 1} 0 obj\n${tresc}\nendobj\n`;
  });
  const xref = plik.length;
  plik += `xref\n0 ${obiekty.length + 1}\n0000000000 65535 f \n`;
  for (const p of przesuniecia) plik += `${String(p).padStart(10, '0')} 00000 n \n`;
  plik += `trailer\n<< /Size ${obiekty.length + 1} /Root ${katalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  const bajty = new Uint8Array(plik.length);
  for (let i = 0; i < plik.length; i++) bajty[i] = plik.charCodeAt(i);
  return bajty;
}

export function plikPdf(
  input: CalculatorInput,
  result: CalculationResult,
  kiedy: Date = new Date(),
  plan: PlanKont = DOMYSLNY_PLAN_KONT,
): Uint8Array {
  return zloz(uloz(wierszeRozliczenia(input, result, kiedy, plan)), kiedy);
}

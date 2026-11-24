import { formatPln, round2 } from './money';
import type { CalculationResult, CalculatorInput, ExpenseCategory } from './types';

/** Rodzaje wydatku, które dekretujemy wprost z faktury — zakup idzie przez środki trwałe. */
export type KategoriaKosztu = Exclude<ExpenseCategory, 'purchase'>;

/**
 * Numery kont użyte w dekrecie. Domyślne odpowiadają planowi kont fundacji,
 * dla której program powstał; każdy może je zmienić u siebie.
 */
export interface PlanKont {
  /** Rozrachunki z dostawcą — strona Ma, kwota brutto. */
  kontrahent: string;
  /** Konto kosztu rodzajowego dla każdego rodzaju wydatku (przy leasingu — kapitał). */
  koszt: Record<KategoriaKosztu, string>;
  /** Odsetki leasingowe jako koszt finansowy. */
  odsetki: string;
  /** Analityka odsetek wyłączonych z kosztów podatkowych. */
  odsetkiNkup: string;
  /** Koszty rodzajowe niestanowiące kosztów uzyskania przychodu. */
  nkup: string;
  /** VAT naliczony do odliczenia. */
  vat: string;
  /** Rozliczenie kosztów rodzajowych. */
  rozliczenie: string;
  /** Koszty działalności statutowej (nieodpłatnej). */
  statutowe: string;
  /** Koszty działalności gospodarczej. */
  gospodarcze: string;
}

export const DOMYSLNY_PLAN_KONT: PlanKont = {
  kontrahent: '202',
  koszt: { leasing: '402-13', operating: '401-01', insuranceAC: '409', insuranceOC: '409' },
  odsetki: '751-01-01',
  odsetkiNkup: '751-01-02',
  nkup: '408-07',
  vat: '221-01',
  rozliczenie: '490',
  statutowe: '500-02',
  gospodarcze: '501-01',
};

/** Uzupełnia zapisany plan kont o pola, których w nim brakuje — np. po zmianie wersji. */
export function uzupelnijPlan(zapisany: unknown): PlanKont {
  const z = (zapisany && typeof zapisany === 'object' ? zapisany : {}) as Partial<Record<keyof PlanKont, unknown>>;
  const tekst = (v: unknown, domyslny: string) => (typeof v === 'string' ? v : domyslny);
  const koszt = (z.koszt && typeof z.koszt === 'object' ? z.koszt : {}) as Partial<Record<KategoriaKosztu, unknown>>;
  const d = DOMYSLNY_PLAN_KONT;
  return {
    kontrahent: tekst(z.kontrahent, d.kontrahent),
    koszt: {
      leasing: tekst(koszt.leasing, d.koszt.leasing),
      operating: tekst(koszt.operating, d.koszt.operating),
      insuranceAC: tekst(koszt.insuranceAC, d.koszt.insuranceAC),
      insuranceOC: tekst(koszt.insuranceOC, d.koszt.insuranceOC),
    },
    odsetki: tekst(z.odsetki, d.odsetki),
    odsetkiNkup: tekst(z.odsetkiNkup, d.odsetkiNkup),
    nkup: tekst(z.nkup, d.nkup),
    vat: tekst(z.vat, d.vat),
    rozliczenie: tekst(z.rozliczenie, d.rozliczenie),
    statutowe: tekst(z.statutowe, d.statutowe),
    gospodarcze: tekst(z.gospodarcze, d.gospodarcze),
  };
}

export interface PozycjaDekretu {
  wn?: string;
  ma?: string;
  kwota: number;
  opis: string;
  /** Przeksięgowanie kosztów rodzajowych przez konto rozliczeniowe — poza kontrolą Wn = Ma faktury. */
  przeksiegowanie?: boolean;
}

const NKUP_OPIS: Record<KategoriaKosztu, string> = {
  leasing: 'kapitał ponad limit — NKUP',
  operating: '25% wyłączone z kosztów — NKUP',
  insuranceAC: 'składka ponad limit — NKUP',
  insuranceOC: 'poza kosztami — NKUP',
};

/**
 * Dekret faktury na konta: zobowiązanie brutto po stronie Ma, a po stronie Wn
 * koszt (część statutowa i koszt podatkowy), odsetki, VAT do odliczenia i to,
 * co nie jest kosztem podatkowym. W wariancie B część statutowa ponad limity
 * idzie razem z gospodarczą na konta wyłączeń. W organizacji dochodzi przeksięgowanie
 * kosztów rodzajowych przez konto rozliczeniowe na koszty działalności
 * statutowej i gospodarczej — odsetki zostają w kosztach finansowych.
 */
export function dekret(input: CalculatorInput, result: CalculationResult, plan: PlanKont): PozycjaDekretu[] | null {
  const r = result.rozbicie;
  if (!r || input.category === 'purchase') return null;

  const organizacja = result.allocation !== null;
  const leasing = input.category === 'leasing';
  const nazwa = leasing ? 'kapitał' : 'koszt';
  const p: PozycjaDekretu[] = [];
  const dodaj = (pozycja: PozycjaDekretu) => {
    if (pozycja.kwota > 0) p.push(pozycja);
  };
  const sklad = (statutowa: number, kup: number) =>
    organizacja && statutowa > 0
      ? `statutowa${input.statutoryLimits ? ' w kosztach' : ''} ${formatPln(statutowa)} + gospodarcza w kosztach ${formatPln(kup)}`
      : 'w kosztach podatkowych';
  /** Wyłączenie z kosztów; w wariancie B razem z częścią statutową ponad limity. */
  const wylaczenie = (opis: string, statutowa: number, gospodarcza: number) =>
    statutowa > 0
      ? `${opis}: statutowa ${formatPln(statutowa)} + gospodarcza ${formatPln(gospodarcza)}`
      : opis;

  dodaj({ ma: plan.kontrahent, kwota: r.brutto, opis: 'zobowiązanie wobec dostawcy — brutto' });
  dodaj({
    wn: plan.koszt[input.category],
    kwota: round2(r.glowna.statutowaWKosztach + r.glowna.kup),
    opis: `${nazwa}: ${sklad(r.glowna.statutowaWKosztach, r.glowna.kup)}`,
  });
  dodaj({
    wn: plan.odsetki,
    kwota: round2(r.odsetki.statutowaWKosztach + r.odsetki.kup),
    opis: `odsetki: ${sklad(r.odsetki.statutowaWKosztach, r.odsetki.kup)}`,
  });
  dodaj({ wn: plan.vat, kwota: r.vatOdliczony, opis: 'VAT naliczony do odliczenia' });
  dodaj({
    wn: plan.nkup,
    kwota: round2(r.glowna.statutowaPozaKosztami + r.glowna.nkup),
    opis: wylaczenie(NKUP_OPIS[input.category], r.glowna.statutowaPozaKosztami, r.glowna.nkup),
  });
  dodaj({
    wn: plan.odsetkiNkup,
    kwota: round2(r.odsetki.statutowaPozaKosztami + r.odsetki.nkup),
    opis: wylaczenie('25% odsetek wyłączone z kosztów — NKUP', r.odsetki.statutowaPozaKosztami, r.odsetki.nkup),
  });

  if (organizacja) {
    dodaj({
      wn: plan.statutowe,
      ma: plan.rozliczenie,
      kwota: r.glowna.statutowa,
      opis: `przeksięgowanie — działalność statutowa (${nazwa})`,
      przeksiegowanie: true,
    });
    const gospodarcza = round2(r.glowna.kup + r.glowna.nkup);
    dodaj({
      wn: plan.gospodarcze,
      ma: plan.rozliczenie,
      kwota: gospodarcza,
      opis:
        r.glowna.nkup > 0
          ? `przeksięgowanie — działalność gospodarcza (${formatPln(r.glowna.kup)} + ${formatPln(r.glowna.nkup)})`
          : `przeksięgowanie — działalność gospodarcza (${nazwa})`,
      przeksiegowanie: true,
    });
  }
  return p;
}

/** Sumy stron dekretu faktury, bez przeksięgowań — muszą być równe. */
export function sumyDekretu(pozycje: PozycjaDekretu[]): { wn: number; ma: number } {
  const faktura = pozycje.filter((x) => !x.przeksiegowanie);
  const suma = (strona: 'wn' | 'ma') =>
    round2(faktura.filter((x) => x[strona]).reduce((s, x) => s + x.kwota, 0));
  return { wn: suma('wn'), ma: suma('ma') };
}

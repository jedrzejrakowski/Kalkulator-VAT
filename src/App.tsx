import { useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { NumberField, PercentField } from './components/fields';
import { CategoryIcon, ClearIcon, GearIcon, MoonIcon, SunIcon } from './components/Icons';
import { Logo } from './components/Logo';
import { PanelUstawien } from './components/PanelUstawien';
import { ResultPanel } from './components/ResultPanel';
import { TitleBar } from './components/TitleBar';
import { calculate } from './domain/calculate';
import { DEFAULT_INPUT, VAT_RATES } from './domain/defaults';
import { uzupelnijPlan, type PlanKont } from './domain/dekret';
import {
  CATEGORY_HINTS,
  CATEGORY_LABELS,
  isVatExempt,
  needsVehicleLimit,
} from './domain/labels';
import { statutoryLimit } from './domain/limits';
import { formatPln, round2 } from './domain/money';
import type {
  AmountMode,
  CalculatorInput,
  EntityType,
  ExpenseCategory,
  Powertrain,
} from './domain/types';
import {
  PALETY,
  czyCiemny,
  wczytaj as wczytajUstawienia,
  zapisz as zapiszUstawienia,
  zastosuj,
  type Ustawienia,
} from './domain/ustawienia';

const KATEGORIE_KAFELKI: { value: ExpenseCategory; short: string }[] = [
  { value: 'operating', short: 'Eksploatacja' },
  { value: 'leasing', short: 'Leasing / Najem' },
  { value: 'purchase', short: 'Zakup auta' },
  { value: 'insuranceAC', short: 'Ubezp. AC / GAP' },
  { value: 'insuranceOC', short: 'OC / NNW' },
];

const NAPEDY: { value: Powertrain; short: string; sub: string }[] = [
  { value: 'emissionHigh', short: 'Spalinowy', sub: 'CO₂ ≥ 50 g/km' },
  { value: 'emissionLow', short: 'Niskoemisyjny', sub: 'CO₂ < 50 g/km' },
  { value: 'zeroEmission', short: 'Elektryczny / H₂', sub: '0 g/km' },
];

/**
 * Data wyliczenia widoczna tylko na wydruku i w PDF.
 *
 * Odświeżana przy `beforeprint`, więc karta otwarta od wczoraj drukuje się
 * z dzisiejszą datą — także przy Ctrl+P. `flushSync`, bo przeglądarka robi
 * zrzut strony zaraz po tym zdarzeniu i nie czeka na zwykły render Reacta.
 */
function PrintDate() {
  const [date, setDate] = useState(() => new Date());

  useEffect(() => {
    const refresh = () => flushSync(() => setDate(new Date()));
    window.addEventListener('beforeprint', refresh);
    return () => window.removeEventListener('beforeprint', refresh);
  }, []);

  return (
    <p className="print-only topbar__date">
      Data wyliczenia: {date.toLocaleString('pl-PL', { dateStyle: 'long', timeStyle: 'short' })}
    </p>
  );
}

const KLUCZ_PLANU = 'kalkulator-vat:plan-kont';

/** Numery kont z poprzedniej wizyty; bez dostępu do pamięci przeglądarki — domyślne. */
function wczytajPlan(): PlanKont {
  try {
    const zapis = window.localStorage.getItem(KLUCZ_PLANU);
    return uzupelnijPlan(zapis ? JSON.parse(zapis) : null);
  } catch {
    return uzupelnijPlan(null);
  }
}

/** Krótki przełącznik jednej z kilku opcji; pod spodem opis wybranej. */
function Przelacznik<T extends string>({
  etykieta,
  wartosc,
  opcje,
  zmien,
}: {
  etykieta: string;
  wartosc: T;
  opcje: { value: T; label: string; opis?: string }[];
  zmien: (v: T) => void;
}) {
  const wybrana = opcje.find((o) => o.value === wartosc);
  return (
    <div className="field">
      <span className="field-label">{etykieta}</span>
      <div className="segmented segmented-pelny" role="group" aria-label={etykieta}>
        {opcje.map((o) => (
          <button key={o.value} type="button" aria-pressed={o.value === wartosc} onClick={() => zmien(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
      {wybrana?.opis ? <span className="field-hint">{wybrana.opis}</span> : null}
    </div>
  );
}

export default function App() {
  const [plan, setPlan] = useState<PlanKont>(wczytajPlan);
  const zmienPlan = (nowy: PlanKont) => {
    setPlan(nowy);
    try {
      window.localStorage.setItem(KLUCZ_PLANU, JSON.stringify(nowy));
    } catch {
      // Tryb prywatny albo zablokowana pamięć — numery działają do zamknięcia karty.
    }
  };
  const [input, setInput] = useState<CalculatorInput>(DEFAULT_INPUT);

  const [ustawienia, setUstawienia] = useState<Ustawienia>(wczytajUstawienia);
  const [panelOtwarty, setPanelOtwarty] = useState(false);
  const [systemCiemny, setSystemCiemny] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  // Ustawienia przenosimy do zmiennych CSS i nasłuchujemy zmiany motywu systemu,
  // bo przy wyborze „jak w systemie” paleta musi za nim podążać.
  useEffect(() => {
    const pytanie = window.matchMedia('(prefers-color-scheme: dark)');
    const nanies = () => {
      setSystemCiemny(pytanie.matches);
      zastosuj(ustawienia, document.documentElement, pytanie.matches);
      const odcien = PALETY[ustawienia.paleta][czyCiemny(ustawienia, pytanie.matches) ? 'ciemny' : 'jasny'];
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', odcien.titlebarBg);
    };
    nanies();
    zapiszUstawienia(ustawienia);
    pytanie.addEventListener('change', nanies);
    return () => pytanie.removeEventListener('change', nanies);
  }, [ustawienia]);

  const result = useMemo(() => calculate(input), [input]);
  const jestCiemny = czyCiemny(ustawienia, systemCiemny);

  const patch = (changes: Partial<CalculatorInput>) =>
    setInput((current) => ({ ...current, ...changes }));

  const changeCategory = (category: ExpenseCategory) =>
    // Ubezpieczenia są zwolnione z VAT, więc stawka wraca do zera i z powrotem do 23%.
    patch({
      category,
      vatRatePercent: isVatExempt(category) ? 0 : input.vatRatePercent || 23,
      interestNet: category === 'leasing' ? input.interestNet : 0,
      // Faktura leasingowa podaje kapitał i odsetki netto — tak też je wpisujemy.
      amountMode: category === 'leasing' ? 'net' : input.amountMode,
    });

  /** Wariant bezpieczniejszy: zeruje kwoty bieżącej faktury, zachowując podmiot, limity i plan kont. */
  const wyczyscFakture = () => patch({ amount: 0, interestNet: 0 });
  const maKwote = input.amount > 0 || input.interestNet > 0;

  const showVehicle = needsVehicleLimit(input.category);
  // Rata to kapitał + odsetki; pole „Kapitał” pokazuje różnicę, żeby faktura dała się przepisać wprost.
  const capitalNet = Math.max(0, round2(input.amount - input.interestNet));
  const lawfulLimit = statutoryLimit(input.powertrain);
  const manualRatio = input.ratioOverridePercent !== null;
  const manualRatioAllowed =
    input.category === 'leasing' || input.category === 'purchase' || input.category === 'insuranceAC';

  return (
    <>
      <TitleBar />
      <div className="app-shell">
        <header className="topbar">
          <div className="topbar__inner">
            <div className="topbar__brand">
              <Logo size={38} className="topbar__mark" />
              <div className="topbar__titles">
                <div className="topbar__title-row">
                  <h1>Kalkulator celów mieszanych</h1>
                  <span className="topbar__badge no-print">
                    {input.entityType === 'ngo' ? 'Fundacja / NGO' : 'Samochód osobowy'} • 2026
                  </span>
                </div>
                <span className="topbar__sub">Rozliczenie VAT i kosztu podatkowego pojedynczej faktury</span>
              </div>
            </div>

            <PrintDate />

            <div className="topbar__actions no-print">
              <button
                type="button"
                className="action-chip action-chip--accent"
                onClick={wyczyscFakture}
                disabled={!maKwote}
                title="Zeruje kwoty bieżącej faktury, zachowując wybrany podmiot, parametry pojazdu i plan kont"
              >
                <ClearIcon size={15} />
                <span>Wyczyść dane</span>
              </button>

              <button
                type="button"
                className="action-chip"
                onClick={() => setPanelOtwarty(true)}
                aria-label="Ustawienia wyglądu"
                title="Ustawienia wyglądu"
              >
                <GearIcon size={15} />
                <span>Wygląd</span>
              </button>

              <button
                type="button"
                className="action-chip action-chip--icon"
                onClick={() => setUstawienia((u) => ({ ...u, motyw: jestCiemny ? 'jasny' : 'ciemny' }))}
                aria-label={jestCiemny ? 'Przełącz na motyw jasny' : 'Przełącz na motyw ciemny'}
                title={jestCiemny ? 'Przełącz na motyw jasny' : 'Przełącz na motyw ciemny'}
              >
                {jestCiemny ? <SunIcon size={16} /> : <MoonIcon size={16} />}
              </button>
            </div>
          </div>
        </header>

        <PanelUstawien
          otwarty={panelOtwarty}
          ustawienia={ustawienia}
          onZmiana={setUstawienia}
          onZamknij={() => setPanelOtwarty(false)}
        />

        <main className="page">
          <div className="workspace">
            <div className="form-column no-print">
              <section className="card">
                <div className="card__head">
                  <span className="card__step">Krok 1</span>
                  <h2>Podmiot i rodzaj wydatku</h2>
                  <p className="card-hint">Decyduje o prawie do odliczenia VAT i dostępnych limitach.</p>
                </div>

                <Przelacznik<EntityType>
                  etykieta="Rodzaj podmiotu"
                  wartosc={input.entityType}
                  zmien={(entityType) => patch({ entityType })}
                  opcje={[
                    {
                      value: 'business',
                      label: 'Firma',
                      opis: 'Pełne prawo do odliczenia ograniczone do 50% z uwagi na użytek mieszany.',
                    },
                    {
                      value: 'ngo',
                      label: 'Fundacja / stowarzyszenie',
                      opis: 'Najpierw prewspółczynnik i proporcja sprzedaży, potem ograniczenie do 50%.',
                    },
                  ]}
                />

                {input.entityType === 'ngo' ? (
                  <div className="ngo-box">
                    <div className="grid-3">
                      <PercentField
                        label="Prewspółczynnik"
                        value={input.prePercent}
                        onChange={(prePercent) => patch({ prePercent })}
                        roundUp
                        hint="art. 86 ust. 2a"
                      />
                      <PercentField
                        label="Proporcja sprzedaży"
                        value={input.salesPercent}
                        onChange={(salesPercent) => patch({ salesPercent })}
                        roundUp
                        hint="art. 90 ust. 2"
                      />
                      <PercentField
                        label="Udział w koszcie"
                        value={input.businessSharePercent}
                        onChange={(businessSharePercent) => patch({ businessSharePercent })}
                        hint="dział. gospodarcza"
                      />
                    </div>
                    <Przelacznik<'A' | 'B'>
                      etykieta="Limity a część statutowa"
                      wartosc={input.statutoryLimits ? 'B' : 'A'}
                      zmien={(w) => patch({ statutoryLimits: w === 'B' })}
                      opcje={[
                        {
                          value: 'A',
                          label: 'Wariant A — tylko gosp.',
                          opis: 'Część statutowa bez limitów, w całości na koncie kosztu.',
                        },
                        {
                          value: 'B',
                          label: 'Wariant B — cała faktura',
                          opis: 'Limity także od części statutowej. Koszt podatkowy części gospodarczej bez zmian.',
                        },
                      ]}
                    />
                  </div>
                ) : null}

                <div className="field">
                  <span className="field-label">Rodzaj wydatku</span>
                  <div className="category-grid" role="group" aria-label="Rodzaj wydatku">
                    {KATEGORIE_KAFELKI.map((item) => {
                      const active = input.category === item.value;
                      return (
                        <button
                          key={item.value}
                          type="button"
                          className={`category-tile${active ? ' category-tile--active' : ''}`}
                          aria-pressed={active}
                          title={CATEGORY_LABELS[item.value]}
                          onClick={() => changeCategory(item.value)}
                        >
                          <span className="category-tile__icon">
                            <CategoryIcon category={item.value} size={19} />
                          </span>
                          <span className="category-tile__label">{item.short}</span>
                        </button>
                      );
                    })}
                  </div>
                  <span className="field-hint">{CATEGORY_HINTS[input.category]}</span>
                </div>
              </section>

              <section className="card">
                <div className="card__head">
                  <span className="card__step">Krok 2</span>
                  <h2>Dane faktury{showVehicle ? ' i pojazd' : ''}</h2>
                  <p className="card-hint">
                    {input.category === 'leasing'
                      ? 'Przepisz obie pozycje netto z faktury leasingowej.'
                      : 'Wpisz kwotę z dokumentu — wyliczenie aktualizuje się na bieżąco.'}
                  </p>
                </div>

                {input.category === 'leasing' ? (
                  <>
                    <div className="grid-2">
                      <NumberField
                        label="Kapitał (netto)"
                        value={capitalNet}
                        onChange={(capital) => patch({ amount: round2(capital + input.interestNet) })}
                        suffix="zł"
                      />
                      <NumberField
                        label="Odsetki (netto)"
                        value={input.interestNet}
                        onChange={(interestNet) =>
                          patch({ interestNet, amount: round2(capitalNet + interestNet) })
                        }
                        suffix="zł"
                      />
                    </div>
                    <Przelacznik<'75' | '100'>
                      etykieta="Odsetki w kosztach"
                      wartosc={input.interest75 ? '75' : '100'}
                      zmien={(w) => patch({ interest75: w === '75' })}
                      opcje={[
                        {
                          value: '75',
                          label: '75%',
                          opis: 'Jak inne koszty używania auta — 25% poza kosztami (art. 16 ust. 1 pkt 51 CIT).',
                        },
                        {
                          value: '100',
                          label: 'W całości',
                          opis: 'Odsetki to koszt finansowania — w kosztach bez wyłączenia.',
                        },
                      ]}
                    />
                  </>
                ) : (
                  <div className="field">
                    <div className="field-row-head">
                      <span className="field-label">Kwota z faktury</span>
                      <div className="segmented segmented--compact" role="group" aria-label="Tryb kwoty">
                        {(['gross', 'net'] as AmountMode[]).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            aria-pressed={input.amountMode === mode}
                            onClick={() => patch({ amountMode: mode })}
                          >
                            {mode === 'gross' ? 'Brutto' : 'Netto'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="amount-hero">
                      <NumberField
                        value={input.amount}
                        onChange={(amount) => patch({ amount })}
                        suffix="zł"
                        ariaLabel={`Kwota z faktury ${input.amountMode === 'gross' ? 'brutto' : 'netto'}`}
                      />
                    </div>
                  </div>
                )}

                {isVatExempt(input.category) ? (
                  <div className="info-banner">
                    Usługa ubezpieczeniowa jest zwolniona z VAT — na fakturze nie ma podatku do odliczenia.
                  </div>
                ) : (
                  <div className="field">
                    <span className="field-label">Stawka VAT</span>
                    <div className="vat-pills" role="group" aria-label="Stawka VAT">
                      {VAT_RATES.map((rate) => {
                        const active = input.vatRatePercent === rate;
                        return (
                          <button
                            key={rate}
                            type="button"
                            className={`vat-pill${active ? ' vat-pill--active' : ''}`}
                            aria-pressed={active}
                            onClick={() => patch({ vatRatePercent: rate })}
                          >
                            {rate}%
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {showVehicle ? (
                  <div className="vehicle-section">
                    <div className="vehicle-section__head">
                      <h3>Pojazd i limit wartości (2026)</h3>
                    </div>

                    {input.category !== 'insuranceAC' ? (
                      <>
                        <div className="field">
                          <span className="field-label">Rodzaj napędu</span>
                          <div className="powertrain-grid" role="group" aria-label="Rodzaj napędu">
                            {NAPEDY.map((p) => {
                              const active = input.powertrain === p.value;
                              return (
                                <button
                                  key={p.value}
                                  type="button"
                                  className={`powertrain-card${active ? ' powertrain-card--active' : ''}`}
                                  aria-pressed={active}
                                  onClick={() => patch({ powertrain: p.value })}
                                >
                                  <span className="powertrain-card__name">{p.short}</span>
                                  <span className="powertrain-card__sub">{p.sub}</span>
                                  <span className="powertrain-card__limit">
                                    {formatPln(statutoryLimit(p.value))}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className={input.category === 'leasing' || input.category === 'purchase' ? 'grid-2' : undefined}>
                          {input.category === 'leasing' ? (
                            <NumberField
                              label="Wartość samochodu z umowy"
                              value={input.vehicleValue}
                              onChange={(vehicleValue) => patch({ vehicleValue })}
                              suffix="zł"
                              hint="Netto + nieodliczony VAT."
                            />
                          ) : null}

                          {input.category === 'purchase' ? (
                            <PercentField
                              label="Roczna stawka amortyzacji"
                              value={input.depreciationRatePercent}
                              onChange={(depreciationRatePercent) => patch({ depreciationRatePercent })}
                              hint="20% liniowa; 40% indywidualna."
                            />
                          ) : null}

                          <NumberField
                            label="Limit w wyliczeniu"
                            value={input.limitOverride ?? lawfulLimit}
                            onChange={(value) =>
                              patch({ limitOverride: value === lawfulLimit ? null : value })
                            }
                            suffix="zł"
                            hint="Edytowalne dla przepisów przejściowych."
                          />
                        </div>
                      </>
                    ) : (
                      <div className="grid-2">
                        <NumberField
                          label="Wartość dla ubezpieczenia"
                          value={input.insuredValue}
                          onChange={(insuredValue) => patch({ insuredValue })}
                          suffix="zł"
                        />
                        <NumberField
                          label="Limit dla składek AC"
                          value={input.acLimit}
                          onChange={(acLimit) => patch({ acLimit })}
                          suffix="zł"
                          hint="150 000 zł niezależnie od napędu."
                        />
                      </div>
                    )}

                    {manualRatioAllowed ? (
                      <>
                        <label className="opcja-inline">
                          <input
                            type="checkbox"
                            checked={manualRatio}
                            onChange={(event) =>
                              patch({
                                ratioOverridePercent: event.target.checked
                                  ? Math.round((result.limit?.ratio ?? 1) * 10_000) / 100
                                  : null,
                              })
                            }
                          />
                          <span>Wpisz proporcję limitu ręcznie</span>
                        </label>

                        {manualRatio ? (
                          <PercentField
                            label="Proporcja zaliczana do kosztów"
                            value={input.ratioOverridePercent as number}
                            onChange={(ratioOverridePercent) => patch({ ratioOverridePercent })}
                            hint="Część kwoty objętej limitem, która trafia do kosztów. Ułamki są dozwolone."
                          />
                        ) : null}
                      </>
                    ) : null}
                  </div>
                ) : null}
              </section>
            </div>

            <ResultPanel input={input} result={result} plan={plan} onPlanChange={zmienPlan} />
          </div>
        </main>
      </div>
    </>
  );
}

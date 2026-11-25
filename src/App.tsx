import { useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { NumberField, PercentField, SelectField } from './components/fields';
import { Logo } from './components/Logo';
import { ResultPanel } from './components/ResultPanel';
import { TitleBar } from './components/TitleBar';
import { PanelUstawien } from './components/PanelUstawien';
import { PALETY, czyCiemny, wczytaj as wczytajUstawienia, zapisz as zapiszUstawienia, zastosuj, type Ustawienia } from './domain/ustawienia';
import { calculate } from './domain/calculate';
import { uzupelnijPlan, type PlanKont } from './domain/dekret';
import { DEFAULT_INPUT, VAT_RATES } from './domain/defaults';
import {
  CATEGORY_HINTS,
  CATEGORY_LABELS,
  isVatExempt,
  needsVehicleLimit,
} from './domain/labels';
import { POWERTRAIN_LABELS, statutoryLimit } from './domain/limits';
import { formatPln, round2 } from './domain/money';
import type {
  AmountMode,
  CalculatorInput,
  EntityType,
  ExpenseCategory,
  Powertrain,
} from './domain/types';

const CATEGORY_OPTIONS = (Object.keys(CATEGORY_LABELS) as ExpenseCategory[]).map((value) => ({
  value,
  label: CATEGORY_LABELS[value],
}));

const VAT_RATE_OPTIONS = VAT_RATES.map((rate) => ({
  value: String(rate),
  label: `${rate}%`,
}));

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
    <p className="print-only page-header__date">
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

  // Ustawienia przenosimy do zmiennych CSS i nasłuchujemy zmiany motywu systemu,
  // bo przy wyborze „jak w systemie” paleta musi za nim podążać.
  useEffect(() => {
    const pytanie = window.matchMedia('(prefers-color-scheme: dark)');
    const nanies = () => {
      zastosuj(ustawienia, document.documentElement, pytanie.matches);
      // Kolor paska okna w zainstalowanej aplikacji i na telefonie idzie za paletą.
      const odcien = PALETY[ustawienia.paleta][czyCiemny(ustawienia, pytanie.matches) ? 'ciemny' : 'jasny'];
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', odcien.titlebarBg);
    };
    nanies();
    zapiszUstawienia(ustawienia);
    pytanie.addEventListener('change', nanies);
    return () => pytanie.removeEventListener('change', nanies);
  }, [ustawienia]);
  const result = useMemo(() => calculate(input), [input]);

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
      <div className="page">
      <header className="page-header">
        <Logo size={40} className="page-header__mark" />
        <div className="page-header__tekst">
          <h1>Kalkulator celów mieszanych</h1>
          <span className="page-header__sub">Samochód osobowy w firmie</span>
        </div>
        <PrintDate />
        <button
          type="button"
          className="zebatka"
          onClick={() => setPanelOtwarty(true)}
          aria-label="Ustawienia wyglądu"
          title="Ustawienia wyglądu"
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .33 1.87l.06.06a2 2 0 1 1-2.830 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.33 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.87.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.53 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.7 8.9a1.7 1.7 0 0 0-.33-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.53 1.7 1.7 0 0 0 10 2.98V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.33 1.87V10a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z" />
          </svg>
        </button>
      </header>

      <PanelUstawien
        otwarty={panelOtwarty}
        ustawienia={ustawienia}
        onZmiana={setUstawienia}
        onZamknij={() => setPanelOtwarty(false)}
      />

      <div className="layout">
        <div>
          <section className="card">
            <h2>Podmiot</h2>
            <p className="card-hint">Decyduje o wskaźniku odliczenia podatku naliczonego.</p>
            <Przelacznik<EntityType>
              etykieta="Rodzaj podmiotu"
              wartosc={input.entityType}
              zmien={(entityType) => patch({ entityType })}
              opcje={[
                { value: 'business', label: 'Firma', opis: 'Pełne prawo do odliczenia ograniczone do 50% z uwagi na użytek mieszany.' },
                { value: 'ngo', label: 'Fundacja / stowarzyszenie', opis: 'Najpierw prewspółczynnik, potem ograniczenie do 50%.' },
              ]}
            />

            {input.entityType === 'ngo' ? (
              <div className="stack">
                <div className="grid-3">
                  <PercentField
                    label="Prewspółczynnik"
                    value={input.prePercent}
                    onChange={(prePercent) => patch({ prePercent })}
                    roundUp
                    hint="art. 86 ust. 2a, w górę do pełnych %"
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
                    hint="działalności gospodarczej, wg polityki"
                  />
                </div>
                <Przelacznik<'A' | 'B'>
                  etykieta="Limity a część statutowa"
                  wartosc={input.statutoryLimits ? 'B' : 'A'}
                  zmien={(w) => patch({ statutoryLimits: w === 'B' })}
                  opcje={[
                    { value: 'A', label: 'Wariant A — tylko gospodarcza', opis: 'Część statutowa bez limitów, w całości na koncie kosztu.' },
                    { value: 'B', label: 'Wariant B — cała faktura', opis: 'Limity także od części statutowej. Koszt podatkowy części gospodarczej bez zmian.' },
                  ]}
                />
              </div>
            ) : null}
          </section>

          <section className="card">
            <h2>Wydatek</h2>
            <p className="card-hint">{CATEGORY_HINTS[input.category]}</p>

            <SelectField<ExpenseCategory>
              label="Rodzaj wydatku"
              value={input.category}
              options={CATEGORY_OPTIONS}
              onChange={changeCategory}
            />

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
                    onChange={(interestNet) => patch({ interestNet, amount: round2(capitalNet + interestNet) })}
                    suffix="zł"
                  />
                </div>
                <p className="field-hint" style={{ marginTop: -8, marginBottom: 16 }}>
                  Przepisz obie pozycje z faktury leasingowej. Limit wartości pojazdu obejmuje
                  wyłącznie kapitał.
                </p>
                <Przelacznik<'75' | '100'>
                  etykieta="Odsetki w kosztach"
                  wartosc={input.interest75 ? '75' : '100'}
                  zmien={(w) => patch({ interest75: w === '75' })}
                  opcje={[
                    { value: '75', label: '75%', opis: 'Jak inne koszty używania auta — objaśnienia MF z 9 lipca 2019 r.' },
                    { value: '100', label: 'W całości', opis: 'Całe odsetki w kosztach, bez wyłączenia.' },
                  ]}
                />
              </>
            ) : (
            <div className="field">
              <span className="field-label">Kwota z faktury</span>
              <div className="segmented" style={{ marginBottom: 10 }}>
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
              <NumberField
                value={input.amount}
                onChange={(amount) => patch({ amount })}
                suffix="zł"
                ariaLabel={`Kwota z faktury ${input.amountMode === 'gross' ? 'brutto' : 'netto'}`}
              />
            </div>
            )}

            {isVatExempt(input.category) ? (
              <p className="field-hint">
                Usługa ubezpieczeniowa jest zwolniona z VAT — na fakturze nie ma podatku do
                odliczenia.
              </p>
            ) : (
              <SelectField
                label="Stawka VAT"
                value={String(input.vatRatePercent)}
                options={VAT_RATE_OPTIONS}
                onChange={(value) => patch({ vatRatePercent: Number(value) })}
              />
            )}

          </section>

          {showVehicle ? (
            <section className="card">
              <h2>Pojazd i limity</h2>
              <p className="card-hint">
                Limity wartości samochodu osobowego obowiązujące od 1 stycznia 2026 r.
              </p>

              {input.category !== 'insuranceAC' ? (
                <>
                  <SelectField<Powertrain>
                    label="Napęd"
                    value={input.powertrain}
                    options={(Object.keys(POWERTRAIN_LABELS) as Powertrain[]).map((value) => ({
                      value,
                      label: `${POWERTRAIN_LABELS[value]} — limit ${formatPln(statutoryLimit(value))}`,
                    }))}
                    onChange={(powertrain) => patch({ powertrain })}
                  />

                  <div className="stack">
                    <NumberField
                      label="Limit stosowany w wyliczeniu"
                      value={input.limitOverride ?? lawfulLimit}
                      onChange={(value) =>
                        patch({ limitOverride: value === lawfulLimit ? null : value })
                      }
                      suffix="zł"
                      hint="Pole edytowalne — użyj go, jeśli do umowy stosujesz przepisy przejściowe albo limit sprzed 2026 r."
                    />
                  </div>
                </>
              ) : null}

              {input.category === 'leasing' ? (
                <NumberField
                  label="Wartość samochodu z umowy"
                  value={input.vehicleValue}
                  onChange={(vehicleValue) => patch({ vehicleValue })}
                  suffix="zł"
                  hint="Wartość netto powiększona o VAT niepodlegający odliczeniu."
                />
              ) : null}

              {input.category === 'purchase' ? (
                <PercentField
                  label="Roczna stawka amortyzacji"
                  value={input.depreciationRatePercent}
                  onChange={(depreciationRatePercent) => patch({ depreciationRatePercent })}
                  hint="20% metodą liniową; 40% przy stawce indywidualnej dla samochodu używanego."
                />
              ) : null}

              {input.category === 'insuranceAC' ? (
                <div className="grid-2">
                  <NumberField
                    label="Wartość dla celów ubezpieczenia"
                    value={input.insuredValue}
                    onChange={(insuredValue) => patch({ insuredValue })}
                    suffix="zł"
                  />
                  <NumberField
                    label="Limit dla składek AC"
                    value={input.acLimit}
                    onChange={(acLimit) => patch({ acLimit })}
                    suffix="zł"
                    hint="150 000 zł niezależnie od rodzaju napędu — inaczej niż przy amortyzacji."
                  />
                </div>
              ) : null}

              {manualRatioAllowed ? (
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
                  Wpisz proporcję ręcznie
                </label>
              ) : null}

              {manualRatio && manualRatioAllowed ? (
                <PercentField
                  label="Proporcja zaliczana do kosztów"
                  value={input.ratioOverridePercent as number}
                  onChange={(ratioOverridePercent) => patch({ ratioOverridePercent })}
                  hint="Część kwoty objętej limitem, która trafia do kosztów. Ułamki są dozwolone."
                />
              ) : null}
            </section>
          ) : null}
        </div>

        <ResultPanel input={input} result={result} plan={plan} onPlanChange={zmienPlan} />
      </div>

      </div>
    </>
  );
}

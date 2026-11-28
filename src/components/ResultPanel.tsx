import { useState } from 'react';
import { udzialy } from '../domain/calculate';
import { DOMYSLNY_PLAN_KONT, dekret, sumyDekretu, type KategoriaKosztu, type PlanKont } from '../domain/dekret';
import { CATEGORY_LABELS } from '../domain/labels';
import { formatPln, formatRate, round2 } from '../domain/money';
import { TYP_PDF, plikPdf } from '../domain/pdf';
import type { CalculationResult, CalculatorInput } from '../domain/types';
import { TYP_XLSX, plikXlsx } from '../domain/xlsx';
import { CheckIcon, CopyIcon, PdfIcon, SheetIcon } from './Icons';

interface Props {
  input: CalculatorInput;
  result: CalculationResult;
  plan: PlanKont;
  onPlanChange: (plan: PlanKont) => void;
}

type ResultTab = 'rozliczenie' | 'dekret' | 'prawo';

interface GrossSlice {
  rodzaj: 'vat' | 'kup' | 'nkup' | 'statutory';
  label: string;
  kwota: number;
}

function PoleKonta({ etykieta, wartosc, zmien }: { etykieta: string; wartosc: string; zmien: (v: string) => void }) {
  return (
    <label className="field">
      <span className="field-label">{etykieta}</span>
      <input type="text" value={wartosc} spellCheck={false} autoComplete="off" onChange={(e) => zmien(e.target.value.trim())} />
    </label>
  );
}

const KIND_CLASS: Record<string, string> = {
  kup: 'row-kup',
  nkup: 'row-nkup',
  statutory: 'row-statutory',
  info: '',
};

/** Pobiera gotowy plik — ten sam sposób dla PDF i Excela. */
function pobierz(dane: Uint8Array, typ: string, rozszerzenie: string, kiedy: Date) {
  const url = URL.createObjectURL(new Blob([dane.slice()], { type: typ }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `rozliczenie-samochod-${kiedy.toLocaleDateString('sv-SE')}.${rozszerzenie}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function exportPdf(input: CalculatorInput, result: CalculationResult, plan: PlanKont) {
  const kiedy = new Date();
  pobierz(plikPdf(input, result, kiedy, plan), TYP_PDF, 'pdf', kiedy);
}

function exportXlsx(input: CalculatorInput, result: CalculationResult, plan: PlanKont) {
  const kiedy = new Date();
  pobierz(plikXlsx(input, result, kiedy, plan), TYP_XLSX, 'xlsx', kiedy);
}

function PasekPodzialuBrutto({ slices }: { slices: GrossSlice[] }) {
  const widoczne = slices.filter((s) => s.kwota > 0);
  const razem = widoczne.reduce((s, c) => s + c.kwota, 0);
  if (razem <= 0) return null;
  const procenty = udzialy(widoczne.map((c) => c.kwota));
  return (
    <div className="split">
      <div className="split__header">
        <span className="split__title">Struktura faktury brutto</span>
        <span className="split__total">{formatPln(razem)}</span>
      </div>
      <div className="split__bar" aria-hidden="true">
        {widoczne.map((c) => (
          <span key={c.rodzaj} className={`split__part split__part--${c.rodzaj}`} style={{ flexGrow: c.kwota }} />
        ))}
      </div>
      <ul className="split__legend">
        {widoczne.map((c, i) => (
          <li key={c.rodzaj}>
            <span className={`split__dot split__part--${c.rodzaj}`} aria-hidden="true" />
            <span>{c.label}</span>
            <span className="split__value">
              {formatPln(c.kwota)} ({formatRate(procenty[i])})
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ResultPanel({ input, result, plan, onPlanChange }: Props) {
  const [activeTab, setActiveTab] = useState<ResultTab>('rozliczenie');
  const [copied, setCopied] = useState(false);

  const { vat, depreciation, limit } = result;
  const hasAmount = vat.gross > 0;
  const pozycje = dekret(input, result, plan);
  const sumy = pozycje ? sumyDekretu(pozycje) : null;
  const kategoria = input.category === 'purchase' ? null : (input.category as KategoriaKosztu);

  const kupDisplay = depreciation
    ? round2(depreciation.initialValue - depreciation.lifetimeNkup)
    : result.kup;
  const nkupDisplay = depreciation ? depreciation.lifetimeNkup : result.nkup;
  const isNgoActive = input.entityType === 'ngo' && input.category !== 'purchase';

  const grossSlices: GrossSlice[] = [
    { rodzaj: 'vat', label: 'VAT do odliczenia', kwota: vat.deductible },
    {
      rodzaj: 'kup',
      label: depreciation ? 'Odpisy KUP' : 'KUP',
      kwota: kupDisplay,
    },
    {
      rodzaj: 'nkup',
      label: depreciation ? 'Nadwyżka NKUP' : 'NKUP',
      kwota: nkupDisplay,
    },
    { rodzaj: 'statutory', label: 'Dział. statutowa', kwota: result.statutory },
  ];

  const kopiujPodsumowanie = async () => {
    const linie = [
      `Kalkulator celów mieszanych — ${CATEGORY_LABELS[input.category]}`,
      `Netto: ${formatPln(vat.net)} | VAT: ${formatPln(vat.vat)} | Brutto: ${formatPln(vat.gross)}`,
      `VAT do odliczenia (${formatRate(vat.deductionRate)}): ${formatPln(vat.deductible)}`,
      `${depreciation ? 'Odpisy KUP (łącznie)' : 'Koszt podatkowy (KUP)'}: ${formatPln(kupDisplay)}`,
      `${depreciation ? 'Nadwyżka ponad limit (NKUP)' : 'Poza kosztami (NKUP)'}: ${formatPln(nkupDisplay)}`,
    ];
    if (result.statutory > 0) {
      linie.push(`Działalność statutowa: ${formatPln(result.statutory)}`);
    }
    if (pozycje && pozycje.length > 0) {
      linie.push('', 'Dekret:');
      for (const p of pozycje) {
        const konta = [p.wn ? `Wn ${p.wn}` : null, p.ma ? `Ma ${p.ma}` : null].filter(Boolean).join(' / ');
        linie.push(`- ${konta}: ${formatPln(p.kwota)} (${p.opis})`);
      }
    }
    try {
      await navigator.clipboard.writeText(linie.join('\n'));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Brak dostępu do schowka nie blokuje dalszej pracy.
    }
  };

  const scrollToResults = (tab?: ResultTab) => {
    if (tab) setActiveTab(tab);
    document.getElementById('wyniki-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      <div id="wyniki-panel" className="results-column">
        <section className="card results-card">
          <div className="results-card__top">
            <div>
              <span className="card__step">Wynik na żywo</span>
              <h2>Podsumowanie rozliczenia</h2>
            </div>
            {hasAmount ? (
              <span className="gross-badge">Brutto: {formatPln(vat.gross)}</span>
            ) : null}
          </div>

          {hasAmount ? (
            <>
              <div className={`kpi-grid${isNgoActive ? ' kpi-grid--4' : ''}`}>
                <div className="kpi-card kpi-card--vat">
                  <div className="kpi-card__head">
                    <span className="kpi-card__label">VAT do odliczenia</span>
                    <span className="kpi-card__pill">{formatRate(vat.deductionRate)}</span>
                  </div>
                  <div className="kpi-card__value">{formatPln(vat.deductible)}</div>
                  <div className="kpi-card__sub">
                    z {formatPln(vat.vat)} podatku VAT
                  </div>
                </div>

                <div className="kpi-card kpi-card--kup">
                  <div className="kpi-card__head">
                    <span className="kpi-card__label">
                      {depreciation ? 'Odpisy KUP (łącznie)' : 'Koszt podatkowy (KUP)'}
                    </span>
                  </div>
                  <div className="kpi-card__value">{formatPln(kupDisplay)}</div>
                  <div className="kpi-card__sub">
                    {depreciation
                      ? `miesięcznie ${formatPln(depreciation.monthlyKup)}`
                      : vat.gross > 0
                        ? `${formatRate(kupDisplay / vat.gross)} kwoty brutto`
                        : '—'}
                  </div>
                </div>

                <div className="kpi-card kpi-card--nkup">
                  <div className="kpi-card__head">
                    <span className="kpi-card__label">
                      {depreciation ? 'Nadwyżka NKUP' : 'Poza kosztami (NKUP)'}
                    </span>
                  </div>
                  <div className="kpi-card__value">{formatPln(nkupDisplay)}</div>
                  <div className="kpi-card__sub">
                    {depreciation
                      ? 'ponad limit wartości'
                      : nkupDisplay > 0
                        ? 'wyłączone z kosztów'
                        : 'brak wyłączeń'}
                  </div>
                </div>

                {isNgoActive ? (
                  <div className="kpi-card kpi-card--statutory">
                    <div className="kpi-card__head">
                      <span className="kpi-card__label">Dział. statutowa</span>
                    </div>
                    <div className="kpi-card__value">{formatPln(result.statutory)}</div>
                    <div className="kpi-card__sub">
                      {input.statutoryLimits ? 'wariant B (z limitami)' : 'wariant A (bez limitów)'}
                    </div>
                  </div>
                ) : null}
              </div>

              <PasekPodzialuBrutto slices={grossSlices} />

              <nav className="tabs-nav no-print" role="tablist" aria-label="Szczegóły rozliczenia">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'rozliczenie'}
                  className={`tab-btn${activeTab === 'rozliczenie' ? ' tab-btn--active' : ''}`}
                  onClick={() => setActiveTab('rozliczenie')}
                >
                  Rozliczenie i limity
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'dekret'}
                  className={`tab-btn${activeTab === 'dekret' ? ' tab-btn--active' : ''}`}
                  onClick={() => setActiveTab('dekret')}
                >
                  Dekret księgowy
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'prawo'}
                  className={`tab-btn${activeTab === 'prawo' ? ' tab-btn--active' : ''}`}
                  onClick={() => setActiveTab('prawo')}
                >
                  Uwagi i prawo
                  {result.warnings.length > 0 ? (
                    <span className="tab-badge">{result.warnings.length}</span>
                  ) : null}
                </button>
              </nav>

              <div className="tab-panels">
                <section
                  className={`tab-panel${activeTab !== 'rozliczenie' ? ' tab-panel--hidden' : ''}`}
                  aria-label="Rozliczenie i limity"
                >
                  <h3 className="subhead print-section-title">Podatek naliczony (VAT)</h3>
                  <table className="figures">
                    <tbody>
                      <tr>
                        <th scope="row">Wartość netto</th>
                        <td>{formatPln(vat.net)}</td>
                      </tr>
                      <tr>
                        <th scope="row">VAT z faktury</th>
                        <td>{formatPln(vat.vat)}</td>
                      </tr>
                      <tr className="row-kup">
                        <th scope="row">VAT do odliczenia ({formatRate(vat.deductionRate)})</th>
                        <td>{formatPln(vat.deductible)}</td>
                      </tr>
                      <tr className="row-nkup">
                        <th scope="row">
                          VAT bez prawa do odliczenia
                          <span className="row-note">powiększa wartość kosztu</span>
                        </th>
                        <td>{formatPln(vat.nonDeductible)}</td>
                      </tr>
                      <tr className="row-total">
                        <th scope="row">Kwota brutto</th>
                        <td>{formatPln(vat.gross)}</td>
                      </tr>
                    </tbody>
                  </table>

                  <h3 className="subhead">Koszt podatkowy</h3>
                  <table className="figures">
                    <tbody>
                      {result.lines.map((line, index) => (
                        <tr key={`${line.label}-${index}`} className={KIND_CLASS[line.kind]}>
                          <th scope="row">
                            {line.label}
                            {line.note ? <span className="row-note">{line.note}</span> : null}
                          </th>
                          <td>{formatPln(line.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {vat.steps.length > 0 ? (
                    <>
                      <h3 className="subhead">Jak powstał wskaźnik VAT</h3>
                      <ul className="steps">
                        {vat.steps.map((step) => (
                          <li key={step.label}>
                            <span>{step.label}</span>
                            <span>{step.detail}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}

                  {limit ? (
                    <div className="limit-card">
                      <div className="limit-card__top">
                        <span>
                          Limit{limit.overridden ? ' (wpisany ręcznie)' : ' wartości pojazdu'}
                        </span>
                        <strong>{formatRate(limit.ratio)} w kosztach</strong>
                      </div>
                      <div className="limit-card__bar" aria-hidden="true">
                        <span style={{ width: `${Math.min(100, limit.ratio * 100)}%` }} />
                      </div>
                      <div className="limit-card__meta">
                        <span>Limit: {formatPln(limit.value)}</span>
                        <span>
                          Wartość pojazdu:{' '}
                          {limit.vehicleValue > 0 ? formatPln(limit.vehicleValue) : 'nie podano'}
                        </span>
                      </div>
                    </div>
                  ) : null}

                  {depreciation ? (
                    <>
                      <h3 className="subhead">Amortyzacja</h3>
                      <table className="figures">
                        <tbody>
                          <tr>
                            <th scope="row">Wartość początkowa</th>
                            <td>{formatPln(depreciation.initialValue)}</td>
                          </tr>
                          <tr>
                            <th scope="row">Odpis roczny ({depreciation.ratePercent}%)</th>
                            <td>{formatPln(depreciation.annual)}</td>
                          </tr>
                          <tr>
                            <th scope="row">Odpis miesięczny</th>
                            <td>{formatPln(depreciation.monthly)}</td>
                          </tr>
                          <tr className="row-kup">
                            <th scope="row">— w tym koszt podatkowy</th>
                            <td>{formatPln(depreciation.monthlyKup)}</td>
                          </tr>
                          <tr className="row-nkup">
                            <th scope="row">— w tym poza kosztami</th>
                            <td>{formatPln(depreciation.monthlyNkup)}</td>
                          </tr>
                          <tr className="row-total row-nkup">
                            <th scope="row">
                              Nadwyżka ponad limit
                              <span className="row-note">nigdy nie stanie się kosztem</span>
                            </th>
                            <td>{formatPln(depreciation.lifetimeNkup)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </>
                  ) : null}

                  {result.allocation ? (
                    <>
                      <h3 className="subhead">Podział rachunkowy</h3>
                      <table className="figures">
                        <tbody>
                          <tr className="row-statutory">
                            <th scope="row">
                              Działalność statutowa
                              <span className="row-note">
                                netto {formatPln(result.allocation.statutory.net)} + VAT{' '}
                                {formatPln(result.allocation.statutory.vat)} bez prawa do odliczenia
                                {result.allocation.statutory.odsetki > 0
                                  ? `; w tym odsetki ${formatPln(result.allocation.statutory.odsetki)}`
                                  : ''}
                              </span>
                            </th>
                            <td>{formatPln(result.allocation.statutory.total)}</td>
                          </tr>
                          <tr>
                            <th scope="row">
                              Działalność gospodarcza
                              <span className="row-note">
                                netto {formatPln(result.allocation.business.net)} + nieodliczony VAT{' '}
                                {formatPln(result.allocation.business.vat)}
                                {result.allocation.business.odsetki > 0
                                  ? `; w tym odsetki ${formatPln(result.allocation.business.odsetki)}`
                                  : ''}
                              </span>
                            </th>
                            <td>{formatPln(result.allocation.business.total)}</td>
                          </tr>
                        </tbody>
                      </table>
                      <p className="field-hint">
                        Netto według udziału działalności gospodarczej w koszcie (
                        {input.businessSharePercent}%), VAT według prewspółczynnika ({input.prePercent}%).{' '}
                        {input.statutoryLimits
                          ? 'Wariant B: limity i reguła 75% obejmują obie części; koszt podatkowy to część gospodarcza.'
                          : 'Wariant A: limity i reguła 75% dotyczą tylko części gospodarczej.'}
                      </p>
                    </>
                  ) : null}
                </section>

                <section
                  className={`tab-panel${activeTab !== 'dekret' ? ' tab-panel--hidden' : ''}`}
                  aria-label="Dekret księgowy"
                >
                  {pozycje ? (
                    <>
                      <h3 className="subhead print-section-title">Dekret księgowy</h3>
                      <table className="figures dekret">
                        <thead>
                          <tr>
                            <th scope="col">Strona / Konto</th>
                            <th scope="col">Kwota</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pozycje.map((x) => (
                            <tr
                              key={`${x.wn ?? ''}|${x.ma ?? ''}|${x.opis}`}
                              className={x.przeksiegowanie ? 'dekret-490' : ''}
                            >
                              <th scope="row">
                                <span className="dekret-konta">
                                  {x.wn ? <span className="konto-pill konto-pill--wn">Wn {x.wn}</span> : null}
                                  {x.ma ? <span className="konto-pill konto-pill--ma">Ma {x.ma}</span> : null}
                                </span>
                                <span className="row-note">{x.opis}</span>
                              </th>
                              <td>{formatPln(x.kwota)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      <div className="dekret-check-row">
                        <span
                          className={`dekret-check${sumy!.wn === sumy!.ma ? ' dekret-check--ok' : ' dekret-check--err'}`}
                        >
                          Kontrola: Wn {formatPln(sumy!.wn)} = Ma {formatPln(sumy!.ma)}
                          {sumy!.wn === sumy!.ma ? ' ✓' : ' — strony się nie równoważą'}
                        </span>
                      </div>

                      {result.allocation ? (
                        <p className="field-hint">
                          Przez konto {plan.rozliczenie} przechodzą tylko koszty rodzajowe — odsetki zostają w kosztach finansowych.
                        </p>
                      ) : null}

                      <details className="legal-box plan-kont no-print">
                        <summary>Edytuj numery kont</summary>
                        <div className="plan-kont__pola">
                          <PoleKonta
                            etykieta="Dostawca (Ma)"
                            wartosc={plan.kontrahent}
                            zmien={(kontrahent) => onPlanChange({ ...plan, kontrahent })}
                          />
                          <PoleKonta
                            etykieta={input.category === 'leasing' ? 'Koszt — kapitał' : 'Koszt rodzajowy'}
                            wartosc={plan.koszt[kategoria!]}
                            zmien={(k) => onPlanChange({ ...plan, koszt: { ...plan.koszt, [kategoria!]: k } })}
                          />
                          {input.category === 'leasing' ? (
                            <>
                              <PoleKonta
                                etykieta="Odsetki"
                                wartosc={plan.odsetki}
                                zmien={(odsetki) => onPlanChange({ ...plan, odsetki })}
                              />
                              <PoleKonta
                                etykieta="Odsetki NKUP"
                                wartosc={plan.odsetkiNkup}
                                zmien={(odsetkiNkup) => onPlanChange({ ...plan, odsetkiNkup })}
                              />
                            </>
                          ) : null}
                          <PoleKonta
                            etykieta="Koszty NKUP"
                            wartosc={plan.nkup}
                            zmien={(nkup) => onPlanChange({ ...plan, nkup })}
                          />
                          <PoleKonta
                            etykieta="VAT naliczony"
                            wartosc={plan.vat}
                            zmien={(vat) => onPlanChange({ ...plan, vat })}
                          />
                          {result.allocation ? (
                            <>
                              <PoleKonta
                                etykieta="Rozliczenie kosztów"
                                wartosc={plan.rozliczenie}
                                zmien={(rozliczenie) => onPlanChange({ ...plan, rozliczenie })}
                              />
                              <PoleKonta
                                etykieta="Działalność statutowa"
                                wartosc={plan.statutowe}
                                zmien={(statutowe) => onPlanChange({ ...plan, statutowe })}
                              />
                              <PoleKonta
                                etykieta="Działalność gospodarcza"
                                wartosc={plan.gospodarcze}
                                zmien={(gospodarcze) => onPlanChange({ ...plan, gospodarcze })}
                              />
                            </>
                          ) : null}
                        </div>
                        <p className="field-hint">
                          Numery zapamiętuje ta przeglądarka. Konto kosztu ustawiasz osobno dla każdego rodzaju wydatku.
                        </p>
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => onPlanChange(DOMYSLNY_PLAN_KONT)}
                        >
                          Przywróć domyślne
                        </button>
                      </details>
                    </>
                  ) : (
                    <div className="empty-box">
                      <strong>Zakup środka trwałego nie trafia bezpośrednio w koszty.</strong>
                      <p>
                        Samochód wprowadzasz do ewidencji środków trwałych w wartości początkowej{' '}
                        {formatPln(result.costBase)}, a w koszty księgujesz miesięczne odpisy amortyzacyjne (
                        {depreciation ? formatPln(depreciation.monthlyKup) : '—'} w KUP).
                      </p>
                    </div>
                  )}
                </section>

                <section
                  className={`tab-panel${activeTab !== 'prawo' ? ' tab-panel--hidden' : ''}`}
                  aria-label="Uwagi i podstawa prawna"
                >
                  {result.warnings.length > 0 ? (
                    <div className="warnings-stack">
                      {result.warnings.map((warning) => (
                        <p key={warning} className="warning">
                          {warning}
                        </p>
                      ))}
                    </div>
                  ) : null}

                  <h3 className="subhead">Opis księgowania i uwagi</h3>
                  <ul className="notes">
                    {result.booking.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>

                  <h3 className="subhead">Podstawa prawna</h3>
                  <ul className="legal">
                    {result.legalBasis.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>

                  <p className="legal-box__note">
                    Kalkulator liczy według reguł dla samochodu osobowego używanego do celów mieszanych,
                    czyli bez ewidencji przebiegu i bez zgłoszenia VAT-26. Wynik jest wyliczeniem
                    pomocniczym, nie poradą podatkową — przy nietypowych umowach i przy stosowaniu
                    przepisów przejściowych do limitów sprawdź stan prawny na dzień poniesienia wydatku.
                  </p>
                </section>
              </div>

              {result.warnings.length > 0 && activeTab !== 'prawo' ? (
                <div className="inline-warning-bar no-print">
                  <span>{result.warnings[0]}</span>
                  {result.warnings.length > 1 ? (
                    <button type="button" className="link-button" onClick={() => setActiveTab('prawo')}>
                      Wszystkie uwagi ({result.warnings.length})
                    </button>
                  ) : null}
                </div>
              ) : null}

              <div className="export-actions no-print">
                <button
                  type="button"
                  className="export-button export-button--primary"
                  onClick={() => exportPdf(input, result, plan)}
                >
                  <PdfIcon size={16} />
                  <span>Zapisz jako PDF</span>
                </button>
                <button
                  type="button"
                  className="export-button"
                  onClick={() => exportXlsx(input, result, plan)}
                >
                  <SheetIcon size={16} />
                  <span>Pobierz Excel (.xlsx)</span>
                </button>
                <button
                  type="button"
                  className="export-button export-button--ghost"
                  onClick={kopiujPodsumowanie}
                >
                  {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
                  <span>{copied ? 'Skopiowano' : 'Kopiuj podsumowanie'}</span>
                </button>
              </div>
            </>
          ) : (
            <div className="empty-state">
              <div className="empty-state__preview" aria-hidden="true">
                <div className="empty-state__chip">VAT</div>
                <div className="empty-state__chip">KUP</div>
                <div className="empty-state__chip">NKUP</div>
              </div>
              <h3>Wpisz kwotę z faktury</h3>
              <p>
                Po lewej stronie podaj kwotę netto lub brutto. Od razu zobaczysz kwoty do odliczenia,
                podział kosztów oraz gotowy dekret księgowy do pobrania w PDF i Excelu.
              </p>
            </div>
          )}
        </section>
      </div>

      {hasAmount ? (
        <div className="mobile-summary no-print" role="region" aria-label="Skrót wyliczenia">
          <div className="mobile-summary__figures">
            <span>
              VAT: <strong>{formatPln(vat.deductible)}</strong>
            </span>
            <span>•</span>
            <span>
              KUP: <strong>{formatPln(kupDisplay)}</strong>
            </span>
            <span>•</span>
            <span>
              NKUP: <strong>{formatPln(nkupDisplay)}</strong>
            </span>
          </div>
          <button
            type="button"
            className="mobile-summary__btn"
            onClick={() => scrollToResults(pozycje ? 'dekret' : 'rozliczenie')}
          >
            {pozycje ? 'Zobacz dekret ↑' : 'Zobacz wynik ↑'}
          </button>
        </div>
      ) : null}
    </>
  );
}

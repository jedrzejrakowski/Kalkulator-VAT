import { podzialKosztu, type CzescKosztu } from '../domain/calculate';
import { DOMYSLNY_PLAN_KONT, dekret, sumyDekretu, type KategoriaKosztu, type PlanKont } from '../domain/dekret';
import { formatPln, formatRate } from '../domain/money';
import { TYP_XLSX, plikXlsx } from '../domain/xlsx';
import type { CalculationResult, CalculatorInput } from '../domain/types';

interface Props {
  input: CalculatorInput;
  result: CalculationResult;
  plan: PlanKont;
  onPlanChange: (plan: PlanKont) => void;
}

function PoleKonta({ etykieta, wartosc, zmien }: { etykieta: string; wartosc: string; zmien: (v: string) => void }) {
  return (
    <label className="field">
      <span className="field-label">{etykieta}</span>
      <input type="text" value={wartosc} spellCheck={false} autoComplete="off" onChange={(e) => zmien(e.target.value.trim())} />
    </label>
  );
}

const CZESC_ETYKIETA: Record<CzescKosztu['rodzaj'], string> = {
  kup: 'W kosztach podatkowych',
  nkup: 'Poza kosztami',
  statutory: 'Działalność statutowa',
};

/** Pasek podziału całego kosztu — te same barwy co w logo i w wierszach tabeli. */
function PasekPodzialu({ czesci }: { czesci: CzescKosztu[] }) {
  const razem = czesci.reduce((s, c) => s + c.kwota, 0);
  if (razem <= 0) return null;
  return (
    <div className="split">
      <div className="split__bar" aria-hidden="true">
        {czesci.map((c) => (
          <span key={c.rodzaj} className={`split__part split__part--${c.rodzaj}`} style={{ flexGrow: c.kwota }} />
        ))}
      </div>
      <ul className="split__legend">
        {czesci.map((c) => (
          <li key={c.rodzaj}>
            <span className={`split__dot split__part--${c.rodzaj}`} aria-hidden="true" />
            {CZESC_ETYKIETA[c.rodzaj]}
            <span className="split__value">{formatRate(c.kwota / razem)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const KIND_CLASS: Record<string, string> = {
  kup: 'row-kup',
  nkup: 'row-nkup',
  statutory: 'row-statutory',
  info: '',
};

/**
 * Eksport przez okno drukowania przeglądarki — ma ono opcję „Zapisz jako PDF”,
 * więc nie potrzeba biblioteki. Podstawę prawną rozwijamy, żeby trafiła do pliku.
 */
function exportPdf() {
  document.querySelectorAll('details').forEach((details) => {
    details.open = true;
  });
  window.print();
}

function exportXlsx(input: CalculatorInput, result: CalculationResult, plan: PlanKont) {
  const kiedy = new Date();
  const url = URL.createObjectURL(new Blob([plikXlsx(input, result, kiedy, plan).slice()], { type: TYP_XLSX }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `rozliczenie-samochod-${kiedy.toLocaleDateString('sv-SE')}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Adres zwalniamy z opóźnieniem — część przeglądarek zaczyna pobieranie
  // dopiero po powrocie z obsługi kliknięcia.
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function ResultPanel({ input, result, plan, onPlanChange }: Props) {
  const { vat, depreciation, limit } = result;
  const hasAmount = vat.gross > 0;
  const pozycje = dekret(input, result, plan);
  const sumy = pozycje ? sumyDekretu(pozycje) : null;
  const kategoria = input.category === 'purchase' ? null : (input.category as KategoriaKosztu);

  return (
    <>
    <div className="results results-wyniki">
      <section className="card">
        <h2>Podatek naliczony</h2>
        <div className="headline">
          <span className="headline-value">{formatRate(vat.deductionRate)}</span>
          <span className="headline-label">
            podatku naliczonego podlega odliczeniu
            {input.entityType === 'ngo' ? ' po zastosowaniu wskaźników organizacji' : ''}
          </span>
        </div>

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
              <th scope="row">VAT do odliczenia</th>
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

        {vat.steps.length > 0 ? (
          <>
            <h3 className="subhead">Jak powstał wskaźnik</h3>
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
      </section>

      <section className="card">
        <h2>Koszt podatkowy</h2>
        {hasAmount ? (
          <>
            <PasekPodzialu czesci={podzialKosztu(result)} />
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

            {limit ? (
              <>
                <h3 className="subhead">Limit wartości pojazdu</h3>
                <ul className="steps">
                  <li>
                    <span>Limit{limit.overridden ? ' (wpisany ręcznie)' : ' ustawowy'}</span>
                    <span>{formatPln(limit.value)}</span>
                  </li>
                  <li>
                    <span>Wartość pojazdu</span>
                    <span>
                      {limit.vehicleValue > 0 ? formatPln(limit.vehicleValue) : 'nie podano'}
                    </span>
                  </li>
                  <li>
                    <span>
                      Proporcja zaliczana do kosztów{limit.ratioOverridden ? ' (wpisana ręcznie)' : ''}
                    </span>
                    <span>{formatRate(limit.ratio)}</span>
                  </li>
                </ul>
              </>
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
          </>
        ) : (
          <p className="empty">Wpisz kwotę z faktury, aby zobaczyć rozliczenie</p>
        )}
      </section>

    </div>
    <div className="results results-dekret">
      {hasAmount ? (
        <section className="card">
          <h2>Jak to zaksięgować</h2>
          {result.warnings.map((warning) => (
            <p key={warning} className="warning">
              {warning}
            </p>
          ))}
          {pozycje ? (
            <>
              <h3 className="subhead">Dekret</h3>
              <table className="figures dekret">
                <thead>
                  <tr>
                    <th scope="col">Konto</th>
                    <th scope="col">Kwota</th>
                  </tr>
                </thead>
                <tbody>
                  {pozycje.map((x) => (
                    <tr key={`${x.wn ?? ''}|${x.ma ?? ''}|${x.opis}`} className={x.przeksiegowanie ? 'dekret-490' : ''}>
                      <th scope="row">
                        <span className="dekret-konta">
                          {x.wn ? <span>Wn {x.wn}</span> : null}
                          {x.ma ? <span>Ma {x.ma}</span> : null}
                        </span>
                        <span className="row-note">{x.opis}</span>
                      </th>
                      <td>{formatPln(x.kwota)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="field-hint">
                Kontrola: Wn {formatPln(sumy!.wn)} = Ma {formatPln(sumy!.ma)}
                {sumy!.wn === sumy!.ma ? ' ✓' : ' — strony się nie równoważą'}
                {result.allocation
                  ? `. Przez ${plan.rozliczenie} przechodzą tylko koszty rodzajowe — odsetki zostają w kosztach finansowych.`
                  : '.'}
              </p>
              <details className="legal-box plan-kont no-print">
                <summary>Numery kont</summary>
                <div className="plan-kont__pola">
                  <PoleKonta etykieta="Dostawca (Ma)" wartosc={plan.kontrahent} zmien={(kontrahent) => onPlanChange({ ...plan, kontrahent })} />
                  <PoleKonta
                    etykieta={input.category === 'leasing' ? 'Koszt — kapitał' : 'Koszt rodzajowy'}
                    wartosc={plan.koszt[kategoria!]}
                    zmien={(k) => onPlanChange({ ...plan, koszt: { ...plan.koszt, [kategoria!]: k } })}
                  />
                  {input.category === 'leasing' ? (
                    <>
                      <PoleKonta etykieta="Odsetki" wartosc={plan.odsetki} zmien={(odsetki) => onPlanChange({ ...plan, odsetki })} />
                      <PoleKonta
                        etykieta="Odsetki NKUP"
                        wartosc={plan.odsetkiNkup}
                        zmien={(odsetkiNkup) => onPlanChange({ ...plan, odsetkiNkup })}
                      />
                    </>
                  ) : null}
                  <PoleKonta etykieta="Koszty NKUP" wartosc={plan.nkup} zmien={(nkup) => onPlanChange({ ...plan, nkup })} />
                  <PoleKonta etykieta="VAT naliczony" wartosc={plan.vat} zmien={(vat) => onPlanChange({ ...plan, vat })} />
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
                  Numery zapamiętuje ta przeglądarka. Konto kosztu ustawiasz osobno dla każdego rodzaju
                  wydatku.
                </p>
                <button type="button" className="link-button" onClick={() => onPlanChange(DOMYSLNY_PLAN_KONT)}>
                  Przywróć domyślne
                </button>
              </details>
            </>
          ) : null}
          {pozycje ? <h3 className="subhead">Uwagi</h3> : null}
          <ul className="notes">
            {result.booking.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>

          <details className="legal-box">
            <summary>Podstawa prawna</summary>
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
          </details>

          <div className="export-actions no-print">
            <button type="button" className="export-button export-button--primary" onClick={exportPdf}>
              Zapisz jako PDF
            </button>
            <button type="button" className="export-button" onClick={() => exportXlsx(input, result, plan)}>
              Pobierz Excel
            </button>
          </div>
        </section>
      ) : (
        <section className="card">
          <h2>Jak to zaksięgować</h2>
          <p className="empty">Dekret pojawi się po wpisaniu kwoty</p>
        </section>
      )}
    </div>
    </>
  );
}

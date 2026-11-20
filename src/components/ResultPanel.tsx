import { formatPln, formatRate } from '../domain/money';
import { TYP_XLSX, plikXlsx } from '../domain/xlsx';
import type { CalculationResult, CalculatorInput } from '../domain/types';

interface Props {
  input: CalculatorInput;
  result: CalculationResult;
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

function exportXlsx(input: CalculatorInput, result: CalculationResult) {
  const kiedy = new Date();
  const url = URL.createObjectURL(new Blob([plikXlsx(input, result, kiedy).slice()], { type: TYP_XLSX }));
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

export function ResultPanel({ input, result }: Props) {
  const { vat, depreciation, limit } = result;
  const hasAmount = vat.gross > 0;

  return (
    <div className="results">
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
                  {input.businessSharePercent}%), VAT według prewspółczynnika ({input.prePercent}%). Limity
                  i reguła 75% dotyczą tylko części gospodarczej.
                </p>
              </>
            ) : null}

            {result.rozbicie ? (
              <>
                <h3 className="subhead">Rozbicie do dekretu</h3>
                <table className="figures dekret">
                  <thead>
                    <tr>
                      <th scope="col">
                        <span className="sr-only">Część</span>
                      </th>
                      <th scope="col">Kapitał</th>
                      <th scope="col">Odsetki</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.allocation ? (
                      <tr className="row-statutory">
                        <th scope="row">Działalność statutowa</th>
                        <td>{formatPln(result.rozbicie.kapital.statutowa)}</td>
                        <td>{formatPln(result.rozbicie.odsetki.statutowa)}</td>
                      </tr>
                    ) : null}
                    <tr className="row-kup">
                      <th scope="row">W kosztach podatkowych</th>
                      <td>{formatPln(result.rozbicie.kapital.kup)}</td>
                      <td>{formatPln(result.rozbicie.odsetki.kup)}</td>
                    </tr>
                    <tr className="row-nkup">
                      <th scope="row">Poza kosztami</th>
                      <td>{formatPln(result.rozbicie.kapital.nkup)}</td>
                      <td>{formatPln(result.rozbicie.odsetki.nkup)}</td>
                    </tr>
                    <tr className="row-total">
                      <th scope="row">Razem</th>
                      <td>{formatPln(result.rozbicie.kapital.razem)}</td>
                      <td>{formatPln(result.rozbicie.odsetki.razem)}</td>
                    </tr>
                    <tr>
                      <th scope="row">VAT do odliczenia</th>
                      <td colSpan={2}>{formatPln(result.rozbicie.vatOdliczony)}</td>
                    </tr>
                    <tr className="row-total">
                      <th scope="row">Brutto z faktury</th>
                      <td colSpan={2}>{formatPln(result.rozbicie.brutto)}</td>
                    </tr>
                  </tbody>
                </table>
                <p className="field-hint">
                  Kapitał i odsetki księguje się zwykle na osobnych kontach (np. 402 i 751), dlatego
                  rozpisane są osobno. Każda kolumna zawiera netto i VAT bez prawa do odliczenia.
                </p>
              </>
            ) : null}
          </>
        ) : (
          <p className="empty">Wpisz kwotę z faktury, aby zobaczyć rozliczenie.</p>
        )}
      </section>

      {hasAmount ? (
        <section className="card">
          <h2>Jak to zaksięgować</h2>
          {result.warnings.map((warning) => (
            <p key={warning} className="warning">
              {warning}
            </p>
          ))}
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
            <button type="button" className="export-button" onClick={exportPdf}>
              Zapisz jako PDF
            </button>
            <button type="button" className="export-button" onClick={() => exportXlsx(input, result)}>
              Pobierz Excel
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

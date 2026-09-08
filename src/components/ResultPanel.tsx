import { formatPln, formatRate } from '../domain/money';
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
                    <span>Proporcja zaliczana do kosztów</span>
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

          <h3 className="subhead">Podstawa prawna</h3>
          <ul className="legal">
            {result.legalBasis.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

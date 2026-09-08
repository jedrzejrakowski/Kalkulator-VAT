import { useMemo, useState } from 'react';
import { Choice, NumberField, PercentField, SelectField } from './components/fields';
import { ResultPanel } from './components/ResultPanel';
import { calculate } from './domain/calculate';
import { DEFAULT_INPUT, VAT_RATES } from './domain/defaults';
import {
  CATEGORY_HINTS,
  CATEGORY_LABELS,
  isVatExempt,
  needsVehicleLimit,
} from './domain/labels';
import { POWERTRAIN_LABELS, statutoryLimit } from './domain/limits';
import { formatPln } from './domain/money';
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

export default function App() {
  const [input, setInput] = useState<CalculatorInput>(DEFAULT_INPUT);
  const result = useMemo(() => calculate(input), [input]);

  const patch = (changes: Partial<CalculatorInput>) =>
    setInput((current) => ({ ...current, ...changes }));

  const changeCategory = (category: ExpenseCategory) =>
    // Ubezpieczenia są zwolnione z VAT, więc stawka wraca do zera i z powrotem do 23%.
    patch({
      category,
      vatRatePercent: isVatExempt(category) ? 0 : input.vatRatePercent || 23,
      interestNet: category === 'leasing' ? input.interestNet : 0,
    });

  const showVehicle = needsVehicleLimit(input.category);
  const lawfulLimit = statutoryLimit(input.powertrain);

  return (
    <div className="page">
      <header className="page-header">
        <h1>Samochód osobowy do celów mieszanych</h1>
        <p>
          Rozliczenie pojedynczej faktury: ile VAT-u odliczysz, ile podatku powiększy koszt i jaka
          część wydatku trafi do kosztów uzyskania przychodu. Dla zwykłej działalności gospodarczej
          oraz dla fundacji i stowarzyszeń łączących działalność gospodarczą ze statutową.
        </p>
      </header>

      <div className="layout">
        <div>
          <section className="card">
            <h2>Podmiot</h2>
            <p className="card-hint">Decyduje o wskaźniku odliczenia podatku naliczonego.</p>
            <div className="choice-group">
              <Choice<EntityType>
                name="entity"
                value="business"
                selected={input.entityType}
                title="Działalność gospodarcza"
                description="Pełne prawo do odliczenia ograniczone do 50% z uwagi na użytek mieszany."
                onSelect={(entityType) => patch({ entityType })}
              />
              <Choice<EntityType>
                name="entity"
                value="ngo"
                selected={input.entityType}
                title="Fundacja lub stowarzyszenie"
                description="Działalność gospodarcza obok statutowej — najpierw prewspółczynnik, potem ograniczenie do 50%."
                onSelect={(entityType) => patch({ entityType })}
              />
            </div>

            {input.entityType === 'ngo' ? (
              <div className="stack">
                <div className="grid-2">
                  <PercentField
                    label="Prewspółczynnik"
                    value={input.prePercent}
                    onChange={(prePercent) => patch({ prePercent })}
                    hint="Udział działalności gospodarczej, art. 86 ust. 2a."
                  />
                  <PercentField
                    label="Proporcja sprzedaży"
                    value={input.salesPercent}
                    onChange={(salesPercent) => patch({ salesPercent })}
                    hint="Art. 90 ust. 2. Zostaw 100%, jeśli nie masz sprzedaży zwolnionej."
                  />
                </div>
                <PercentField
                  label="Udział działalności gospodarczej w koszcie"
                  value={input.businessSharePercent}
                  onChange={(businessSharePercent) => patch({ businessSharePercent })}
                  hint="Podział kosztu między działalność gospodarczą i statutową według polityki organizacji. Nie wynika wprost z ustawy."
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

            {input.category === 'leasing' ? (
              <NumberField
                label="Część odsetkowa raty (netto)"
                value={input.interestNet}
                onChange={(interestNet) => patch({ interestNet })}
                suffix="zł"
                hint="Z harmonogramu leasingu. Odsetki są kosztem w całości — limit obejmuje wyłącznie część kapitałową."
              />
            ) : null}
          </section>

          {showVehicle ? (
            <section className="card">
              <h2>Pojazd i limity</h2>
              <p className="card-hint">
                Limity wartości samochodu osobowego obowiązujące od 1 stycznia 2026 r.
              </p>

              {input.category !== 'insuranceAC' ? (
                <>
                  <div className="choice-group">
                    {(Object.keys(POWERTRAIN_LABELS) as Powertrain[]).map((value) => (
                      <Choice<Powertrain>
                        key={value}
                        name="powertrain"
                        value={value}
                        selected={input.powertrain}
                        title={POWERTRAIN_LABELS[value]}
                        description={`Limit ${formatPln(statutoryLimit(value))}`}
                        onSelect={(powertrain) => patch({ powertrain })}
                      />
                    ))}
                  </div>

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
                    hint="Domyślnie 150 000 zł."
                  />
                </div>
              ) : null}
            </section>
          ) : null}
        </div>

        <ResultPanel input={input} result={result} />
      </div>

      <p className="disclaimer">
        Kalkulator liczy według reguł dla samochodu osobowego używanego do celów mieszanych, czyli
        bez ewidencji przebiegu i bez zgłoszenia VAT-26. Wynik jest wyliczeniem pomocniczym, nie
        poradą podatkową — przy nietypowych umowach i przy stosowaniu przepisów przejściowych do
        limitów sprawdź stan prawny na dzień poniesienia wydatku.
      </p>
    </div>
  );
}

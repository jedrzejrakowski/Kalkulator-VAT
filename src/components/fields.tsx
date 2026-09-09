import { useEffect, useState, type ReactNode } from 'react';
import { formatAmount, formatPercent, parseAmount, parsePercent } from '../domain/money';

interface NumberFieldProps {
  label?: string;
  value: number;
  onChange: (value: number) => void;
  suffix?: string;
  hint?: ReactNode;
  placeholder?: string;
  /** Etykieta dla czytników ekranu, gdy pole nie ma widocznej etykiety własnej. */
  ariaLabel?: string;
}

/**
 * Pole kwotowe przyjmujące zapis polski — przecinek dziesiętny i spacje w tysiącach.
 * Trzyma własny tekst, żeby nie przerywać pisania, i formatuje dopiero po wyjściu z pola.
 */
export function NumberField({
  label,
  value,
  onChange,
  suffix,
  hint,
  placeholder,
  ariaLabel,
}: NumberFieldProps) {
  const [text, setText] = useState(() => (value === 0 ? '' : formatAmount(value)));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(value === 0 ? '' : formatAmount(value));
  }, [value, focused]);

  return (
    <label className="field">
      {label ? <span className="field-label">{label}</span> : null}
      <span className={suffix ? 'input-suffix' : undefined}>
        <input
          type="text"
          inputMode="decimal"
          aria-label={ariaLabel}
          value={text}
          placeholder={placeholder ?? '0,00'}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setText(value === 0 ? '' : formatAmount(value));
          }}
          onChange={(event) => {
            setText(event.target.value);
            onChange(parseAmount(event.target.value));
          }}
        />
        {suffix ? <span>{suffix}</span> : null}
      </span>
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

interface PercentFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  hint?: ReactNode;
  /**
   * Zaokrąglanie w górę do pełnych procentów. Wymagają go wskaźniki VAT
   * (art. 86 ust. 2g i art. 90 ust. 4 ustawy o VAT); klucze podziału kosztu
   * ustalane wewnętrznie przez organizację żadnemu zaokrągleniu nie podlegają.
   */
  roundUp?: boolean;
}

/**
 * Pole procentowe przyjmujące ułamki w zapisie polskim i angielskim.
 *
 * Tekst i wartość są trzymane razem: kiedy wpisana liczba wykracza poza zakres
 * od 0 do 100, prostowany jest również tekst w polu, żeby na ekranie nigdy nie
 * stała liczba inna niż ta, którą kalkulator faktycznie liczy.
 */
export function PercentField({ label, value, onChange, hint, roundUp }: PercentFieldProps) {
  const [text, setText] = useState(() => formatPercent(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(formatPercent(value));
  }, [value, focused]);

  const typed = parsePercent(text);
  const rounded = roundUp && typed !== null && !Number.isInteger(typed);

  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="input-suffix">
        <input
          type="text"
          inputMode="decimal"
          value={text}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setText(formatPercent(value));
          }}
          onChange={(event) => {
            const raw = event.target.value.replace(/[^\d.,]/g, '');
            const parsed = parsePercent(raw);
            if (parsed === null) {
              setText(raw);
              onChange(0);
              return;
            }
            const inRange = String(parsed) === raw.replace(',', '.');
            setText(inRange ? raw : formatPercent(parsed));
            onChange(roundUp ? Math.ceil(parsed) : parsed);
          }}
        />
        <span>%</span>
      </span>
      {rounded ? (
        <span className="field-hint field-hint-active">
          {formatPercent(typed)}% zaokrąglono w górę do {value}% — art. 86 ust. 2g i art. 90 ust. 4
          ustawy o VAT
        </span>
      ) : null}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

interface ChoiceProps<T extends string> {
  name: string;
  value: T;
  selected: T;
  title: string;
  description?: string;
  onSelect: (value: T) => void;
}

export function Choice<T extends string>({
  name,
  value,
  selected,
  title,
  description,
  onSelect,
}: ChoiceProps<T>) {
  return (
    <label className={`choice${selected === value ? ' choice-selected' : ''}`}>
      <input
        type="radio"
        name={name}
        checked={selected === value}
        onChange={() => onSelect(value)}
      />
      <span>
        <span className="choice-title">{title}</span>
        {description ? <span className="choice-desc">{description}</span> : null}
      </span>
    </label>
  );
}

interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  hint?: ReactNode;
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
}: SelectFieldProps<T>) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

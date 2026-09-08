import { useEffect, useState, type ReactNode } from 'react';
import { formatAmount, parseAmount } from '../domain/money';

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
  max?: number;
}

/** Pole procentowe przyjmujące wyłącznie pełne procenty. */
export function PercentField({ label, value, onChange, hint, max = 100 }: PercentFieldProps) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);

  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="input-suffix">
        <input
          type="text"
          inputMode="numeric"
          value={text}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setText(String(value));
          }}
          onChange={(event) => {
            const raw = event.target.value.replace(/[^\d]/g, '');
            setText(raw);
            if (raw === '') {
              onChange(0);
              return;
            }
            onChange(Math.min(max, Number(raw)));
          }}
        />
        <span>%</span>
      </span>
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

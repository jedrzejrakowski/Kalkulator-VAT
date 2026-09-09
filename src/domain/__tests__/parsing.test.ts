import { describe, expect, it } from 'vitest';
import { parseAmount, parsePercent } from '../money';

describe('parsowanie kwot', () => {
  it('przyjmuje zapis polski z przecinkiem i spacjami', () => {
    expect(parseAmount('80 775,00')).toBe(80775);
    expect(parseAmount('1 234,56')).toBe(1234.56);
  });

  it('traktuje kropkę przed dwiema cyframi jako separator dziesiętny', () => {
    // Klawiatura numeryczna i kopiowanie z systemów anglojęzycznych dają taki zapis.
    expect(parseAmount('80775.00')).toBe(80775);
    expect(parseAmount('1234.56')).toBe(1234.56);
    expect(parseAmount('0.5')).toBe(0.5);
  });

  it('traktuje kropkę jako separator tysięcy tam, gdzie nie może być dziesiętna', () => {
    expect(parseAmount('80.775')).toBe(80775);
    expect(parseAmount('1.234.567')).toBe(1234567);
  });

  it('przy obecnym przecinku kropka zawsze rozdziela tysiące', () => {
    expect(parseAmount('80.775,00')).toBe(80775);
  });

  it('odrzuca śmieci zamiast zwracać NaN', () => {
    expect(parseAmount('')).toBe(0);
    expect(parseAmount('abc')).toBe(0);
  });
});

describe('parsowanie procentów', () => {
  it('przyjmuje ułamki w obu zapisach', () => {
    expect(parsePercent('58,44')).toBe(58.44);
    expect(parsePercent('58.44')).toBe(58.44);
  });

  it('przycina do zakresu od 0 do 100', () => {
    // Wcześniej "58,44" gubiło przecinek i stawało się 5844, a po przycięciu 100%.
    expect(parsePercent('5844')).toBe(100);
    expect(parsePercent('-5')).toBe(0);
  });

  it('sygnalizuje brak liczby zamiast podstawiać zero', () => {
    expect(parsePercent('')).toBeNull();
    expect(parsePercent(',')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { calculate } from '../calculate';
import { DEFAULT_INPUT } from '../defaults';
import { splitAmount } from '../vat';
import type { CalculatorInput } from '../types';

function input(overrides: Partial<CalculatorInput> = {}): CalculatorInput {
  return { ...DEFAULT_INPUT, ...overrides };
}

describe('podział kwoty', () => {
  it('wylicza VAT od kwoty netto', () => {
    expect(splitAmount('net', 1000, 23)).toEqual({ net: 1000, vat: 230, gross: 1230 });
  });

  it('wydziela VAT z kwoty brutto', () => {
    expect(splitAmount('gross', 1230, 23)).toEqual({ net: 1000, vat: 230, gross: 1230 });
  });
});

describe('działalność gospodarcza — użytek mieszany', () => {
  const result = calculate(input({ amount: 1230, amountMode: 'gross' }));

  it('odlicza połowę podatku naliczonego', () => {
    expect(result.vat.deductionRate).toBe(0.5);
    expect(result.vat.deductible).toBe(115);
    expect(result.vat.nonDeductible).toBe(115);
  });

  it('podstawą kosztu jest netto powiększone o VAT nieodliczony', () => {
    expect(result.costBase).toBe(1115);
  });

  it('do kosztów trafia 75% podstawy', () => {
    expect(result.kup).toBe(836.25);
    expect(result.nkup).toBe(278.75);
  });
});

describe('fundacja z działalnością gospodarczą i statutową', () => {
  it('przy prewspółczynniku 50% odlicza 25% podatku', () => {
    const result = calculate(input({ entityType: 'ngo', prePercent: 50, amount: 1230 }));
    expect(result.vat.deductionRate).toBe(0.25);
    expect(result.vat.deductible).toBe(57.5);
    expect(result.vat.nonDeductible).toBe(172.5);
  });

  it('uwzględnia proporcję sprzedaży obok prewspółczynnika', () => {
    const result = calculate(
      input({ entityType: 'ngo', prePercent: 60, salesPercent: 80, amount: 1230 }),
    );
    // 60% * 80% * 50% = 24%
    expect(result.vat.deductionRate).toBeCloseTo(0.24, 10);
    expect(result.vat.deductible).toBe(55.2);
  });

  it('dzieli koszt podatkowy według wskazanej alokacji', () => {
    const result = calculate(
      input({ entityType: 'ngo', prePercent: 50, businessSharePercent: 40, amount: 1230 }),
    );
    const total = result.kup + result.statutory;
    expect(total).toBeCloseTo(result.costBase * 0.75, 2);
    expect(result.statutory).toBeGreaterThan(result.kup);
  });

  it('obie części VAT sumują się do podatku z faktury', () => {
    const result = calculate(input({ entityType: 'ngo', prePercent: 37, amount: 999.99 }));
    expect(result.vat.deductible + result.vat.nonDeductible).toBeCloseTo(result.vat.vat, 10);
  });
});

describe('limity wartości pojazdu od 2026 roku', () => {
  const purchase = (overrides: Partial<CalculatorInput>) =>
    calculate(input({ category: 'purchase', amountMode: 'net', amount: 200_000, ...overrides }));

  it('samochód spalinowy powyżej 50 g/km ma limit 100 000 zł', () => {
    const result = purchase({ powertrain: 'emissionHigh' });
    expect(result.limit?.value).toBe(100_000);
    // wartość początkowa: 200 000 + 23 000 nieodliczonego VAT
    expect(result.depreciation?.initialValue).toBe(223_000);
    expect(result.limit?.ratio).toBeCloseTo(100_000 / 223_000, 10);
  });

  it('samochód poniżej 50 g/km ma limit 150 000 zł', () => {
    expect(purchase({ powertrain: 'emissionLow' }).limit?.value).toBe(150_000);
  });

  it('samochód elektryczny ma limit 225 000 zł', () => {
    const result = purchase({ powertrain: 'zeroEmission' });
    expect(result.limit?.value).toBe(225_000);
    // wartość początkowa poniżej limitu — całość odpisu jest kosztem
    expect(result.limit?.ratio).toBe(1);
    expect(result.depreciation?.annualNkup).toBe(0);
  });

  it('pozwala nadpisać limit ręcznie', () => {
    const result = purchase({ powertrain: 'emissionHigh', limitOverride: 165_000 });
    expect(result.limit?.value).toBe(165_000);
    expect(result.limit?.overridden).toBe(true);
  });

  it('rozbija odpis roczny na część kosztową i wyłączoną', () => {
    const result = purchase({ powertrain: 'emissionLow', depreciationRatePercent: 20 });
    const dep = result.depreciation!;
    expect(dep.annual).toBeCloseTo(dep.annualKup + dep.annualNkup, 2);
    expect(dep.annual).toBe(44_600);
  });
});

describe('leasing operacyjny', () => {
  it('limit obejmuje część kapitałową, a odsetki są kosztem w całości', () => {
    const result = calculate(
      input({
        category: 'leasing',
        amountMode: 'net',
        amount: 2000,
        interestNet: 400,
        vehicleValue: 200_000,
        powertrain: 'emissionHigh',
      }),
    );
    expect(result.limit?.ratio).toBe(0.5);

    // netto 2000, VAT 460, nieodliczony 230 -> podstawa 2230
    expect(result.costBase).toBe(2230);
    // odsetki 400 netto to 20% raty, więc 46 zł nieodliczonego VAT
    // kapitał: 1784 * 50% = 892 KUP, odsetki 446 w całości
    expect(result.kup).toBeCloseTo(1338, 2);
    expect(result.nkup).toBeCloseTo(892, 2);
  });

  it('bez wartości pojazdu ostrzega i nie stosuje limitu', () => {
    const result = calculate(
      input({ category: 'leasing', amountMode: 'net', amount: 2000, vehicleValue: 0 }),
    );
    expect(result.limit?.ratio).toBe(1);
    expect(result.warnings.join(' ')).toContain('wartości samochodu');
  });
});

describe('ubezpieczenia', () => {
  it('AC podlega limitowi proporcjonalnemu', () => {
    const result = calculate(
      input({
        category: 'insuranceAC',
        amountMode: 'net',
        amount: 6000,
        vatRatePercent: 0,
        insuredValue: 300_000,
      }),
    );
    expect(result.kup).toBe(3000);
    expect(result.nkup).toBe(3000);
  });

  it('OC jest kosztem w całości', () => {
    const result = calculate(
      input({ category: 'insuranceOC', amountMode: 'net', amount: 1200, vatRatePercent: 0 }),
    );
    expect(result.kup).toBe(1200);
    expect(result.nkup).toBe(0);
  });
});

describe('przypadek z praktyki — rata leasingowa w fundacji', () => {
  // Odtworzenie rzeczywistego dekretu: faktura 80 775,00 zł brutto,
  // prewspółczynnik 50%, klucz podziału kosztu 58,44%, wartość auta
  // w granicach limitu. Różnice groszowe wynikają z zaokrąglenia netto
  // na fakturze (65 670,74) wobec 80 775 / 1,23 = 65 670,73.
  const result = calculate(
    input({
      entityType: 'ngo',
      category: 'leasing',
      amountMode: 'gross',
      amount: 80_775,
      vatRatePercent: 23,
      prePercent: 50,
      businessSharePercent: 58.44,
      vehicleValue: 100_000,
      powertrain: 'emissionHigh',
    }),
  );

  it('odlicza 25% podatku naliczonego', () => {
    expect(result.vat.deductionRate).toBe(0.25);
    expect(result.vat.deductible).toBeCloseTo(3776.06, 1);
    expect(result.vat.nonDeductible).toBeCloseTo(11_328.2, 1);
  });

  it('podstawa obejmuje netto i VAT niepodlegający odliczeniu', () => {
    expect(result.costBase).toBeCloseTo(76_998.94, 1);
  });

  it('dzieli podstawę kluczem 58,44% bez reguły 75%', () => {
    // Rata leasingowa nie jest kosztem używania, więc limit 75% jej nie dotyczy.
    expect(result.kup).toBeCloseTo(44_998.18, 1);
    expect(result.statutory).toBeCloseTo(32_000.76, 1);
    expect(result.nkup).toBe(0);
  });

  it('rozdział pokrywa całą podstawę', () => {
    expect(result.kup + result.statutory + result.nkup).toBeCloseTo(result.costBase, 2);
  });
});

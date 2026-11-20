import { describe, expect, it } from 'vitest';
import { calculate } from '../calculate';
import { DEFAULT_INPUT } from '../defaults';
import { DOMYSLNY_PLAN_KONT, dekret, sumyDekretu, uzupelnijPlan } from '../dekret';
import type { CalculatorInput } from '../types';

const fundacja = (zmiany: Partial<CalculatorInput>): CalculatorInput => ({
  ...DEFAULT_INPUT,
  entityType: 'ngo',
  prePercent: 50,
  salesPercent: 100,
  businessSharePercent: 50,
  amountMode: 'net',
  ...zmiany,
});

const naKonta = (input: CalculatorInput) =>
  dekret(input, calculate(input), DOMYSLNY_PLAN_KONT)!.map(({ wn, ma, kwota }) => [wn ?? '', ma ?? '', kwota]);

describe('dekret raty BNP 11854/10/2026 w fundacji', () => {
  const input = fundacja({
    category: 'leasing',
    amount: 2216.07,
    vatRatePercent: 23,
    interestNet: 38.39,
    ratioOverridePercent: 58.44,
  });

  it('odpowiada dekretowi księgowej, z odsetkami w 75%', () => {
    expect(naKonta(input)).toEqual([
      ['', '202', 2725.77],
      ['402-13', '', 2048.77], // kapitał: statutowa 1 339,28 + w kosztach 709,49
      ['751-01-01', '', 39.66], // odsetki: statutowe 23,62 + w kosztach 16,04
      ['221-01', '', 127.43],
      ['408-07', '', 504.56], // kapitał ponad limit
      ['751-01-02', '', 5.35], // 25% gospodarczej części odsetek
      ['500-02', '490', 1339.28],
      ['501-01', '490', 1214.05], // 709,49 + 504,56
    ]);
  });

  it('strony faktury się równoważą', () => {
    const pozycje = dekret(input, calculate(input), DOMYSLNY_PLAN_KONT)!;
    expect(sumyDekretu(pozycje)).toEqual({ wn: 2725.77, ma: 2725.77 });
  });

  it('przez 490 przechodzi dokładnie to, co trafiło na konta kosztów rodzajowych', () => {
    const k = naKonta(input);
    const kwota = (konto: string) => k.find((x) => x[0] === konto)![2] as number;
    expect(Math.round((kwota('402-13') + kwota('408-07')) * 100) / 100).toBe(
      Math.round((kwota('500-02') + kwota('501-01')) * 100) / 100,
    );
  });
});

describe('dekret paliwa Orlen F 33394/4472/26 w fundacji', () => {
  it('koszt rodzajowy, wyłączenie 25% i przeksięgowanie', () => {
    const input = fundacja({ category: 'operating', amount: 370.46, vatRatePercent: 8 });
    expect(naKonta(input)).toEqual([
      ['', '202', 400.1],
      ['401-01', '', 344.53], // statutowa 200,05 + w kosztach 144,48
      ['221-01', '', 7.41],
      ['408-07', '', 48.16],
      ['500-02', '490', 200.05],
      ['501-01', '490', 192.64], // 144,48 + 48,16
    ]);
  });
});

describe('dekret w firmie', () => {
  it('bez części statutowej i bez przeksięgowania przez 490', () => {
    const input: CalculatorInput = { ...DEFAULT_INPUT, category: 'operating', amountMode: 'gross', amount: 1230 };
    const pozycje = dekret(input, calculate(input), DOMYSLNY_PLAN_KONT)!;
    expect(pozycje.some((x) => x.przeksiegowanie)).toBe(false);
    expect(pozycje.map((x) => x.kwota)).toEqual([1230, 836.25, 115, 278.75]);
    expect(sumyDekretu(pozycje)).toEqual({ wn: 1230, ma: 1230 });
  });

  it('zakupu nie dekretujemy — to środek trwały', () => {
    const input: CalculatorInput = { ...DEFAULT_INPUT, category: 'purchase', amount: 80000, vehicleValue: 80000 };
    expect(dekret(input, calculate(input), DOMYSLNY_PLAN_KONT)).toBeNull();
  });
});

describe('plan kont zapisany w przeglądarce', () => {
  it('uzupełnia brakujące pola i odrzuca śmieci', () => {
    expect(uzupelnijPlan(null)).toEqual(DOMYSLNY_PLAN_KONT);
    expect(uzupelnijPlan('x')).toEqual(DOMYSLNY_PLAN_KONT);
    const plan = uzupelnijPlan({ vat: '221-02', koszt: { operating: '401-05', leasing: 7 } });
    expect(plan.vat).toBe('221-02');
    expect(plan.koszt.operating).toBe('401-05');
    expect(plan.koszt.leasing).toBe('402-13');
    expect(plan.nkup).toBe('408-07');
  });
});

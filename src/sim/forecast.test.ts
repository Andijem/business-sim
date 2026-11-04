import { describe, expect, it } from 'vitest';
import { forecast, yesterday } from './forecast';
import { STRATEGIES, runStrategy } from './strategies';

describe('разбор прибыли и прогноз', () => {
  const r = runStrategy(STRATEGIES.smart, 60, 4);
  it('строки разбора складываются в прибыль дня', () => {
    const b = yesterday(r.st);
    expect(b.rev - b.cogs - b.wages - b.rent - b.acquiring - b.repair - b.depts).toBeCloseTo(b.profit, 6);
    expect(b.rev).toBeGreaterThan(0);
  });
  it('прогноз на конец сезона учитывает налог и не уходит далеко от факта', () => {
    const st = runStrategy(STRATEGIES.passive, 21, 4).st; // начало сезона
    const fc = forecast(st);
    expect(fc.daysToSeason).toBe(7);
    expect(fc.tax).toBeGreaterThan(0);
    const after = runStrategy(STRATEGIES.passive, 28, 4).st;
    const real = after.companies[0].cash;
    expect(Math.abs(fc.cashAtSeasonEnd - real)).toBeLessThan(0.1 * Math.abs(real) + 5000);
  });
});

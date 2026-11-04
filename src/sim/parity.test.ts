import { describe, expect, it } from 'vitest';
import fixture from './fixtures/model-parity.json';
import { MODEL_PARITY, STRATEGIES, runStrategy } from './strategies';

// Фикстуру пишет scripts/model-parity.py из planning/balance/sim.py с тем же генератором случайных чисел.
describe('ядро повторяет модель баланса', () => {
  for (const [key, runs] of Object.entries(fixture)) {
    it(`стратегия ${key}: захват деревень и касса совпадают`, () => {
      runs.forEach((py, seed) => {
        const r = runStrategy(STRATEGIES[key], 168, seed, MODEL_PARITY);
        expect(r.captured).toEqual(py.captured);
        [13, 55, 111, 167].forEach((d, i) => expect(Math.abs(r.cash[d] - py.cash[i])).toBeLessThanOrEqual(1));
      });
    });
  }
});

import { describe, expect, it } from 'vitest';
import { MODEL_PARITY, STRATEGIES, runStrategy } from './strategies';

const SEEDS = 30;
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const runs = (key: string, opts = {}) => Array.from({ length: SEEDS }, (_, s) => runStrategy(STRATEGIES[key], 168, s, opts));

describe('темп из документа баланса', () => {
  const smart = runs('smart', MODEL_PARITY);
  it('средний формат берёт Копеечкино около 58-го дня, Барыши около 113-го', () => {
    expect(median(smart.map((r) => r.captured.kopeechkino ?? 999))).toBeGreaterThanOrEqual(48);
    expect(median(smart.map((r) => r.captured.kopeechkino ?? 999))).toBeLessThanOrEqual(66);
    expect(median(smart.map((r) => r.captured.barysh ?? 999))).toBeGreaterThanOrEqual(100);
    expect(median(smart.map((r) => r.captured.barysh ?? 999))).toBeLessThanOrEqual(126);
  });
  it('эконом быстрее среднего, премиум медленнее', () => {
    const econ = median(runs('econ', MODEL_PARITY).map((r) => r.captured.kopeechkino ?? 999));
    const prem = median(runs('premium', MODEL_PARITY).map((r) => r.captured.kopeechkino ?? 999));
    const mid = median(smart.map((r) => r.captured.kopeechkino ?? 999));
    expect(econ).toBeLessThan(mid);
    expect(prem).toBeGreaterThan(mid);
  });
});

describe('100 дней в полной игре (карточки, налоги, кредиты)', () => {
  const passive = runs('passive');
  const smart = runs('smart');
  it('без решений кофейня выживает еле-еле', () => {
    for (const r of passive) {
      expect(r.st.bankrupt).toBe(false);
      expect(r.cash[99]).toBeGreaterThan(0);
    }
    expect(median(passive.map((r) => r.cash[99]))).toBeLessThan(200_000);
  });
  it('с хорошими решениями компания растёт и захватывает деревню', () => {
    expect(smart.every((r) => !r.st.bankrupt)).toBe(true);
    expect(median(smart.map((r) => r.cash[99]))).toBeGreaterThan(2 * median(passive.map((r) => r.cash[99])));
    expect(median(smart.map((r) => r.captured.kopeechkino ?? 999))).toBeLessThan(100);
    expect(median(smart.map((r) => r.st.companies[0].points.length))).toBeGreaterThanOrEqual(6);
  });
});

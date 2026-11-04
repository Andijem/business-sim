import { describe, expect, it } from 'vitest';
import { MODEL_PARITY, STRATEGIES, runStrategy } from './strategies';
import { cardDef, resolveCard } from './cards';
import { newGame } from './state';
import { endDay, finishDay } from './tick';

const SEEDS = 30;
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const runs = (key: string, opts = {}) => Array.from({ length: SEEDS }, (_, s) => runStrategy(STRATEGIES[key], 168, s, opts));

describe('темп из документа баланса', () => {
  const smart = runs('smart', MODEL_PARITY);
  // выкуп подорожал (решение FAJI 04.11): Копеечкино примерно на 2 недели позже
  it('средний формат берёт Копеечкино около 67-го дня, Барыши около 115-го', () => {
    expect(median(smart.map((r) => r.captured.kopeechkino ?? 999))).toBeGreaterThanOrEqual(56);
    expect(median(smart.map((r) => r.captured.kopeechkino ?? 999))).toBeLessThanOrEqual(74);
    expect(median(smart.map((r) => r.captured.barysh ?? 999))).toBeGreaterThanOrEqual(100);
    expect(median(smart.map((r) => r.captured.barysh ?? 999))).toBeLessThanOrEqual(125);
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

describe('осторожная игра стоит 10–15% темпа (решение FAJI)', () => {
  it('smart с осторожными ответами: Копеечкино ≤ 80, Барыши ≤ 130', () => {
    const k: number[] = [], b: number[] = [];
    for (let seed = 0; seed < SEEDS; seed++) {
      const s = STRATEGIES.smart;
      const st = newGame(seed, {}, s.first ?? {});
      for (let d = 0; d < 168 && !st.bankrupt; d++) {
        endDay(st);
        for (const pc of [...st.pending]) {
          const c = cardDef(pc.card);
          resolveCard(st, pc.uid, (c.options.find((o) => o.cautious) ?? c.options[0]).id);
        }
        s.act(st);
        finishDay(st);
      }
      k.push(st.captured.kopeechkino ?? 999);
      b.push(st.captured.barysh ?? 999);
    }
    expect(median(k)).toBeLessThanOrEqual(80);
    expect(median(b)).toBeLessThanOrEqual(130);
  });
});

describe('v0.2: Грошево и Наваринка', () => {
  const DAYS = 224;
  const play = (cautious: boolean) => {
    const g: number[] = [], n: number[] = [];
    for (let seed = 0; seed < SEEDS; seed++) {
      const s = STRATEGIES.smart;
      const st = newGame(seed, { cards: cautious }, s.first ?? {});
      for (let d = 0; d < DAYS && !st.bankrupt; d++) {
        endDay(st);
        for (const pc of [...st.pending]) {
          const c = cardDef(pc.card);
          resolveCard(st, pc.uid, (c.options.find((o) => o.cautious) ?? c.options[0]).id);
        }
        s.act(st);
        finishDay(st);
      }
      expect(st.bankrupt).toBe(false);
      g.push(st.captured.grosh ?? 999);
      n.push(st.captured.navarinka ?? 999);
    }
    return { g: median(g), n: median(n) };
  };
  it('smart без карточек: Грошево около 143-го дня, Наваринка около 179-го', () => {
    const r = play(false);
    expect(r.g).toBeGreaterThanOrEqual(130);
    expect(r.g).toBeLessThanOrEqual(155);
    expect(r.n).toBeGreaterThanOrEqual(165);
    expect(r.n).toBeLessThanOrEqual(195);
  });
  it('smart с осторожными ответами: Грошево ≤ 165, Наваринка ≤ 200', () => {
    const r = play(true);
    expect(r.g).toBeLessThanOrEqual(165);
    expect(r.n).toBeLessThanOrEqual(200);
  });
});

describe('v0.3: кольцо 1 Капитальска', () => {
  const DAYS = 380;
  const CITY_SEEDS = 12;
  const play = (cautious: boolean) => {
    const a: number[] = [], z: number[] = [];
    for (let seed = 0; seed < CITY_SEEDS; seed++) {
      const s = STRATEGIES.smart;
      const st = newGame(seed, { cards: cautious }, s.first ?? {});
      for (let d = 0; d < DAYS && !st.bankrupt; d++) {
        endDay(st);
        for (const pc of [...st.pending]) {
          const c = cardDef(pc.card);
          resolveCard(st, pc.uid, (c.options.find((o) => o.cautious) ?? c.options[0]).id);
        }
        s.act(st);
        finishDay(st);
      }
      expect(st.bankrupt).toBe(false);
      a.push(st.captured.novostroyki ?? 999);
      z.push(st.captured.studgorodok ?? 999);
    }
    return { first: median(a), last: median(z) };
  };
  it('smart без карточек: Новостройки около 248-го дня, Студгородок около 349-го', () => {
    const r = play(false);
    expect(r.first).toBeGreaterThanOrEqual(225);
    expect(r.first).toBeLessThanOrEqual(270);
    expect(r.last).toBeGreaterThanOrEqual(320);
    expect(r.last).toBeLessThanOrEqual(375);
  }, 120_000);
  it('smart с осторожными ответами: Студгородок ≤ 390', () => {
    expect(play(true).last).toBeLessThanOrEqual(390);
  }, 120_000);
});

describe('v0.4: Кредитовка и Должково', () => {
  const DAYS = 470;
  const SEEDS4 = 12;
  const play = (cautious: boolean) => {
    const k: number[] = [], d: number[] = [];
    for (let seed = 0; seed < SEEDS4; seed++) {
      const s = STRATEGIES.smart;
      const st = newGame(seed, { cards: cautious }, s.first ?? {});
      for (let day = 0; day < DAYS && !st.bankrupt; day++) {
        endDay(st);
        for (const pc of [...st.pending]) {
          const c = cardDef(pc.card);
          resolveCard(st, pc.uid, (c.options.find((o) => o.cautious) ?? c.options[0]).id);
        }
        s.act(st);
        finishDay(st);
      }
      expect(st.bankrupt).toBe(false);
      k.push(st.captured.kreditovka ?? 999);
      d.push(st.captured.dolzhkovo ?? 999);
    }
    return { k: median(k), d: median(d) };
  };
  it('smart без карточек: Кредитовка около 384-го дня, Должково около 417-го', () => {
    const r = play(false);
    expect(r.k).toBeGreaterThanOrEqual(365);
    expect(r.k).toBeLessThanOrEqual(405);
    expect(r.d).toBeGreaterThanOrEqual(395);
    expect(r.d).toBeLessThanOrEqual(440);
  }, 180_000);
  it('smart с осторожными ответами: Должково ≤ 455', () => {
    expect(play(true).d).toBeLessThanOrEqual(455);
  }, 180_000);
});

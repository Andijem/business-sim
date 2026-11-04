import { describe, expect, it } from 'vitest';
import { newGame } from './state';
import { advanceDay } from './tick';
import { baseline, effect } from './whatif';

describe('примерка действия', () => {
  it('не меняет настоящую игру и даёт разумные числа', () => {
    const st = newGame(5);
    for (let i = 0; i < 10; i++) advanceDay(st);
    st.companies[0].cash = 200000;
    const before = JSON.stringify(st);
    const base = baseline(st);
    const id = st.companies[0].points[0].id;
    const t0 = performance.now();
    const out = {
      hire: effect(st, { a: 'hire', id }, base),
      fire: effect(st, { a: 'fire', id }, base),
      up: effect(st, { a: 'priceUp', id }, base),
      down: effect(st, { a: 'priceDown', id }, base),
      dept: effect(st, { a: 'dept', dept: 'mkt' }, base),
      open: effect(st, { a: 'open', village: 'kopeechkino', niche: 'store', seg: 0 }, base),
    };
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(out.hire).toEqual({ fail: 'slots' });
    expect(JSON.stringify(st)).toBe(before);
    const open = out.open as { cost: number; perDay: number };
    expect(open.cost).toBeGreaterThan(0);
    expect(open.perDay).toBeGreaterThan(0);
  });
});

import { readFileSync } from 'node:fs';
import ru from '../i18n/ru.json';
describe('причины отказа', () => {
  it('у каждой причины есть текст', () => {
    const src = readFileSync(new URL('./actions.ts', import.meta.url), 'utf8');
    for (const m of src.matchAll(/fail\('(\w+)'\)/g)) expect(ru, m[1]).toHaveProperty([`ui.fail.${m[1]}`]);
  });
});

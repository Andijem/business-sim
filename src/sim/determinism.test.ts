import { describe, expect, it } from 'vitest';
import { newGame } from './state';
import { advanceDay } from './tick';
import { STRATEGIES, runStrategy } from './strategies';
import { hasKey } from '../i18n';

describe('детерминизм и сохранение', () => {
  it('одно зерно — одна и та же игра', () => {
    const a = runStrategy(STRATEGIES.smart, 120, 11);
    const b = runStrategy(STRATEGIES.smart, 120, 11);
    expect(JSON.stringify(a.st)).toBe(JSON.stringify(b.st));
  });

  it('состояние переживает JSON (как сохранение) и продолжается так же', () => {
    const a = newGame(9);
    for (let d = 0; d < 30; d++) advanceDay(a);
    const b = JSON.parse(JSON.stringify(a));
    for (let d = 0; d < 30; d++) {
      advanceDay(a);
      advanceDay(b);
    }
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('у каждого события игры есть текст', () => {
    const r = runStrategy(STRATEGIES.smart, 168, 2);
    for (const e of r.st.events) expect(hasKey(e.key), e.key).toBe(true);
  });
});

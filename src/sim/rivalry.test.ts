import { describe, expect, it } from 'vitest';
import ru from '../i18n/ru.json';
import { advanceDay } from './tick';
import { newGame } from './state';
import { RIVAL_EVENTS, rivalHistory, rivalry } from './rivalry';

describe('шкала конкуренции с Хваткиным', () => {
  it('доли в пределах 0..1 и есть по каждой нише открытой деревни', () => {
    const st = newGame(7);
    for (let i = 0; i < 20; i++) {
      const r = rivalry(st);
      expect(r.share).toBeGreaterThanOrEqual(0);
      expect(r.share).toBeLessThanOrEqual(1);
      expect(r.niches.length).toBe(2);
      for (const n of r.niches) expect(n.share).toBeGreaterThanOrEqual(0), expect(n.share).toBeLessThanOrEqual(1);
      advanceDay(st);
    }
    expect(rivalry(st).shareLastWeek).not.toBeNull();
  });

  it('у всех ходов Хваткина есть текст, ежегодные вложения попадают в историю', () => {
    for (const k of RIVAL_EVENTS) expect(ru).toHaveProperty([k]);
    const st = newGame(3);
    for (let i = 0; i < 28; i++) advanceDay(st);
    expect(rivalHistory(st, 50).some((e) => e.key === 'ev.rivalInvest')).toBe(true);
  });
});

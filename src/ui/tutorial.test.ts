import { describe, expect, it } from 'vitest';
import { hasKey } from '../i18n';
import { newGame, advanceDay, endDay, finishDay } from '../sim';
import { makeSmart } from '../sim/strategies';
import { nextHint } from './tutorial';

describe('подсказки новичку', () => {
  it('первый день — прожить день', () => {
    expect(nextHint(newGame(1))).toEqual({ key: 'tut.first'.concat('Day'), target: 'day1' });
  });
  it('на всём пути до захвата у подсказки есть текст, карточка всегда первой', () => {
    const st = newGame(2);
    const smart = makeSmart();
    const seen = new Set<string>();
    for (let d = 0; d < 120; d++) {
      const h = nextHint(st);
      seen.add(h.key);
      expect(hasKey(h.key), h.key).toBe(true);
      if (st.pending.length) expect(h.key).toBe('tut.card');
      endDay(st);
      smart(st);
      finishDay(st);
    }
    expect(seen.has('tut.open')).toBe(true);
    expect(seen.has('tut.card')).toBe(true);
  });
  it('пассивный игрок видит подсказки, а не пустоту', () => {
    const st = newGame(3);
    for (let d = 0; d < 30; d++) advanceDay(st);
    expect(hasKey(nextHint(st).key)).toBe(true);
  });
});

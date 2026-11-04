import { describe, expect, it } from 'vitest';
import { advanceDay, newGame, openPoint } from '../sim';
import { lotsOf, villageLots } from './layout';

describe('раскладка участков', () => {
  it('у каждого лота своё место, бойкие у перекрёстка', () => {
    for (const v of ['kopeechkino', 'barysh']) {
      const lots = villageLots(v);
      expect(new Set(lots.map((l) => l.slot)).size).toBe(lots.length);
      for (const l of lots) if (l.traffic === 1.25) expect(l.slot).toBeLessThan(4);
    }
  });
  it('все точки стоят на участках, место точки не меняется после открытия новой', () => {
    const st = newGame(3);
    const before = lotsOf(st, 'kopeechkino');
    expect(before.filter((l) => l.point).length).toBe(4);
    const mine = before.find((l) => l.point?.owner === 0)!;
    st.companies[0].cash = 1e6;
    advanceDay(st);
    expect(openPoint(st, 'kopeechkino', 'store', 0).ok).toBe(true);
    const after = lotsOf(st, 'kopeechkino');
    expect(after.filter((l) => l.point).length).toBe(5);
    expect(after.find((l) => l.point?.id === mine.point!.id)!.slot).toBe(mine.slot);
  });
});

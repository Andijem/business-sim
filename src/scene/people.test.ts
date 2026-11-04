import { describe, expect, it } from 'vitest';
import { advanceDay, newGame } from '../sim';
import { LotsView } from './lots';
import { People } from './people';

describe('гости на улице', () => {
  it('днём идут к точкам, ночью новых нет', () => {
    const st = newGame(1);
    advanceDay(st);
    const lots = new LotsView();
    lots.sync(st);
    const ppl = new People();
    for (let i = 0; i < 30; i++) ppl.update(0.1, 0.5, 12, lots.views.values());
    const day = (ppl.group.children[0] as unknown as { count: number }).count;
    expect(day).toBeGreaterThan(3);
    // ночью новые не приходят, старые расходятся
    for (let i = 0; i < 2000; i++) ppl.update(0.1, 0.5, 23, lots.views.values());
    expect((ppl.group.children[0] as unknown as { count: number }).count).toBe(0);
  });
  it('здания перестраиваются только при изменениях', () => {
    const st = newGame(1);
    const lots = new LotsView();
    expect(lots.sync(st)).toBe(true);
    expect(lots.sync(st)).toBe(false);
    st.companies[0].points[0].staff += 1;
    expect(lots.sync(st)).toBe(true);
  });
});

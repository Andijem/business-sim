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

import { buildLot } from './buildings';
import { NICHE_ICON } from '../ui/icons';
import { hasKey } from '../i18n';
import { NICHES } from '../sim';
import type { Point } from '../sim';
describe('здания всех ниш', () => {
  it('строятся на любом уровне зала и формате, у ниши есть значок и названия', () => {
    const base = newGame(1).companies[0].points[0];
    for (const niche of Object.keys(NICHE_ICON)) {
      expect(hasKey(`niche.${niche}`), niche).toBe(true);
      for (const u of NICHES[niche as keyof typeof NICHES]?.upgrades ?? []) expect(hasKey(`upgrade.${u.id}`), u.id).toBe(true);
      for (const seg of [-1, 0, 1] as const) {
        expect(hasKey(`segName.${niche}.${seg}`), `${niche}.${seg}`).toBe(true);
        for (let hall = 0; hall < 4; hall++) {
          const p = { ...base, niche, seg, hall, staff: hall + 1, upgrades: 3 } as unknown as Point;
          const m = buildLot(p);
          expect(m.group.children.length, `${niche} ${hall}`).toBeGreaterThan(0);
        }
      }
    }
  });
});

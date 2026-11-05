import { describe, expect, it } from 'vitest';
import { buildWorld } from './village';
import { Life } from './life';

describe('жизнь вокруг бизнесов', () => {
  const w = buildWorld();
  const k = w.places[0], g = w.places.find((p) => p.id === 'grosh')!;
  w.ensure(k.x, 1);
  w.ensure(g.x, 1);
  it('пока идёт время: машины едут, жители гуляют, животные бродят, из труб дым', () => {
    const life = new Life(w.places, [-32, 3000]);
    for (let i = 0; i < 200; i++) life.update(0.05, true, 12, k.x);
    const s = life.stats();
    expect(s.cars).toBeGreaterThan(0);
    expect(s.walkers).toBeGreaterThan(3);
    expect(s.animals).toBeGreaterThan(3);
    expect(s.puffs).toBeGreaterThan(0);
  });
  it('мельница в Грошево крутится, а на паузе ничего не движется', () => {
    const life = new Life(w.places, [-32, 3000]);
    const mill = g.movers.find((o) => (o.userData.anim as { kind: string }).kind === 'spin')!;
    const r0 = mill.rotation.z;
    expect(life.update(1, false, 12, g.x)).toBe(false);
    expect(mill.rotation.z).toBe(r0);
    life.update(1, true, 12, g.x);
    expect(mill.rotation.z).not.toBe(r0);
  });
  it('ночью на улицах почти пусто', () => {
    const life = new Life(w.places, [-32, 3000]);
    for (let i = 0; i < 400; i++) life.update(0.05, true, 23.5, k.x);
    expect(life.stats().walkers).toBeLessThanOrEqual(3);
  });
});

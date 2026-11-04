import { describe, expect, it } from 'vitest';
import { hasKey } from '../i18n';
import { CARDS, cardDef, managerChoice, resolveCard } from './cards';
import { player, upgradeHall, setManager } from './actions';
import { newGame } from './state';
import { advanceDay } from './tick';

describe('карточки решений', () => {
  it('78 карточек (60 из v0.1 и 18 для ниш v0.2), у каждой есть осторожный вариант и тексты', () => {
    expect(CARDS).toHaveLength(78);
    expect(new Set(CARDS.map((c) => c.id)).size).toBe(CARDS.length);
    for (const c of CARDS) {
      expect(c.options.filter((o) => o.cautious)).toHaveLength(1);
      expect(hasKey(`card.${c.id}.title`)).toBe(true);
      expect(hasKey(`card.${c.id}.text`)).toBe(true);
      for (const o of c.options) {
        expect(hasKey(`card.${c.id}.${o.id}`), `${c.id}.${o.id}`).toBe(true);
        expect(hasKey(`card.${c.id}.${o.id}.hint`), `${c.id}.${o.id}.hint`).toBe(true);
      }
    }
  });

  it('сезонные карточки выпадают только в свой сезон', () => {
    const seasonal = new Set(CARDS.filter((c) => c.seasons).map((c) => c.id));
    expect(seasonal.size).toBeGreaterThanOrEqual(12);
    const st = newGame(11);
    player(st).cash = 1e6;
    for (let d = 0; d < 112; d++) advanceDay(st);
    const got = st.events.filter((e) => (e.key === 'ev.cardNew' || e.key === 'ev.managerCard') && seasonal.has(String(e.params!.card)));
    expect(got.length).toBeGreaterThan(0);
    for (const e of got) expect(cardDef(String(e.params!.card)).seasons).toContain(Math.floor(e.day / 7) % 4);
  });

  it('выпадают 0–2 в день, без ответа решаются осторожно через сутки', () => {
    const st = newGame(3);
    let seen = 0;
    for (let d = 0; d < 40; d++) {
      advanceDay(st);
      expect(st.pending.length).toBeLessThanOrEqual(2);
      for (const pc of st.pending) expect(pc.day).toBeGreaterThanOrEqual(st.day - 1);
      seen += st.events.filter((e) => e.day === st.day - 1 && e.key === 'ev.cardNew').length;
    }
    expect(seen).toBeGreaterThan(5);
    expect(st.events.some((e) => e.key === 'ev.cardAuto')).toBe(true);
  });

  it('ответ игрока применяет последствия', () => {
    const st = newGame(3);
    while (!st.pending.length) advanceDay(st);
    const pc = st.pending[0];
    const c = cardDef(pc.card);
    const cash = player(st).cash;
    const opt = c.options.find((o) => o.effects.some((e) => e.t === 'cash')) ?? c.options[0];
    expect(resolveCard(st, pc.uid, opt.id)).toBe(true);
    expect(st.pending.find((x) => x.uid === pc.uid)).toBeUndefined();
    const cashFx = opt.effects.filter((e) => e.t === 'cash').reduce((a, e) => a + (e.t === 'cash' ? e.v : 0), 0);
    expect(player(st).cash).toBe(cash + cashFx);
  });

  it('управляющий решает мелкие карточки по правилам, крупные остаются игроку', () => {
    const bean = cardDef('beanPrice');
    expect(managerChoice(bean, { price: 'hold', raw: -1, hire: true }).id).toBe('cheap');
    expect(managerChoice(bean, { price: 'hold', raw: 0, hire: true }).id).toBe('endure');
    const st = newGame(5);
    player(st).cash = 1e6;
    const p = player(st).points[0];
    upgradeHall(st, p.id);
    upgradeHall(st, p.id);
    setManager(st, p.id, { price: 'hold', raw: 0, hire: false });
    for (let d = 0; d < 60; d++) advanceDay(st);
    for (const e of st.events.filter((x) => x.key === 'ev.cardNew')) expect(cardDef(String(e.params!.card)).size).toBe('big');
    expect(st.events.some((e) => e.key === 'ev.managerCard')).toBe(true);
  });
});

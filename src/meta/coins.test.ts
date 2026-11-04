import { describe, expect, it } from 'vitest';
import { hasKey } from '../i18n';
import { changeFormat, newGame, player } from '../sim';
import { ACHIEVEMENTS, BOOSTS, buyBoost, checkAchievements, dailyLogin, newMeta, offlineMax, timeMult } from './coins';

describe('монетки', () => {
  it('ежедневный вход: раз в день, серия растит награду до 10', () => {
    const m = newMeta();
    const d = new Date(2026, 10, 4, 10);
    expect(dailyLogin(m, d)).toBe(5);
    expect(dailyLogin(m, new Date(2026, 10, 4, 22))).toBe(0);
    const got = [];
    for (let i = 1; i <= 7; i++) got.push(dailyLogin(m, new Date(2026, 10, 4 + i, 9)));
    expect(got).toEqual([6, 7, 8, 9, 10, 10, 10]);
    expect(dailyLogin(m, new Date(2026, 10, 20, 9))).toBe(5); // пропуск — серия сначала
  });

  it('достижения дают монетки один раз, у всех есть тексты', () => {
    const st = newGame(1);
    const m = newMeta();
    st.day = 30;
    const first = checkAchievements(st, m).map((a) => a.id);
    expect(first).toEqual(['week', 'year']);
    expect(m.coins).toBe(20 + 5 + 15);
    expect(checkAchievements(st, m)).toEqual([]);
    for (const a of ACHIEVEMENTS) {
      expect(hasKey(`ach.${a.id}`), a.id).toBe(true);
      expect(hasKey(`ach.${a.id}.how`), a.id).toBe(true);
    }
  });

  it('ускорители покупают время, а не результат', () => {
    const m = newMeta();
    m.coins = 100;
    const now = 1_000_000;
    expect(offlineMax(m, now, 7)).toBe(7);
    expect(buyBoost(m, 'longOffline', now).ok).toBe(true);
    expect(offlineMax(m, now + 1000, 7)).toBe(14);
    expect(offlineMax(m, now + 4 * 24 * 3600e3, 7)).toBe(7);
    expect(buyBoost(m, 'speed', now).ok).toBe(true);
    expect(timeMult(m, now + 60e3)).toBe(2);
    expect(timeMult(m, now + 2 * 3600e3)).toBe(1);
    expect(m.coins).toBe(100 - BOOSTS.longOffline.cost - BOOSTS.speed.cost);

    const st = newGame(1);
    player(st).cash = 1e6;
    const p = player(st).points[0];
    expect(buyBoost(m, 'rebuild', now, st, p.id)).toEqual({ ok: false, reason: 'point' });
    changeFormat(st, p.id, 1);
    expect(p.closedDays).toBeGreaterThan(0);
    expect(buyBoost(m, 'rebuild', now, st, p.id).ok).toBe(true);
    expect(p.closedDays).toBe(0);
    m.coins = 0;
    expect(buyBoost(m, 'speed', now)).toEqual({ ok: false, reason: 'coins' });
  });
});

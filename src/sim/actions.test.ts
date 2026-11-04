import { describe, expect, it } from 'vitest';
import {
  buyDept, buyNicheUpgrade, loanLimit, buyout, buyoutPrice, changeFormat, openPoint, player, rival, setManager, setUsn, takeLoan,
  upgradeHall,
} from './actions';
import { newGame } from './state';
import { advanceDay } from './tick';

const fresh = () => newGame(7, { cards: false });

describe('действия игрока', () => {
  it('стартовая точка: киоск-кофейня на улице, Хваткин на лучших участках', () => {
    const st = fresh();
    expect(player(st).cash).toBe(40000);
    expect(player(st).points).toHaveLength(1);
    expect(player(st).points[0].traffic).toBe(1.0);
    expect(player(st).points[0].newDays).toBe(7);
    const kc = rival(st).points.filter((p) => p.village === 'kopeechkino' && p.niche === 'coffee');
    expect(kc.map((p) => p.traffic)).toEqual([1.25, 1.25]);
  });

  it('открытие точки: цена по формату, лучший свободный участок, неделя «Новинка»', () => {
    const st = fresh();
    player(st).cash = 200000;
    expect(openPoint(st, 'kopeechkino', 'coffee', -1).ok).toBe(true);
    expect(player(st).cash).toBe(200000 - 36000);
    const p = player(st).points[1];
    expect(p.seg).toBe(-1);
    expect(p.newDays).toBe(7);
    expect(p.traffic).toBe(0.8);
    expect(openPoint(st, 'kopeechkino', 'coffee', 0).ok).toBe(false); // 4 участка заняты
    expect(openPoint(st, 'barysh', 'wash', 0)).toEqual({ ok: false, reason: 'locked' });
  });

  it('отдел не выше числа точек + 1', () => {
    const st = fresh();
    player(st).cash = 1e6;
    expect(buyDept(st, 'hr').ok).toBe(true);
    expect(buyDept(st, 'hr').ok).toBe(true);
    expect(buyDept(st, 'hr')).toEqual({ ok: false, reason: 'cap' });
    expect(player(st).cash).toBe(1e6 - 8000 - 20000);
  });

  it('прокачка ниши открывается по одной на зал 2, 3 и 4', () => {
    const st = fresh();
    player(st).cash = 1e6;
    const id = player(st).points[0].id;
    expect(buyNicheUpgrade(st, id)).toEqual({ ok: false, reason: 'hall' });
    upgradeHall(st, id);
    expect(buyNicheUpgrade(st, id).ok).toBe(true);
    expect(player(st).cash).toBe(1e6 - 25000 - 18000);
    expect(buyNicheUpgrade(st, id)).toEqual({ ok: false, reason: 'hall' });
  });

  it('выкуп точки Хваткина: цена открытия + 20 дней прибыли, передача, Хваткин демпингует', () => {
    const st = fresh();
    for (let i = 0; i < 10; i++) advanceDay(st);
    const p = rival(st).points[0];
    const price = buyoutPrice(p);
    expect(price).toBe(Math.round((60000 * 0.6 * 1.0 + 20 * Math.max(0, p.profitEma!)) / 1000) * 1000);
    const rep = p.rep;
    const other = rival(st).points.find((r) => r !== p && r.village === p.village)!;
    const otherPrice = other.priceIdx;
    player(st).cash = price;
    expect(buyout(st, p.id).ok).toBe(true);
    expect(p.owner).toBe(0);
    expect(p.seg).toBe(-1);
    expect(rival(st).points).not.toContain(p);
    expect(p.rep).toBeCloseTo(Math.max(1, rep - 0.5));
    expect(p.loyal).toBe(0.2);
    expect(p.handover).toBe(3);
    expect(other.priceIdx).toBeCloseTo(otherPrice * 0.9);
    expect(other.revenge).toBe(14);
    for (let i = 0; i < 14; i++) advanceDay(st);
    expect(p.handover).toBe(0);
    expect(other.revenge).toBe(0);
    expect(other.priceIdx).toBeCloseTo(otherPrice);
  });

  it('смена формата: 50% цены нового формата, 3 дня закрыто', () => {
    const st = fresh();
    player(st).cash = 100000;
    const p = player(st).points[0];
    expect(changeFormat(st, p.id, 1).ok).toBe(true);
    expect(player(st).cash).toBe(100000 - 54000);
    expect(p.closedDays).toBe(3);
    advanceDay(st);
    expect(p.closedDays).toBe(2);
    expect(p.last).toBeNull();
  });

  it('управляющий только при зале 3-го уровня', () => {
    const st = fresh();
    player(st).cash = 1e6;
    const p = player(st).points[0];
    const rules = { price: 'hold', raw: 1, hire: true } as const;
    expect(setManager(st, p.id, rules)).toEqual({ ok: false, reason: 'hall' });
    upgradeHall(st, p.id);
    upgradeHall(st, p.id);
    expect(setManager(st, p.id, rules).ok).toBe(true);
    advanceDay(st);
    expect(p.raw).toBe(1);
  });

  it('УСН: выбор в первый сезон, потом раз в год весной и с Бухгалтерией 2', () => {
    const st = fresh();
    expect(setUsn(st, 15).ok).toBe(true);
    for (let i = 0; i < 10; i++) advanceDay(st);
    expect(setUsn(st, 6)).toEqual({ ok: false, reason: 'season' });
    while (st.day % 28 !== 0) advanceDay(st);
    expect(setUsn(st, 6)).toEqual({ ok: false, reason: 'acc' });
    player(st).cash = 1e6;
    buyDept(st, 'acc');
    buyDept(st, 'acc');
    expect(setUsn(st, 6).ok).toBe(true);
  });

  it('кассовый разрыв: овердрафт, затем спасительный кредит и заморозка расширения', () => {
    const st = fresh();
    for (let i = 0; i < 7; i++) advanceDay(st);
    player(st).cash = -6000;
    advanceDay(st);
    expect(st.negDays).toBeGreaterThan(0);
    player(st).cash = -1e6;
    advanceDay(st);
    expect(st.loans.some((l) => l.kind === 'rescue')).toBe(true);
    expect(player(st).cash).toBeGreaterThanOrEqual(0);
    player(st).cash = 1e6;
    expect(openPoint(st, 'kopeechkino', 'coffee', 0)).toEqual({ ok: false, reason: 'frozen' });
  });

  it('кредит на развитие: один за раз, не больше 10 дней прибыли, гасится по сезонам', () => {
    const st = fresh();
    for (let i = 0; i < 7; i++) advanceDay(st);
    expect(takeLoan(st, 1e7).ok).toBe(false);
    const before = player(st).cash;
    expect(takeLoan(st, loanLimit(st) + 1).ok).toBe(false);
    expect(takeLoan(st, 10000).ok).toBe(true);
    expect(player(st).cash).toBe(before + 10000);
    expect(takeLoan(st, 1000).ok).toBe(false); // второй кредит, пока первый не погашен
    for (let i = 0; i < 7 * 10; i++) advanceDay(st);
    expect(st.loans).toHaveLength(0);
  });
});

import { catchUp } from './tick';
describe('офлайн-прогресс', () => {
  it('день за каждые полчаса отсутствия, неделя за 3,5 часа, дальше не копится', () => {
    const st = newGame(1);
    expect(catchUp(st, 29 * 60)).toBe(0);
    expect(catchUp(st, 2 * 3600)).toBe(4);
    expect(st.day).toBe(4);
    expect(catchUp(st, 3.5 * 3600)).toBe(7);
    expect(catchUp(st, 24 * 3600)).toBe(7);
    expect(st.day).toBe(18);
  });
});

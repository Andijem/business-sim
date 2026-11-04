import type { GameState, Result } from '../sim';

/**
 * Монетки — премиум-валюта (GDD, раздел 9). Покупают время, а не результат:
 * их нельзя обменять на баблосы и нельзя потратить, чтобы отменить последствия решения.
 * Хранятся отдельно от партии: «Новая игра» их не сбрасывает.
 * Реальной оплаты в версии 0.1 нет: монетки дают за ежедневный вход и достижения.
 */
export interface Meta {
  coins: number;
  /** Дата последнего входа, ГГГГ-ММ-ДД по местному времени. */
  lastLogin: string;
  streak: number;
  achieved: string[];
  /** До какого момента (мс) действует «Длинный офлайн». */
  longOfflineUntil: number;
  /** До какого момента (мс) время идёт ×2. */
  speedUntil: number;
}

export const START_COINS = 20;
export const newMeta = (): Meta => ({ coins: START_COINS, lastLogin: '', streak: 0, achieved: [], longOfflineUntil: 0, speedUntil: 0 });

export function isMeta(x: unknown): x is Meta {
  const m = x as Meta;
  return !!m && typeof m.coins === 'number' && typeof m.lastLogin === 'string' && Array.isArray(m.achieved);
}

const dateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Ежедневный вход: 5 монеток, за каждый день подряд +1, до 10. Возвращает, сколько начислено (0 — сегодня уже было). */
export function dailyLogin(m: Meta, now: Date): number {
  const today = dateKey(now);
  if (m.lastLogin === today) return 0;
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  m.streak = m.lastLogin === dateKey(y) ? m.streak + 1 : 1;
  m.lastLogin = today;
  const n = 5 + Math.min(m.streak - 1, 5);
  m.coins += n;
  return n;
}

export interface Achievement {
  id: string;
  coins: number;
  done: (st: GameState) => boolean;
}

const has = (st: GameState, key: string) => st.events.some((e) => e.key === key);

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'week', coins: 5, done: (st) => st.day >= 7 },
  { id: 'firstCard', coins: 5, done: (st) => has(st, 'ev.card') },
  { id: 'firstDept', coins: 10, done: (st) => Object.values(st.companies[0].depts).some((l) => l > 0) },
  { id: 'secondPoint', coins: 10, done: (st) => st.companies[0].points.length >= 2 },
  { id: 'thirdPoint', coins: 15, done: (st) => st.companies[0].points.length >= 3 },
  { id: 'firstBuyout', coins: 15, done: (st) => has(st, 'ev.buyout') },
  { id: 'year', coins: 15, done: (st) => st.day >= 28 },
  { id: 'kopeechkino', coins: 30, done: (st) => 'kopeechkino' in st.captured },
  { id: 'million', coins: 30, done: (st) => st.companies[0].cash >= 1_000_000 },
  { id: 'barysh', coins: 50, done: (st) => 'barysh' in st.captured },
  { id: 'grosh', coins: 60, done: (st) => 'grosh' in st.captured },
  { id: 'navarinka', coins: 80, done: (st) => 'navarinka' in st.captured },
  { id: 'bridge', coins: 30, done: (st) => st.unlocked.includes('novostroyki') },
  { id: 'district', coins: 100, done: (st) => 'novostroyki' in st.captured },
  { id: 'ring1', coins: 200, done: (st) => ['novostroyki', 'zarechye', 'port', 'studgorodok'].every((v) => v in st.captured) },
  { id: 'kreditovka', coins: 120, done: (st) => 'kreditovka' in st.captured },
  { id: 'dolzhkovo', coins: 150, done: (st) => 'dolzhkovo' in st.captured },
];

/** Новые достижения: отмечает их и начисляет монетки. */
export function checkAchievements(st: GameState, m: Meta): Achievement[] {
  const fresh = ACHIEVEMENTS.filter((a) => !m.achieved.includes(a.id) && a.done(st));
  for (const a of fresh) {
    m.achieved.push(a.id);
    m.coins += a.coins;
  }
  return fresh;
}

export type BoostId = 'longOffline' | 'speed' | 'rebuild';
export const BOOSTS: Record<BoostId, { cost: number }> = {
  /** Автопилот до 14 дней вместо 7, действует 3 дня реального времени. */
  longOffline: { cost: 40 },
  /** Дни идут вдвое быстрее целый час игры. */
  speed: { cost: 20 },
  /** Ремонт после смены формата заканчивается сразу. */
  rebuild: { cost: 15 },
};
export const LONG_OFFLINE_MS = 3 * 24 * 3600 * 1000;
export const SPEED_MS = 3600 * 1000;
export const OFFLINE_LONG_DAYS = 14;

const fail = (reason: string): Result => ({ ok: false, reason });

export function buyBoost(m: Meta, id: BoostId, now: number, st?: GameState, pointId?: number): Result {
  const cost = BOOSTS[id].cost;
  if (m.coins < cost) return fail('coins');
  if (id === 'rebuild') {
    const p = st?.companies[0].points.find((x) => x.id === pointId);
    if (!p || p.closedDays <= 0) return fail('point');
    p.closedDays = 0;
  }
  if (id === 'longOffline') m.longOfflineUntil = Math.max(now, m.longOfflineUntil) + LONG_OFFLINE_MS;
  if (id === 'speed') m.speedUntil = Math.max(now, m.speedUntil) + SPEED_MS;
  m.coins -= cost;
  return { ok: true };
}

/** Сколько дней автопилота набирается за отсутствие. */
export const offlineMax = (m: Meta, now: number, base: number) => (now < m.longOfflineUntil ? OFFLINE_LONG_DAYS : base);
/** Множитель скорости дней от ускорителя. */
export const timeMult = (m: Meta, now: number) => (now < m.speedUntil ? 2 : 1);

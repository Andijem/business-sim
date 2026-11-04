import cardsJson from './data/cards.json';
import { ECO } from './data';
import { findPoint, log } from './actions';
import { quality } from './formulas';
import { int, next } from './rng';
import type { GameState, ManagerRules, Mod, NicheId, Point } from './types';

export type Effect =
  | { t: 'cash'; v: number }
  | { t: 'mod'; stat: Mod['stat']; mult?: number; add?: number; days: number }
  | { t: 'price'; mult: number }
  | { t: 'raw'; v: -1 | 0 | 1 }
  | { t: 'rep'; add: number }
  | { t: 'skill'; set?: number; add?: number }
  | { t: 'chance'; p: number; then: Effect[]; else: Effect[] }
  | { t: 'ifQuality'; below: number; then: Effect[]; else: Effect[] }
  | { t: 'later'; days: number; effects: Effect[] };

export interface CardOption {
  id: string;
  cautious?: boolean;
  fits?: Partial<ManagerRules>;
  effects: Effect[];
}

export interface CardDef {
  id: string;
  niche: NicheId | null;
  size: 'small' | 'big';
  weight: number;
  cooldown: number;
  minDay: number;
  needsRival?: boolean;
  options: CardOption[];
}

export const CARDS = cardsJson as unknown as CardDef[];
export const cardDef = (id: string): CardDef => {
  const c = CARDS.find((x) => x.id === id);
  if (!c) throw new Error(`unknown card ${id}`);
  return c;
};

function apply(st: GameState, p: Point, card: string, effects: Effect[]) {
  const co = st.companies[p.owner];
  for (const e of effects) {
    switch (e.t) {
      case 'cash':
        co.cash += e.v;
        break;
      case 'mod':
        // Постоянный эффект той же карточки заменяет прежний, а не копится (прибавка бариста не растёт по кругу).
        if (e.days < 0) p.mods = p.mods.filter((m) => !(m.days < 0 && m.src === card && m.stat === e.stat));
        p.mods.push({ stat: e.stat, mult: e.mult, add: e.add, days: e.days, src: card });
        break;
      case 'price':
        p.priceIdx = Math.max(0.5, Math.min(2, p.priceIdx * e.mult));
        break;
      case 'raw':
        p.raw = e.v;
        break;
      case 'rep':
        p.rep = Math.max(1, Math.min(5, p.rep + e.add));
        p.satEma = 25 + ((p.rep - 1) / 4) * 55;
        break;
      case 'skill':
        if (e.set != null) p.skill = e.set;
        if (e.add != null) p.skill += e.add;
        break;
      case 'chance':
        apply(st, p, card, next(st.rng.cards) < e.p ? e.then : e.else);
        break;
      case 'ifQuality':
        apply(st, p, card, quality(p, co) < e.below ? e.then : e.else);
        break;
      case 'later':
        st.scheduled.push({ day: st.day + e.days, pointId: p.id, card, effects: e.effects });
        break;
    }
  }
}

const cautious = (c: CardDef): CardOption => c.options.find((o) => o.cautious) ?? c.options[0];

/** Вариант, который выберет управляющий по своим правилам; иначе осторожный. */
export function managerChoice(c: CardDef, m: ManagerRules): CardOption {
  const fit = c.options.find(
    (o) => o.fits && Object.entries(o.fits).every(([k, v]) => m[k as keyof ManagerRules] === v),
  );
  return fit ?? cautious(c);
}

export function resolveCard(st: GameState, uid: number, optionId: string): boolean {
  const i = st.pending.findIndex((x) => x.uid === uid);
  if (i < 0) return false;
  const pc = st.pending[i];
  const c = cardDef(pc.card);
  const o = c.options.find((x) => x.id === optionId);
  if (!o) return false;
  st.pending.splice(i, 1);
  const p = findPoint(st, pc.pointId);
  if (p && p.owner === 0) apply(st, p, c.id, o.effects);
  log(st, 'ev.card', { card: c.id, option: o.id });
  return true;
}

/** Карточка без ответа больше суток решается осторожным вариантом (как на автопилоте). */
export function expireCards(st: GameState) {
  for (const pc of [...st.pending]) {
    if (pc.day < st.day) {
      const c = cardDef(pc.card);
      resolveCard(st, pc.uid, cautious(c).id);
      log(st, 'ev.cardAuto', { card: c.id });
    }
  }
}

export function runScheduled(st: GameState) {
  const due = st.scheduled.filter((s) => s.day <= st.day);
  st.scheduled = st.scheduled.filter((s) => s.day > st.day);
  for (const s of due) {
    const p = findPoint(st, s.pointId);
    if (p && p.owner === 0) apply(st, p, s.card, s.effects as Effect[]);
    else if (!p) {
      // Точку закрыли или продали: деньги всё равно доходят до компании.
      for (const e of s.effects as Effect[]) if (e.t === 'cash') st.companies[0].cash += e.v;
    }
  }
}

function eligible(st: GameState, c: CardDef): Point[] {
  if (st.day < c.minDay || (st.cardCooldown[c.id] ?? -1) > st.day) return [];
  if (st.pending.some((x) => x.card === c.id)) return [];
  return st.companies[0].points.filter(
    (p) =>
      (c.niche == null || p.niche === c.niche) &&
      p.closedDays <= 0 &&
      (!c.needsRival || st.companies[1].points.some((r) => r.village === p.village && r.niche === p.niche)),
  );
}

/** 0–2 карточки в день: с шансом 60% выпадает одна, если в очереди меньше двух. */
export function drawCards(st: GameState) {
  if (st.pending.length >= ECO.cards.maxPending) return;
  if (next(st.rng.cards) >= ECO.cards.dailyChance) return;
  const pool = CARDS.map((c) => ({ c, pts: eligible(st, c) })).filter((x) => x.pts.length);
  if (!pool.length) return;
  const total = pool.reduce((a, x) => a + x.c.weight, 0);
  let r = next(st.rng.cards) * total;
  let pick = pool[pool.length - 1];
  for (const x of pool) {
    r -= x.c.weight;
    if (r < 0) {
      pick = x;
      break;
    }
  }
  const p = pick.pts[int(st.rng.cards, pick.pts.length)];
  st.cardCooldown[pick.c.id] = st.day + pick.c.cooldown;
  const uid = st.nextId++;
  if (p.manager && pick.c.size === 'small') {
    const o = managerChoice(pick.c, p.manager);
    apply(st, p, pick.c.id, o.effects);
    log(st, 'ev.managerCard', { card: pick.c.id, option: o.id, niche: p.niche, village: p.village });
    return;
  }
  st.pending.push({ uid, card: pick.c.id, pointId: p.id, day: st.day });
  log(st, 'ev.cardNew', { card: pick.c.id });
}

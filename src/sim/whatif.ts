import {
  buyDept, buyNicheUpgrade, buyout, changeFormat, findPoint, fire, hire, openPoint, setManager, setPrice, setRaw, upgradeHall,
} from './actions';
import { yesterday } from './forecast';
import { advanceDay } from './tick';
import type { Result } from './actions';
import type { DeptId, GameState, NicheId, Raw, Seg } from './types';

/** Действие игрока в виде данных: так его можно и выполнить, и примерить заранее. */
export type Action =
  | { a: 'hire' | 'fire' | 'hall' | 'nicheUp' | 'priceUp' | 'priceDown' | 'manager' | 'buyout'; id: number }
  | { a: 'raw'; id: number; raw: Raw }
  | { a: 'format'; id: number; seg: Seg }
  | { a: 'dept'; dept: DeptId }
  | { a: 'open'; village: string; niche: NicheId; seg: Seg; loan?: boolean };

export function applyAction(st: GameState, x: Action): Result {
  switch (x.a) {
    case 'hire': return hire(st, x.id);
    case 'fire': return fire(st, x.id);
    case 'hall': return upgradeHall(st, x.id);
    case 'nicheUp': return buyNicheUpgrade(st, x.id);
    case 'priceUp': return setPrice(st, x.id, (findPoint(st, x.id)?.priceIdx ?? 1) * 1.05);
    case 'priceDown': return setPrice(st, x.id, (findPoint(st, x.id)?.priceIdx ?? 1) / 1.05);
    case 'manager': {
      const p = findPoint(st, x.id);
      return setManager(st, x.id, p?.manager ? null : { price: 'hold', raw: p?.raw ?? 0, hire: true });
    }
    case 'buyout': return buyout(st, x.id);
    case 'raw': return setRaw(st, x.id, x.raw);
    case 'format': return changeFormat(st, x.id, x.seg);
    case 'dept': return buyDept(st, x.dept);
    case 'open': return openPoint(st, x.village, x.niche, x.seg, { pay: x.loan ? 'loan' : 'cash' });
  }
}

export interface WhatIf {
  /** Разовая цена действия (на сколько сразу уменьшится касса). */
  cost: number;
  /** Изменение прибыли компании в день после того, как всё устоится (2-я неделя), до налогов. */
  perDay: number;
  /** Изменение гостей в день по всей компании (обслуженных). */
  guests: number;
  /** Изменение средних звёзд точки (или компании) через 2 недели. */
  rep: number;
  /** Через сколько дней окупится (null — не окупается). */
  payback: number | null;
  /** Сколько не хватает денег сейчас (эффект посчитан, как если бы деньги были). */
  short: number;
}

export type Try = WhatIf | { fail: string };

const HORIZON = 14;
const TAIL = 7;

interface Run { profit: number; guests: number; rep: number }

/** Прожить копию игры без карточек и банка, с одинаковой погодой по дням. */
function run(st: GameState, pointId?: number): Run {
  let profit = 0, guests = 0;
  for (let d = 0; d < HORIZON; d++) {
    st.rng.market.s = (Math.imul(st.seed ^ 0x9e3779b9, 31) + st.day * 2654435761) >>> 0;
    advanceDay(st);
    if (d >= HORIZON - TAIL) {
      profit += yesterday(st).profit;
      guests += st.companies[0].points.reduce((a, p) => a + (p.last?.served ?? 0), 0);
    }
  }
  const pts = st.companies[0].points;
  const own = pointId != null ? pts.filter((p) => p.id === pointId) : pts;
  const rep = own.length ? own.reduce((a, p) => a + p.rep, 0) / own.length : 0;
  return { profit: profit / TAIL, guests: guests / TAIL, rep };
}

function sandbox(st: GameState): GameState {
  const c = structuredClone(st);
  c.options = { ...c.options, cards: false, finance: false };
  c.pending = [];
  c.scheduled = [];
  return c;
}

/** Базовый прогон без действия: считается один раз на ход и переиспользуется. */
export function baseline(st: GameState): { st: GameState; run: Run; byPoint: Map<number, number> } {
  const b = sandbox(st);
  const r = run(b);
  return { st: b, run: r, byPoint: new Map(b.companies[0].points.map((p) => [p.id, p.rep])) };
}

/** Что будет через 2 недели, если сделать действие сейчас, по сравнению с «ничего не делать». */
export function effect(st: GameState, x: Action, base = baseline(st)): Try {
  let c = sandbox(st);
  let cash0 = c.companies[0].cash;
  let short = 0;
  const r0 = applyAction(c, x);
  if (!r0.ok) {
    if (r0.reason !== 'cash') return { fail: r0.reason };
    // Денег не хватает: всё равно покажем, что даст действие, и сколько не хватает.
    c = sandbox(st);
    const extra = 1e9;
    c.companies[0].cash += extra;
    cash0 = c.companies[0].cash;
    const r1 = applyAction(c, x);
    if (!r1.ok) return { fail: r1.reason };
    short = Math.max(0, cash0 - c.companies[0].cash - st.companies[0].cash);
  }
  const cost = cash0 - c.companies[0].cash;
  const id = 'id' in x && x.a !== 'buyout' ? x.id : undefined;
  const r = run(c, id);
  const perDay = r.profit - base.run.profit;
  const baseRep = id != null ? base.byPoint.get(id) ?? 0 : base.run.rep;
  return {
    cost,
    perDay,
    guests: r.guests - base.run.guests,
    rep: id != null ? r.rep - baseRep : 0,
    payback: cost > 0 && perDay > 0 ? Math.ceil(cost / perDay) : null,
    short,
  };
}

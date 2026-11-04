import { buyDept, buyout, buyoutPrice, freeLot, hire, hallPrice, openPoint, openPrice, player, rival, upgradeHall } from './actions';
import { DEPTS, ECO, NICHES, VILLAGES, VILLAGE_MIX, SEGS, seg, trafficRent, village } from './data';
import { newGame, type PointInit } from './state';
import { endDay, finishDay } from './tick';
import type { GameOptions, GameState, NicheId, Raw, Seg, VillageId } from './types';

/**
 * Стратегии из модели баланса (planning/balance/sim.py), переписанные на действия игры.
 * Нужны для тестов темпа и как автопилот. Порядок решений повторяет модель один в один.
 */
export type Act = (st: GameState) => void;

/** Дневные траты без себестоимости (как burn() в модели: без коэффициента аренды деревни). */
export function burn(st: GameState): number {
  let b = 0;
  for (const p of player(st).points) {
    const N = NICHES[p.niche];
    const S = seg(p.seg);
    b += p.staff * N.wage * S.wage + (N.rentDay + N.utilDay) * S.rent * trafficRent(p.traffic);
  }
  let up = 0;
  for (const d of DEPTS) up += ECO.deptUpkeep[player(st).depts[d]];
  return b + up;
}

export const actPassive: Act = () => {};

/** «Сегмент под рынок»: формат, где меньше всего конкурентов на долю спроса. */
export function chooseSeg(st: GameState, v: VillageId, niche: NicheId, s: Seg | 'mix'): Seg {
  if (s !== 'mix') return s;
  const pts = st.companies.flatMap((c) => c.points.filter((p) => p.village === v && p.niche === niche));
  const crowd = [0, 1, 2].map((i) => pts.reduce((a, p) => a + seg(p.seg).reach[i], 0));
  let best: Seg = -1;
  let bestScore = -Infinity;
  for (const c of [-1, 0, 1] as Seg[]) {
    const S = SEGS[c + 1];
    let reach = 0;
    for (let i = 0; i < 3; i++) reach += (VILLAGE_MIX[i] * S.reach[i]) / (1 + crowd[i]);
    const score = (reach * S.price) / S.open ** 0.5;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

export interface SmartCfg {
  raw?: Raw;
  price?: number;
  hire?: boolean;
  reserveDays?: number;
  seg?: Seg | 'mix';
}

export function makeSmart(cfg: SmartCfg = {}): Act {
  const raw = cfg.raw ?? 0;
  const price = cfg.price ?? 1.0;
  const doHire = cfg.hire ?? true;
  const reserveDays = cfg.reserveDays ?? 5;
  const sg = cfg.seg ?? 0;
  return (st) => {
    const me = player(st);
    const reserve = burn(st) * reserveDays;
    for (const p of me.points) {
      const L = p.last;
      if (!L) continue;
      const overload = L.qlost > 0.08 * L.served;
      const slots = NICHES[p.niche].slots[p.hall];
      if (overload && p.staff < slots && doHire && me.cash > reserve) hire(st, p.id);
      else if (overload && p.staff >= slots && p.hall < 3 && me.cash > hallPrice(p) + reserve) upgradeHall(st, p.id);
    }
    for (const d of DEPTS) {
      if (me.depts[d] === 0 && me.cash > ECO.deptCost[0] + reserve) {
        buyDept(st, d);
        return;
      }
    }
    for (const p of [...rival(st).points]) {
      if (!st.unlocked.includes(p.village)) continue;
      const mine = me.points.filter((x) => x.village === p.village && x.niche === p.niche).length;
      const theirs = rival(st).points.filter((x) => x.village === p.village && x.niche === p.niche).length;
      if ((mine <= theirs && !freeLot(st, p.village, p.niche)) || p.forSale) {
        const pr = buyoutPrice(p);
        if (me.cash > pr + reserve) {
          buyout(st, p.id, { priceIdx: price, raw });
          return;
        }
      }
    }
    // Сначала самая новая открытая деревня.
    const order = VILLAGES.filter((v) => st.unlocked.includes(v.id)).reverse();
    for (const V of order) {
      for (const niche of Object.keys(village(V.id).lots) as NicheId[]) {
        const s = chooseSeg(st, V.id, niche, sg);
        const cost = openPrice(niche, s);
        const mine = me.points.filter((p) => p.village === V.id && p.niche === niche).length;
        const theirs = rival(st).points.filter((p) => p.village === V.id && p.niche === niche && !p.forSale).length;
        if (freeLot(st, V.id, niche) && mine <= theirs) {
          if (me.cash > cost + reserve) openPoint(st, V.id, niche, s, { raw, priceIdx: price });
          return;
        }
      }
    }
    const minLevel = Math.min(...DEPTS.map((d) => me.depts[d]));
    for (const d of DEPTS) {
      const l = me.depts[d];
      if (l < Math.min(5, me.points.length + 1) && l <= minLevel && me.cash > ECO.deptCost[l] + reserve) {
        buyDept(st, d);
        return;
      }
    }
  };
}

export interface Strategy {
  act: Act;
  first?: PointInit;
}

export const STRATEGIES: Record<string, Strategy> = {
  passive: { act: actPassive },
  smart: { act: makeSmart() },
  mix: { act: makeSmart({ seg: 'mix' }) },
  econ: { act: makeSmart({ seg: -1 }), first: { seg: -1 } },
  greedy: { act: makeSmart({ raw: -1, price: 0.92, hire: false }), first: { raw: -1, priceIdx: 0.92 } },
  premium: { act: makeSmart({ raw: 1, seg: 1 }), first: { raw: 1, seg: 1 } },
};

export interface RunResult {
  cash: number[];
  captured: Record<string, number>;
  minCash: number;
  /** Средняя прибыль в день без вложений по неделям. */
  weekly: number[];
  st: GameState;
}

/** Прогон стратегии, как run() в модели. */
export function runStrategy(s: Strategy, days = 168, seed = 1, options: Partial<GameOptions> = {}): RunResult {
  const st = newGame(seed, options, s.first ?? {});
  const cash: number[] = [];
  const op: number[] = [];
  for (let d = 0; d < days; d++) {
    const before = player(st).cash;
    endDay(st);
    op.push(player(st).cash - before);
    s.act(st);
    finishDay(st);
    cash.push(Math.round(player(st).cash));
    if (st.bankrupt) break;
  }
  const weekly: number[] = [];
  for (let i = 0; i < op.length; i += 7) weekly.push(Math.round(op.slice(i, i + 7).reduce((a, b) => a + b, 0) / 7));
  return { cash, captured: { ...st.captured }, minCash: Math.min(...cash), weekly, st };
}

/** Параметры сверки с моделью: всё, чего нет в sim.py, выключено. */
export const MODEL_PARITY: Partial<GameOptions> = { cards: false, finance: false, rivalCloses: false, villages: 2 };

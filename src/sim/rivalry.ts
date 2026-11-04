import { VILLAGES } from './data';
import type { GameEvent, GameState, NicheId, VillageId } from './types';

export interface NicheShare {
  village: VillageId;
  niche: NicheId;
  /** Гостей за вчера у игрока и у Хваткина (точки на продаже не считаются). */
  mine: number;
  theirs: number;
  /** Доля игрока 0..1; без гостей у обоих — по числу точек. */
  share: number;
  pointsMine: number;
  pointsTheirs: number;
}

export interface Rivalry {
  /** Доля игрока в выручке открытых деревень за вчера, 0..1. */
  share: number;
  /** То же за прошлую неделю (null, пока недели не было). */
  shareLastWeek: number | null;
  niches: NicheShare[];
}

const ratio = (a: number, b: number, fa: number, fb: number) =>
  a + b > 0 ? a / (a + b) : fa + fb > 0 ? fa / (fa + fb) : 0.5;

/** Шкала конкуренции с Хваткиным: доля рынка в целом и по каждой нише открытых деревень. */
export function rivalry(st: GameState): Rivalry {
  const [me, rv] = st.companies;
  const open = VILLAGES.filter((v) => st.unlocked.includes(v.id));
  const niches: NicheShare[] = [];
  let revMine = 0, revTheirs = 0, wkMine = 0, wkTheirs = 0;
  for (const V of open) {
    for (const niche of Object.keys(V.lots) as NicheId[]) {
      const mp = me.points.filter((p) => p.village === V.id && p.niche === niche);
      const tp = rv.points.filter((p) => p.village === V.id && p.niche === niche && !p.forSale);
      const mine = mp.reduce((a, p) => a + (p.last?.served ?? 0), 0);
      const theirs = tp.reduce((a, p) => a + (p.last?.served ?? 0), 0);
      revMine += mp.reduce((a, p) => a + (p.last?.rev ?? 0), 0);
      revTheirs += tp.reduce((a, p) => a + (p.last?.rev ?? 0), 0);
      wkMine += mp.reduce((a, p) => a + p.weekRevLast, 0);
      wkTheirs += tp.reduce((a, p) => a + p.weekRevLast, 0);
      niches.push({
        village: V.id, niche, mine, theirs,
        share: ratio(mine, theirs, mp.length, tp.length),
        pointsMine: mp.length, pointsTheirs: tp.length,
      });
    }
  }
  const pm = niches.reduce((a, n) => a + n.pointsMine, 0);
  const pt = niches.reduce((a, n) => a + n.pointsTheirs, 0);
  return {
    share: ratio(revMine, revTheirs, pm, pt),
    shareLastWeek: wkMine + wkTheirs > 0 ? wkMine / (wkMine + wkTheirs) : null,
    niches,
  };
}

/** Ходы Хваткина и то, что с ним сделал игрок: для ленты «История Хваткина». */
export const RIVAL_EVENTS = ['ev.rivalDump', 'ev.rivalRevenge', 'ev.rivalSale', 'ev.rivalClosed', 'ev.rivalInvest', 'ev.buyout', 'ev.captured'];
const RIVAL_CARDS = ['rivalPromo', 'baristaPoach'];

export function rivalHistory(st: GameState, limit = 12): GameEvent[] {
  return st.events
    .filter((e) => RIVAL_EVENTS.includes(e.key) || (e.key === 'ev.cardNew' && RIVAL_CARDS.includes(String(e.params?.card))))
    .slice(-limit)
    .reverse();
}

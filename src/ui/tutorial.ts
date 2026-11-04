import { NICHES, VILLAGES, freeLot, openPrice, repFromSat } from '../sim';
import type { GameState, NicheId } from '../sim';
import { bestMove, describe, fxText, selectorOf, tryAction } from './advice';

export interface Hint {
  /** Ключ текста подсказки в i18n. */
  key: string;
  params?: Record<string, string | number>;
  /** Какую кнопку подсветить: значение data-a. */
  target?: string;
  /** Точный селектор кнопки, если таких кнопок несколько. */
  sel?: string;
}

/**
 * Подсказка новичку: что нажать прямо сейчас и зачем.
 * Правила идут сверху вниз, срабатывает первое подходящее.
 */
export function nextHint(st: GameState): Hint {
  const me = st.companies[0];
  if (st.bankrupt) return { key: 'tut.bankrupt', target: 'new' };
  if (st.pending.length) return { key: 'tut.card', target: 'card' };
  if (st.day === 0) return { key: 'tut.firstDay', target: 'day1' };
  const overloaded = me.points.find(
    (p) => p.last && p.last.qlost > 0.08 * p.last.served && p.staff < NICHES[p.niche].slots[p.hall],
  );
  if (overloaded && me.cash > 0) {
    const L = overloaded.last!;
    const check = L.served > 0 ? L.rev / L.served : 0;
    const e = tryAction(st, { a: 'hire', id: overloaded.id });
    return {
      key: 'tut.queue',
      params: { niche: overloaded.niche, lost: Math.round(L.qlost), money: Math.round(L.qlost * check).toLocaleString('ru-RU'), fx: fxText(e).text },
      target: 'hire', sel: `button[data-a="hire"][data-id="${overloaded.id}"]`,
    };
  }
  if (st.day < 3) return { key: 'tut.days', target: 'day7' };
  const falling = me.points.find((p) => p.last && p.newDays === 0 && repFromSat(p.last.sat) < p.rep - 0.4 && p.rep < 3.5);
  if (falling) return { key: 'tut.repDown', params: { niche: falling.niche } };
  if (me.cash < 0) return { key: 'tut.negative' };
  const forSale = st.companies[1].points.find((p) => p.forSale && st.unlocked.includes(p.village));
  if (forSale) {
    const e = tryAction(st, { a: 'buyout', id: forSale.id });
    return { key: 'tut.forSale', params: { fx: fxText(e).text }, target: 'buyout', sel: `button[data-a="buyout"][data-id="${forSale.id}"]` };
  }
  const best = bestMove(st);
  if (best) {
    const e = best.e;
    return {
      key: e.cost > 0 ? 'tut.best' : 'tut.bestFree',
      params: {
        what: describe(st, best.x),
        perDay: Math.round(e.perDay).toLocaleString('ru-RU'),
        cost: Math.round(e.cost).toLocaleString('ru-RU'),
        payback: e.payback ?? 0,
      },
      target: best.x.a,
      sel: selectorOf(best.x),
    };
  }
  for (const V of VILLAGES.filter((v) => st.unlocked.includes(v.id) && !(v.id in st.captured))) {
    for (const n of Object.keys(V.lots) as NicheId[]) {
      if (freeLot(st, V.id, n) && me.cash >= openPrice(n, -1, V.id))
        return { key: 'tut.open', params: { niche: n }, target: 'open' };
    }
  }
  if (st.captured.kopeechkino != null && !('barysh' in st.captured)) return { key: 'tut.barysh' };
  if (st.captured.kopeechkino == null) return { key: 'tut.capture' };
  return { key: 'tut.grow', target: 'auto7' };
}

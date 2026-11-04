import { ECO, NICHES, VILLAGES, freeLot, openPrice } from '../sim';
import type { GameState, NicheId } from '../sim';

export interface Hint {
  /** Ключ текста подсказки в i18n. */
  key: string;
  params?: Record<string, string | number>;
  /** Какую кнопку подсветить: значение data-a. */
  target?: string;
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
  if (overloaded && me.cash > 0) return { key: 'tut.queue', target: 'hire' };
  if (st.day < 3) return { key: 'tut.days', target: 'day7' };
  if (me.cash < 0) return { key: 'tut.negative' };
  const deptsBought = Object.values(me.depts).some((l) => l > 0);
  if (!deptsBought && me.cash > ECO.deptCost[0] + 5000) return { key: 'tut.dept', target: 'dept' };
  const forSale = st.companies[1].points.find((p) => p.forSale && st.unlocked.includes(p.village));
  if (forSale) return { key: 'tut.forSale', target: 'buyout' };
  for (const V of VILLAGES.filter((v) => st.unlocked.includes(v.id) && !(v.id in st.captured))) {
    for (const n of Object.keys(V.lots) as NicheId[]) {
      if (freeLot(st, V.id, n) && me.cash >= openPrice(n, -1))
        return { key: 'tut.open', params: { niche: n }, target: 'open' };
    }
  }
  if (st.captured.kopeechkino != null && !('barysh' in st.captured)) return { key: 'tut.barysh' };
  if (st.captured.kopeechkino == null) return { key: 'tut.capture' };
  return { key: 'tut.grow', target: 'auto7' };
}

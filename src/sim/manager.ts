import { NICHES } from './data';
import { log } from './actions';
import type { GameState } from './types';

/**
 * Управляющий точки каждый день держит три правила игрока: цена, сырьё, найм.
 * Мелкие карточки этой точки он тоже решает сам (см. cards.ts).
 */
export function runManagers(st: GameState) {
  const co = st.companies[0];
  for (const p of co.points) {
    const m = p.manager;
    if (!m) continue;
    p.raw = m.raw;
    if (m.price === 'match') {
      const rivals = st.companies[1].points.filter((r) => r.village === p.village && r.niche === p.niche);
      if (rivals.length) p.priceIdx = Math.min(...rivals.map((r) => r.priceIdx));
    }
    const L = p.last;
    if (m.hire && L && L.qlost > 0.08 * L.served && p.staff < NICHES[p.niche].slots[p.hall]) {
      // Нанимает, только если касса выдержит неделю зарплаты нового сотрудника.
      if (co.cash > NICHES[p.niche].wage * 7) {
        p.staff += 1;
        log(st, 'ev.managerHire', { niche: p.niche, village: p.village, staff: p.staff });
      }
    }
  }
}

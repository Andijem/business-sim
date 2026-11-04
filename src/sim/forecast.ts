import { DEPTS, ECO } from './data';
import type { GameState } from './types';

export interface Breakdown {
  rev: number;
  cogs: number;
  wages: number;
  rent: number;
  acquiring: number;
  repair: number;
  depts: number;
  profit: number;
}

/** Из чего сложилась прибыль вчерашнего дня (по всем точкам игрока). */
export function yesterday(st: GameState): Breakdown {
  const me = st.companies[0];
  const b: Breakdown = { rev: 0, cogs: 0, wages: 0, rent: 0, acquiring: 0, repair: 0, depts: 0, profit: 0 };
  for (const p of me.points) {
    const L = p.last;
    if (!L) continue;
    b.rev += L.rev;
    b.cogs += L.cogs;
    b.wages += L.wages;
    b.rent += L.rent;
    b.acquiring += L.acquiring;
    b.repair += L.repair;
    b.profit += L.profit;
  }
  b.depts = DEPTS.reduce((a, d) => a + ECO.deptUpkeep[me.depts[d]], 0);
  b.profit -= b.depts;
  return b;
}

export interface Forecast {
  /** Ожидаемая прибыль в день: сглаженная прибыль точек минус отделы. */
  perDay: number;
  /** Дней до конца сезона (налог и платежи по кредитам). */
  daysToSeason: number;
  tax: number;
  loanPayments: number;
  /** Касса в конце сезона, если ничего не покупать. */
  cashAtSeasonEnd: number;
}

export function forecast(st: GameState): Forecast {
  const me = st.companies[0];
  const depts = DEPTS.reduce((a, d) => a + ECO.deptUpkeep[me.depts[d]], 0);
  const perDay = me.points.reduce((a, p) => a + (p.profitEma ?? 0), 0) - depts;
  const daysToSeason = 7 - (st.day % 7);
  const revPerDay = me.points.reduce((a, p) => a + (p.last?.rev ?? 0), 0);
  const seasonRev = me.seasonRev + revPerDay * daysToSeason;
  const seasonCost = me.seasonCost + (revPerDay - perDay) * daysToSeason;
  const T = ECO.tax;
  const tax = st.usn === 6 ? seasonRev * T.usn6 : Math.max(T.usn15 * (seasonRev - seasonCost), T.usn15Min * seasonRev);
  const loanPayments = st.loans.reduce((a, l) => a + l.payment, 0);
  return { perDay, daysToSeason, tax, loanPayments, cashAtSeasonEnd: me.cash + perDay * daysToSeason - tax - loanPayments };
}

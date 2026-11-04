import { ECO, MARKET_K, NICHES, VILLAGES, VILLAGE_MIX, seg, trafficRent } from './data';
import { attractiveness, modAdd, modMult, quality, service, unitPrice, upgradeFx } from './formulas';
import { next } from './rng';
import type { GameState, NicheId, Point } from './types';

export const seasonOf = (day: number): number => Math.floor(day / 7) % 4;

/** Ежедневные расходы точки без себестоимости: зарплаты, управляющий, аренда, коммуналка. */
export function fixedCosts(p: Point): number {
  const N = NICHES[p.niche];
  const S = seg(p.seg);
  const V = VILLAGES.find((v) => v.id === p.village)!;
  const wm = modMult(p, 'wage');
  const manager = p.manager ? N.wage * S.wage * ECO.manager.wageMult : 0;
  return p.staff * N.wage * S.wage * wm + (N.rentDay + N.utilDay) * V.rent * S.rent * trafficRent(p.traffic) + manager;
}

/**
 * Шаги 1–5 игрового дня для всех точек всех деревень (формулы из документа баланса).
 * Порядок обращений к генератору совпадает с моделью planning/balance/sim.py.
 */
export function simulateDay(st: GameState): { rain: boolean; afterRain: boolean } {
  const day = st.day;
  const rng = st.rng.market;
  const season = seasonOf(day);
  const wd = day % 7;
  const rain = next(rng) < [0.3, 0.15, 0.35, 0.25][season];
  const afterRain = !rain && next(rng) < 0.5;
  const all = [...st.companies[0].points, ...st.companies[1].points];

  for (const V of VILLAGES) {
    for (const [niche, M] of Object.entries(V.market) as [NicheId, number][]) {
      const N = NICHES[niche];
      const here = all.filter((p) => p.village === V.id && p.niche === niche && !p.forSale);
      // Закрытая на ремонт точка платит аренду, но гостей не принимает.
      const open = here.filter((p) => p.closedDays <= 0);
      for (const p of here.filter((x) => x.closedDays > 0)) {
        const co = st.companies[p.owner];
        const c = fixedCosts(p);
        co.cash -= c;
        co.seasonCost += c;
        p.weekProfit -= c;
        p.closedDays -= 1;
      }
      if (!open.length) continue;
      let mult = N.season[season] * N.weekday[wd];
      const weather = niche === 'wash' ? (rain ? 0.45 : afterRain ? 1.6 : 1.0) : 1.0;
      if (niche === 'wash') mult *= weather;
      const qs = new Map<Point, number>();
      const A = new Map<Point, number>();
      for (const p of open) qs.set(p, quality(p, st.companies[p.owner]));
      for (const p of open) A.set(p, attractiveness(p, st.companies[p.owner], qs.get(p)!));
      const dem = new Map<Point, number>(open.map((p) => [p, 0]));
      VILLAGE_MIX.forEach((share, si) => {
        const As = new Map<Point, number>(open.map((p) => [p, A.get(p)! * seg(p.seg).reach[si]]));
        let tot = N.outside;
        for (const p of open) tot += As.get(p)!;
        for (const p of open) dem.set(p, dem.get(p)! + ((M * share * mult * As.get(p)!) / tot));
      });
      for (const p of open) {
        const co = st.companies[p.owner];
        const S = seg(p.seg);
        const fx = upgradeFx(p);
        // Абонементы мойки сглаживают погоду: поправка к общему погодному множителю.
        const myWeather = rain ? Math.max(weather, fx.rainFloor) : Math.min(weather, fx.afterRainCap);
        const wfix = niche === 'wash' && myWeather !== weather ? myWeather / weather : 1;
        const demand = dem.get(p)! * MARKET_K * wfix * fx.flowMult * modMult(p, 'flow');
        let capH =
          (p.staff + fx.freeStaff) * N.perStaffH * N.hallSpeed[p.hall] * (0.5 + p.skill / 100) * S.speed *
          fx.capMult * (season === 1 ? fx.summerCapMult : 1) * modMult(p, 'capacity');
        if (p.broken > 0) capH *= 0.5;
        let served = 0;
        let queue = 0;
        let lost = 0;
        for (const sh of N.profile) {
          const arr = demand * sh + queue;
          const s = Math.min(arr, capH);
          served += s;
          queue = (arr - s) * 0.3;
          lost += (arr - s) * 0.7;
        }
        const util = (demand * Math.max(...N.profile)) / Math.max(1e-6, capH);
        const qlost = lost;
        if (N.stockout > 0) {
          const so = Math.max(0.02, N.stockout - 0.025 * co.depts.buy);
          lost += served * so;
          served *= 1 - so;
        }
        const rev = served * unitPrice(p);
        const cogsU =
          N.cogs * S.cogs * N.rawCost[p.raw + 1] * (1 - 0.02 * co.depts.buy) * fx.cogsMult * modMult(p, 'cogs');
        let cogs = served * cogsU;
        if (N.spoil > 0) cogs += served * cogsU * Math.max(0.01, N.spoil * fx.spoilMult - 0.007 * co.depts.buy);
        let costs = fixedCosts(p) + rev * ECO.acquiring;
        if (p.broken > 0) p.broken -= 1;
        else if (next(rng) < N.breakdown * (1 - 0.15 * co.depts.buy) * modMult(p, 'breakdown')) {
          p.broken = 1;
          costs += N.repair;
        }
        const profit = rev - cogs - costs;
        co.cash += profit;
        co.seasonRev += rev;
        co.seasonCost += cogs + costs;
        p.weekRev += rev;
        p.weekProfit += profit;
        p.profitEma = (p.profitEma ?? profit) * 0.9 + profit * 0.1;
        const q = qs.get(p)!;
        const srv = service(p, co, util);
        const value = Math.max(0, Math.min(100, 50 + 150 * (1 - p.priceIdx)));
        const waitPen = Math.min(30, (40 * lost) / Math.max(1, served + lost));
        const [wq, ws, wv] = S.sat;
        let sat = wq * q + ws * srv + wv * value - waitPen;
        if (S.need) sat -= 0.6 * Math.max(0, S.need - Math.min(q, srv));
        p.satEma += (sat - p.satEma) / (p.newDays > 0 ? 7 : 14);
        p.rep = 1 + 4 * Math.max(0, Math.min(1, (p.satEma - 25) / 55));
        p.loyal += (Math.max(0, Math.min(1, (sat - 35) / 45 + modAdd(p, 'loyal'))) - p.loyal) / 7;
        p.skill = Math.min(50 + 10 * co.depts.hr, p.skill + 0.8 + 0.3 * co.depts.hr);
        if (p.newDays > 0) p.newDays -= 1;
        p.last = { demand, served, lost, qlost, util, q, s: srv, sat, rev, profit };
      }
    }
  }
  return { rain, afterRain };
}

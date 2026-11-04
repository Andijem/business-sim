import { ECO, NICHES, RAW_QUALITY, seg } from './data';
import type { UpgradeEffects } from './data';
import type { Company, Mod, Point } from './types';

/** Суммарные эффекты купленных прокачек ниши. */
export function upgradeFx(p: Point): Required<UpgradeEffects> {
  const fx: Required<UpgradeEffects> = {
    capMult: 1, qualityAdd: 0, cogsMult: 1, summerCapMult: 1, freeStaff: 0,
    spoilMult: 1, priceMult: 1, flowMult: 1, rainFloor: 0, afterRainCap: Infinity,
  };
  for (const u of NICHES[p.niche].upgrades.slice(0, p.upgrades)) {
    const e = u.effects;
    if (e.capMult) fx.capMult *= e.capMult;
    if (e.qualityAdd) fx.qualityAdd += e.qualityAdd;
    if (e.cogsMult) fx.cogsMult *= e.cogsMult;
    if (e.summerCapMult) fx.summerCapMult *= e.summerCapMult;
    if (e.freeStaff) fx.freeStaff += e.freeStaff;
    if (e.spoilMult) fx.spoilMult *= e.spoilMult;
    if (e.priceMult) fx.priceMult *= e.priceMult;
    if (e.flowMult) fx.flowMult *= e.flowMult;
    if (e.rainFloor) fx.rainFloor = Math.max(fx.rainFloor, e.rainFloor);
    if (e.afterRainCap) fx.afterRainCap = Math.min(fx.afterRainCap, e.afterRainCap);
  }
  return fx;
}

/** Множитель (или прибавка) от модификаторов карточек для одного показателя. */
export function modMult(p: Point, stat: Mod['stat']): number {
  let m = 1;
  for (const x of p.mods) if (x.stat === stat && x.mult != null) m *= x.mult;
  return m;
}
export function modAdd(p: Point, stat: Mod['stat']): number {
  let a = 0;
  for (const x of p.mods) if (x.stat === stat && x.add != null) a += x.add;
  return a;
}

export function quality(p: Point, co: Company): number {
  const base =
    0.55 * Math.max(0, RAW_QUALITY[p.raw + 1] + seg(p.seg).q) +
    0.3 * p.skill +
    0.15 * (50 + 12 * p.hall) +
    3 * co.depts.buy;
  const extra = upgradeFx(p).qualityAdd + modAdd(p, 'quality');
  return Math.max(0, Math.min(100, base + extra));
}

export function service(p: Point, co: Company, util: number): number {
  let s = 20 + 0.6 * p.skill + 5 * co.depts.hr + (util < 0.6 ? 6 : 0);
  if (util > 0.85) s -= (util - 0.85) * 120;
  if (p.handover > 0) s -= ECO.buyout.handoverService;
  s += modAdd(p, 'service');
  return Math.max(0, Math.min(100, s));
}

/** Цена относительно рынка с учётом прокачек и карточек: на неё реагируют гости. */
export const effPriceIdx = (p: Point): number => p.priceIdx * upgradeFx(p).priceMult * modMult(p, 'price');

export function attractiveness(p: Point, co: Company, q: number): number {
  const N = NICHES[p.niche];
  const S = seg(p.seg);
  const repm = 0.5 + 0.25 * (p.rep - 1);
  return (
    repm *
    (q / 50) ** 0.8 *
    effPriceIdx(p) ** (-N.elasticity * S.elast) *
    (0.7 + 0.6 * p.loyal) *
    (1 + ECO.mktBonus[co.depts.mkt]) *
    p.traffic *
    (p.newDays > 0 ? ECO.novelty.flow : 1.0)
  );
}

/** Цена одной покупки в баблосах. */
export function unitPrice(p: Point): number {
  return NICHES[p.niche].refPrice * seg(p.seg).price * p.priceIdx * upgradeFx(p).priceMult * modMult(p, 'price');
}

/** Звёзды, к которым тянется репутация при таком довольстве (0–100). */
export const repFromSat = (sat: number): number => 1 + 4 * Math.max(0, Math.min(1, (sat - 25) / 55));
/** Во сколько раз звёзды меняют поток гостей (★3 = 1). */
export const repFlow = (rep: number): number => 0.5 + 0.25 * (rep - 1);

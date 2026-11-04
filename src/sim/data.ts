import nichesJson from './data/niches.json';
import segmentsJson from './data/segments.json';
import villagesJson from './data/villages.json';
import economyJson from './data/economy.json';
import type { DeptId, NicheId, Seg } from './types';

export interface UpgradeEffects {
  capMult?: number;
  qualityAdd?: number;
  cogsMult?: number;
  summerCapMult?: number;
  freeStaff?: number;
  spoilMult?: number;
  priceMult?: number;
  flowMult?: number;
  rainFloor?: number;
  afterRainCap?: number;
  /** Поток вне летнего сезона (курорт). */
  offSeasonFlow?: number;
  /** Доля торговли в шторм (рыба: коптильня продаёт вчерашний улов). */
  stormFloor?: number;
}

export interface NicheDef {
  refPrice: number;
  cogs: number;
  elasticity: number;
  outside: number;
  profile: number[];
  perStaffH: number;
  wage: number;
  rentDay: number;
  utilDay: number;
  season: number[];
  weekday: number[];
  openCost: number;
  slots: number[];
  hallCost: number[];
  hallSpeed: number[];
  breakdown: number;
  repair: number;
  stockout: number;
  spoil: number;
  rawCost: number[];
  /** Себестоимость по сезонам (ферма: летом изобилие, зимой дефицит). */
  seasonCogs?: number[];
  /** Погода: множитель потока в дождь, в сухой день и в шторм (дождь осенью и зимой). */
  weather?: { rain: number; dry: number; storm?: number };
  upgrades: { id: string; effects: UpgradeEffects }[];
}

export interface SegDef {
  id: string;
  open: number;
  price: number;
  cogs: number;
  q: number;
  elast: number;
  wage: number;
  rent: number;
  speed: number;
  reach: number[];
  sat: number[];
  need: number;
}

export interface VillageDef {
  id: string;
  rent: number;
  market: Partial<Record<NicheId, number>>;
  lots: Partial<Record<NicheId, number>>;
  traffic: Partial<Record<NicheId, number[]>>;
  unlocks: string | null;
  /** Доли спроса эконом/средний/премиум летом (курорт), иначе общие деревенские. */
  summerMix?: number[];
  /** Точки Хваткина появляются, когда деревня открывается (деревни после v0.1). */
  lateRival?: boolean;
  /** Район Капитальска (городская раскладка сцены). */
  city?: boolean;
  /** Доли спроса эконом/средний/премиум круглый год (район города); иначе общие деревенские. */
  mix?: number[];
  /** Поток района по сезонам (Студгородок пустеет летом). */
  seasonFlow?: number[];
  /** «Всё схвачено»: доля участков каждой ниши, навык, звёзды, персонал и зал его точек. */
  rival?: { share: number; skill: number; rep: number; staff: number; hall: number };
  /** Во сколько раз дороже открытие, зал и прокачки (город). */
  costMult?: number;
  /** Свои правила выкупа (город): доли цены открытия и дни прибыли. */
  buyout?: { openShare?: number; forSaleShare?: number; profitDays?: number };
}
/** Доли спроса по сегментам в деревне или районе в этот сезон. */
export const mixOf = (V: VillageDef, season: number): number[] =>
  (season === 1 && V.summerMix) || V.mix || VILLAGE_MIX;

export const NICHES = nichesJson as Record<NicheId, NicheDef>;
export const NICHE_IDS = Object.keys(NICHES) as NicheId[];
export const SEGS = segmentsJson.segments as SegDef[];
export const seg = (s: Seg): SegDef => SEGS[s + 1];
export const RAW_QUALITY = segmentsJson.rawQuality;
export const VILLAGE_MIX = segmentsJson.villageMix;
export const VILLAGES = villagesJson.villages as VillageDef[];
export const village = (id: string): VillageDef => {
  const v = VILLAGES.find((x) => x.id === id);
  if (!v) throw new Error(`unknown village ${id}`);
  return v;
};
export const MARKET_K = villagesJson.marketK;
const TRAFFIC_RENT = villagesJson.trafficRent as Record<string, number>;
export const trafficRent = (t: number): number => TRAFFIC_RENT[String(t)] ?? 1;
export const START = villagesJson.start;
export const ECO = economyJson;
export const DEPTS = economyJson.depts as DeptId[];

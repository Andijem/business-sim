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
}

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

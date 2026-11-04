import { VILLAGES } from '../sim';
import type { GameState, NicheId, Point } from '../sim';

/** Участок на карте деревни: прямоугольник 7×7 м, вход смотрит на дорогу. */
export interface Slot {
  x0: number;
  z0: number;
  /** Куда смотрит фасад: +z (на юг), −z (на север), +x, −x. */
  face: 'pz' | 'nz' | 'px' | 'nx';
}

export const PLOT = 7;
/** Расстояние между деревнями по главной дороге. */
export const VILLAGE_GAP = 80;

/**
 * Шаблон участков одной деревни, от лучших к худшим.
 * Главная дорога идёт вдоль x (z от 1 до 5), боковая — вдоль z (x от −8 до −4) на север.
 * Первые 4 — у перекрёстка (бойкие), следующие 6 — вдоль улицы, последние 2 — во дворах.
 */
const TEMPLATE: Slot[] = [
  { x0: -3, z0: -7.5, face: 'pz' },
  { x0: -3, z0: 6.5, face: 'nz' },
  { x0: -16, z0: -7.5, face: 'pz' },
  { x0: -16, z0: 6.5, face: 'nz' },
  { x0: 5.5, z0: -7.5, face: 'pz' },
  { x0: 5.5, z0: 6.5, face: 'nz' },
  { x0: 14, z0: -7.5, face: 'pz' },
  { x0: 14, z0: 6.5, face: 'nz' },
  { x0: -25, z0: -7.5, face: 'pz' },
  { x0: -25, z0: 6.5, face: 'nz' },
  { x0: -3, z0: -16, face: 'nx' },
  { x0: -16, z0: -16, face: 'px' },
];
const CLASS: Record<string, number[]> = { '1.25': [0, 1, 2, 3], '1': [4, 5, 6, 7, 8, 9], '0.8': [10, 11] };

export interface Lot {
  village: string;
  niche: NicheId;
  traffic: number;
  /** Индекс участка в шаблоне деревни. */
  slot: number;
  /** Точка на участке (игрока или Хваткина) или null, если участок свободен. */
  point: Point | null;
}

/** Смещение деревни по x: деревни стоят вдоль одной дороги. */
export const villageX = (id: string) => VILLAGES.findIndex((v) => v.id === id) * VILLAGE_GAP;

/** Участки деревни: каждому лоту из данных — место в шаблоне по его проходимости. */
export function villageLots(id: string): Omit<Lot, 'point'>[] {
  const V = VILLAGES.find((v) => v.id === id)!;
  const used: Record<string, number> = {};
  const out: Omit<Lot, 'point'>[] = [];
  const all = (Object.keys(V.lots) as NicheId[]).flatMap((n) =>
    (V.traffic[n] ?? Array(V.lots[n]).fill(1)).map((tr) => ({ niche: n, traffic: tr })));
  // Сначала бойкие места, внутри — по порядку ниш: так кофейни и магазины перемешаны у перекрёстка.
  all.sort((a, b) => b.traffic - a.traffic);
  for (const l of all) {
    const key = String(l.traffic);
    const pool = CLASS[key] ?? CLASS['1'];
    const i = used[key] ?? 0;
    used[key] = i + 1;
    out.push({ village: id, niche: l.niche, traffic: l.traffic, slot: pool[Math.min(i, pool.length - 1)] });
  }
  return out;
}

/**
 * Раскладка точек по участкам. Точки с одной проходимостью ставятся по возрастанию id,
 * поэтому место точки не прыгает, пока соседи не закрываются.
 */
export function lotsOf(st: GameState, village: string): Lot[] {
  const lots: Lot[] = villageLots(village).map((l) => ({ ...l, point: null }));
  const points = st.companies.flatMap((c) => c.points).filter((p) => p.village === village).sort((a, b) => a.id - b.id);
  for (const p of points) {
    const lot = lots.find((l) => !l.point && l.niche === p.niche && l.traffic === p.traffic)
      ?? lots.find((l) => !l.point && l.niche === p.niche);
    if (lot) lot.point = p;
  }
  return lots;
}

export const slotOf = (l: { slot: number }) => TEMPLATE[l.slot];
/** Все места шаблона: незанятые лотами заполняются домами и садами. */
export const TEMPLATE_SLOTS = TEMPLATE;

/** Центр участка в мировых координатах (с учётом смещения деревни). */
export function lotCenter(l: { village: string; slot: number }): [number, number] {
  const s = slotOf(l);
  return [villageX(l.village) + s.x0 + PLOT / 2, s.z0 + PLOT / 2];
}

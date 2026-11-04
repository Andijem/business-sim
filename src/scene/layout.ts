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
/** Районы города шире: до 30 участков вдоль проспекта и во дворах. */
export const DISTRICT_GAP = 120;
/** Перед первым районом — река и мост. */
export const RIVER_GAP = 40;

/**
 * Шаблон участков одной деревни, от лучших к худшим.
 * Главная дорога идёт вдоль x (z от 1 до 5), боковая — вдоль z (x от −8 до −4) на север.
 * Первые 4 — у перекрёстка (бойкие), следующие 6 — вдоль улицы, 2 — во дворах,
 * дальше ещё 2 на краю улицы и 2 в дальних дворах (для деревень больше 12 участков).
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
  { x0: 22.5, z0: -7.5, face: 'pz' },
  { x0: 22.5, z0: 6.5, face: 'nz' },
  { x0: -3, z0: -24.5, face: 'nx' },
  { x0: -16, z0: -24.5, face: 'px' },
];
const CLASS: Record<string, number[]> = { '1.25': [0, 1, 2, 3], '1': [4, 5, 6, 7, 8, 9, 12, 13], '0.8': [10, 11, 14, 15] };
/** Если места своего класса кончились, берём следующее свободное в порядке шаблона. */
const ORDER = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 13, 10, 11, 14, 15];

/** Район города: деревенский шаблон плюс ещё 12 мест вдоль проспекта и 2 дальних двора (всего 30). */
const CITY: Slot[] = [
  ...TEMPLATE,
  ...[31, -33.5, 39.5, -42, 48, -50.5].flatMap((x0): Slot[] => [{ x0, z0: -7.5, face: 'pz' }, { x0, z0: 6.5, face: 'nz' }]),
  { x0: -3, z0: -33, face: 'nx' },
  { x0: -16, z0: -33, face: 'px' },
];
const CITY_CLASS: Record<string, number[]> = {
  '1.25': [0, 1, 2, 3, 4, 5, 16, 17],
  '1': [6, 7, 8, 9, 12, 13, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27],
  '0.8': [10, 11, 14, 15, 28, 29],
};
const CITY_ORDER = [...CITY_CLASS['1.25'], ...CITY_CLASS['1'], ...CITY_CLASS['0.8']];

const isCity = (id: string) => !!VILLAGES.find((v) => v.id === id)?.city;
/** Шаблон места: деревня или район города. */
export const templateOf = (id: string): Slot[] => (isCity(id) ? CITY : TEMPLATE);

export interface Lot {
  village: string;
  niche: NicheId;
  traffic: number;
  /** Индекс участка в шаблоне деревни. */
  slot: number;
  /** Точка на участке (игрока или Хваткина) или null, если участок свободен. */
  point: Point | null;
}

/** Смещение деревни по x: деревни, а за рекой районы города стоят вдоль одной дороги. */
export function villageX(id: string): number {
  let x = 0;
  for (let i = 0; i < VILLAGES.length; i++) {
    const V = VILLAGES[i];
    if (i > 0) {
      const prev = VILLAGES[i - 1];
      x += !V.city ? VILLAGE_GAP : prev.city ? DISTRICT_GAP : VILLAGE_GAP / 2 + RIVER_GAP + DISTRICT_GAP / 2;
    }
    if (V.id === id) return x;
  }
  return -1;
}

/** Где течёт река: x её середины или null, если города ещё нет. */
export function riverX(): number | null {
  const i = VILLAGES.findIndex((v) => v.city);
  if (i <= 0) return null;
  return villageX(VILLAGES[i - 1].id) + VILLAGE_GAP / 2 + RIVER_GAP / 2;
}

/** Участки деревни: каждому лоту из данных — место в шаблоне по его проходимости. */
export function villageLots(id: string): Omit<Lot, 'point'>[] {
  const V = VILLAGES.find((v) => v.id === id)!;
  const out: Omit<Lot, 'point'>[] = [];
  const all = (Object.keys(V.lots) as NicheId[]).flatMap((n) =>
    (V.traffic[n] ?? Array(V.lots[n]).fill(1)).map((tr) => ({ niche: n, traffic: tr })));
  // Сначала бойкие места, внутри — по порядку ниш: так кофейни и магазины перемешаны у перекрёстка.
  all.sort((a, b) => b.traffic - a.traffic);
  const taken = new Set<number>();
  const [classes, order] = isCity(id) ? [CITY_CLASS, CITY_ORDER] : [CLASS, ORDER];
  for (const l of all) {
    const pool = classes[String(l.traffic)] ?? classes['1'];
    const slot = pool.find((s) => !taken.has(s)) ?? order.find((s) => !taken.has(s));
    if (slot == null) throw new Error(`в месте ${id} больше ${order.length} участков`);
    taken.add(slot);
    out.push({ village: id, niche: l.niche, traffic: l.traffic, slot });
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

export const slotOf = (l: { village: string; slot: number }) => templateOf(l.village)[l.slot];

/** Центр участка в мировых координатах (с учётом смещения деревни). */
export function lotCenter(l: { village: string; slot: number }): [number, number] {
  const s = slotOf(l);
  return [villageX(l.village) + s.x0 + PLOT / 2, s.z0 + PLOT / 2];
}

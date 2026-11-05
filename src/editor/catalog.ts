import type * as THREE from 'three';
import type { NicheId, Point } from '../sim';
import { VoxelStore, VS, hash, vi } from '../scene/voxels';
import {
  C, Frame, Plan, rng, type Ctx, type Tree,
  bench, beds, bin, bush, busStop, clothesline, dacha, doghouse, fence, field, flowers, greenhouse,
  house2, izba, lamp, lowTree, parkedCar, pond, powerLine, rock, shed, stela, tree, well, woodpile,
} from '../scene/props';
import { THEMES, homestead, waterTower } from '../scene/places';
import { STREET, road } from '../scene/village';
import { buildLot, slotsOf } from '../scene/buildings';
import { PLOT } from '../scene/layout';
import { CARS, HAIR, PET, SHIRTS } from '../scene/life';

/**
 * Список предметов для редактора: каждый собирается той же функцией, что и в игре,
 * но один, в центре сцены. Названия и описания — в i18n (ed.item.*, ed.desc.*).
 * Новые места добавляются строками в `places` и новыми предметами.
 */

export type SectionId = 'people' | 'transport' | 'animals' | 'plants' | 'houses' | 'yards' | 'street' | 'landmarks' | 'biz';
export const SECTIONS: SectionId[] = ['people', 'transport', 'animals', 'plants', 'houses', 'yards', 'street', 'landmarks', 'biz'];

/** Настройка предмета: ползунок или выбор из вариантов (opts — ключи i18n или цвета). */
export interface ParamDef {
  key: string;
  min: number;
  max: number;
  step: number;
  def: number;
  /** Подписи вариантов: ключи i18n (ed.opt.*) или цвета (#rrggbb). */
  opts?: string[];
}
export type Params = Record<string, number>;

export type FigureKind = 'person' | 'car' | 'hen' | 'dog' | 'cat' | 'duck' | 'cow' | 'goat' | 'gull' | 'pigeon' | 'crow' | 'squirrel';
export interface Figure { kind: FigureKind; x: number; y: number; z: number; tint: number; hair?: number; scale: number; rot: number }

/** Что собрал предмет: воксели, готовые меши (здания бизнесов), фигурки и дым. */
export interface Stage {
  ctx: Ctx;
  /** Готовые группы (здание бизнеса). */
  extra: THREE.Object3D[];
  /** Части, которые снимаются кнопкой «Без крыши и фасада». */
  cutaway: THREE.Object3D[];
  figures: Figure[];
}

export interface Item {
  id: string;
  section: SectionId;
  /** В каких местах встречается (id мест из sim). */
  places: string[];
  params?: ParamDef[];
  build(st: Stage, p: Params): void;
}

export function newStage(seed = 1): Stage {
  const s = new VoxelStore();
  const ctx: Ctx = { s, plan: new Plan(), r: rng(seed), smoke: [], anim: [], pens: [], idle: [], water: [] };
  return { ctx, extra: [], cutaway: [], figures: [] };
}

const K = 'kopeechkino';
const T = THEMES[K];
const hexes = (list: number[]) => list.map((c) => '#' + c.toString(16).padStart(6, '0'));

// ---------- общие настройки ----------
const P = {
  variant: { key: 'variant', min: 0, max: 9, step: 1, def: 0 } as ParamDef,
  height: (def: number, min = 1.5, max = 6) => ({ key: 'height', min, max, step: 0.25, def }) as ParamDef,
  width: (def: number, min: number, max: number) => ({ key: 'width', min, max, step: 0.25, def }) as ParamDef,
  depth: (def: number, min: number, max: number) => ({ key: 'depth', min, max, step: 0.25, def }) as ParamDef,
  pick: (key: string, list: number[], def = 0) => ({ key, min: 0, max: list.length - 1, step: 1, def, opts: hexes(list) }) as ParamDef,
  opts: (key: string, opts: string[], def = 0) => ({ key, min: 0, max: opts.length - 1, step: 1, def, opts }) as ParamDef,
  toggle: (key: string, def = 0) => ({ key, min: 0, max: 1, step: 1, def, opts: ['ed.opt.no', 'ed.opt.yes'] }) as ParamDef,
};

/** Рамка с центром в начале координат: фасад смотрит на +z, к камере. */
const frame = (st: Stage, w: number, d: number) => new Frame(st.ctx.s, -w / 2, -d / 2, w, d, 'pz');
/** Сдвиг по «варианту»: у моделей, где оттенки зависят от координат, меняется узор. */
const shift = (p: Params) => (p.variant ?? 0) * 7 * VS;

/** Животные из загонов (будка, пруд): ставим фигурки неподвижно, ближе к камере. */
function pensToFigures(st: Stage) {
  for (const pen of st.ctx.pens) {
    for (let n = 0; n < pen.n; n++) {
      const a = hash(n, 3, vi(pen.x0)), b = hash(n, 5, vi(pen.z0));
      const pet = PET[pen.kind];
      st.figures.push({
        kind: pen.kind as FigureKind, x: pen.x0 + a * (pen.x1 - pen.x0), y: pen.kind === 'duck' ? -0.1 : 0, z: pen.z0 + (0.6 + 0.4 * b) * (pen.z1 - pen.z0), // ближе к камере, чтобы не прятались за будкой
        tint: pet ? pet[n % pet.length] : 0xffffff, scale: 1, rot: a * 6.28,
      });
    }
  }
  st.ctx.pens.length = 0;
}

const treeItem = (id: string, kind: Tree, def: number): Item => ({
  id, section: 'plants', places: [K], params: [P.height(def, 1.5, 5), P.variant],
  build: (st, p) => tree(st.ctx.s, kind, shift(p), 0, p.height),
});

function point(niche: NicheId, p: Params): Point {
  const hall = p.hall ?? 0;
  const staff = Math.min(p.staff ?? 1, slotsOf(niche)[hall]);
  const queue = p.queue ?? 0;
  return {
    id: 1, niche, village: K, owner: (p.owner ?? 0) as 0 | 1, seg: ((p.seg ?? 1) - 1) as -1 | 0 | 1, hall, staff, upgrades: p.upgrades ?? 0,
    forSale: !!p.forSale, closedDays: p.closed ? 1 : 0,
    last: queue ? { served: 10, qlost: queue * 6 } : null,
  } as unknown as Point;
}
const bizParams = (): ParamDef[] => [
  P.opts('owner', ['ed.opt.player', 'ed.opt.rival']),
  P.opts('seg', ['seg.-1', 'seg.0', 'seg.1'], 1),
  { key: 'hall', min: 0, max: 3, step: 1, def: 0, opts: ['ed.opt.hall1', 'ed.opt.hall2', 'ed.opt.hall3', 'ed.opt.hall4'] },
  { key: 'staff', min: 0, max: 5, step: 1, def: 1 },
  { key: 'upgrades', min: 0, max: 3, step: 1, def: 0 },
  { key: 'queue', min: 0, max: 6, step: 1, def: 0 },
  P.toggle('forSale'),
  P.toggle('closed'),
];
function lotItem(id: string, niche: NicheId | null): Item {
  return {
    id, section: 'biz', places: [K], params: niche ? bizParams() : [],
    build: (st, p) => {
      const m = buildLot(niche ? point(niche, p) : null);
      m.group.position.set(-PLOT / 2, 0, -PLOT / 2);
      st.extra.push(m.group);
      st.cutaway.push(m.roof, m.front);
    },
  };
}

export const ITEMS: Item[] = [
  // ---------- люди ----------
  {
    id: 'walker', section: 'people', places: [K],
    params: [P.pick('shirt', SHIRTS), P.pick('hair', HAIR), P.toggle('kid')],
    build: (st, p) => st.figures.push({ kind: 'person', x: 0, y: 0, z: 0, tint: SHIRTS[p.shirt], hair: HAIR[p.hair], scale: p.kid ? 0.95 : 1.35, rot: Math.PI / 2 }),
  },
  // ---------- транспорт ----------
  {
    id: 'car', section: 'transport', places: [K], params: [P.pick('color', CARS, 1)],
    build: (st, p) => st.figures.push({ kind: 'car', x: -1.1, y: 0, z: 0, tint: CARS[p.color], scale: 1, rot: 0 }),
  },
  {
    id: 'parkedCar', section: 'transport', places: [K], params: [P.pick('color', C.cars, 2)],
    build: (st, p) => parkedCar(st.ctx.s, -1.125, -0.5, C.cars[p.color]),
  },
  // ---------- животные ----------
  { id: 'hen', section: 'animals', places: [K], build: (st) => st.figures.push({ kind: 'hen', x: 0, y: 0, z: 0, tint: 0xffffff, scale: 1, rot: 0 }) },
  {
    id: 'dog', section: 'animals', places: [K], params: [P.pick('coat', PET.dog)],
    build: (st, p) => st.figures.push({ kind: 'dog', x: 0, y: 0, z: 0, tint: PET.dog[p.coat], scale: 1, rot: 0 }),
  },
  {
    id: 'cat', section: 'animals', places: [K], params: [P.pick('coat', PET.cat)],
    build: (st, p) => st.figures.push({ kind: 'cat', x: 0, y: 0, z: 0, tint: PET.cat[p.coat], scale: 1, rot: 0 }),
  },
  { id: 'duck', section: 'animals', places: [K], build: (st) => st.figures.push({ kind: 'duck', x: 0, y: 0, z: 0, tint: 0xffffff, scale: 1, rot: 0 }) },
  // ---------- деревья и растения ----------
  treeItem('oak', 'oak', 3),
  treeItem('birch', 'birch', 3),
  treeItem('pine', 'pine', 3.5),
  treeItem('apple', 'apple', 2.7),
  {
    id: 'forestTree', section: 'plants', places: [K],
    params: [P.opts('kind', ['ed.item.birch', 'ed.item.pine', 'ed.item.oak']), P.height(4, 2.8, 5.6), P.variant],
    build: (st, p) => lowTree(st.ctx.s, (['birch', 'pine', 'oak'] as Tree[])[p.kind], shift(p), 0, p.height),
  },
  {
    id: 'bush', section: 'plants', places: [K], params: [{ key: 'size', min: 0.5, max: 1.25, step: 0.25, def: 0.75 }, P.variant],
    build: (st, p) => bush(st.ctx.s, shift(p), 0, p.size),
  },
  { id: 'flowers', section: 'plants', places: [K], params: [P.variant], build: (st, p) => flowers(st.ctx.s, shift(p) - 1.5, -1.5, 3, 3) },
  {
    id: 'rock', section: 'plants', places: [K], params: [{ key: 'size', min: 0.4, max: 1, step: 0.1, def: 0.6 }, P.variant],
    build: (st, p) => rock(st.ctx.s, shift(p), 0, p.size),
  },
  { id: 'potatoField', section: 'plants', places: [K], build: (st) => field(st.ctx.s, -3, -2, 6, 4, 'potato') },
  { id: 'cabbageField', section: 'plants', places: [K], build: (st) => field(st.ctx.s, -3, -2, 6, 4, 'cabbage') },
  // ---------- жилые дома ----------
  {
    id: 'izba', section: 'houses', places: [K],
    params: [P.pick('roof', T.roofs), P.width(5.5, 4, 7), P.depth(4.5, 3.5, 6), P.variant],
    build: (st, p) => { st.ctx.r = rng(p.variant + 1); izba(st.ctx, frame(st, p.width, p.depth), T.roofs[p.roof], T.trim); },
  },
  {
    id: 'house2', section: 'houses', places: [K],
    params: [P.pick('wall', T.walls), P.pick('roof', T.roofs), P.width(5.5, 4, 7), P.depth(4.5, 3.5, 6), P.variant],
    build: (st, p) => { st.ctx.r = rng(p.variant + 1); house2(st.ctx, frame(st, p.width, p.depth), T.walls[p.wall], T.roofs[p.roof]); },
  },
  {
    id: 'dacha', section: 'houses', places: [K],
    params: [P.pick('wall', T.walls), P.pick('roof', T.roofs), P.width(4, 3.5, 6), P.depth(4.5, 3.5, 6), P.variant],
    build: (st, p) => { st.ctx.r = rng(p.variant + 1); dacha(st.ctx, frame(st, p.width, p.depth), T.walls[p.wall], T.roofs[p.roof]); },
  },
  {
    id: 'homestead', section: 'houses', places: [K],
    params: [P.opts('kind', ['ed.item.izba', 'ed.item.house2', 'ed.item.dacha']), P.variant],
    build: (st, p) => {
      st.ctx.r = rng(p.variant * 31 + 7);
      homestead(st.ctx, frame(st, 8, 8), T, true, (['izba', 'house2', 'dacha'] as const)[p.kind]);
      pensToFigures(st);
    },
  },
  // ---------- во дворах ----------
  {
    id: 'fence', section: 'yards', places: [K],
    params: [P.width(6, 3, 8), P.depth(5, 3, 8), P.opts('look', ['ed.opt.picket', 'ed.opt.solid']), P.opts('color', ['ed.opt.plank', 'ed.opt.grey'])],
    build: (st, p) => { const f = frame(st, p.width, p.depth); fence(f, p.color ? 0x7a8a9a : C.plank, f.w / 2 - 0.25, !p.look); },
  },
  { id: 'shed', section: 'yards', places: [K], params: [P.pick('roof', T.roofs)], build: (st, p) => shed(frame(st, 1.5, 1.5), 0, 0, T.roofs[p.roof]) },
  { id: 'woodpile', section: 'yards', places: [K], build: (st) => woodpile(frame(st, 1.5, 0.5), 0, 0) },
  { id: 'clothesline', section: 'yards', places: [K], params: [P.width(4, 2, 6)], build: (st, p) => clothesline(frame(st, p.width, 0.25), 0, 0, p.width) },
  { id: 'greenhouse', section: 'yards', places: [K], build: (st) => greenhouse(frame(st, 1.25, 2), 0, 0) },
  { id: 'beds', section: 'yards', places: [K], params: [P.width(2, 1, 4), P.depth(3, 1, 5)], build: (st, p) => beds(frame(st, p.width, p.depth), 0, 0, p.width, p.depth) },
  { id: 'doghouse', section: 'yards', places: [K], build: (st) => { doghouse(st.ctx, frame(st, 0.75, 0.75), 0, 0); pensToFigures(st); } },
  { id: 'bench', section: 'yards', places: [K], params: [P.width(1.5, 1, 3)], build: (st, p) => bench(frame(st, p.width, 0.75), 0, 0, p.width) },
  // ---------- улица ----------
  {
    id: 'road', section: 'street', places: [K],
    build: (st) => {
      const s = st.ctx.s;
      road(s, -6, 6);
      const paving = (i: number, _j: number, k: number) => ((i + k) % 4 === 0 ? STREET.walk2 : STREET.walk);
      s.fill(-6, 0, 0, 6, 0.25, 1, paving);
      s.fill(-6, 0, 5, 6, 0.25, 6, paving);
      for (let q = 0; q < 5; q++) s.fill(-1.6 + q * 0.75, -0.25, 1.2, -1.2 + q * 0.75, 0, 4.8, STREET.paint);
    },
  },
  {
    id: 'dirtPath', section: 'street', places: [K],
    // в игре слой 0…0.05 м тоньше вокселя и не рисуется; здесь — как задумано, высотой в воксель
    build: (st) => st.ctx.s.fill(-4, 0, -0.75, 4, 0.25, 0.75, (i, _j, k) => (hash(i, 6, k) > 0.7 ? 0x9cc46a : 0xc8b08a)),
  },
  { id: 'stela', section: 'street', places: [K], build: (st) => stela(st.ctx.s, -1.25, 0, T.stela) },
  { id: 'busStop', section: 'street', places: [K], build: (st) => busStop(st.ctx, frame(st, 3, 1.5), T.stela) },
  { id: 'powerLine', section: 'street', places: [K], build: (st) => powerLine(st.ctx.s, -12, 12, 0, 12) },
  { id: 'lamp', section: 'street', places: [K], build: (st) => lamp(st.ctx.s, 0, 0, false) },
  { id: 'bin', section: 'street', places: [K], build: (st) => bin(st.ctx.s, 0, 0) },
  // ---------- достопримечательности ----------
  { id: 'waterTower', section: 'landmarks', places: [K], build: (st) => waterTower(st.ctx, -0.875, -0.875) },
  {
    id: 'pond', section: 'landmarks', places: [K],
    params: [P.width(4, 2, 7), P.depth(2.5, 1.5, 5), P.toggle('ducks', 1)],
    build: (st, p) => { pond(st.ctx, 0, 0, p.width, p.depth, !!p.ducks); pensToFigures(st); },
  },
  { id: 'well', section: 'landmarks', places: [K], build: (st) => well(frame(st, 1, 1), 0, 0) },
  // ---------- здания бизнесов ----------
  lotItem('freeLot', null),
  lotItem('coffee', 'coffee'),
  lotItem('store', 'store'),
];

/** Места, для которых уже собраны предметы. Остальные ПГТ и районы добавим следующими. */
export const PLACES = [K];

export const defaults = (it: Item): Params => Object.fromEntries((it.params ?? []).map((d) => [d.key, d.def]));

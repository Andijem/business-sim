import * as THREE from 'three';
import { VILLAGES } from '../sim';
import { villageLots, villageX, templateOf, riverX, PLOT, DISTRICT_GAP, RIVER_GAP } from './layout';
import { VoxelStore, pick, hash, vi } from './voxels';
import { Frame, Plan, rng, lamp, parkedCar, tree, C, type Anim, type Ctx, type Pen } from './props';
import { THEMES, homestead, street, surroundings, type Area } from './places';

const P = {
  road: [0x8a8790, 0x83808a],
  walk: 0xe9dfcf, walk2: 0xdfd4c2, curb: 0xcfc6b8, paint: 0xf4ecd8,
  wood: 0x6b4a36, glass: 0x9cc6cf,
  leaves: [0x6f9a5a, 0x7fab63, 0x5f8a4e, 0x89b46a], pine: [0x4f7d4f, 0x5a8a56, 0x467046],
  wheat: [0xe8c870, 0xdcb85c], soil: [0x8a6a4a, 0x7d5f42],
};
/** Цвета улицы: асфальт, плитка, разметка (нужны редактору предметов). */
export const STREET = P;

/** Половина длины деревни вдоль дороги; у района города — шире. */
const HALF = 32;
const halfOf = (city?: boolean) => (city ? DISTRICT_GAP / 2 : HALF);

export function road(s: VoxelStore, a: number, b: number) {
  s.fill(a, -0.25, 1, b, 0, 5, (i, j, k) => pick(P.road, i, j, k));
  for (let x = a + 1; x < b; x += 2) s.fill(x, -0.25, 2.85, Math.min(b, x + 1), 0, 3.15, P.paint);
}

/** Одно место мира: где стоит и что в нём оживает. */
export interface Place {
  id: string;
  x: number;
  half: number;
  city: boolean;
  built: boolean;
  anim: Anim[];
  pens: Pen[];
  smoke: [number, number, number][];
  idle: [number, number, number][];
  /** Вращающиеся и качающиеся части (мельница, колесо обозрения, лодки). */
  movers: THREE.Object3D[];
}

/** Мир вокруг бизнесов: места строятся по мере надобности, ближние к камере — первыми. */
export interface WorldBuild {
  group: THREE.Group;
  places: Place[];
  /** Достроить места в радиусе от x; true — если что-то построилось. */
  ensure(x: number, radius: number): boolean;
  /** Достроить одно ещё не построенное место (фоном); false — всё уже готово. */
  step(): boolean;
}

/** Граница между соседними местами — посередине промежутка между их краями. */
function bounds(i: number): [number, number] {
  const V = VILLAGES[i], x = villageX(V.id), h = halfOf(V.city);
  const prev = VILLAGES[i - 1], next = VILLAGES[i + 1];
  const lo = prev ? (villageX(prev.id) + halfOf(prev.city) + x - h) / 2 : x - h - 30;
  const hi = next ? (x + h + villageX(next.id) - halfOf(next.city)) / 2 : x + h + 30;
  return [lo, hi];
}

/**
 * Неизменная часть мира кусками: у каждой деревни и района свой набор мешей.
 * Так three.js не рисует (и не считает в тенях) места, которые не попали в кадр.
 * Каждое место строится независимо от соседей (свои границы), поэтому мир одинаков
 * при любом порядке постройки.
 */
export function buildWorld(): WorldBuild {
  const world = new THREE.Group();
  const rx = riverX();
  const places: Place[] = VILLAGES.map((V) => ({
    id: V.id, x: villageX(V.id), half: halfOf(V.city), city: !!V.city, built: false, anim: [], pens: [], smoke: [], idle: [], movers: [],
  }));
  const buildPlace = (i: number) => {
    const V = VILLAGES[i], P = places[i];
    P.built = true;
    // дороги и участки всех мест заняты: дома и деревья на них не залезут
    const plan = new Plan(...bounds(i));
    for (const W of VILLAGES) if (Math.abs(villageX(W.id) - P.x) < 300) reserve(plan, W.id, !!W.city);
    if (rx != null) plan.mark(rx - RIVER_GAP / 2, -200, rx + RIVER_GAP / 2, 200);
    const s = new VoxelStore();
    const x = P.x;
    const prev = VILLAGES[i - 1], next = VILLAGES[i + 1];
    // дорога от середины промежутка до середины следующего, но не по воде
    let a = i === 0 ? x - HALF : (villageX(prev.id) + x) / 2;
    let b = next ? (x + villageX(next.id)) / 2 : x + halfOf(V.city);
    if (rx != null && !V.city && next?.city) b = rx - RIVER_GAP / 2 + 3;
    if (rx != null && V.city && !prev?.city) a = rx + RIVER_GAP / 2 - 3;
    road(s, a, b);
    const water: { x: number; z: number; rx: number; rz: number }[] = [];
    const ctx: Ctx = { s, plan, r: rng(i * 7919 + 13), smoke: P.smoke, anim: P.anim, pens: P.pens, idle: P.idle, water };
    place(ctx, V.id, !!V.city);
    const chunk = s.build();
    for (const an of P.anim) {
      const g = an.store.build();
      g.position.set(an.x, an.y, an.z);
      g.userData.anim = an;
      g.userData.y = an.y;
      chunk.add(g);
      P.movers.push(g);
    }
    // морские заливы: песок и вода — две плоские эллипса, почти даром для телефона
    for (const w of water) {
      for (const [k, color, y, off] of [[1.06, 0xe0cc98, -0.015, -1], [1, 0x4f9ac0, -0.008, -3]] as const) {
        const m = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshLambertMaterial({ color, polygonOffset: true, polygonOffsetFactor: off, polygonOffsetUnits: off }));
        m.rotation.x = -Math.PI / 2;
        m.scale.set(w.rx * k, w.rz * k, 1);
        m.position.set(w.x, y, w.z);
        m.receiveShadow = true;
        chunk.add(m);
      }
    }
    world.add(chunk);
  };
  if (rx != null) {
    const s = new VoxelStore();
    river(s, rx);
    world.add(s.build());
    const w = RIVER_GAP / 2 - 4;
    const water = new THREE.Mesh(new THREE.PlaneGeometry(w * 2, 120), new THREE.MeshLambertMaterial({ color: 0x5a9ab8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(rx, -0.01, 0);
    water.receiveShadow = true;
    world.add(water);
  }
  return {
    group: world,
    places,
    ensure(x, radius) {
      let any = false;
      places.forEach((P, i) => {
        if (!P.built && Math.abs(P.x - x) - P.half < radius) { buildPlace(i); any = true; }
      });
      return any;
    },
    step() {
      const i = places.findIndex((P) => !P.built);
      if (i < 0) return false;
      buildPlace(i);
      return true;
    },
  };
}

/** Дороги, тротуары и все участки места: их не занимают дома и деревья. */
function reserve(plan: Plan, id: string, city: boolean) {
  const vx = villageX(id), H = halfOf(city), side = city ? -40 : -31;
  plan.mark(vx - H, -0.5, vx + H, 6.5);
  plan.mark(vx - 9, side - 1, vx - 3, 0);
  for (const sl of templateOf(id)) plan.mark(vx + sl.x0, sl.z0, vx + sl.x0 + PLOT, sl.z0 + PLOT);
}

/** Река между деревнями и городом, через неё мост с перилами. */
function river(s: VoxelStore, cx: number) {
  const w = RIVER_GAP / 2 - 4;
  // вода — отдельная плоскость (buildWorld), здесь берега и мост
  s.fill(cx - w - 0.5, -0.25, -60, cx - w, 0.25, 60, 0xb8a888);
  s.fill(cx + w, -0.25, -60, cx + w + 0.5, 0.25, 60, 0xb8a888);
  // мост: настил над водой и перила
  s.fill(cx - w - 1, 0, 0.5, cx + w + 1, 0.25, 5.5, (i, j, k) => pick(P.road, i, j, k));
  s.fill(cx - w - 1, -0.75, 0, cx + w + 1, 0, 6, 0x9a9488);
  for (let x = cx - w - 1; x < cx + w + 1; x += 1) {
    s.fill(x, 0.25, 0, x + 0.25, 1.25, 0.25, 0x6d7f9a);
    s.fill(x, 0.25, 5.75, x + 0.25, 1.25, 6, 0x6d7f9a);
  }
  s.fill(cx - w - 1, 1.25, 0, cx + w + 1, 1.5, 0.25, 0x6d7f9a);
  s.fill(cx - w - 1, 1.25, 5.75, cx + w + 1, 1.5, 6, 0x6d7f9a);
}


/**
 * Одно место: улицы и тротуары, жилые дома на свободных участках, достопримечательность,
 * улица с остановкой и столбами, дома и природа вокруг. Бизнесы строятся отдельно (scene/lots.ts).
 */
function place(ctx: Ctx, id: string, city: boolean) {
  const s = ctx.s;
  const vx = villageX(id);
  const H = halfOf(city);
  const X = (x: number) => vx + x;
  const t = THEMES[id] ?? THEMES.kopeechkino;
  const side = city ? -40 : -31;
  const asphalt = (i: number, j: number, k: number) => pick(P.road, i, j, k);
  const paving = (i: number, _j: number, k: number) => ((i + k) % 4 === 0 ? P.walk2 : P.walk);
  // боковая улица на север, зебра и тротуары
  s.fill(X(-8), -0.25, side, X(-4), 0, 1, asphalt);
  for (let q = 0; q < 5; q++) s.fill(X(-3.4 + q * 0.75), -0.25, 1.2, X(-3.0 + q * 0.75), 0, 4.8, P.paint);
  s.fill(X(-H), 0, 0, X(-8.5), 0.25, 1, paving);
  s.fill(X(-3.5), 0, 0, X(H), 0.25, 1, paving);
  s.fill(X(-H), 0, 5, X(H), 0.25, 6, paving);
  s.fill(X(-8.5), 0, side, X(-8), 0.25, 0, paving);
  s.fill(X(-4), 0, side, X(-3.5), 0.25, 0, paving);
  if (city) for (let q = 0; q < 5; q++) s.fill(X(-8 + q * 0.8), -0.25, -1.75, X(-7.6 + q * 0.8), 0, -0.75, P.paint);
  // достопримечательность — первой, ей нужно больше всего места
  t.landmark(ctx, X);
  // свободные участки шаблона занимают дома жителей
  const used = new Set(villageLots(id).map((l) => l.slot));
  templateOf(id).forEach((sl, n) => {
    if (used.has(n)) return;
    homestead(ctx, new Frame(s, X(sl.x0), sl.z0, PLOT, PLOT, sl.face), t, true);
  });
  const area: Area = { half: H, city, sideTo: side };
  street(ctx, X, t, area);
  surroundings(ctx, X, t, area);
  // фонари и деревья у тротуаров
  for (let x = -H + 6; x < H; x += 10) lamp(s, X(x), 0.5, city);
  for (let x = -H + 11; x < H; x += 10) lamp(s, X(x), 5.4, city);
  for (const [x, z] of [[-1.5, -8.5], [12.5, -9], [-10.5, 15.5], [9, 15], [-26, 0], [24, -9]]) {
    if (ctx.plan.take(X(x) - 0.5, z - 0.5, X(x) + 1, z + 1)) tree(s, pick(t.trees, vi(x), 1, vi(z)), X(x), z, 2.4 + hash(vi(x), 2, 3) * 0.6);
  }
  // машины у обочины и во дворах
  const car = (n: number) => pick(C.cars, n, vi(vx), 3);
  if (!t.abandoned) {
    parkedCar(s, X(-6.5), -14, car(1), true);
    if (city) for (let x = -H + 15; x < H - 10; x += 23) parkedCar(s, X(x), 1.25, car(x));
  }
}


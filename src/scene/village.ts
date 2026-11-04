import * as THREE from 'three';
import { VILLAGES } from '../sim';
import { villageLots, villageX, templateOf, riverX, PLOT, DISTRICT_GAP, RIVER_GAP } from './layout';
import { VoxelStore, vi, pick, hash, VS } from './voxels';

const P = {
  road: [0x8a8790, 0x83808a],
  walk: 0xe9dfcf, walk2: 0xdfd4c2, curb: 0xcfc6b8, paint: 0xf4ecd8,
  wood: 0x6b4a36, glass: 0x9cc6cf,
  leaves: [0x6f9a5a, 0x7fab63, 0x5f8a4e, 0x89b46a], pine: [0x4f7d4f, 0x5a8a56, 0x467046],
  wheat: [0xe8c870, 0xdcb85c], soil: [0x8a6a4a, 0x7d5f42],
};

/** Половина длины деревни вдоль дороги; у района города — шире. */
const HALF = 32;
const halfOf = (city?: boolean) => (city ? DISTRICT_GAP / 2 : HALF);

/**
 * Неизменная часть мира: дороги, тротуары, дома жителей, деревья, поля.
 * Точки бизнеса строятся отдельно (scene/lots.ts) и перестраиваются по ходу игры.
 */
export function buildVillages(s: VoxelStore) {
  const lastV = VILLAGES[VILLAGES.length - 1];
  road(s, -HALF, villageX(lastV.id) + halfOf(lastV.city));
  const rx = riverX();
  if (rx != null) river(s, rx);
  for (const V of VILLAGES) (V.city ? district : village)(s, V.id);
}

function road(s: VoxelStore, a: number, b: number) {
  s.fill(a, -0.25, 1, b, 0, 5, (i, j, k) => pick(P.road, i, j, k));
  for (let x = a + 1; x < b; x += 2) s.fill(x, -0.25, 2.85, Math.min(b, x + 1), 0, 3.15, P.paint);
}

/**
 * Весь неизменный мир кусками: у каждой деревни и района свой набор мешей.
 * Так three.js не рисует (и не считает в тенях) места, которые не попали в кадр.
 */
export function buildWorld(): THREE.Group {
  const world = new THREE.Group();
  const rx = riverX();
  VILLAGES.forEach((V, i) => {
    const s = new VoxelStore();
    const x = villageX(V.id);
    const prev = VILLAGES[i - 1], next = VILLAGES[i + 1];
    // дорога от середины промежутка до середины следующего, но не по воде
    let a = i === 0 ? x - HALF : (villageX(prev.id) + x) / 2;
    let b = next ? (x + villageX(next.id)) / 2 : x + halfOf(V.city);
    if (rx != null && !V.city && next?.city) b = rx - RIVER_GAP / 2 + 3;
    if (rx != null && V.city && !prev?.city) a = rx + RIVER_GAP / 2 - 3;
    road(s, a, b);
    (V.city ? district : village)(s, V.id);
    world.add(s.build());
  });
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
  return world;
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

/** Район Капитальска: проспект, тротуары, многоэтажки за участками. */
function district(s: VoxelStore, id: string) {
  const vx = villageX(id);
  const H = DISTRICT_GAP / 2;
  const X = (x: number) => vx + x;
  const asphalt = (i: number, j: number, k: number) => pick(P.road, i, j, k);
  const paving = (i: number, _j: number, k: number) => ((i + k) % 4 === 0 ? P.walk2 : P.walk);
  s.fill(X(-8), -0.25, -40, X(-4), 0, 1, asphalt);
  for (let q = 0; q < 5; q++) s.fill(X(-3.4 + q * 0.75), -0.25, 1.2, X(-3.0 + q * 0.75), 0, 4.8, P.paint);
  s.fill(X(-H), 0, 0, X(-8.5), 0.25, 1, paving);
  s.fill(X(-3.5), 0, 0, X(H), 0.25, 1, paving);
  s.fill(X(-H), 0, 5, X(H), 0.25, 6, paving);
  s.fill(X(-8.5), 0, -40, X(-8), 0.25, 0, paving);
  s.fill(X(-4), 0, -40, X(-3.5), 0.25, 0, paving);
  const used = new Set(villageLots(id).map((l) => l.slot));
  templateOf(id).forEach((sl, n) => {
    if (used.has(n)) return;
    const x0 = X(sl.x0), z0 = sl.z0;
    if (n % 3 === 0) garden(s, x0, z0);
    else panelBlock(s, x0 + 0.5, z0 + 1.5, 6, 4, 3 + (n % 3), n % 2 ? 0xe6d6c0 : 0xd9c7b0);
  });
  // многоэтажки за линией участков, с двух сторон проспекта
  const seed = vx;
  for (let x = -H + 4; x < H - 10; x += 12) {
    const f1 = 5 + Math.floor(hash(seed + x, 1, 1) * 5), f2 = 5 + Math.floor(hash(seed + x, 2, 2) * 5);
    if (x < -20 || x > 4) panelBlock(s, X(x), -20, 9, 4, f1, hash(x, 3, 3) > 0.5 ? 0xd9c7b0 : 0xe6d6c0);
    panelBlock(s, X(x), 16, 9, 4, f2, hash(x, 4, 4) > 0.5 ? 0xe6d6c0 : 0xcfd8de);
  }
  for (let x = -H + 6; x < H; x += 10) lamp(s, X(x), 0.5);
  for (let x = -H + 11; x < H; x += 10) lamp(s, X(x), 5.4);
  [[-12, -10], [10, -10], [28, -10], [-38, 14], [20, 14]].forEach(([x, z]) => tree(s, X(x), z, 2.6));
  car(s, X(-20), 1.5, 0x3b7fbf); car(s, X(14), 3.5, 0xe2604a); car(s, X(34), 1.5, 0xe9e2d6);
}

function village(s: VoxelStore, id: string) {
  const vx = villageX(id);
  const X = (x: number) => vx + x;
  const asphalt = (i: number, j: number, k: number) => pick(P.road, i, j, k);
  const paving = (i: number, _j: number, k: number) => ((i + k) % 4 === 0 ? P.walk2 : P.walk);
  // боковая дорога на север, к дворам
  s.fill(X(-8), -0.25, -31, X(-4), 0, 1, asphalt);
  // зебра и тротуары
  for (let q = 0; q < 5; q++) s.fill(X(-3.4 + q * 0.75), -0.25, 1.2, X(-3.0 + q * 0.75), 0, 4.8, P.paint);
  s.fill(X(-HALF), 0, 0, X(-8.5), 0.25, 1, paving);
  s.fill(X(-3.5), 0, 0, X(HALF), 0.25, 1, paving);
  s.fill(X(-HALF), 0, 5, X(HALF), 0.25, 6, paving);
  s.fill(X(-8.5), 0, -31, X(-8), 0.25, 0, paving);
  s.fill(X(-4), 0, -31, X(-3.5), 0.25, 0, paving);
  // участки шаблона, на которых в этой деревне нет лотов, занимают дома жителей и огороды
  const used = new Set(villageLots(id).map((l) => l.slot));
  templateOf(id).forEach((sl, n) => {
    if (used.has(n)) return;
    const x0 = X(sl.x0), z0 = sl.z0;
    if (n % 2) garden(s, x0, z0);
    else house(s, x0 + 1.5, z0 + 1.5, 4, 3.5, n % 4 ? 0xf1d7c4 : 0xdfe6d2, n % 4 ? 0xb4563f : 0x6d7f9a);
  });
  // поле за деревней и жилые дома
  field(s, X(4), -24, 16, 7);
  panelBlock(s, X(-28), -20, 8, 3.5, 4, 0xd9c7b0);
  panelBlock(s, X(16), 15, 8, 3.5, 5, 0xe6d6c0);
  house(s, X(-20), 16, 3.75, 3, 0xf1d7c4, 0xb4563f);
  house(s, X(2), 16.5, 3.25, 3, 0xdfe6d2, 0x6d7f9a);
  const seed = vx;
  [[-1.5, -8.5, 2.6], [12.5, -9, 2.8], [-10.5, 15.5, 2.4], [9, 15, 2.6], [-26, 0, 2.2], [24, -9, 2.6]].forEach(([x, z, h]) => tree(s, X(x), z, h));
  [[-30, -12, 3.2], [-18, -20, 2.8], [31, 16, 2.6], [-30, 18, 3], [28, -18, 3], [20, -22, 2.8]].forEach(([x, z, h]) => pine(s, X(x), z, h + hash(seed, 1, 2) * 0.4));
  [[-13, 0.5], [-1.5, 0.5], [10, 0.5], [2, 5.4], [13, 5.4], [22, 0.5], [-22, 5.4]].forEach(([x, z]) => lamp(s, X(x), z));
  car(s, X(-10), 1.5, 0xe9e2d6); car(s, X(18), 3.5, 0x3b7fbf); car(s, X(-7.5), -12, 0xe8a84a, true);
}

function garden(s: VoxelStore, x0: number, z0: number) {
  s.fill(x0 + 0.5, 0, z0 + 0.5, x0 + PLOT - 0.5, 0.25, z0 + PLOT - 0.5, (i, j, k) => (k % 3 === 0 ? 0x6f9a5a : pick(P.soil, i, j, k)));
  for (let x = x0 + 0.25; x < x0 + PLOT; x += 1) s.fill(x, 0, z0 + 0.25, x + 0.25, 0.75, z0 + 0.5, P.wood);
  tree(s, x0 + 1.5, z0 + 1.5, 2.2);
}

function field(s: VoxelStore, x0: number, z0: number, w: number, d: number) {
  for (let i = vi(x0); i < vi(x0 + w); i++)
    for (let k = vi(z0); k < vi(z0 + d); k++) s.put(i, 0, k, i % 4 < 2 ? pick(P.wheat, i, 0, k) : 0xb8b060);
}

function panelBlock(s: VoxelStore, x0: number, z0: number, w: number, d: number, floors: number, wall: number) {
  const h = floors + 0.5;
  s.fill(x0, 0, z0, x0 + w, h, z0 + d, (_i, j) => (j % 4 === 0 ? 0xcabba5 : wall));
  s.fill(x0 - 0.25, h, z0 - 0.25, x0 + w + 0.25, h + 0.25, z0 + d + 0.25, 0x8c8378);
  const win = (u: number, v: number) => (u % 4 === 1 || u % 4 === 2) && (v % 4 === 1 || v % 4 === 2);
  for (let i = vi(x0); i < vi(x0 + w); i++) for (let j = vi(0.5); j < vi(h - 0.25); j++)
    if (win(i - vi(x0), j - vi(0.5))) {
      if (hash(i, j, 3) > 0.55) s.putGlow(i, j, vi(z0 + d - 0.25), 0xffd98f);
      else s.put(i, j, vi(z0 + d - 0.25), 0x7fa3b8);
    }
}

function house(s: VoxelStore, x0: number, z0: number, w: number, d: number, wall: number, roof: number) {
  s.fill(x0, 0, z0, x0 + w, 2, z0 + d, wall);
  for (let l = 0; l * VS < d / 2 + 0.3; l++) {
    const a = z0 - 0.25 + l * VS, b = z0 + d + 0.25 - l * VS;
    if (b <= a) break;
    s.fill(x0 - 0.25, 2 + l * VS, a, x0 + w + 0.25, 2 + (l + 1) * VS, b, roof);
  }
  s.fill(x0 + 0.5, 0.75, z0 + d - 0.25, x0 + 1.25, 1.5, z0 + d, 0xffd98f, true);
  s.fill(x0 + w - 1.25, 0.75, z0 + d - 0.25, x0 + w - 0.5, 1.5, z0 + d, P.glass);
  s.fill(x0 + w / 2 - 0.25, 0, z0 + d - 0.25, x0 + w / 2 + 0.5, 1.25, z0 + d, P.wood);
}

function tree(s: VoxelStore, x: number, z: number, h: number) {
  const cx = vi(x), cz = vi(z), th = Math.round((h * 0.45) / VS);
  for (let j = 0; j < th; j++) { s.put(cx, j, cz, P.wood); s.put(cx + 1, j, cz + 1, P.wood); s.put(cx + 1, j, cz, 0x5e4130); s.put(cx, j, cz + 1, 0x5e4130); }
  const R = (h * 0.4) / VS, cy = th + R * 0.7;
  for (let i = -R - 1; i <= R + 1; i++) for (let j = -R; j <= R * 1.1; j++) for (let k = -R - 1; k <= R + 1; k++)
    if (Math.hypot(i / R, j / (R * 1.05), k / R) + hash(cx + i, j, cz + k) * 0.25 < 1.05)
      s.put(cx + Math.round(i), Math.round(cy + j), cz + Math.round(k), pick(P.leaves, cx + i, j, cz + k));
}

function pine(s: VoxelStore, x: number, z: number, h: number) {
  const cx = vi(x), cz = vi(z), H = Math.round(h / VS);
  for (let j = 0; j < 4; j++) s.put(cx, j, cz, P.wood);
  for (let j = 3; j < H; j++) {
    const rr = (1 - (j - 3) / (H - 3)) * (h * 0.32) / VS + (j % 3 === 0 ? 0.8 : 0);
    for (let i = -Math.ceil(rr); i <= rr; i++) for (let k = -Math.ceil(rr); k <= rr; k++)
      if (Math.hypot(i, k) <= rr) s.put(cx + i, j, cz + k, pick(P.pine, i, j, k));
  }
}

function lamp(s: VoxelStore, x: number, z: number) {
  const i = vi(x), k = vi(z);
  for (let j = 0; j < 12; j++) s.put(i, j, k, 0x40404a);
  s.put(i, 11, k + 1, 0x40404a);
  s.putGlow(i, 10, k + 1, 0xfff2c8);
}

function car(s: VoxelStore, x: number, z: number, c: number, alongZ = false) {
  const L = 9, W = 4, i0 = vi(x), k0 = vi(z);
  const put = (a: number, b: number, j: number, col: number) => (alongZ ? s.put(i0 + b, j, k0 + a, col) : s.put(i0 + a, j, k0 + b, col));
  for (let a = 0; a < L; a++) for (let b = 0; b < W; b++) { put(a, b, 1, c); put(a, b, 2, c); }
  for (let a = 2; a < L - 2; a++) for (let b = 0; b < W; b++) {
    const edge = a === 2 || a === L - 3 || b === 0 || b === W - 1;
    put(a, b, 3, edge ? 0x2b3340 : c); put(a, b, 4, c);
  }
  [[1, 0], [L - 2, 0], [1, W - 1], [L - 2, W - 1]].forEach(([a, b]) => put(a, b, 0, 0x222222));
}

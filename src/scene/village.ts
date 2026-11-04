import { VoxelStore, vi, pick, hash, VS } from './voxels';

/** Палитра дня. Вечерняя и сезонные палитры появятся на этапах 2 и 4. */
const P = {
  grass: [0x9cc46a, 0x93bb60, 0xa6cc72, 0x8ab55c],
  road: [0x8a8790, 0x83808a],
  walk: 0xe9dfcf, walk2: 0xdfd4c2, curb: 0xcfc6b8, paint: 0xf4ecd8,
  wood: 0x6b4a36, glass: 0x9cc6cf, skin: 0xf0c8a8,
  leaves: [0x6f9a5a, 0x7fab63, 0x5f8a4e, 0x89b46a], pine: [0x4f7d4f, 0x5a8a56, 0x467046],
  wheat: [0xe8c870, 0xdcb85c],
};
const people = [0x3b7fbf, 0xe8a84a, 0x7a5ea8, 0x2f6f62, 0xd65a5a, 0x5a6a7a];

/** Координаты точки игрока: нужны сцене для подписи. */
export const COFFEE = { x0: 1, z0: -7, w: 7, d: 5.5, h: 3.25 };

export function buildVillage(s: VoxelStore) {
  const G = 22;
  // земля: трава, справа сверху пшеничное поле
  for (let i = vi(-G); i < vi(G); i++)
    for (let k = vi(-G); k < vi(G); k++) {
      const x = i * VS, z = k * VS;
      const wheat = x >= 13 && z < -4;
      s.put(i, -1, k, wheat ? (i % 4 < 2 ? pick(P.wheat, i, 0, k) : 0xb8b060) : pick(P.grass, i, -1, k));
    }
  const asphalt = (i: number, j: number, k: number) => pick(P.road, i, j, k);
  s.fill(-G, -0.25, 1, G, 0, 5, asphalt);
  s.fill(-8, -0.25, -G, -4, 0, 1, asphalt);
  for (let x = -G + 1; x < G; x += 2) if (Math.abs(x + 6) > 2.5) s.fill(x, -0.25, 2.85, x + 1, 0, 3.15, P.paint);
  for (let q = 0; q < 5; q++) s.fill(-3.4 + q * 0.75, -0.25, 1.2, -3.0 + q * 0.75, 0, 4.8, P.paint);
  const paving = (i: number, _j: number, k: number) => ((i + k) % 4 === 0 ? P.walk2 : P.walk);
  s.fill(-G, 0, 0, -8.5, 0.25, 1, paving); s.fill(-3.5, 0, 0, G, 0.25, 1, paving); s.fill(-G, 0, 5, G, 0.25, 6, paving);
  s.fill(-G, 0, 0.75, -8.5, 0.25, 1, P.curb); s.fill(-3.5, 0, 0.75, G, 0.25, 1, P.curb); s.fill(-G, 0, 5, G, 0.25, 5.25, P.curb);

  coffeeShop(s);
  rival(s);
  panelBlock(s, 1, -14.75, 9, 3.5, 6, 0xd9c7b0);
  panelBlock(s, -14.5, -14.5, 7, 3.5, 5, 0xe6d6c0);
  house(s, -14.5, 8, 3.75, 3, 0xf1d7c4, 0xb4563f);
  house(s, -9.5, 8.25, 3.25, 3, 0xdfe6d2, 0x6d7f9a);

  [[-1.5, -3, 2.6], [-1.8, -9, 3], [11.5, -4.5, 2.8], [3, 9, 2.4], [9, 8, 2.6], [-3, 12, 2.2]].forEach(([x, z, h]) => tree(s, x, z, h));
  [[-15, -10, 3.2], [-18, -4, 2.8], [15, 10, 2.6], [-19, 14, 3], [14, -18, 3]].forEach(([x, z, h]) => pine(s, x, z, h));
  [[-13, 0.5], [-1.5, 0.5], [10, 0.5], [2, 5.4], [13, 5.4]].forEach(([x, z]) => lamp(s, x, z));
  car(s, -10, 1.5, 0xe9e2d6); car(s, 5, 3.5, 0x3b7fbf); car(s, -7.5, -10, 0xe8a84a, true);
  for (let q = 0; q < 4; q++) person(s, 2.1 + (q % 2) * 0.25, -0.9 + q * 0.5, people[q]);
  person(s, -4.5, 0.5, people[4]); person(s, 9, 5.5, people[5]);
}

function coffeeShop(s: VoxelStore) {
  const { x0, z0, w, d, h } = COFFEE;
  const wall = (_i: number, j: number) => (j % 3 === 0 ? 0xead6b4 : 0xf3e2c4);
  s.fill(x0, 0, z0, x0 + w, h, z0 + d, wall);
  s.fill(x0, 0, z0, x0 + w, 0.5, z0 + d, 0xc9b394);
  s.fill(x0 - 0.25, h, z0 - 0.25, x0 + w + 0.25, h + 0.5, z0 + d + 0.25, (_i, j) => (j % 2 ? 0x2f7a72 : 0x2a6d66));
  // витрина с переплётом
  const k = vi(z0 + d - 0.25);
  for (let i = vi(x0 + 2.25); i < vi(x0 + w - 0.5); i++)
    for (let j = vi(0.75); j < vi(2.5); j++)
      s.put(i, j, k, (i - vi(x0 + 2.25)) % 5 === 0 || j === vi(0.75) ? P.wood : P.glass);
  s.fill(x0 + 0.5, 0, z0 + d - 0.25, x0 + 1.75, 2.25, z0 + d, P.wood);
  // полосатый навес
  for (let i = vi(x0 + 2); i < vi(x0 + w - 0.25); i++)
    for (let t = 0; t < 5; t++)
      s.put(i, vi(2.75) - Math.floor(t / 2), vi(z0 + d) + t, Math.floor((i - vi(x0 + 2)) / 2) % 2 ? 0xfaf2e6 : 0xe2604a);
  // вывеска на крыше
  s.fill(x0 + 1.5, h + 0.5, z0 + 1.5, x0 + 5.5, h + 1.75, z0 + 1.75, 0xfaf2e6);
  s.fill(x0 + 1.75, h + 1.25, z0 + 1.75, x0 + 5.25, h + 1.5, z0 + 2, 0xe2604a);
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) for (let q = 0; q < 4; q++)
    if (Math.hypot(i - 2, q - 1.5) < 2.3 - j * 0.08) s.put(vi(x0 + 0.25) + i, vi(h + 0.5) + j, vi(z0 + 1) + q, j === 4 ? 0x5a3b2c : 0xe8a84a);
}

function rival(s: VoxelStore) {
  s.fill(-15, 0, -8, -9, 2.75, -3, (_i, j) => (j % 3 === 0 ? 0xcfc9c0 : 0xd9d4cc));
  s.fill(-15.25, 2.75, -8.25, -8.75, 3, -2.75, 0x8c8a86);
  s.fill(-15, 2, -3.25, -9, 2.5, -3, 0xc8302a);
  s.fill(-14, 0.25, -3.25, -10, 1.75, -3, P.glass);
}

function panelBlock(s: VoxelStore, x0: number, z0: number, w: number, d: number, floors: number, wall: number) {
  const h = floors + 0.5;
  s.fill(x0, 0, z0, x0 + w, h, z0 + d, (_i, j) => (j % 4 === 0 ? 0xcabba5 : wall));
  s.fill(x0 - 0.25, h, z0 - 0.25, x0 + w + 0.25, h + 0.25, z0 + d + 0.25, 0x8c8378);
  const win = (u: number, v: number) => (u % 4 === 1 || u % 4 === 2) && (v % 4 === 1 || v % 4 === 2);
  for (let i = vi(x0); i < vi(x0 + w); i++) for (let j = vi(0.5); j < vi(h - 0.25); j++)
    if (win(i - vi(x0), j - vi(0.5))) s.put(i, j, vi(z0 + d - 0.25), 0x7fa3b8);
  for (let k = vi(z0); k < vi(z0 + d); k++) for (let j = vi(0.5); j < vi(h - 0.25); j++)
    if (win(k - vi(z0), j - vi(0.5))) s.put(vi(x0 + w - 0.25), j, k, 0x7fa3b8);
}

function house(s: VoxelStore, x0: number, z0: number, w: number, d: number, wall: number, roof: number) {
  s.fill(x0, 0, z0, x0 + w, 2, z0 + d, wall);
  for (let l = 0; l * VS < d / 2 + 0.3; l++) {
    const a = z0 - 0.25 + l * VS, b = z0 + d + 0.25 - l * VS;
    if (b <= a) break;
    s.fill(x0 - 0.25, 2 + l * VS, a, x0 + w + 0.25, 2 + (l + 1) * VS, b, roof);
  }
  s.fill(x0 + 0.5, 0.75, z0 + d - 0.25, x0 + 1.25, 1.5, z0 + d, P.glass);
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
  s.put(i, 10, k + 1, 0xfff2c8);
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

function person(s: VoxelStore, x: number, z: number, c: number) {
  const i = vi(x), k = vi(z);
  s.put(i, 0, k, 0x3a3a48); s.put(i, 1, k, c); s.put(i, 2, k, c); s.put(i, 3, k, P.skin);
}

import { VoxelStore, hash, pick, vi, VS } from './voxels';
import {
  C, Frame, type Animal, type Ctx, type Face, type Tree,
  bench, beds, bin, bush, busStop, chalet, clothesline, cottage, dacha, doghouse, fence, field, flowerbed, flowers,
  greenhouse, haystack, house2, izba, lamp, merchant, panel, parkedCar, pond, powerLine, rock, shade, shed, stalinka,
  stela, tower, trafficLight, tree, lowTree, villa, warehouse, well, woodpile, barrack,
} from './props';

/**
 * Характер каждой локации: какие дома, деревья, животные и главная достопримечательность.
 * Бизнесы стоят на участках, а всё остальное — жизнь вокруг них.
 */
type HouseKind = 'izba' | 'house2' | 'dacha' | 'ruin' | 'barrack' | 'panel' | 'tallPanel' | 'cottage' | 'merchant' | 'stalinka'
  | 'tower' | 'dorm' | 'chalet' | 'villa' | 'hotel' | 'warehouse' | 'glass';

export interface Theme {
  houses: HouseKind[];
  walls: number[];
  roofs: number[];
  trim: number;
  trees: Tree[];
  forest: Tree[];
  /** Животные во дворах и на улицах. */
  animals: Animal[];
  stela: number;
  crops?: ('wheat' | 'potato' | 'sunflower' | 'cabbage')[];
  /** Море к северу от локации. */
  sea?: boolean;
  /** Брошенная деревня: заколоченные окна, бурьян, без дыма. */
  abandoned?: boolean;
  /** Насколько густо стоят деревья на краю (0…1). */
  wild: number;
  landmark: (ctx: Ctx, X: (x: number) => number) => void;
}

const WARM = [0xf1d7c4, 0xf2e6c8, 0xe8d4b0, 0xdfe6d2, 0xf4e0b0];
const SOFT_ROOFS = [0xb4563f, 0x6d7f9a, 0x5f8a6a, 0x8a4a3a];

export const THEMES: Record<string, Theme> = {
  kopeechkino: {
    houses: ['izba', 'izba', 'dacha', 'house2'], walls: WARM, roofs: SOFT_ROOFS, trim: 0xfaf2e6,
    trees: ['birch', 'apple', 'oak'], forest: ['birch', 'birch', 'pine', 'oak'], animals: ['hen', 'cat', 'dog'],
    stela: 0x2f6f62, crops: ['potato', 'cabbage'], wild: 0.7,
    landmark: (ctx, X) => { waterTower(ctx, X(20), -30); pond(ctx, X(-22), 21, 4, 2.5); well(new Frame(ctx.s, X(-11.5), -1.75, 1, 1), 0, 0); },
  },
  barysh: {
    houses: ['house2', 'izba', 'barrack', 'izba'], walls: [0xe8dcc8, 0xd8ccb0, 0xf1d7c4, 0xd9d6cf], roofs: [0x6d7f9a, 0x8a8a92, 0xb4563f], trim: 0x3b6f9f,
    trees: ['poplar', 'poplar', 'oak'], forest: ['poplar', 'oak', 'pine'], animals: ['dog', 'dog', 'cat'],
    stela: 0x3b6f9f, crops: ['wheat'], wild: 0.4,
    landmark: (ctx, X) => { gasStation(ctx, X(34), 7); truckStop(ctx, X(34), -12); },
  },
  grosh: {
    houses: ['izba', 'house2', 'izba', 'izba'], walls: [0xe8d4b0, 0xf1d7c4, 0xdcc8a8], roofs: [0x8a4a3a, 0x5f8a6a, 0xb4563f], trim: 0xfaf2e6,
    trees: ['apple', 'oak', 'birch'], forest: ['oak', 'birch', 'pine'], animals: ['hen', 'hen', 'goat', 'dog'],
    stela: 0x6f9a5a, crops: ['wheat', 'sunflower', 'wheat'], wild: 0.5,
    landmark: (ctx, X) => { windmill(ctx, X(18), -36); barn(ctx, X(26), -20); cowMeadow(ctx, X(-24), 27); },
  },
  navarinka: {
    houses: ['dacha', 'house2', 'dacha', 'izba'], walls: [0xfaf6ee, 0xe8f0f4, 0xf6ecd8], roofs: [0x3b6f8f, 0x3bb0b0, 0x5a8ab0], trim: 0x3b6f9f,
    trees: ['poplar', 'pine', 'palm'], forest: ['pine', 'pine', 'poplar'], animals: ['cat', 'gull', 'gull', 'dog'],
    stela: 0x3bb0b0, sea: true, wild: 0.35,
    landmark: (ctx, X) => { seaside(ctx, X, 'beach'); lighthouse(ctx, X(24), -42); pier(ctx, X(-7), -33, 12); },
  },
  kreditovka: {
    houses: ['barrack', 'panel', 'barrack', 'house2'], walls: [0xe6d6c0, 0xd9c7b0, 0xe8dcc8, 0xd0c8b8], roofs: [0x7a7a82, 0x6d7f9a, 0x8a4a3a], trim: 0xfaf2e6,
    trees: ['maple', 'oak', 'poplar'], forest: ['oak', 'birch', 'maple'], animals: ['cat', 'pigeon', 'dog'],
    stela: 0x58b8a8, wild: 0.4,
    landmark: (ctx, X) => houseOfCulture(ctx, X(8), -30),
  },
  dolzhkovo: {
    houses: ['ruin', 'ruin', 'izba', 'ruin'], walls: [0xb8a890, 0xa89880, 0xc0b098], roofs: [0x6a5a4a, 0x5a5a5a, 0x7a5a4a], trim: 0x8a7a6a,
    trees: ['willow', 'oak', 'birch'], forest: ['birch', 'willow', 'pine'], animals: ['crow', 'crow', 'cat'],
    stela: 0x8a7a6a, abandoned: true, wild: 0.9,
    landmark: (ctx, X) => kolkhozGarage(ctx, X(10), -34),
  },
  novostroyki: {
    houses: ['tallPanel', 'tallPanel', 'panel'], walls: [0xf0e0c8, 0xd8e4ec, 0xf2d8c8, 0xe0ecd8], roofs: [0x8c8378], trim: 0xfaf2e6,
    trees: ['young', 'young', 'birch'], forest: ['birch', 'young'], animals: ['dog', 'pigeon', 'cat'],
    stela: 0xe8a84a, wild: 0.3,
    landmark: (ctx, X) => { construction(ctx, X(20), -48); playground(ctx, X(-34), 22); },
  },
  zarechye: {
    houses: ['izba', 'house2', 'panel', 'izba'], walls: WARM, roofs: SOFT_ROOFS, trim: 0xfaf2e6,
    trees: ['willow', 'apple', 'birch'], forest: ['willow', 'birch', 'oak'], animals: ['hen', 'cat', 'dog'],
    stela: 0x6d7f9a, crops: ['potato'], wild: 0.5,
    landmark: (ctx, X) => { church(ctx, X(14), -46); pond(ctx, X(34), -44, 7, 4); marketStalls(ctx, X(-40), 16); },
  },
  port: {
    houses: ['warehouse', 'warehouse', 'panel'], walls: [0x9aa0a8, 0xa89880, 0x8a9a8a, 0xb8a888], roofs: [0x7a7a82], trim: 0xfaf2e6,
    trees: ['poplar'], forest: ['poplar', 'oak'], animals: ['gull', 'gull', 'dog'],
    stela: 0x34406a, sea: true, wild: 0.15,
    landmark: (ctx, X) => { seaside(ctx, X, 'quay'); portCranes(ctx, X); factory(ctx, X(-44), 24); },
  },
  studgorodok: {
    houses: ['dorm', 'dorm', 'panel'], walls: [0xb4604a, 0xa8553e, 0xe6d6c0], roofs: [0x7a7a82], trim: 0xfaf2e6,
    trees: ['maple', 'birch', 'young'], forest: ['birch', 'maple'], animals: ['pigeon', 'dog', 'cat'],
    stela: 0x7a5ea8, wild: 0.3,
    landmark: (ctx, X) => { university(ctx, X(4), -52); stadium(ctx, X(-30), 24); },
  },
  kupechesky: {
    houses: ['merchant', 'merchant', 'merchant'], walls: [0xe8c070, 0x9cc8b0, 0xf0b8a8, 0xd8c8e8, 0xf2e2b0], roofs: [0x5f8a6a, 0x8a4a3a, 0x6d7f9a], trim: 0xfaf2e6,
    trees: ['oak', 'maple'], forest: ['oak', 'birch'], animals: ['pigeon', 'pigeon', 'cat'],
    stela: 0xd9a441, wild: 0.3,
    landmark: (ctx, X) => { belfry(ctx, X(16), -44); tradeRows(ctx, X(-46), 16); },
  },
  capitalCity: {
    houses: ['glass', 'glass', 'tower'], walls: [0x5a7a9a, 0x6a8aa8, 0x4a6a8a, 0x7a9ab0], roofs: [0x8c8a86], trim: 0xd8dce4,
    trees: ['young', 'maple'], forest: ['maple', 'oak'], animals: ['pigeon', 'pigeon'],
    stela: 0x34406a, wild: 0.15,
    landmark: (ctx, X) => { hqTower(ctx, X(16), -50); fountain(ctx, X(-30), 22); },
  },
  vokzalny: {
    houses: ['stalinka', 'stalinka', 'panel'], walls: [0xe8d8b0, 0xf0e0c0, 0xd8c8a0], roofs: [0x8a6a4a], trim: 0xfaf2e6,
    trees: ['oak', 'maple'], forest: ['oak', 'poplar'], animals: ['pigeon', 'pigeon', 'dog'],
    stela: 0xb83a3a, wild: 0.2,
    landmark: (ctx, X) => station(ctx, X),
  },
  technopark: {
    houses: ['glass', 'cottage', 'glass'], walls: [0x6aa8a0, 0x7ab8b0, 0x8ac0d0, 0xf6f2ea], roofs: [0xd8dce4], trim: 0xd8dce4,
    trees: ['young', 'birch'], forest: ['birch', 'pine'], animals: ['dog', 'pigeon'],
    stela: 0x58b8a8, wild: 0.3,
    landmark: (ctx, X) => { solarField(ctx, X(4), -60); windTurbines(ctx, X); },
  },
  embankment: {
    houses: ['hotel', 'hotel', 'villa'], walls: [0xfaf6ee, 0xf6ecd8, 0xe8f0f4], roofs: [0x3bb0b0, 0x3b6f8f], trim: 0x3bb0b0,
    trees: ['palm', 'palm', 'poplar'], forest: ['palm', 'pine', 'poplar'], animals: ['gull', 'gull', 'cat'],
    stela: 0x3bb0b0, sea: true, wild: 0.25,
    landmark: (ctx, X) => { seaside(ctx, X, 'promenade'); ferrisWheel(ctx, X(30), -44); },
  },
  slopes: {
    houses: ['chalet', 'chalet', 'chalet'], walls: WARM, roofs: [0x8a4a3a, 0x5a3a2a, 0x6d7f9a], trim: 0xfaf2e6,
    trees: ['pine', 'pine', 'birch'], forest: ['pine', 'pine', 'pine'], animals: ['dog', 'squirrel'],
    stela: 0x5a8ab0, wild: 0.8,
    landmark: (ctx, X) => mountain(ctx, X),
  },
  marina: {
    houses: ['villa', 'villa', 'hotel'], walls: [0xfaf6ee], roofs: [0x3b6f8f, 0x2f6f62, 0xb4563f], trim: 0x3b6f8f,
    trees: ['palm', 'palm', 'pine'], forest: ['pine', 'palm'], animals: ['gull', 'gull', 'cat'],
    stela: 0x2f6f62, sea: true, wild: 0.25,
    landmark: (ctx, X) => { seaside(ctx, X, 'marina'); },
  },
  pineHills: {
    houses: ['cottage', 'cottage', 'chalet'], walls: [0xf6f2ea, 0xe8dcc8, 0xd8c8b0, 0xdfe6d2], roofs: [0x4a5a7a, 0x5a3a2a, 0x2f6f62], trim: 0xfaf2e6,
    trees: ['pine', 'pine', 'birch'], forest: ['pine', 'pine', 'pine', 'birch'], animals: ['dog', 'dog', 'squirrel'],
    stela: 0x2f6f62, wild: 0.95,
    landmark: (ctx, X) => barrier(ctx, X(-57), 0),
  },
};

// ---------- жилые дома ----------

/** Дом с двором на участке 7×7 или больше: дом в глубине, двор у фасада. */
/** low — дом ближе к камере: многоэтажки ниже, чтобы не закрывали улицу. */
export function homestead(ctx: Ctx, f: Frame, t: Theme, low = false, kind?: HouseKind) {
  const r = ctx.r;
  const k = kind ?? pick(t.houses, vi(f.ox), 1, vi(f.oz));
  const wall = t.walls[Math.floor(r() * t.walls.length)];
  const roof = t.roofs[Math.floor(r() * t.roofs.length)];
  const big = ['barrack', 'panel', 'tallPanel', 'tower', 'glass', 'dorm', 'stalinka', 'hotel', 'warehouse', 'merchant'].includes(k);
  if (big) return building(ctx, f, t, k, wall, roof, low);
  const hw = Math.min(f.w - 1, k === 'cottage' ? 7 : k === 'dacha' ? 4 : 5.5);
  const hd = Math.min(f.d - 2.5, k === 'cottage' ? 6 : 4.5);
  const hu = (f.w - hw) / 2;
  const h = sub(f, hu, 0.75, hw, hd);
  const ruined = k === 'ruin';
  if (k === 'izba' || ruined) {
    izba(ctx, h, ruined ? shade(roof, 0.7) : roof, ruined ? 0x8a7a6a : t.trim);
    if (ruined) ruin(ctx, h);
  } else if (k === 'house2') house2(ctx, h, wall, roof);
  else if (k === 'dacha') dacha(ctx, h, wall, roof);
  else if (k === 'cottage') cottage(ctx, h, wall, roof);
  else if (k === 'chalet') chalet(ctx, h, roof);
  else if (k === 'villa') villa(ctx, h, roof);
  // двор
  const gate = f.w / 2 - 0.25;
  if (!ruined || r() > 0.5) fence(f, k === 'cottage' || k === 'villa' ? shade(wall, 0.7) : ruined ? 0x6a5a48 : r() > 0.5 ? C.plank : 0x7a8a9a, gate, k !== 'cottage');
  const yardV = 0.75 + hd + 0.25;
  const left = r() > 0.5;
  const ua = left ? 0.5 : f.w - 2.25;
  if (ruined) {
    for (let n = 0; n < 4; n++) { const [x, z] = f.at(0.75 + r() * (f.w - 1.5), yardV + r() * (f.d - yardV - 0.5)); bush(ctx.s, x, z, 0.5); }
    return;
  }
  const extra = r();
  if (k === 'villa' || k === 'cottage') {
    const [x, z] = f.at(left ? 1 : f.w - 1.25, f.d - 1);
    bush(ctx.s, x, z, 0.5);
    if (extra > 0.5) { const [px, pz] = f.at(f.w - 1.25, f.d - 1.25); parkedCar(ctx.s, px - 1, pz - 1.25, pick(C.cars, vi(px), 2, vi(pz)), true); }
    if (t.animals.includes('dog') && extra < 0.4) doghouse(ctx, f, 0.75, f.d - 1.5);
    return;
  }
  if (f.d - yardV > 1.5) {
    if (extra < 0.3) beds(f, ua, yardV, 1.75, f.d - yardV - 0.75);
    else if (extra < 0.5) clothesline(f, 1, f.d - 1.25, f.w - 2.5);
    else if (extra < 0.65) greenhouse(f, ua, yardV);
    else if (extra < 0.8) woodpile(f, ua, yardV + 0.25);
    else if (t.animals.includes('dog')) doghouse(ctx, f, ua + 0.5, yardV + 0.25);
  }
  // сарай и дерево за домом, если место есть
  if (f.d - hd > 3 && r() > 0.4) shed(f, left ? f.w - 2 : 0.5, f.d - 1.75, roof);
  else if (r() > 0.4) { const [x, z] = f.at(left ? f.w - 1 : 1, f.d - 1); tree(ctx.s, pick(t.trees, vi(x), 3, vi(z)), x, z, 2.2 + r()); }
  if (t.animals.includes('hen') && r() > 0.55) {
    const [x0, z0] = f.at(0.5, yardV), [x1, z1] = f.at(f.w - 0.5, f.d - 0.5);
    ctx.pens.push({ kind: 'hen', x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), n: 2 + Math.floor(r() * 3) });
  }
  if (r() > 0.75) bench(f, gate + 1, f.d - 0.75, 1.25);
}

/** Многоэтажный дом без забора: подъезды, клумба, лавочки. */
function building(ctx: Ctx, f: Frame, t: Theme, k: HouseKind, wall: number, roof: number, low: boolean) {
  const r = ctx.r;
  /** Этажей: в ближних рядах не выше пяти. */
  const fl = (a: number, b: number) => (low ? Math.min(a + Math.floor(r() * 2), 5) : a + Math.floor(r() * (b - a + 1)));
  const tall = k === 'tower' || k === 'glass';
  // ближние к камере башни уже и ниже: не закрывают улицу
  const bw = low && tall ? Math.min(f.w - 2, 7) : f.w;
  const bd = Math.min(f.d - 1, k === 'warehouse' ? f.d - 1 : tall ? (low ? 6 : f.d - 1) : 5);
  const h = sub(f, (f.w - bw) / 2, 0, bw, bd);
  switch (k) {
    case 'barrack': barrack(ctx, h, wall, roof); break;
    case 'dorm': barrack(ctx, h, wall, 0x7a7a82, low ? 3 : 4 + Math.floor(r() * 2)); break;
    case 'panel': panel(ctx, h, wall, fl(4, 5)); break;
    case 'tallPanel': panel(ctx, h, wall, fl(9, 14), pick([0x7fa3b8, 0x9ab8c8, 0x8aa0b0], vi(f.ox), 1, 1)); break;
    case 'hotel': panel(ctx, h, wall, fl(6, 9), t.trim); break;
    case 'stalinka': stalinka(ctx, h, wall, low ? 4 : 5 + Math.floor(r() * 2)); break;
    case 'merchant': merchant(ctx, h, wall, roof, 2 + Math.floor(r() * 2)); break;
    case 'warehouse': warehouse(ctx, h, wall); break;
    case 'tower': tower(ctx, h, fl(14, 24), wall, t.trim); break;
    case 'glass': tower(ctx, h, fl(8, 22), wall, t.trim); break;
  }
  if (f.d - bd >= 1) {
    const [x, z] = f.at(0.5, bd + 0.25);
    const [x2, z2] = f.at(bw - 0.5, f.d - 0.25);
    if (k !== 'warehouse' && r() > 0.4) flowerbed(ctx.s, Math.min(x, x2), Math.min(z, z2), Math.min(2, Math.abs(x2 - x)), Math.min(0.75, Math.abs(z2 - z)));
  }
}

/** Рамка внутри рамки: тот же поворот, сдвиг на (u, v). */
function sub(f: Frame, u: number, v: number, w: number, d: number): Frame {
  // угол (u, v+d) в старой рамке — это начало новой с тем же поворотом
  const pts = [f.at(u, v), f.at(u + w, v + d)];
  const ox = Math.min(pts[0][0], pts[1][0]), oz = Math.min(pts[0][1], pts[1][1]);
  return new Frame(f.s, ox, oz, w, d, f.face);
}

/** Брошенный дом: заколоченные окна, дыра в крыше, нет дыма. */
function ruin(ctx: Ctx, h: Frame) {
  ctx.smoke.pop();
  for (const u of [1, h.w - 1.75]) h.fill(u - 0.25, 0.75, h.d - 0.75, u + 1, 1, h.d - 0.5, C.plank);
  for (const u of [1, h.w - 1.75]) h.fill(u, 1.25, h.d - 0.75, u + 0.75, 1.5, h.d - 0.5, C.plank);
  const [x, z] = h.at(h.w / 2, h.d / 2);
  ctx.s.clear(x - 0.75, 2.25, z - 1.25, x + 0.5, 3.5, z + 0.25);
}

// ---------- достопримечательности ----------

function waterTower(ctx: Ctx, x: number, z: number) {
  const s = ctx.s;
  if (!ctx.plan.take(x - 2, z - 2, x + 3, z + 3)) return;
  for (const [dx, dz] of [[0, 0], [2, 0], [0, 2], [2, 2]]) s.fill(x + dx - 0.25, 0, z + dz - 0.25, x + dx, 6, z + dz, 0x8a4a3a);
  for (let y = 1; y < 6; y += 2) { s.fill(x - 0.25, y, z - 0.25, x + 2, y + 0.25, z, 0x8a4a3a); s.fill(x - 0.25, y, z + 1.75, x + 2, y + 0.25, z + 2, 0x8a4a3a); }
  const cx = vi(x + 0.875), cz = vi(z + 0.875);
  for (let j = vi(6); j < vi(9); j++) for (let i = -7; i <= 7; i++) for (let k = -7; k <= 7; k++)
    if (Math.hypot(i, k) <= 6.5) s.put(cx + i, j, cz + k, j % 3 === 0 ? 0x7a3a2a : 0xa8553e);
  for (let j = vi(9); j < vi(10.5); j++) for (let i = -7; i <= 7; i++) for (let k = -7; k <= 7; k++)
    if (Math.hypot(i, k) <= 6.5 - (j - vi(9)) * 1.1) s.put(cx + i, j, cz + k, 0x6d7f9a);
}

function gasStation(ctx: Ctx, x: number, z: number) {
  const s = ctx.s;
  if (!ctx.plan.take(x, z, x + 11, z + 7)) return;
  s.fill(x, 0, z, x + 11, 0.25, z + 7, (i, j, k) => pick([0x8a8790, 0x83808a], i, j, k));
  for (const dx of [1, 6]) for (const dz of [1.25]) {
    s.fill(x + dx, 0.25, z + dz, x + dx + 0.25, 3.5, z + dz + 0.25, 0xd9d6cf);
    s.fill(x + dx + 3, 0.25, z + dz, x + dx + 3.25, 3.5, z + dz + 0.25, 0xd9d6cf);
  }
  s.fill(x + 0.5, 3.5, z + 0.25, x + 10.5, 4, z + 2.75, 0xfaf2e6);
  s.fill(x + 0.5, 3.5, z + 2.5, x + 10.5, 3.75, z + 2.75, 0xe2604a);
  for (const dx of [2.5, 7.5]) { s.fill(x + dx, 0.25, z + 1.25, x + dx + 0.5, 1.5, z + 1.75, 0xe2604a); s.putGlow(vi(x + dx), vi(1), vi(z + 1.75), 0xfff2c8); }
  // магазинчик
  s.fill(x + 3, 0.25, z + 4, x + 10, 2.75, z + 6.75, 0xeee6d8);
  s.fill(x + 3.5, 0.75, z + 3.75, x + 9.5, 2, z + 4, C.lit, true);
  s.fill(x + 2.75, 2.75, z + 3.75, x + 10.25, 3, z + 7, 0xe2604a);
  // стела с ценами
  s.fill(x + 0.5, 0, z + 5, x + 1.5, 4, z + 5.5, 0x3b6f9f);
  for (let y = 1.5; y < 3.75; y += 0.75) s.fill(x + 0.75, y, z + 4.75, x + 1.25, y + 0.25, z + 5, 0xfff2c8, true);
  parkedCar(s, x + 2, z + 1, 0x3b7fbf);
}

function truckStop(ctx: Ctx, x: number, z: number) {
  if (!ctx.plan.take(x, z, x + 12, z + 10)) return;
  const s = ctx.s;
  s.fill(x, 0, z, x + 12, 0.25, z + 10, (i, j, k) => (hash(i, j, k) > 0.9 ? 0x9a9488 : 0xa89a80));
  truck(s, x + 1, z + 1.5, 0x3b7fbf);
  truck(s, x + 1, z + 5.5, 0xe8a84a);
  for (let n = 0; n < 5; n++) s.fill(x + 10, n * 0.25, z + 1 + n * 0.25, x + 11, n * 0.25 + 0.5, z + 2 + n * 0.25, 0x2a2a2a); // покрышки
  ctx.idle.push([x + 9, 0.25, z + 8]);
}

function truck(s: VoxelStore, x: number, z: number, c: number) {
  s.fill(x, 0.25, z, x + 2, 2.25, z + 2, c);
  s.fill(x + 0.25, 1.25, z + 0.125, x + 1.75, 2, z + 0.25, 0x2b3340);
  s.fill(x + 2.25, 0.5, z, x + 8.5, 3, z + 2, 0xd9d6cf);
  for (const dx of [0.5, 3, 7.5]) { s.fill(x + dx, 0, z - 0.125, x + dx + 0.75, 0.5, z, 0x222222); s.fill(x + dx, 0, z + 2, x + dx + 0.75, 0.5, z + 2.125, 0x222222); }
}

/** Мельница: дом-башня и лопасти, которые крутятся, пока идёт время. */
function windmill(ctx: Ctx, x: number, z: number) {
  if (!ctx.plan.take(x - 3, z - 3, x + 4, z + 4)) return;
  const s = ctx.s;
  for (let j = 0; j < vi(6); j++) {
    const r = 2.6 - j * 0.04;
    for (let i = -r; i <= r; i++) for (let k = -r; k <= r; k++) if (Math.hypot(i, k) <= r) s.put(vi(x) + Math.round(i), j, vi(z) + Math.round(k), j % 4 === 0 ? 0x8a5e3c : 0xa87a52);
  }
  for (let j = vi(6); j < vi(7.5); j++) for (let i = -3; i <= 3; i++) for (let k = -3; k <= 3; k++)
    if (Math.hypot(i, k) <= 3 - (j - vi(6)) * 0.5) s.put(vi(x) + i, j, vi(z) + k, 0x8a4a3a);
  s.fill(x - 0.25, 0, z + 0.5, x + 0.5, 1.5, z + 0.75, C.wood2);
  // лопасти крутятся вокруг оси z перед фасадом
  const blades = new VoxelStore();
  for (let a = 0; a < 4; a++) {
    const ang = (a * Math.PI) / 2;
    for (let n = 1; n < 18; n++) for (let w = 0; w < (n > 4 ? 4 : 1); w++) {
      const px = Math.round(Math.cos(ang) * n - Math.sin(ang) * w), py = Math.round(Math.sin(ang) * n + Math.cos(ang) * w);
      blades.put(px, py, 0, n > 4 ? (w === 0 ? C.wood : 0xeee6d8) : C.wood);
    }
  }
  blades.put(0, 0, 0, C.wood2);
  ctx.anim.push({ kind: 'spin', store: blades, x: x + 0.125, y: 6.5, z: z + 0.875, axis: 'z', speed: 0.8 });
  ctx.pens.push({ kind: 'hen', x0: x - 4, z0: z + 3.5, x1: x + 4, z1: z + 6, n: 3 });
}

function barn(ctx: Ctx, x: number, z: number) {
  if (!ctx.plan.take(x - 0.5, z - 0.5, x + 7.5, z + 6.5)) return;
  const f = new Frame(ctx.s, x, z, 7, 6, 'nz');
  f.fill(0, 0, 0, 7, 3, 6, (i) => (i % 2 ? 0xa8433a : 0x983a32));
  let l = 0;
  for (; l * VS < 3.3; l++) f.fill(-0.25, 3 + l * VS, -0.25 + l * VS, 7.25, 3.25 + l * VS, 6.25 - l * VS, 0x5a5a62);
  f.fill(2.5, 0, 5.75, 4.5, 2.5, 6, C.white);
  f.fill(2.75, 0, 5.75, 4.25, 2.25, 6, 0x6b3a2a);
  haystack(ctx.s, x + 9, z + 2);
  haystack(ctx.s, x + 10.5, z + 6);
  // трактор
  const s = ctx.s, tx = x - 4, tz = z + 7;
  s.fill(tx, 0.5, tz, tx + 2, 1.5, tz + 1.25, 0x3f8a3f);
  s.fill(tx + 1, 1.5, tz, tx + 2, 2.5, tz + 1.25, 0x2b3340);
  s.fill(tx + 1.25, 0, tz - 0.25, tx + 2.25, 1, tz, 0x222222);
  s.fill(tx + 1.25, 0, tz + 1.25, tx + 2.25, 1, tz + 1.5, 0x222222);
  s.fill(tx, 0, tz - 0.125, tx + 0.5, 0.5, tz, 0x222222);
  s.fill(tx, 0, tz + 1.25, tx + 0.5, 0.5, tz + 1.375, 0x222222);
}

function cowMeadow(ctx: Ctx, x: number, z: number) {
  if (!ctx.plan.take(x - 8, z - 4, x + 8, z + 5)) return;
  const f = new Frame(ctx.s, x - 8, z - 4, 16, 9, 'pz');
  fence(f, C.plank, -5, false);
  ctx.pens.push({ kind: 'cow', x0: x - 7, z0: z - 3, x1: x + 7, z1: z + 4, n: 4 });
  ctx.pens.push({ kind: 'goat', x0: x - 6, z0: z - 2, x1: x + 6, z1: z + 3, n: 2 });
}

/** Море к северу: залив, береговая линия и что на ней (пляж, причал, набережная). */
function seaside(ctx: Ctx, X: (x: number) => number, kind: 'beach' | 'quay' | 'promenade' | 'marina') {
  const s = ctx.s, shore = kind === 'beach' ? -34 : -40;
  ctx.water.push({ x: X(0), z: shore - 60, rx: kind === 'beach' ? 46 : 58, rz: 60 });
  ctx.plan.mark(X(-70), shore - 120, X(70), shore + 1);
  if (kind === 'beach') {
    for (let x = -26; x < 30; x += 7) {
      if (x > -10 && x < -3) continue;
      s.fill(X(x + 0.875), 0, shore + 2.875, X(x + 1.125), 2, shore + 3.125, C.white);
      s.fill(X(x), 2, shore + 2, X(x + 2), 2.25, shore + 4, x % 2 ? 0xe2604a : 0x3bb0b0);
      s.fill(X(x + 1.5), 0, shore + 1.5, X(x + 2.5), 0.25, shore + 3, x % 3 ? 0xf2c230 : C.white); // полотенце
      ctx.idle.push([X(x + 2), 0.25, shore + 2.25]);
    }
    boats(ctx, X(4), shore - 8, 3);
  }
  if (kind === 'quay') {
    s.block(X(-58), -1, shore - 1.5, X(58), 0.25, shore + 1, 0x9a958c);
    for (let x = -56; x < 56; x += 4) s.fill(X(x), 0.25, shore - 1.25, X(x + 0.5), 0.75, shore - 0.75, 0x40404a);
  }
  if (kind === 'promenade') {
    s.block(X(-58), -0.5, shore - 1, X(58), 0.25, shore + 3, 0xe8dcc8);
    for (let x = -58; x < 58; x += 1) s.fill(X(x), 0.25, shore - 1, X(x + 0.25), 1, shore - 0.75, C.white);
    s.fill(X(-58), 1, shore - 1, X(58), 1.25, shore - 0.75, C.white);
    for (let x = -56; x < 56; x += 8) { tree(s, 'palm', X(x), shore + 2, 4); bench(new Frame(s, X(x + 2.5), shore + 1, 1.5, 0.5, 'nz'), 0, 0); ctx.idle.push([X(x + 3.25), 0.25, shore + 1.25]); }
    for (let x = -52; x < 60; x += 16) lamp(s, X(x), shore + 2.5, true);
    boats(ctx, X(-20), shore - 10, 4);
  }
  if (kind === 'marina') {
    s.block(X(-58), -0.5, shore - 1, X(58), 0.25, shore + 2, 0xd8d0c0);
    for (let x = -50; x < 56; x += 18) {
      s.block(X(x), -0.25, shore - 22, X(x + 1.5), 0.25, shore - 1, 0x9a7452);
      for (let n = 0; n < 3; n++) yacht(ctx, X(x + (n % 2 ? 2.5 : -5)), shore - 6 - n * 6, n % 2 === 0);
    }
    for (let x = -56; x < 60; x += 9) tree(s, 'palm', X(x), shore + 1.5, 4.5);
  }
  if (kind === 'quay') boats(ctx, X(30), shore - 14, 1, true);
  ctx.pens.push({ kind: 'gull', x0: X(-40), z0: shore - 30, x1: X(40), z1: shore + 6, n: 6 });
}

function boats(ctx: Ctx, x: number, z: number, n: number, ship = false) {
  for (let q = 0; q < n; q++) {
    const b = new VoxelStore();
    if (ship) {
      for (let i = -40; i < 40; i++) for (let k = -8; k < 8; k++) {
        const edge = Math.abs(k) / 8 + Math.max(0, (Math.abs(i) - 30) / 10);
        if (edge > 1) continue;
        for (let j = 0; j < 6; j++) b.put(i, j, k, j < 2 ? 0x8a3a3a : 0x2b3340);
      }
      for (let i = -32; i < 20; i += 8) for (let j = 6; j < 14; j++) for (let k = -6; k < 6; k++) b.put(i + (k + 6 > 11 ? 0 : 0), j, k, pick([0xe2604a, 0x3b7fbf, 0xe8a84a, 0x3f8a3f], i, Math.floor(j / 4), 0));
      for (let i = 22; i < 34; i++) for (let j = 6; j < 18; j++) for (let k = -5; k < 5; k++) if (i === 22 || i === 33 || j === 17 || Math.abs(k) === 5) b.put(i, j, k, j > 13 && j < 16 && i === 22 ? C.lit : C.white);
    } else {
      const c = pick([0xe2604a, 0xfaf2e6, 0x3b7fbf, 0xe8a84a], q, 1, vi(x));
      for (let i = -6; i < 6; i++) for (let k = -2; k <= 2; k++) {
        if (Math.abs(k) / 2.5 + Math.max(0, (Math.abs(i) - 3) / 3) > 1) continue;
        b.put(i, 0, k, c); b.put(i, 1, k, Math.abs(k) === 2 || Math.abs(i) > 4 ? c : 0x9a7452);
      }
      if (q % 2 === 0) { for (let j = 2; j < 12; j++) b.put(0, j, 0, C.wood); for (let j = 3; j < 11; j++) for (let i = 1; i < 1 + (11 - j) * 0.6; i++) b.put(i, j, 0, C.white); }
    }
    ctx.anim.push({ kind: 'bob', store: b, x: x + q * 9 - (ship ? 0 : 4), y: -0.1, z: z - (q % 2) * 4, speed: 1 + q * 0.3 });
  }
}

function yacht(ctx: Ctx, x: number, z: number, sail: boolean) {
  const b = new VoxelStore();
  for (let k = -12; k < 12; k++) for (let i = -3; i <= 3; i++) {
    if (Math.abs(i) / 3.5 + Math.max(0, (Math.abs(k) - 7) / 5) > 1) continue;
    b.put(i, 0, k, 0xf6f6f6); b.put(i, 1, k, Math.abs(i) === 3 || Math.abs(k) > 9 ? 0xf6f6f6 : 0xb88a5a);
  }
  for (let k = -3; k < 4; k++) for (let i = -2; i <= 2; i++) { b.put(i, 2, k, 0xf6f6f6); if (Math.abs(i) < 2) b.put(i, 3, k, k > 1 ? 0x2b3340 : 0xf6f6f6); }
  if (sail) { for (let j = 4; j < 22; j++) b.put(0, j, 0, 0xd8d8d8); for (let j = 5; j < 20; j++) for (let k = 1; k < (20 - j) * 0.45; k++) b.put(0, j, k, C.white); }
  ctx.anim.push({ kind: 'bob', store: b, x, y: -0.1, z, speed: 0.8 + (vi(x) % 5) * 0.1 });
}

function pier(ctx: Ctx, x: number, z: number, len: number) {
  const s = ctx.s;
  s.block(x, 0, z - len, x + 2, 0.25, z, 0x9a7452);
  for (let v = z - len; v < z; v += 2) { s.fill(x - 0.25, -1, v, x, 0.25, v + 0.25, C.wood2); s.fill(x + 2, -1, v, x + 2.25, 0.25, v + 0.25, C.wood2); }
  for (let v = z - len + 1; v < z; v += 3) s.fill(x + 2, 0.25, v, x + 2.25, 1, v + 0.25, C.wood2);
  ctx.idle.push([x + 1, 0.25, z - len + 0.75]);
  ctx.idle.push([x + 1.5, 0.25, z - len + 4]);
}

function lighthouse(ctx: Ctx, x: number, z: number) {
  const s = ctx.s;
  s.block(x - 4, -0.5, z - 4, x + 4, 0.5, z + 4, 0xc8b890);
  for (let j = 2; j < vi(9); j++) {
    const r = 5.5 - j * 0.07;
    for (let i = -6; i <= 6; i++) for (let k = -6; k <= 6; k++) if (Math.hypot(i, k) <= r) s.put(vi(x) + i, j, vi(z) + k, Math.floor(j / 5) % 2 ? 0xe2604a : C.white);
  }
  for (let j = vi(9); j < vi(10.25); j++) for (let i = -3; i <= 3; i++) for (let k = -3; k <= 3; k++) {
    if (Math.abs(i) === 3 || Math.abs(k) === 3) s.put(vi(x) + i, j, vi(z) + k, 0x2b3340);
    else s.putGlow(vi(x) + i, j, vi(z) + k, 0xfff2c8);
  }
  for (let i = -4; i <= 4; i++) for (let k = -4; k <= 4; k++) if (Math.hypot(i, k) <= 4) s.put(vi(x) + i, vi(10.25), vi(z) + k, 0xe2604a);
}

function houseOfCulture(ctx: Ctx, x: number, z: number) {
  if (!ctx.plan.take(x - 1, z - 1, x + 17, z + 14)) return;
  const f = new Frame(ctx.s, x, z, 16, 8, 'pz');
  f.fill(0, 0, 0, 16, 6, 6, 0xe8d8b8);
  f.fill(-0.25, 6, -0.25, 16.25, 6.5, 6.25, C.white);
  for (let l = 0; l < 6; l++) f.fill(4 + l * 0.5, 6.5 + l * 0.25, 6, 12 - l * 0.5, 6.75 + l * 0.25, 7.5, 0xe8d8b8); // фронтон
  f.fill(3.5, 0, 6, 12.5, 0.5, 8, C.stone[2]);
  for (let u = 4; u < 12.5; u += 1.5) f.fill(u, 0.5, 7, u + 0.5, 6.5, 7.5, C.white); // колонны
  f.fill(3.5, 6.5, 6, 12.5, 6.75, 7.75, C.white);
  for (let u = 0.75; u < 16; u += 1.5) if (u < 3.5 || u > 12.5) windowAt2(f, u, 2, 6, ctx.r() > 0.5);
  f.fill(7, 0.5, 6, 9, 3, 6.25, C.wood);
  // площадь с клумбой и памятником
  ctx.s.fill(x + 3, 0, z + 8.5, x + 13, 0.25, z + 13.5, (i, _j, k) => ((i + k) % 3 ? 0xd8d0c0 : 0xc8c0b0));
  flowerbed(ctx.s, x + 6, z + 10, 4, 2.5);
  ctx.s.fill(x + 7.75, 0.5, z + 10.75, x + 8.25, 2.5, z + 11.25, 0x8a8a92);
  ctx.s.fill(x + 7.5, 2.5, z + 10.5, x + 8.5, 3.25, z + 11.5, 0x7a8a7a);
  bench(new Frame(ctx.s, x + 3.5, z + 12.5, 1.5, 0.5, 'nz'), 0, 0);
  bench(new Frame(ctx.s, x + 11, z + 12.5, 1.5, 0.5, 'nz'), 0, 0);
  ctx.idle.push([x + 4.25, 0.25, z + 12.75], [x + 11.75, 0.25, z + 12.75]);
  ctx.pens.push({ kind: 'pigeon', x0: x + 4, z0: z + 9, x1: x + 12, z1: z + 13, n: 4 });
}
function windowAt2(f: Frame, u: number, y: number, v: number, lit: boolean) {
  f.fill(u, y, v, u + 0.75, y + 2, v + 0.25, lit ? C.lit : C.glass, lit);
}

function kolkhozGarage(ctx: Ctx, x: number, z: number) {
  if (!ctx.plan.take(x - 1, z - 1, x + 15, z + 12)) return;
  const f = new Frame(ctx.s, x, z, 14, 7, 'pz');
  f.fill(0, 0, 0, 14, 4, 7, (i, j, k) => (hash(i, j, k) > 0.85 ? 0x8a7a6a : 0xa89880));
  f.fill(-0.25, 4, -0.25, 14.25, 4.25, 7.25, (i, _j, k) => (hash(i, 2, k) > 0.8 ? 0x7a4a3a : 0x6a6a6a));
  ctx.s.clear(x + 4, 4, z + 2, x + 7, 4.25, z + 4); // дыра в крыше
  for (let u = 1; u < 13; u += 4.5) f.fill(u, 0, 6.75, u + 3, 3, 7, (_i, j) => (j % 2 ? 0x5a6a5a : 0x4a5a4a));
  // ржавый трактор и бурьян
  const s = ctx.s, tx = x + 3, tz = z + 9;
  s.fill(tx, 0.5, tz, tx + 2, 1.5, tz + 1.25, 0x8a5a3a);
  s.fill(tx + 1, 1.5, tz, tx + 2, 2.25, tz + 1.25, 0x6a4a3a);
  s.fill(tx + 1.25, 0, tz - 0.25, tx + 2.25, 1, tz, 0x2a2a2a);
  for (let n = 0; n < 10; n++) bush(s, x + hash(n, 1, 1) * 14, z + 8 + hash(n, 2, 2) * 3, 0.5, [0x7a8a4a, 0x8a9a5a, 0x6a7a3a]);
  ctx.pens.push({ kind: 'crow', x0: x, z0: z + 7, x1: x + 14, z1: z + 12, n: 4 });
}

function construction(ctx: Ctx, x: number, z: number) {
  if (!ctx.plan.take(x - 1, z - 1, x + 22, z + 14)) return;
  const s = ctx.s;
  // недостроенный дом: каркас этажей
  s.fill(x, 0, z, x + 12, 0.25, z + 10, 0xa89a80);
  for (let fl = 0; fl < 7; fl++) {
    const y = fl * 1.25;
    for (const [dx, dz] of [[0, 0], [5.75, 0], [11.5, 0], [0, 4.75], [11.5, 4.75], [0, 9.5], [5.75, 9.5], [11.5, 9.5]]) s.fill(x + dx, y, z + dz, x + dx + 0.5, y + 1.25, z + dz + 0.5, 0xb8b0a0);
    s.block(x, y + 1.25, z, x + 12, y + 1.45, z + 10, 0xc8c0b0);
    if (fl < 4) s.block(x, y, z + 9.75, x + 12, y + 1.25, z + 10, 0xe8dcc8);
  }
  // башенный кран: решётчатая мачта, стрела, противовес
  const cx = x + 15, cz = z + 4;
  for (let j = 0; j < vi(20); j++) for (const [dx, dz] of [[0, 0], [3, 0], [0, 3], [3, 3]]) s.put(vi(cx) + dx, j, vi(cz) + dz, j % 4 === 0 ? 0xc89a20 : 0xf2c230);
  for (let j = 0; j < vi(20); j += 4) for (let n = 0; n < 4; n++) { s.put(vi(cx) + n, j, vi(cz), 0xf2c230); s.put(vi(cx), j, vi(cz) + n, 0xf2c230); }
  for (let i = -vi(16); i < vi(6); i++) { s.put(vi(cx) + 1 + i, vi(20), vi(cz) + 1, 0xf2c230); s.put(vi(cx) + 1 + i, vi(20), vi(cz) + 2, 0xf2c230); if (i % 3 === 0) s.put(vi(cx) + 1 + i, vi(20) + 1, vi(cz) + 1, 0xf2c230); }
  s.fill(cx + 3.5, 19.25, cz, cx + 5.5, 20, cz + 0.75, 0x6a6a72);
  s.fill(cx, 20.25, cz, cx + 1, 21, cz + 1, 0x3b6f9f);
  for (let j = vi(14); j < vi(20); j++) s.put(vi(cx - 10), j, vi(cz) + 1, 0x2a2a30);
  s.fill(cx - 10.5, 13, cz, cx - 9, 13.75, cz + 0.75, 0xd65a5a);
  ctx.idle.push([x + 4, 0.25, z + 11], [x + 6, 0.25, z + 11.5]);
}

function playground(ctx: Ctx, x: number, z: number) {
  if (!ctx.plan.take(x, z, x + 10, z + 8)) return;
  const s = ctx.s;
  s.fill(x, 0, z, x + 10, 0.25, z + 8, (i, _j, k) => (hash(i, 5, k) > 0.5 ? 0xd8b080 : 0xc8a070));
  s.fill(x + 1, 0.25, z + 1, x + 3, 0.5, z + 3, 0xe8c870);
  s.fill(x + 5, 0.25, z + 1, x + 5.25, 2.5, z + 1.25, 0xe2604a); s.fill(x + 7, 0.25, z + 1, x + 7.25, 2.5, z + 1.25, 0xe2604a);
  s.fill(x + 5, 2.5, z + 1, x + 7.25, 2.75, z + 1.25, 0xe2604a);
  s.fill(x + 5.75, 0.75, z + 0.75, x + 6.5, 1, z + 1.5, 0x3b7fbf); // качели
  s.fill(x + 2, 0.25, z + 5, x + 3, 2, z + 6, 0x3b7fbf); s.fill(x + 3, 0.25, z + 5, x + 5, 1.75, z + 6, 0xf2c230); // горка
  bench(new Frame(s, x + 7, z + 6.5, 1.5, 0.5, 'nz'), 0, 0);
  ctx.idle.push([x + 7.75, 0.25, z + 6.75], [x + 2, 0.25, z + 2]);
}

function church(ctx: Ctx, x: number, z: number) {
  if (!ctx.plan.take(x - 1, z - 1, x + 11, z + 13)) return;
  const s = ctx.s;
  s.fill(x, 0, z, x + 8, 5, z + 10, (_i, j) => (j % 6 === 0 ? 0xe8e0d0 : 0xf6f2ea));
  s.fill(x - 0.25, 5, z - 0.25, x + 8.25, 5.5, z + 10.25, 0x5f8a6a);
  s.fill(x + 3, 0.25, z + 10, x + 5, 3, z + 10.25, C.wood);
  for (const dz of [2, 5, 8]) { s.fill(x - 0.25, 2, z + dz, x, 3.5, z + dz + 0.75, C.lit, true); s.fill(x + 8, 2, z + dz, x + 8.25, 3.5, z + dz + 0.75, C.lit, true); }
  s.fill(x + 2.5, 5.5, z + 3, x + 5.5, 8, z + 6, 0xf6f2ea); // барабан
  const cx = vi(x + 4), cz = vi(z + 4.5);
  for (let j = 0; j < 14; j++) for (let i = -7; i <= 7; i++) for (let k = -7; k <= 7; k++)
    if (Math.hypot(i, k) <= Math.sqrt(Math.max(0, 49 - (j - 3) * (j - 3) * 0.6)) && j + (Math.hypot(i, k) > 5 ? 3 : 0) < 14) s.put(cx + i, vi(8) + j, cz + k, 0xd9a441);
  for (let j = 0; j < 8; j++) s.put(cx, vi(8) + 14 + j, cz, 0xd9a441);
  for (let i = -2; i <= 2; i++) s.put(cx + i, vi(8) + 19, cz, 0xd9a441);
  ctx.idle.push([x + 4, 0.25, z + 11]);
}

function marketStalls(ctx: Ctx, x: number, z: number) {
  if (!ctx.plan.take(x, z, x + 14, z + 5)) return;
  const s = ctx.s;
  for (let n = 0; n < 4; n++) {
    const sx = x + n * 3.5, c = pick([0xe2604a, 0x3b7fbf, 0x6f9a5a, 0xe8a84a], n, 1, 1);
    s.fill(sx, 0, z + 1, sx + 2.75, 0.75, z + 2, C.plank);
    s.fill(sx + 0.25, 0.75, z + 1.25, sx + 2.5, 1, z + 1.75, (i) => pick(C.flowers, i, 2, n));
    for (const dx of [0, 2.5]) s.fill(sx + dx, 0, z + 2.5, sx + dx + 0.25, 2.25, z + 2.75, C.wood2);
    s.fill(sx - 0.25, 2.25, z + 0.75, sx + 3, 2.5, z + 3, (i) => (i % 2 ? c : C.white));
    ctx.idle.push([sx + 1.25, 0.25, z + 3.5]);
  }
}

function portCranes(ctx: Ctx, X: (x: number) => number) {
  const s = ctx.s;
  for (const cx of [-30, 0, 30]) {
    const x = X(cx), z = -42;
    for (const [dx, dz] of [[0, 0], [4, 0]]) {
      for (let j = 0; j < vi(10); j++) { s.put(vi(x + dx), j, vi(z + dz), 0xe2604a); s.put(vi(x + dx), j, vi(z + dz) - 8, 0xe2604a); }
    }
    for (let i = -6; i < vi(6) + 30; i++) { s.put(vi(x) + i, vi(10), vi(z) - 4, 0xe2604a); s.put(vi(x) + i, vi(10), vi(z) - 3, 0xe2604a); }
    s.fill(x + 0.5, 10, z - 1.5, x + 3, 11.5, z, 0xf2c230);
    for (let j = vi(5); j < vi(10); j++) s.put(vi(x + 6), j, vi(z) - 3, 0x2a2a30);
    s.fill(x + 5.5, 4.5, z - 1.25, x + 6.75, 5, z - 0.5, 0x40404a);
  }
  // штабеля контейнеров на причале
  const cols = [0xe2604a, 0x3b7fbf, 0x3f8a3f, 0xe8a84a, 0x8a3a3a, 0x5a6a7a];
  for (let x = -54; x < 56; x += 7) {
    if (x > -36 && x < -24) continue;
    const n = 1 + Math.floor(hash(x, 1, 2) * 3);
    for (let lvl = 0; lvl < n; lvl++) for (let row = 0; row < 2; row++)
      s.block(X(x), lvl * 1.25, -38 + row * 1.5 - 1.5, X(x + 6), lvl * 1.25 + 1.2, -38 + row * 1.5 - 0.1, pick(cols, x + lvl, row, 3));
  }
  ctx.plan.mark(X(-60), -40, X(60), -34);
}

function factory(ctx: Ctx, x: number, z: number) {
  if (!ctx.plan.take(x - 1, z - 1, x + 21, z + 12)) return;
  const s = ctx.s;
  s.fill(x, 0, z, x + 20, 5, z + 10, (i) => (i % 2 ? 0xa89880 : 0x988a72));
  for (let u = 0; u < 20; u += 4) for (let l = 0; l < 5; l++) s.fill(x + u + l * 0.5, 5 + l * 0.25, z, x + u + 4 - (l > 3 ? 0 : 0), 5.25 + l * 0.25, z + 10, l === 4 ? 0x9cc6cf : 0x7a7a82);
  for (const dx of [3, 8]) {
    for (let j = 0; j < vi(16); j++) for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) if (i === 0 || i === 3 || k === 0 || k === 3) s.put(vi(x + dx) + i, j, vi(z - 3) + k, Math.floor(j / 6) % 2 ? 0xe2604a : C.white);
    ctx.smoke.push([x + dx + 0.5, 16.25, z - 2.5]);
    ctx.smoke.push([x + dx + 0.5, 16.25, z - 2.5]);
  }
  for (let u = 1; u < 19; u += 2) s.fill(x + u, 2, z + 10, x + u + 1, 3.5, z + 10.25, C.lit, true);
}

function university(ctx: Ctx, x: number, z: number) {
  if (!ctx.plan.take(x - 12, z - 1, x + 13, z + 18)) return;
  const f = new Frame(ctx.s, x - 12, z, 24, 10, 'pz');
  f.fill(0, 0, 0, 24, 9, 9, (_i, j) => (j < 4 ? 0xc8b89a : 0xe8d8b0));
  f.fill(-0.25, 9, -0.25, 24.25, 9.5, 9.25, C.white);
  f.fill(8, 9.5, 2, 16, 13, 8, 0xe8d8b0);
  f.fill(7.75, 13, 1.75, 16.25, 13.5, 8.25, C.white);
  f.fill(11.5, 13.5, 4.5, 12.5, 17, 5.5, 0xd9a441);
  for (let u = 1; u < 23.5; u += 1.5) for (let fl = 0; fl < 3; fl++) f.fill(u, 1.5 + fl * 2.5, 9, u + 0.75, 3 + fl * 2.5, 9.25, ctx.r() > 0.5 ? C.lit : C.glass, true);
  f.fill(8, 0, 9, 16, 0.5, 11, C.stone[2]);
  for (let u = 8.5; u < 16; u += 1.5) f.fill(u, 0.5, 10.25, u + 0.5, 6, 10.75, C.white);
  f.fill(8, 6, 9, 16, 6.5, 11, C.white);
  ctx.s.fill(x - 12, 0, z + 11.5, x + 12, 0.25, z + 18, (i, _j, k) => ((i + k) % 4 ? 0xd8d0c0 : 0xc8c0b0));
  for (let dx = -10; dx < 12; dx += 5) tree(ctx.s, 'maple', x + dx, z + 14, 3);
  ctx.idle.push([x - 4, 0.25, z + 12.5], [x + 2, 0.25, z + 13], [x + 6, 0.25, z + 12.5]);
  ctx.pens.push({ kind: 'pigeon', x0: x - 10, z0: z + 12, x1: x + 10, z1: z + 17, n: 5 });
}

function stadium(ctx: Ctx, x: number, z: number) {
  if (!ctx.plan.take(x - 1, z - 1, x + 25, z + 15)) return;
  const s = ctx.s;
  s.fill(x, 0, z, x + 24, 0.25, z + 14, 0xb8603a);
  s.fill(x + 2, 0.25, z + 2, x + 22, 0.3, z + 12, (i) => (Math.floor(i / 8) % 2 ? 0x6faa4a : 0x64a043));
  s.fill(x + 11.9, 0.3, z + 2, x + 12.1, 0.35, z + 12, C.white);
  for (const dx of [2, 21.5]) { s.fill(x + dx, 0.3, z + 5.5, x + dx + 0.25, 2, z + 5.75, C.white); s.fill(x + dx, 0.3, z + 8.25, x + dx + 0.25, 2, z + 8.5, C.white); s.fill(x + dx, 1.75, z + 5.5, x + dx + 0.25, 2, z + 8.5, C.white); }
  for (let l = 0; l < 4; l++) s.fill(x, 0.25 + l * 0.5, z + 14 + l * 0.75, x + 24, 0.75 + l * 0.5, z + 14.75 + l * 0.75, (i) => (i % 3 ? 0x3b7fbf : 0xe2604a));
  for (let n = 0; n < 6; n++) ctx.idle.push([x + 4 + n * 3.5, 0.25, z + 5 + (n % 3) * 2]);
}

function belfry(ctx: Ctx, x: number, z: number) {
  if (!ctx.plan.take(x - 1, z - 1, x + 7, z + 7)) return;
  const s = ctx.s;
  s.fill(x, 0, z, x + 6, 6, z + 6, 0xf6f2ea);
  s.fill(x + 0.5, 6, z + 0.5, x + 5.5, 10, z + 5.5, 0xf0e8d8);
  s.clear(x + 1.5, 7.5, z + 0.5, x + 4.5, 9.5, z + 5.5);
  s.clear(x + 0.5, 7.5, z + 1.5, x + 5.5, 9.5, z + 4.5);
  s.fill(x + 2.5, 8, z + 2.5, x + 3.5, 9, z + 3.5, 0xd9a441); // колокол
  s.fill(x + 1, 10, z + 1, x + 5, 12, z + 5, 0xf0e8d8);
  for (let l = 0; l < 10; l++) s.fill(x + 1.25 + l * 0.18, 12 + l * 0.5, z + 1.25 + l * 0.18, x + 4.75 - l * 0.18, 12.5 + l * 0.5, z + 4.75 - l * 0.18, 0x5f8a6a);
  s.fill(x + 2.875, 17, z + 2.875, x + 3.125, 19, z + 3.125, 0xd9a441);
  s.fill(x + 2, 0, z + 6, x + 4, 3, z + 6.25, C.wood);
  ctx.pens.push({ kind: 'pigeon', x0: x - 4, z0: z + 6, x1: x + 10, z1: z + 12, n: 5 });
}

function tradeRows(ctx: Ctx, x: number, z: number) {
  if (!ctx.plan.take(x, z, x + 22, z + 7)) return;
  const f = new Frame(ctx.s, x, z, 22, 6, 'nz');
  f.fill(0, 0, 0, 22, 4, 4, 0xf2e2b0);
  f.fill(-0.25, 4, -0.25, 22.25, 4.5, 4.25, C.white);
  f.fill(0, 4.5, 0.5, 22, 5.25, 3.5, 0x5f8a6a);
  for (let u = 0.5; u < 21.5; u += 2) {
    f.fill(u, 0, 4, u + 0.5, 3.5, 5.5, C.white);
    f.fill(u + 0.75, 0.25, 4, u + 1.75, 2.5, 4.25, C.lit, ctx.r() > 0.3);
  }
  f.fill(0, 3.5, 4, 22, 4, 5.5, C.white);
}

function hqTower(ctx: Ctx, x: number, z: number) {
  if (!ctx.plan.take(x - 1, z - 1, x + 13, z + 13)) return;
  const f = new Frame(ctx.s, x, z, 12, 12, 'pz');
  f.block(0, 0, 0, 12, 50, 12, 0x2a3450);
  for (let y = 2; y < 50; y += 2.5) f.block(-0.1, y, -0.1, 12.1, y + 0.2, 12.1, 0x5a6a90);
  for (let y = 2.5; y < 48; y += 2.5) {
    const n = hash(1, vi(y), 7);
    if (n > 0.3) f.block(1 + n * 6, y + 0.5, 12.05, 4 + n * 6, y + 1.8, 12.15, C.lit, true);
    if (n < 0.6) f.block(-0.15, y + 0.5, 2 + n * 5, -0.05, y + 1.8, 5 + n * 5, C.lit, true);
  }
  f.block(2, 50, 2, 10, 54, 10, 0x34406a);
  f.block(5.75, 54, 5.75, 6.25, 62, 6.25, 0xd8dce4);
  f.block(1, 46, 12.1, 11, 48.5, 12.4, 0xd84a3a, true); // красная вывеска «Всё схвачено»
  f.block(-1, 0, 12, 13, 0.25, 15, 0xd8d0c0);
}

function fountain(ctx: Ctx, x: number, z: number) {
  if (!ctx.plan.take(x - 7, z - 6, x + 7, z + 7)) return;
  const s = ctx.s, cx = vi(x), cz = vi(z);
  s.fill(x - 7, 0, z - 6, x + 7, 0.25, z + 7, (i, _j, k) => ((i + k) % 4 ? 0xe0d8c8 : 0xd0c8b8));
  for (let i = -18; i <= 18; i++) for (let k = -18; k <= 18; k++) {
    const d = Math.hypot(i, k);
    if (d <= 16) s.put(cx + i, 1, cz + k, d > 14.5 ? C.stone[2] : 0x5fa8c8);
  }
  for (let j = 1; j < 10; j++) s.putGlow(cx, j, cz, 0xcfeaf6);
  for (let i = -3; i <= 3; i++) for (let k = -3; k <= 3; k++) if (Math.hypot(i, k) < 3) s.putGlow(cx + i, 2 + (Math.hypot(i, k) < 2 ? 1 : 0), cz + k, 0xcfeaf6);
  for (const [dx, dz] of [[-6, -5], [6, -5], [-6, 6], [6, 6]]) flowerbed(s, x + dx - 1, z + dz - 0.5, 2, 1);
  for (const dx of [-5, 3]) { bench(new Frame(s, x + dx, z + 5.5, 1.5, 0.5, 'nz'), 0, 0); ctx.idle.push([x + dx + 0.75, 0.25, z + 5.75]); }
  ctx.pens.push({ kind: 'pigeon', x0: x - 6, z0: z - 5, x1: x + 6, z1: z + 6, n: 6 });
}

function station(ctx: Ctx, X: (x: number) => number) {
  const s = ctx.s;
  // вокзал с часовой башней
  const x = X(-6), z = -46;
  if (ctx.plan.take(x - 1, z - 1, x + 25, z + 11)) {
    s.fill(x, 0, z, x + 24, 6, z + 8, (_i, j) => (j < 4 ? 0xc8a878 : 0xe8d0a0));
    s.fill(x - 0.25, 6, z - 0.25, x + 24.25, 6.5, z + 8.25, C.white);
    s.fill(x, 6.5, z + 1, x + 24, 7.5, z + 7, 0x7a5a4a);
    s.fill(x + 9.5, 0, z + 2, x + 14.5, 13, z + 7, 0xe8d0a0);
    s.fill(x + 9.25, 13, z + 1.75, x + 14.75, 13.5, z + 7.25, C.white);
    for (let l = 0; l < 6; l++) s.fill(x + 9.75 + l * 0.4, 13.5 + l * 0.5, z + 2.25 + l * 0.4, x + 14.25 - l * 0.4, 14 + l * 0.5, z + 6.75 - l * 0.4, 0x5f8a6a);
    const cx = vi(x + 12), cy = vi(10.5);
    for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) if (Math.hypot(i, j) <= 4) s.putGlow(cx + i, cy + j, vi(z + 7), Math.hypot(i, j) > 3.3 ? 0x2b3340 : 0xfaf6e6);
    s.put(cx, cy + 1, vi(z + 7) + 1, 0x2b3340); s.put(cx, cy + 2, vi(z + 7) + 1, 0x2b3340); s.put(cx + 1, cy, vi(z + 7) + 1, 0x2b3340);
    for (let u = 1; u < 23; u += 2) if (u < 9 || u > 15) s.fill(x + u, 1.5, z + 8, x + u + 1, 4.5, z + 8.25, C.lit, true);
    s.fill(x + 10.5, 0, z + 8, x + 13.5, 3.5, z + 8.25, C.wood);
    s.fill(x + 4, 0, z + 8.5, x + 20, 0.25, z + 11, 0xd8d0c0);
    for (let n = 0; n < 5; n++) ctx.idle.push([x + 5 + n * 3, 0.25, z + 9.5]);
  }
  // пути и поезд вдоль всего района
  const rz = -54;
  for (let xx = -60; xx < 60; xx += 1) s.fill(X(xx), 0, rz - 0.5, X(xx + 0.5), 0.25, rz + 3.5, 0x6b5a48);
  s.block(X(-60), 0.25, rz, X(60), 0.4, rz + 0.25, 0x8a8a92);
  s.block(X(-60), 0.25, rz + 2.75, X(60), 0.4, rz + 3, 0x8a8a92);
  s.block(X(-60), 0, rz - 1, X(60), 0.2, rz + 4, 0x9a9080);
  for (let n = 0; n < 5; n++) {
    const tx = X(-30 + n * 9);
    s.block(tx, 0.5, rz - 0.25, tx + 8.5, 3.25, rz + 3.25, n === 0 ? 0xb83a3a : 0x3f6a4a);
    s.block(tx, 3.25, rz, tx + 8.5, 3.6, rz + 3, 0x5a5a62);
    for (let w = 0.75; w < 8; w += 1.5) s.block(tx + w, 1.75, rz + 3.25, tx + w + 0.75, 2.5, rz + 3.3, C.lit, true);
  }
  ctx.plan.mark(X(-62), rz - 2, X(62), rz + 5);
  // перрон
  s.block(X(-30), 0, rz + 4, X(18), 0.5, rz + 6, 0xc8c0b0);
  for (let n = 0; n < 4; n++) ctx.idle.push([X(-24 + n * 10), 0.5, rz + 5]);
}

function solarField(ctx: Ctx, x: number, z: number) {
  if (!ctx.plan.take(x - 16, z - 1, x + 16, z + 14)) return;
  for (let row = 0; row < 4; row++) for (let col = 0; col < 6; col++) {
    const px = x - 15 + col * 5, pz = z + row * 3.5;
    ctx.s.fill(px + 1.875, 0, pz + 1, px + 2.125, 0.75, pz + 1.25, 0x8a8a92);
    for (let l = 0; l < 4; l++) ctx.s.block(px, 0.75 + l * 0.25, pz + l * 0.5, px + 4, 1 + l * 0.25, pz + 0.5 + l * 0.5, 0x2a4a7a);
  }
}

function windTurbines(ctx: Ctx, X: (x: number) => number) {
  for (const [x, z] of [[-40, -56], [36, -60], [52, -48]]) {
    const wx = X(x);
    if (!ctx.plan.take(wx - 1, z - 1, wx + 2, z + 2)) continue;
    ctx.s.block(wx - 0.3, 0, z - 0.3, wx + 0.3, 18, z + 0.3, 0xf2f4f6);
    ctx.s.block(wx - 0.5, 17.6, z - 0.5, wx + 0.5, 18.4, z + 1, 0xe8eaec);
    const b = new VoxelStore();
    for (let a = 0; a < 3; a++) {
      const ang = (a * 2 * Math.PI) / 3;
      for (let n = 1; n < 32; n++) b.put(Math.round(Math.cos(ang) * n), Math.round(Math.sin(ang) * n), 0, 0xf6f6f6);
    }
    ctx.anim.push({ kind: 'spin', store: b, x: wx, y: 18, z: z + 1.1, axis: 'z', speed: 1.3 });
  }
}

function ferrisWheel(ctx: Ctx, x: number, z: number) {
  if (!ctx.plan.take(x - 8, z - 2, x + 8, z + 3)) return;
  const s = ctx.s;
  for (const dz of [0, 1.75]) for (let j = 0; j < vi(10); j++) { s.put(vi(x) - Math.floor(j / 3), j, vi(z + dz), 0xd8dce4); s.put(vi(x) + Math.floor(j / 3), j, vi(z + dz), 0xd8dce4); }
  const w = new VoxelStore(), R = 30;
  for (let a = 0; a < 360; a += 1.5) {
    const t = (a * Math.PI) / 180;
    w.put(Math.round(Math.cos(t) * R), Math.round(Math.sin(t) * R), 0, 0xe8eaec);
    w.put(Math.round(Math.cos(t) * R), Math.round(Math.sin(t) * R), 6, 0xe8eaec);
  }
  for (let n = 0; n < 12; n++) {
    const t = (n / 12) * Math.PI * 2;
    for (let q = 0; q < R; q += 1) { w.put(Math.round(Math.cos(t) * q), Math.round(Math.sin(t) * q), 0, 0xd8dce4); }
    const cx = Math.round(Math.cos(t) * R), cy = Math.round(Math.sin(t) * R);
    const c = pick([0xe2604a, 0x3bb0b0, 0xf2c230, 0x7a5ea8], n, 1, 1);
    for (let i = -2; i <= 2; i++) for (let j = -4; j <= 0; j++) for (let k = 1; k <= 5; k++) w.put(cx + i, cy + j, k, j === -2 && Math.abs(i) < 2 ? 0xfff2c8 : c);
  }
  for (let k = 0; k <= 6; k++) w.put(0, 0, k, 0x8a8a92);
  ctx.anim.push({ kind: 'spin', store: w, x, y: 10, z: z + 0.125, axis: 'z', speed: 0.12 });
}

function mountain(ctx: Ctx, X: (x: number) => number) {
  const s = ctx.s, cx = X(10), cz = -80;
  // гора ступенями: снизу лес и камень, сверху снег
  for (let l = 0; l < 16; l++) {
    const r = 46 - l * 2.7, y = l * 2.2;
    for (let q = 0; q < 6; q++) {
      const a = (q / 6) * Math.PI * 2 + l * 0.4;
      const ox = Math.cos(a) * r * 0.25, oz = Math.sin(a) * r * 0.2;
      const c = l > 10 ? 0xf4f6f8 : l > 7 ? (q % 2 ? 0xe8ecf0 : 0x9a958c) : l > 3 ? 0x8a857c : 0x5f7a52;
      s.block(cx + ox - r * 0.8, y, cz + oz - r * 0.6, cx + ox + r * 0.8, y + 2.2, cz + oz + r * 0.6, c);
    }
  }
  ctx.plan.mark(cx - 50, cz - 40, cx + 50, cz + 40);
  // канатная дорога от подножия к вершине
  const x0 = X(26), z0 = -40, x1 = cx + 4, z1 = cz + 6, y1 = 34;
  for (let t = 0; t <= 1; t += 0.004) {
    const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, y = 6 + (y1 - 6) * t - Math.sin(t * Math.PI) * 3;
    s.put(vi(x), vi(y), vi(z), 0x2a2a30);
  }
  for (const t of [0, 0.35, 0.7]) {
    const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    const h = 6 + (y1 - 6) * t - Math.sin(t * Math.PI) * 3;
    s.block(x - 0.25, t ? (t > 0.5 ? 18 : 8) : 0, z - 0.25, x + 0.25, h, z + 0.25, 0x6a6a72);
  }
  for (const t of [0.15, 0.5, 0.85]) {
    const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, y = 6 + (y1 - 6) * t - Math.sin(t * Math.PI) * 3;
    s.fill(x - 0.5, y - 2, z - 0.5, x + 0.5, y - 0.75, z + 0.5, 0xe2604a);
    s.put(vi(x), vi(y - 0.5), vi(z), 0x2a2a30);
  }
  // станция внизу и снег вокруг
  s.fill(x0 - 2, 0, z0 - 2, x0 + 2, 3, z0 + 2, (i, j, k) => pick(C.log, i, j, k));
  s.fill(x0 - 2.5, 3, z0 - 2.5, x0 + 2.5, 3.5, z0 + 2.5, 0x8a4a3a);
  ctx.plan.mark(x0 - 3, z0 - 3, x0 + 3, z0 + 3);
  for (let n = 0; n < 40; n++) {
    const x = X(-50 + hash(n, 3, 1) * 100), z = -36 - hash(n, 4, 1) * 20;
    s.fill(x, 0, z, x + 1 + hash(n, 5, 1) * 3, 0.25, z + 1 + hash(n, 6, 1) * 2, 0xf4f6f8);
  }
}

function barrier(ctx: Ctx, x: number, z: number) {
  const s = ctx.s;
  s.fill(x, 0, z - 1, x + 1.5, 2.5, z, 0xd8d0c0);
  s.fill(x + 0.25, 0.5, z - 0.75, x + 1.25, 1.5, z - 0.25, C.lit, true);
  s.fill(x + 0.5, 1, z + 0.25, x + 0.75, 1.25, z + 6, (_i, _j, k) => (k % 4 < 2 ? 0xe2604a : C.white));
  s.fill(x - 0.5, 2.5, z - 1.5, x + 2, 2.75, z + 0.5, 0x2f6f62);
}

// ---------- сборка локации ----------

export interface Area {
  /** Половина ширины локации вдоль дороги. */
  half: number;
  city: boolean;
  /** До какого z на север идёт боковая улица. */
  sideTo: number;
}

/** Улица: стелы, остановка, столбы, лавочки, урны, машины у обочины. */
export function street(ctx: Ctx, X: (x: number) => number, t: Theme, a: Area) {
  const s = ctx.s, H = a.half;
  stela(s, X(-H + 1), 6.25, t.stela);
  stela(s, X(H - 3.5), -0.75, t.stela);
  if (!t.abandoned) busStop(ctx, new Frame(s, X(a.city ? 8 : 6), 6.25, 3, 1.5, 'nz'), t.stela);
  if (!a.city) powerLine(s, X(-H + 2), X(H - 2), 14, 12);
  else {
    trafficLight(s, X(-8.75), 0.25);
    trafficLight(s, X(-3.5), 5.25);
    for (let x = -H + 3; x < H - 3; x += 12) { bin(s, X(x), 0.25); bin(s, X(x + 6), 5.5); }
  }
  for (const [x, z] of [[-11, 0.25], [12, 5.5], [-20, 5.5]]) bin(s, X(x), z);
}

/** Дома и природа вокруг: ряды дворов к югу и северу, поля, лес на краю. */
export function surroundings(ctx: Ctx, X: (x: number) => number, t: Theme, a: Area) {
  const H = a.half, r = ctx.r;
  const rows: { z: number; d: number; face: Face; w: number }[] = a.city
    ? [{ z: 15, d: 9, face: 'nz', w: 10 }, { z: 27, d: 10, face: 'nz', w: 12 }, { z: -19, d: 9, face: 'pz', w: 10 }, { z: -32, d: 10, face: 'pz', w: 12 }]
    : [{ z: 15.5, d: 8, face: 'nz', w: 8 }, { z: 25, d: 8, face: 'nz', w: 8 }, { z: -17.5, d: 8, face: 'pz', w: 8 }, { z: -27, d: 8, face: 'pz', w: 8 }];
  for (const row of rows) {
    for (let x = -H; x + row.w <= H; x += row.w + (a.city ? 2 : 1)) {
      const w = row.w, x0 = X(x + 0.5);
      if (!ctx.plan.take(x0, row.z, x0 + w, row.z + row.d)) continue;
      if (t.crops && !a.city && Math.abs(row.z) > 20 && r() < 0.35) { field(ctx.s, x0 + 0.5, row.z + 0.5, w - 1, row.d - 1, pick(t.crops, vi(x0), 2, vi(row.z))); continue; }
      if (r() < (a.city ? 0.15 : 0.12)) { grove(ctx, t, x0, row.z, w, row.d); continue; }
      homestead(ctx, new Frame(ctx.s, x0, row.z, w, row.d, row.face), t, row.z > 0);
    }
  }
  // деревенская улочка вдоль южного ряда
  if (!a.city) ctx.s.fill(X(-H), 0, 13.75, X(H), 0.05, 15.25, (i, _j, k) => (hash(i, 6, k) > 0.7 ? 0x9cc46a : 0xc8b08a));
  // край локации: лес, луга, камни
  const n = Math.round((a.city ? 50 : 70) * t.wild + 12);
  for (let q = 0; q < n; q++) {
    const north = r() < 0.6;
    const x = X(-H - 6 + r() * (2 * H + 12)), z = north ? -36 - r() * 34 : (a.city ? 38 : 33) + r() * 18;
    if (!ctx.plan.take(x - 1, z - 1, x + 1.5, z + 1.5)) continue;
    const kind = pick(t.forest, vi(x), 7, vi(z));
    lowTree(ctx.s, kind, x, z, 2.8 + r() * 2.8);
  }
  for (let q = 0; q < 14; q++) {
    const x = X(-H + r() * 2 * H), z = r() < 0.5 ? -34 - r() * 20 : 32 + r() * 14;
    if (!ctx.plan.take(x - 1, z - 1, x + 1, z + 1)) continue;
    const k = r();
    if (k < 0.45) bush(ctx.s, x, z, 0.5 + r() * 0.5);
    else if (k < 0.75) flowers(ctx.s, x - 1, z - 1, 2, 2);
    else rock(ctx.s, x, z, 0.4 + r() * 0.4);
  }
  // кошки и собаки на улицах, голуби в городе
  for (const kind of new Set(t.animals)) {
    if (kind === 'hen' || kind === 'cow' || kind === 'goat' || kind === 'duck' || kind === 'gull') continue;
    ctx.pens.push({ kind, x0: X(-H + 4), z0: kind === 'pigeon' || kind === 'crow' ? 6.5 : -1, x1: X(H - 4), z1: kind === 'pigeon' || kind === 'crow' ? 13 : 0.5, n: kind === 'cat' ? 2 : kind === 'squirrel' ? 3 : 2 });
  }
  if (t.animals.includes('gull') && !t.sea) ctx.pens.push({ kind: 'gull', x0: X(-H), z0: -40, x1: X(H), z1: 20, n: 3 });
}

function grove(ctx: Ctx, t: Theme, x0: number, z0: number, w: number, d: number) {
  for (let n = 0; n < 3; n++) {
    const x = x0 + 1 + ctx.r() * (w - 2), z = z0 + 1 + ctx.r() * (d - 2);
    tree(ctx.s, pick(t.trees, vi(x), 4, vi(z)), x, z, 2.4 + ctx.r() * 1.5);
  }
  flowers(ctx.s, x0 + w / 2 - 1.5, z0 + d / 2 - 1, 3, 2);
  if (ctx.r() > 0.5) { bench(new Frame(ctx.s, x0 + w / 2 - 0.75, z0 + 0.5, 1.5, 0.5, 'pz'), 0, 0); ctx.idle.push([x0 + w / 2, 0.25, z0 + 0.75]); }
}

export { shade };

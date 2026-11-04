import * as THREE from 'three';
import { NICHES, VILLAGES } from '../sim';
import type { Point } from '../sim';
import { PLOT, type Slot } from './layout';
import { VoxelStore, hash, pick, vi, VS } from './voxels';
import { NICHE_ICON } from '../ui/icons';

/** Цвета хозяев: игрок — бирюза, Хваткин — красный, «Всё схвачено» в городе — тёмно-синий. */
export const OWNER = [0x2f6f62, 0xc8302a];
const CORP = 0x34406a;
/** Цвет хозяина точки с учётом города. */
const ownerColor = (p: Point) => (p.owner === 1 && VILLAGES.find((v) => v.id === p.village)?.city ? CORP : OWNER[p.owner]);
const SKIN = 0xf0c8a8;
const GLASS = 0xffd98f; // окна светятся вечером
const WOOD = 0x6b4a36;
const PEOPLE = [0x3b7fbf, 0xe8a84a, 0x7a5ea8, 0xd65a5a, 0x5a6a7a, 0x4f9a6a];

/** Три части здания: без крыши и фасада видно, что внутри. */
export interface BuildingMesh {
  group: THREE.Group;
  roof: THREE.Group;
  front: THREE.Group;
}

/** Отпечаток точки: здание перестраивается, только когда он меняется. */
export function pointSig(p: Point | null): string {
  if (!p) return 'free';
  const L = p.last;
  const queue = L && L.served > 0 ? Math.min(6, Math.round(L.qlost / 6)) : 0;
  return [p.owner, p.niche, p.seg, p.hall, p.staff, p.upgrades, p.forSale ? 1 : 0, p.closedDays > 0 ? 1 : 0, queue].join(':');
}

const wallOf = (seg: number) => (seg < 0 ? [0xd9d6cf, 0xcfccc4] : seg > 0 ? [0x5b4a44, 0x514039] : [0xf3e2c4, 0xead6b4]);

function person(s: VoxelStore, i: number, k: number, c: number, y = 0) {
  s.put(i, y, k, 0x3a3a48);
  s.put(i, y + 1, k, 0x3a3a48);
  s.put(i, y + 2, k, c);
  s.put(i, y + 3, k, c);
  s.put(i, y + 4, k, SKIN);
}

function sign(s: VoxelStore, x0: number, x1: number, y: number, z: number, c: number) {
  s.fill(x0, y, z, x1, y + 0.75, z + 0.25, c);
  for (let i = vi(x0 + 0.25); i < vi(x1 - 0.25); i++) if (i % 2 === 0) s.put(i, vi(y + 0.25), vi(z) - 1, 0xfaf2e6);
}

/** Пустой участок: земля, низкий забор и табличка «Сдаётся». */
function freeLot(b: VoxelStore) {
  b.fill(0.25, 0, 0.25, PLOT - 0.25, 0.25, PLOT - 0.25, (i, _j, k) => (hash(i, 7, k) > 0.85 ? 0x93bb60 : 0xb59a73));
  for (let x = 0.25; x < PLOT; x += 1) {
    b.fill(x, 0.25, 0.25, x + 0.25, 1, 0.5, WOOD);
    b.fill(x, 0.25, PLOT - 0.5, x + 0.25, 1, PLOT - 0.25, WOOD);
  }
  for (let z = 0.25; z < PLOT; z += 1) {
    b.fill(0.25, 0.25, z, 0.5, 1, z + 0.25, WOOD);
    b.fill(PLOT - 0.5, 0.25, z, PLOT - 0.25, 1, z + 0.25, WOOD);
  }
  b.fill(3.25, 0.25, PLOT - 1.25, 3.5, 1.75, PLOT - 1, WOOD);
  b.fill(2.25, 1.25, PLOT - 1.25, 4.5, 2.25, PLOT - 1, 0xfaf2e6);
  b.fill(2.5, 1.5, PLOT - 1.5, 4.25, 2, PLOT - 1.25, 0x2f6f62);
}

function coffee(p: Point, b: VoxelStore, r: VoxelStore, f: VoxelStore) {
  const w = [4, 5, 6, 7][p.hall];
  const x0 = (PLOT - w) / 2, x1 = x0 + w, z0 = 1, z1 = 5.75;
  const h = p.seg > 0 ? 3.5 : 3;
  const [wa, wb] = wallOf(p.seg);
  const acc = ownerColor(p);
  const wall = (_i: number, j: number) => (j % 3 === 0 ? wb : wa);
  // пол и стены (кроме фасада)
  b.fill(x0, 0, z0, x1, 0.25, z1, (i, _j, k) => ((i + k) % 2 ? 0xc9a27a : 0xb88f68));
  b.fill(x0, 0.25, z0, x1, h, z0 + 0.25, wall);
  b.fill(x0, 0.25, z0, x0 + 0.25, h, z1, wall);
  b.fill(x1 - 0.25, 0.25, z0, x1, h, z1, wall);
  // стойка и бариста
  b.fill(x0 + 0.5, 0.25, z0 + 1.25, x1 - 0.5, 0.75, z0 + 1.75, WOOD);
  b.fill(x0 + 0.5, 0.75, z0 + 1.25, x1 - 0.5, 1, z0 + 1.75, 0xe8e0d0);
  b.fill(x0 + 0.75, 1, z0 + 1.25, x0 + 1.25, 1.5, z0 + 1.75, 0x40404a); // кофемашина
  for (let n = 0; n < p.staff; n++) person(b, vi(x0 + 1.75 + n * 0.75), vi(z0 + 0.5), acc, 1);
  // столики: по одному на уровень зала
  for (let n = 0; n <= p.hall; n++) {
    const x = x0 + 0.75 + n * 1.5;
    if (x + 1 > x1) break;
    b.fill(x, 0.25, z0 + 3, x + 0.75, 0.75, z0 + 3.75, WOOD);
    b.fill(x - 0.25, 0.25, z0 + 3.25, x, 0.5, z0 + 3.5, 0x8a6a50);
  }
  // фасад: витрина, дверь, навес
  const k = vi(z1 - 0.25);
  for (let i = vi(x0); i < vi(x1); i++)
    for (let j = vi(0.25); j < vi(h); j++) {
      const di = i - vi(x0), win = j >= vi(0.75) && j < vi(2.5) && di > 1 && di < vi(w) - 1;
      const door = di >= 1 && di < 3 && j < vi(2.25);
      if (door) f.put(i, j, k, WOOD);
      else if (win) f.putGlow(i, j, k, GLASS);
      else f.put(i, j, k, j % 3 === 0 ? wb : wa);
    }
  for (let i = vi(x0 + 1); i < vi(x1 - 0.25); i++)
    for (let t = 0; t < 4; t++)
      f.put(i, vi(2.75) - Math.floor(t / 2), vi(z1) + t, Math.floor(i / 2) % 2 ? 0xfaf2e6 : acc);
  // крыша и вывеска-кружка
  r.fill(x0 - 0.25, h, z0 - 0.25, x1 + 0.25, h + 0.5, z1 + 0.25, (_i, j) => (j % 2 ? acc : 0x2a2a2a));
  sign(r, x0 + 1, x1 - 0.5, h + 0.5, z1 - 1, p.seg > 0 ? 0xd9a441 : 0xfaf2e6);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let q = 0; q < 3; q++)
    if (Math.hypot(i - 1.5, q - 1) < 1.9) r.put(vi(x0 + 0.25) + i, vi(h + 0.5) + j, vi(z0 + 1) + q, j === 3 ? 0x5a3b2c : 0xe8a84a);
  // терраса — третья прокачка кофейни
  if (p.upgrades >= 3) {
    b.fill(x0, 0, z1 + 0.25, x1, 0.25, PLOT - 0.25, 0xb88f68);
    for (let x = x0 + 0.5; x < x1 - 0.5; x += 2) b.fill(x, 0.25, z1 + 0.5, x + 0.5, 0.75, z1 + 1, 0xfaf2e6);
  }
}

function store(p: Point, b: VoxelStore, r: VoxelStore, f: VoxelStore) {
  const w = [5, 6, 6.5, 7][p.hall];
  const x0 = (PLOT - w) / 2, x1 = x0 + w, z0 = 0.75, z1 = 5.75, h = 3.25;
  const [wa, wb] = wallOf(p.seg);
  const acc = ownerColor(p);
  b.fill(x0, 0, z0, x1, 0.25, z1, (i, _j, k) => ((i + k) % 2 ? 0xe8e4dc : 0xd8d4cc));
  b.fill(x0, 0.25, z0, x1, h, z0 + 0.25, wa);
  b.fill(x0, 0.25, z0, x0 + 0.25, h, z1, wa);
  b.fill(x1 - 0.25, 0.25, z0, x1, h, z1, wa);
  // стеллажи с товаром
  const goods = [0xe2604a, 0xe8c870, 0x6f9a5a, 0x3b7fbf, 0xfaf2e6];
  for (let x = x0 + 0.5; x < x1 - 1; x += 1.25)
    b.fill(x, 0.25, z0 + 0.75, x + 0.5, 2, z0 + 3, (i, j, k) => (j % 3 === 0 ? 0x8a8a8a : pick(goods, i, j, k)));
  // касса и кассиры
  b.fill(x1 - 2, 0.25, z1 - 1.5, x1 - 0.5, 1, z1 - 1, 0x8a8a8a);
  for (let n = 0; n < p.staff; n++) person(b, vi(x1 - 1.75 + (n % 2) * 0.5), vi(z1 - 2 - Math.floor(n / 2) * 0.5), acc);
  if (p.upgrades >= 2) b.fill(x0 + 0.5, 0.25, z1 - 1.25, x0 + 1.5, 2.25, z1 - 0.5, 0xbfe0ee); // холодильник
  // фасад: стекло во всю ширину и полоса вывески
  const k = vi(z1 - 0.25);
  for (let i = vi(x0); i < vi(x1); i++)
    for (let j = vi(0.25); j < vi(h); j++) {
      const di = i - vi(x0);
      const glass = j < vi(2.25) && di > 0 && di < vi(w) - 1 && (di - 1) % 6 !== 5;
      if (glass) f.putGlow(i, j, k, GLASS);
      else f.put(i, j, k, j >= vi(2.25) ? acc : wb);
    }
  for (let i = vi(x0 + 0.5); i < vi(x1 - 0.5); i++) if (i % 3) f.put(i, vi(2.5), k + 1, 0xfaf2e6);
  r.fill(x0 - 0.25, h, z0 - 0.25, x1 + 0.25, h + 0.25, z1 + 0.25, 0x8c8a86);
  if (p.upgrades >= 3) r.fill(x0 + 0.5, h + 0.25, z0 + 0.5, x0 + 2.5, h + 1, z0 + 1.5, 0x3b7fbf); // доставка: фургон-вывеска
}

function wash(p: Point, b: VoxelStore, r: VoxelStore, f: VoxelStore) {
  const bays = p.hall + 1;
  const bw = 1.5, w = bays * bw + 0.5;
  const x0 = (PLOT - w) / 2, z0 = 1, z1 = 5.5, h = 3;
  const acc = ownerColor(p);
  b.fill(x0, 0, z0, x0 + w, 0.25, PLOT - 0.25, 0x9a9aa2);
  for (let n = 0; n <= bays; n++) b.fill(x0 + n * bw, 0.25, z0, x0 + n * bw + 0.5, h, z1, 0xd9d6cf);
  b.fill(x0, 0.25, z0, x0 + w, h, z0 + 0.25, 0xd9d6cf);
  const cars = [0xe9e2d6, 0x3b7fbf, 0xe8a84a, 0x2b3340];
  for (let n = 0; n < Math.min(bays, p.staff + 1); n++) {
    const cx = x0 + n * bw + 0.5;
    b.fill(cx + 0.125, 0.25, z0 + 1, cx + 0.875, 0.75, z0 + 3.25, cars[n % 4]);
    b.fill(cx + 0.125, 0.75, z0 + 1.5, cx + 0.875, 1, z0 + 2.75, 0x9cc6cf);
  }
  for (let n = 0; n < p.staff; n++) person(b, vi(x0 + n * bw + 0.5), vi(z0 + 3.75), acc);
  f.fill(x0, h - 0.75, z1 - 0.25, x0 + w, h, z1, acc);
  for (let i = vi(x0); i < vi(x0 + w); i++) if (i % 4 === 0) f.putGlow(i, vi(h - 0.5), vi(z1), GLASS);
  r.fill(x0 - 0.25, h, z0 - 0.25, x0 + w + 0.25, h + 0.25, z1 + 0.25, 0x5f6a7a);
  sign(r, x0 + 0.5, x0 + w - 0.5, h + 0.25, z1 - 0.75, 0xfaf2e6);
}

/** Простая коробка-зал для новых ниш: пол, три стены, фасад с дверью и окнами, крыша. */
function hallBox(p: Point, b: VoxelStore, r: VoxelStore, f: VoxelStore, o: {
  w: number; z0?: number; z1?: number; h?: number; floor: [number, number]; wall?: [number, number]; roof: number | ((i: number, j: number, k: number) => number);
  awning?: number; pitched?: boolean;
}) {
  const w = Math.min(7, o.w), x0 = (PLOT - w) / 2, x1 = x0 + w, z0 = o.z0 ?? 1, z1 = o.z1 ?? 5.75, h = o.h ?? 3;
  const [wa, wb] = o.wall ?? wallOf(p.seg);
  const acc = ownerColor(p);
  b.fill(x0, 0, z0, x1, 0.25, z1, (i, _j, k) => ((i + k) % 2 ? o.floor[0] : o.floor[1]));
  const wall = (_i: number, j: number) => (j % 3 === 0 ? wb : wa);
  b.fill(x0, 0.25, z0, x1, h, z0 + 0.25, wall);
  b.fill(x0, 0.25, z0, x0 + 0.25, h, z1, wall);
  b.fill(x1 - 0.25, 0.25, z0, x1, h, z1, wall);
  const k = vi(z1 - 0.25);
  for (let i = vi(x0); i < vi(x1); i++)
    for (let j = vi(0.25); j < vi(h); j++) {
      const di = i - vi(x0);
      const door = di >= 2 && di < 4 && j < vi(2.25);
      const win = j >= vi(0.75) && j < vi(2.25) && di > 5 && di < vi(w) - 1 && di % 4 !== 1;
      if (door) f.put(i, j, k, WOOD);
      else if (win) f.putGlow(i, j, k, GLASS);
      else f.put(i, j, k, j % 3 === 0 ? wb : wa);
    }
  if (o.awning != null)
    for (let i = vi(x0 + 0.5); i < vi(x1 - 0.25); i++)
      for (let t = 0; t < 4; t++) f.put(i, vi(2.75) - Math.floor(t / 2), vi(z1) + t, Math.floor(i / 2) % 2 ? 0xfaf2e6 : o.awning || acc);
  if (o.pitched) {
    for (let l = 0; l * VS < (z1 - z0) / 2 + 0.3; l++) {
      const a = z0 - 0.25 + l * VS, c = z1 + 0.25 - l * VS;
      if (c <= a) break;
      r.fill(x0 - 0.25, h + l * VS, a, x1 + 0.25, h + (l + 1) * VS, c, typeof o.roof === 'number' ? (l % 3 ? o.roof : acc) : o.roof);
    }
  } else r.fill(x0 - 0.25, h, z0 - 0.25, x1 + 0.25, h + 0.25, z1 + 0.25, o.roof);
  return { x0, x1, z0, z1, h, acc };
}

/** Фермерская лавка: деревянный навес, ящики с овощами у входа. */
function farm(p: Point, b: VoxelStore, r: VoxelStore, f: VoxelStore) {
  const { x0, x1, z1, h, acc } = hallBox(p, b, r, f, { w: 4.5 + p.hall * 0.75, floor: [0xb88f68, 0xa8805c], wall: [0xc9a27a, 0xb88f68], roof: 0x6b8a4a, pitched: true });
  const veg = [0xe2604a, 0xe8a84a, 0x6f9a5a, 0xd9c070, 0x8a4a7a];
  for (let x = x0 + 0.25, n = 0; x < x1 - 0.75; x += 1, n++) {
    b.fill(x, 0, z1 + 0.25, x + 0.75, 0.5, z1 + 1, WOOD);
    b.fill(x + 0.25, 0.5, z1 + 0.5, x + 0.5, 0.75, z1 + 0.75, veg[n % veg.length]);
    b.fill(x, 0.5, z1 + 0.25, x + 0.25, 0.75, z1 + 0.5, veg[(n + 2) % veg.length]);
  }
  for (let n = 0; n < p.staff; n++) person(b, vi(x0 + 1 + n * 0.75), vi(z1 - 1.5), acc);
  sign(r, x0 + 0.75, x1 - 0.75, h + 1.25, z1 - 0.5, 0x6f9a5a);
  if (p.upgrades >= 1) b.fill(x1 - 1.5, 0.25, 1.5, x1 - 0.5, 2, 2.5, 0xbfe0ee); // холодильная камера
}

/** Пекарня: тёплая витрина, печь с трубой, багет на вывеске. */
function bakery(p: Point, b: VoxelStore, r: VoxelStore, f: VoxelStore) {
  const { x0, x1, z0, z1, h, acc } = hallBox(p, b, r, f, { w: 4.5 + p.hall * 0.75, floor: [0xe8d8c0, 0xdccab0], roof: 0x8a4a3a, awning: 0xd9a441, pitched: true });
  b.fill(x0 + 0.5, 0.25, z0 + 0.5, x0 + 2, 1.75, z0 + 1.5, 0x9a5a3a); // печь
  b.fill(x0 + 0.75, 0.5, z0 + 1.5, x0 + 1.75, 1, z0 + 1.75, 0xffa64a, true);
  r.fill(x0 + 0.75, h, z0 + 0.5, x0 + 1.25, h + 2, z0 + 1, 0x7a4a3a); // труба
  b.fill(x0 + 2.5, 0.25, z1 - 2, x1 - 0.5, 1, z1 - 1.5, 0xe8e0d0);
  for (let x = x0 + 2.75; x < x1 - 0.75; x += 0.5) b.put(vi(x), vi(1), vi(z1 - 1.75), 0xd9a441);
  for (let n = 0; n < p.staff; n++) person(b, vi(x0 + 3 + n * 0.75), vi(z1 - 2.75), acc);
  r.fill(x1 - 2.5, h + 1.25, z1 - 0.75, x1 - 0.5, h + 1.75, z1 - 0.5, 0xd9a441);
}

/** Гостевой дом: два этажа, балкон, номера светятся вечером. */
function guesthouse(p: Point, b: VoxelStore, r: VoxelStore, f: VoxelStore) {
  const h = 5.5;
  const { x0, x1, z1, acc } = hallBox(p, b, r, f, { w: 5 + p.hall * 0.5, h, z0: 0.75, floor: [0xc9a27a, 0xb88f68], wall: [0xf1e4cc, 0xe6d6b8], roof: 0x3b6f8f, pitched: true });
  for (let i = vi(x0 + 0.5); i < vi(x1 - 0.5); i++)
    for (let j = vi(3.25); j < vi(4.75); j++) if ((i - vi(x0)) % 5 > 1) f.putGlow(i, j, vi(z1 - 0.25), GLASS);
  f.fill(x0 + 0.5, 3, z1, x1 - 0.5, 3.25, z1 + 0.75, WOOD); // балкон
  for (let x = x0 + 0.5; x < x1 - 0.5; x += 0.5) f.fill(x, 3.25, z1 + 0.5, x + 0.25, 3.75, z1 + 0.75, WOOD);
  b.fill(x0 + 0.5, 0.25, 2, x0 + 2, 1, 2.5, WOOD); // стойка ресепшена
  for (let n = 0; n < p.staff; n++) person(b, vi(x0 + 0.75 + n * 0.75), vi(1.5), acc);
  b.fill(x0, 0, z1 + 0.25, x1, 0.25, PLOT - 0.25, 0xd9c7a0);
}

/** Курортное кафе: открытая веранда с зонтиками. */
function resortCafe(p: Point, b: VoxelStore, r: VoxelStore, f: VoxelStore) {
  const { x0, x1, z1, h, acc } = hallBox(p, b, r, f, { w: 4 + p.hall * 0.5, z1: 4, h: 2.75, floor: [0xe8dcc0, 0xdccfb0], wall: [0xfaf2e6, 0xeee2cc], roof: 0x3bb0b0, awning: 0x3bb0b0 });
  b.fill(0.25, 0, z1 + 0.25, PLOT - 0.25, 0.25, PLOT - 0.25, (i, _j, k) => ((i + k) % 2 ? 0xd9b77a : 0xcfa96a));
  const n = 1 + Math.min(3, p.hall + 1);
  for (let q = 0; q < n; q++) {
    const x = 0.75 + q * 1.6;
    b.fill(x + 0.25, 0.25, z1 + 1.25, x + 0.5, 2, z1 + 1.5, 0xfaf2e6);
    b.fill(x - 0.5, 2, z1 + 0.5, x + 1.25, 2.25, z1 + 2.25, q % 2 ? 0xe2604a : 0x3bb0b0);
    b.fill(x - 0.25, 0.25, z1 + 1, x + 1, 0.75, z1 + 1.75, WOOD);
  }
  for (let m = 0; m < p.staff; m++) person(b, vi(x0 + 0.75 + m * 0.75), vi(z1 - 1.5), acc);
  sign(r, x0 + 0.5, x1 - 0.5, h + 0.25, z1 - 0.75, 0xfaf2e6);
}

/** Рыбная лавка: синий полосатый навес, лёд и рыба на прилавке. */
function fish(p: Point, b: VoxelStore, r: VoxelStore, f: VoxelStore) {
  const { x0, x1, z1, h, acc } = hallBox(p, b, r, f, { w: 4 + p.hall * 0.75, floor: [0xd8dce0, 0xc8ccd2], wall: [0xdfe6ea, 0xcfd8de], roof: 0x5f6a7a, awning: 0x3b6f9f });
  b.fill(x0 + 0.5, 0.25, z1 - 2, x1 - 0.5, 1, z1 - 1.25, 0xbfe0ee);
  for (let x = x0 + 0.75; x < x1 - 0.75; x += 0.75) b.fill(x, 1, z1 - 1.75, x + 0.5, 1.25, z1 - 1.5, hash(vi(x), 1, 3) > 0.5 ? 0x9aa8b4 : 0xe8a090);
  for (let n = 0; n < p.staff; n++) person(b, vi(x0 + 1 + n * 0.75), vi(z1 - 2.75), acc);
  sign(r, x0 + 0.5, x1 - 0.5, h + 0.25, z1 - 0.75, 0x3b6f9f);
}

/** Прокат: сарай со стойкой сапов или лыж у входа. */
function rental(p: Point, b: VoxelStore, r: VoxelStore, f: VoxelStore) {
  const { x0, x1, z1, acc } = hallBox(p, b, r, f, { w: 4 + p.hall * 0.75, floor: [0xb88f68, 0xa8805c], wall: [0x8a6a50, 0x7a5c44], roof: 0x2f6f62, pitched: true });
  const boards = [0xe8a84a, 0x3bb0b0, 0xe2604a, 0xfaf2e6];
  for (let n = 0; n < 2 + p.hall; n++) {
    const x = x0 + 0.25 + n * 0.75;
    if (x > x1 - 0.5) break;
    b.fill(x, 0.25, z1 + 0.25, x + 0.25, 2.5, z1 + 0.75, boards[n % boards.length]);
  }
  b.fill(x0, 0.25, z1 + 0.75, x1, 0.5, z1 + 1, WOOD);
  for (let n = 0; n < p.staff; n++) person(b, vi(x1 - 1.25 - n * 0.75), vi(z1 + 1.5), acc);
}

/** Шаурма: ларёк с окном выдачи, вертел светится. */
function shawarma(p: Point, b: VoxelStore, r: VoxelStore, f: VoxelStore) {
  const { x0, x1, z1, h, acc } = hallBox(p, b, r, f, { w: 3.5 + p.hall * 0.75, h: 2.75, floor: [0xd8d4cc, 0xc8c4bc], wall: [0xf2e2b0, 0xe6d49c], roof: 0xd96a2a, awning: 0xd96a2a });
  b.fill(x0 + 0.5, 0.25, 1.5, x0 + 1, 1.75, 2, 0xb8602a, true); // вертел
  b.fill(x0 + 1.5, 0.25, z1 - 1.5, x1 - 0.5, 1, z1 - 1, 0x8a8a8a);
  for (let n = 0; n < p.staff; n++) person(b, vi(x0 + 1.5 + n * 0.75), vi(z1 - 2.25), acc);
  for (let n = 0; n < Math.min(2, p.hall + 1); n++) b.fill(x1 - 1.5 - n * 1.5, 0, z1 + 0.5, x1 - 1 - n * 1.5, 1, z1 + 1, 0x40404a); // стоячие столики
  sign(r, x0 + 0.25, x1 - 0.25, h + 0.25, z1 - 0.75, 0xf2c230);
}

/** Автоботы: бокс с подъёмником и шинами (шиномонтаж и автосервис). */
function garage(p: Point, b: VoxelStore, r: VoxelStore, f: VoxelStore, tires: boolean) {
  const bays = Math.min(4, p.hall + 1);
  const w = Math.min(7, bays * 1.75 + 0.5), x0 = (PLOT - w) / 2, z0 = 0.75, z1 = 5.5, h = 3;
  const acc = ownerColor(p);
  b.fill(x0, 0, z0, x0 + w, 0.25, PLOT - 0.25, 0x8a8a92);
  b.fill(x0, 0.25, z0, x0 + w, h, z0 + 0.25, 0xcfccc4);
  b.fill(x0, 0.25, z0, x0 + 0.25, h, z1, 0xcfccc4);
  b.fill(x0 + w - 0.25, 0.25, z0, x0 + w, h, z1, 0xcfccc4);
  const cars = [0x3b7fbf, 0xe9e2d6, 0xe2604a, 0x2b3340];
  for (let n = 0; n < bays; n++) {
    const cx = x0 + 0.5 + n * 1.75;
    if (n < p.staff) {
      b.fill(cx, tires ? 0.25 : 0.75, z0 + 1, cx + 1, (tires ? 0.75 : 1.25), z0 + 3.25, cars[n % 4]);
      if (!tires) b.fill(cx + 0.25, 0.25, z0 + 1.5, cx + 0.5, 0.75, z0 + 2.75, 0xf2c230); // подъёмник
    }
    f.fill(cx - 0.25, h - 0.5, z1 - 0.25, cx + 1.25, h, z1, 0x40404a);
  }
  for (let n = 0; n < p.staff; n++) person(b, vi(x0 + 0.5 + n * 1.75), vi(z0 + 3.75), acc);
  if (tires) for (let n = 0; n < 4; n++) b.fill(x0 + w - 1, 0.25 + n * 0.25, z1 + 0.25, x0 + w - 0.25, 0.5 + n * 0.25, z1 + 1, 0x2a2a2a);
  r.fill(x0 - 0.25, h, z0 - 0.25, x0 + w + 0.25, h + 0.25, z1 + 0.25, 0x5f6a7a);
  sign(r, x0 + 0.5, x0 + w - 0.5, h + 0.25, z1 - 0.75, acc);
}
const tyre = (p: Point, b: VoxelStore, r: VoxelStore, f: VoxelStore) => garage(p, b, r, f, true);
const carService = (p: Point, b: VoxelStore, r: VoxelStore, f: VoxelStore) => garage(p, b, r, f, false);

/** Столовая: длинные столы и раздача с подносами. */
function canteen(p: Point, b: VoxelStore, r: VoxelStore, f: VoxelStore) {
  const { x0, x1, z0, z1, h, acc } = hallBox(p, b, r, f, { w: 5 + p.hall * 0.5, floor: [0xe8e4dc, 0xd8d4cc], roof: 0x7a8a6a });
  b.fill(x0 + 0.5, 0.25, z0 + 0.5, x1 - 0.5, 1, z0 + 1, 0xb8b8c0);
  for (let n = 0; n < p.staff; n++) person(b, vi(x0 + 1 + n * 0.75), vi(z0 + 0.25), acc);
  for (let row = 0; row <= Math.min(2, p.hall); row++) b.fill(x0 + 0.75, 0.25, z0 + 2 + row * 1, x1 - 0.75, 0.75, z0 + 2.5 + row * 1, WOOD);
  sign(r, x0 + 0.5, x1 - 0.5, h + 0.25, z1 - 0.75, 0xfaf2e6);
}

/** Прачечная: ряд стиральных машин с круглыми окошками. */
function laundry(p: Point, b: VoxelStore, r: VoxelStore, f: VoxelStore) {
  const { x0, x1, z0, z1, h, acc } = hallBox(p, b, r, f, { w: 4.5 + p.hall * 0.75, floor: [0xdfe6ea, 0xcfd8de], wall: [0xeef4f6, 0xdfe8ec], roof: 0x5fa8c8, awning: 0x5fa8c8 });
  for (let x = x0 + 0.5; x < x1 - 0.75; x += 1) {
    b.fill(x, 0.25, z0 + 0.5, x + 0.75, 1.25, z0 + 1.25, 0xf4f4f4);
    b.fill(x + 0.25, 0.5, z0 + 1.25, x + 0.5, 1, z0 + 1.5, 0x5fa8c8, true);
  }
  for (let n = 0; n < p.staff; n++) person(b, vi(x0 + 1 + n * 0.75), vi(z1 - 1.5), acc);
  sign(r, x0 + 0.5, x1 - 0.5, h + 0.25, z1 - 0.75, 0xfaf2e6);
}

/** Курьеры: офис-склад с коробками и самокатами у входа. */
function couriers(p: Point, b: VoxelStore, r: VoxelStore, f: VoxelStore) {
  const { x0, x1, z0, z1, acc } = hallBox(p, b, r, f, { w: 4 + p.hall * 0.5, floor: [0xd8d4cc, 0xc8c4bc], wall: [0xe8dcc8, 0xd8ccb8], roof: 0x8a8a92 });
  for (let n = 0; n < 6; n++) b.fill(x0 + 0.5 + (n % 3) * 0.75, 0.25 + Math.floor(n / 3) * 0.5, z0 + 0.5, x0 + 1 + (n % 3) * 0.75, 0.75 + Math.floor(n / 3) * 0.5, z0 + 1.25, 0xc9a27a);
  for (let n = 0; n < p.staff; n++) {
    const x = 0.5 + n * 0.75;
    if (x > PLOT - 0.75) break;
    b.fill(x, 0.25, z1 + 0.75, x + 0.25, 0.5, z1 + 1.5, 0x2a2a2a);
    b.fill(x, 0.5, z1 + 0.75, x + 0.25, 1.25, z1 + 1, acc);
    person(b, vi(x + 0.25), vi(z1 + 1.75), acc);
  }
  if (x1 - x0 > 5) b.fill(x1 - 2, 0.25, z0 + 1, x1 - 0.5, 1.25, z0 + 3, 0xfaf2e6); // фургон
}

/** Агентство нянь: домик с игровой площадкой. */
function nannies(p: Point, b: VoxelStore, r: VoxelStore, f: VoxelStore) {
  const { x0, x1, z1, acc } = hallBox(p, b, r, f, { w: 4 + p.hall * 0.5, z1: 4.5, floor: [0xf2d8c8, 0xe8ccb8], wall: [0xfbe8d8, 0xf2dcc8], roof: 0xe8a0a0, pitched: true });
  b.fill(0.5, 0, z1 + 0.25, PLOT - 0.5, 0.25, PLOT - 0.25, 0x9cc46a);
  b.fill(x0 + 0.5, 0.25, z1 + 0.75, x0 + 1.75, 0.5, z1 + 2, 0xe8c870); // песочница
  b.fill(x1 - 1.5, 0.25, z1 + 0.75, x1 - 1.25, 1.5, z1 + 1, 0x3b7fbf); // горка
  b.fill(x1 - 1.5, 1.25, z1 + 0.75, x1 - 0.5, 1.5, z1 + 1.75, 0xe2604a);
  for (let n = 0; n < p.staff; n++) person(b, vi(x0 + 2 + n * 0.75), vi(z1 + 1.5), acc);
}

/** Салон красоты: розовая витрина и кресла с зеркалами. */
function beauty(p: Point, b: VoxelStore, r: VoxelStore, f: VoxelStore) {
  const { x0, x1, z0, z1, h, acc } = hallBox(p, b, r, f, { w: 4.5 + p.hall * 0.5, floor: [0xf4ece4, 0xe8dcd4], wall: [0xf6dce4, 0xecd0d8], roof: 0xc87a9a, awning: 0xc87a9a });
  for (let x = x0 + 0.5, n = 0; x < x1 - 0.75; x += 1.25, n++) {
    b.fill(x, 1, z0 + 0.25, x + 0.75, 2, z0 + 0.5, 0xbfe0ee, true);
    b.fill(x, 0.25, z0 + 1, x + 0.75, 0.75, z0 + 1.75, 0x40404a);
    if (n < p.staff) person(b, vi(x + 0.25), vi(z0 + 2), acc);
  }
  sign(r, x0 + 0.5, x1 - 0.5, h + 0.25, z1 - 0.75, 0xfaf2e6);
}

/** Ремонт техники: тесная мастерская с паяльными столами. */
function techRepair(p: Point, b: VoxelStore, r: VoxelStore, f: VoxelStore) {
  const { x0, x1, z0, z1, h, acc } = hallBox(p, b, r, f, { w: 3.5 + p.hall * 0.75, floor: [0xd8d4cc, 0xc8c4bc], wall: [0xdcdce4, 0xcfcfd8], roof: 0x4a5a7a });
  b.fill(x0 + 0.5, 0.25, z0 + 0.75, x1 - 0.5, 1, z0 + 1.5, 0x6b6b74);
  for (let x = x0 + 0.75; x < x1 - 0.75; x += 1) b.fill(x, 1, z0 + 1, x + 0.5, 1.25, z0 + 1.25, 0x2b3340);
  for (let n = 0; n < p.staff; n++) person(b, vi(x0 + 1 + n * 0.75), vi(z0 + 2), acc);
  sign(r, x0 + 0.25, x1 - 0.25, h + 0.25, z1 - 0.75, 0x5fa8c8);
}

/** Клининг: офис бригады с микроавтобусом, вёдрами и швабрами у входа. */
function cleaning(p: Point, b: VoxelStore, r: VoxelStore, f: VoxelStore) {
  const { x0, x1, z0, z1, h, acc } = hallBox(p, b, r, f, { w: 4 + p.hall * 0.5, floor: [0xe4ecf0, 0xd4dee4], wall: [0xf2f6f8, 0xe2eaee], roof: 0x58b8a8, awning: 0x58b8a8 });
  for (let n = 0; n < 3; n++) {
    b.fill(x0 + 0.5 + n * 0.75, 0.25, z0 + 0.5, x0 + 1 + n * 0.75, 0.75, z0 + 1, 0x58b8a8);
    b.fill(x0 + 0.75 + n * 0.75, 0.75, z0 + 0.75, x0 + 1 + n * 0.75, 2, z0 + 1, WOOD);
  }
  for (let n = 0; n < p.staff; n++) {
    const x = 0.5 + n * 0.75;
    if (x > PLOT - 0.75) break;
    person(b, vi(x), vi(z1 + 1.25), acc);
    b.fill(x + 0.25, 0.25, z1 + 1.5, x + 0.5, 0.5, z1 + 1.75, 0x58b8a8, true); // ведро
  }
  if (x1 - x0 > 5) {
    b.fill(x1 - 2.25, 0.25, z0 + 1, x1 - 0.5, 1.5, z0 + 3.25, 0xf4f4f4); // микроавтобус
    b.fill(x1 - 2.25, 0.75, z0 + 1, x1 - 0.5, 1, z0 + 3.25, acc);
  }
  sign(r, x0 + 0.5, x1 - 0.5, h + 0.25, z1 - 0.75, 0xfaf2e6);
}

const BUILDERS: Record<string, (p: Point, b: VoxelStore, r: VoxelStore, f: VoxelStore) => void> = {
  coffee, store, wash, farm, bakery, guesthouse, resortCafe, fish, rental,
  shawarma, tyre, carService, canteen, laundry, couriers, nannies, beauty, techRepair, cleaning,
};

/** Собирает здание точки (или пустой участок) в локальных координатах участка, фасадом на +z. */
export function buildLot(p: Point | null): BuildingMesh {
  const b = new VoxelStore(), r = new VoxelStore(), f = new VoxelStore();
  if (!p) freeLot(b);
  else {
    (BUILDERS[p.niche] ?? store)(p, b, r, f);
    // очередь у входа: гости, которые не дождались
    const L = p.last;
    const queue = L && L.served > 0 ? Math.min(6, Math.round(L.qlost / 6)) : 0;
    for (let n = 0; n < queue; n++) person(b, vi(1.25 + n * 0.75), vi(PLOT - 0.75), PEOPLE[n % PEOPLE.length]);
    // Хваткин продаёт точку: жёлтый щит на крыше
    if (p.forSale) r.fill(2, 4, 3, 5, 5, 3.25, 0xf2c230);
    if (p.closedDays > 0) f.fill(2.5, 0.5, 6, 4.5, 1.5, 6.25, 0xf2c230);
  }
  const roof = r.build(), front = f.build(), group = b.build();
  group.add(roof, front);
  return { group, roof, front };
}

/** Поворот участка фасадом к дороге. */
export function placeLot(g: THREE.Group, s: Slot, vx: number) {
  const rot = { pz: 0, nz: Math.PI, px: Math.PI / 2, nx: -Math.PI / 2 }[s.face];
  g.rotation.y = rot;
  // поворачиваем вокруг центра участка
  const c = new THREE.Vector3(PLOT / 2, 0, PLOT / 2).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
  g.position.set(vx + s.x0 + PLOT / 2 - c.x, 0.25, s.z0 + PLOT / 2 - c.z);
}

export const nicheIcon = (n: string) => NICHE_ICON[n] ?? '🏠';
export const slotsOf = (n: string) => NICHES[n as keyof typeof NICHES].slots;
export const VOXEL = VS;

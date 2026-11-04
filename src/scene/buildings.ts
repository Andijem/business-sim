import * as THREE from 'three';
import { NICHES } from '../sim';
import type { Point } from '../sim';
import { PLOT, type Slot } from './layout';
import { VoxelStore, hash, pick, vi, VS } from './voxels';

/** Цвета хозяев: игрок — бирюза, Хваткин — красный. */
export const OWNER = [0x2f6f62, 0xc8302a];
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
  const acc = OWNER[p.owner];
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
  const acc = OWNER[p.owner];
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
  const acc = OWNER[p.owner];
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

/** Собирает здание точки (или пустой участок) в локальных координатах участка, фасадом на +z. */
export function buildLot(p: Point | null): BuildingMesh {
  const b = new VoxelStore(), r = new VoxelStore(), f = new VoxelStore();
  if (!p) freeLot(b);
  else {
    if (p.niche === 'coffee') coffee(p, b, r, f);
    else if (p.niche === 'store') store(p, b, r, f);
    else wash(p, b, r, f);
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

export const nicheIcon = (n: string) => ({ coffee: '☕', store: '🛒', wash: '🚗' })[n] ?? '🏠';
export const slotsOf = (n: string) => NICHES[n as keyof typeof NICHES].slots;
export const VOXEL = VS;

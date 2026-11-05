import * as THREE from 'three';
import { VoxelStore } from '../scene/voxels';

/**
 * Перекраска моделей в редакторе без правки кода игры.
 * Пока собирается предмет, каждый цвет, который модель кладёт в воксели, проходит через карту замен,
 * а заодно считается, сколько раз он встретился. Так видны все цвета модели и любой можно заменить.
 */

export interface Swatch {
  /** Исходный цвет из кода игры. */
  c: number;
  /** Сколько вокселей (или коробок) им покрашено. */
  n: number;
  glow: boolean;
}

let remap = new Map<number, number>();
let seen = new Map<number, Swatch>();
let active = false;

const note = (c: number, n: number, glow: boolean) => {
  const s = seen.get(c);
  if (s) { s.n += n; s.glow ||= glow; } else seen.set(c, { c, n, glow });
};
const to = (c: number) => remap.get(c) ?? c;

const proto = VoxelStore.prototype;
const put = proto.put, putGlow = proto.putGlow, block = proto.block;
const putFine = proto.putFine;
proto.putFine = function (this: VoxelStore, i: number, j: number, k: number, c: number) {
  if (!active) return putFine.call(this, i, j, k, c);
  note(c, 1, false);
  return putFine.call(this, i, j, k, to(c));
};
const car = proto.car;
proto.car = function (this: VoxelStore, x: number, z: number, c: number, alongZ = false) {
  if (!active) return car.call(this, x, z, c, alongZ);
  note(c, 1, false);
  return car.call(this, x, z, to(c), alongZ);
};
proto.put = function (this: VoxelStore, i: number, j: number, k: number, c: number | null) {
  if (c == null || !active) return put.call(this, i, j, k, c);
  note(c, 1, false);
  return put.call(this, i, j, k, to(c));
};
proto.putGlow = function (this: VoxelStore, i: number, j: number, k: number, c: number) {
  if (!active) return putGlow.call(this, i, j, k, c);
  note(c, 1, true);
  return putGlow.call(this, i, j, k, to(c));
};
proto.block = function (this: VoxelStore, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number, glow = false) {
  if (!active) return block.call(this, x0, y0, z0, x1, y1, z1, c, glow);
  note(c, Math.max(1, Math.round(((x1 - x0) * (y1 - y0) * (z1 - z0)) / 0.015625)), glow);
  return block.call(this, x0, y0, z0, x1, y1, z1, to(c), glow);
};

/** Собирает предмет с заменой цветов и возвращает его палитру (самые частые цвета первыми). */
export function withColors<T>(map: Map<number, number>, fn: () => T): { out: T; swatches: Swatch[] } {
  remap = map;
  seen = new Map();
  active = true;
  try {
    const out = fn();
    return { out, swatches: [...seen.values()].sort((a, b) => b.n - a.n) };
  } finally {
    active = false;
    remap = new Map();
  }
}

/** Цвет фигурки (оттенок инстанса) тоже идёт через карту, если редактор сейчас собирает предмет. */
export function tint(c: number): number {
  if (!active) return c;
  note(c, 1, false);
  return to(c);
}

/** Перекрашивает цвета вершин фигурки (люди, машины, животные) по той же карте. */
export function recolorGeometry(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const attr = geo.getAttribute('color') as THREE.BufferAttribute | undefined;
  if (!attr) return geo;
  const col = new THREE.Color();
  const groups = new Map<number, number>();
  for (let i = 0; i < attr.count; i++) {
    col.setRGB(attr.getX(i), attr.getY(i), attr.getZ(i));
    const hex = col.getHex();
    if (hex === 0xffffff) continue; // белое красится оттенком фигурки (окрас, одежда)
    groups.set(hex, (groups.get(hex) ?? 0) + 1);
    const nh = active ? to(hex) : hex;
    if (nh !== hex) { col.setHex(nh); attr.setXYZ(i, col.r, col.g, col.b); }
  }
  // одна коробка — 36 вершин: считаем коробками, как воксели
  if (active) for (const [hex, n] of groups) note(hex, Math.max(1, Math.round(n / 36)), false);
  attr.needsUpdate = true;
  return geo;
}

export const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
export const unhex = (s: string) => parseInt(s.replace('#', ''), 16);

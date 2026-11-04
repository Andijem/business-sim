import type { ColorArg } from './voxels';
import { VoxelStore, hash, pick, vi, VS } from './voxels';

/**
 * Детали мира: жилые дома, дворы, улица, природа.
 * Всё строится в «рамке» участка (Frame): u — вдоль фасада, v — вглубь, фасад смотрит на v = d.
 * Так один и тот же дом можно развернуть к любой дороге.
 */

export type Face = 'pz' | 'nz' | 'px' | 'nx';

/** Детерминированный генератор случайных чисел: мир одинаковый при каждом запуске. */
export function rng(seed: number): () => number {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Что оживляет сцену после постройки: дым из труб, вращение, животные. */
export interface Anim {
  kind: 'spin' | 'bob';
  /** Имя группы с отдельными вокселями (лопасти мельницы, колесо, лодка). */
  store: VoxelStore;
  /** Центр вращения или покачивания в мире. */
  x: number;
  y: number;
  z: number;
  /** Ось вращения: 'x' или 'z'. */
  axis?: 'x' | 'z';
  speed: number;
}
export interface Pen {
  kind: Animal;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  n: number;
}
export type Animal = 'hen' | 'dog' | 'cat' | 'cow' | 'goat' | 'duck' | 'gull' | 'pigeon' | 'crow' | 'squirrel';

/** Сетка занятости 1×1 м: деревья и дома не лезут на дороги, участки и друг на друга. */
export class Plan {
  private cells = new Set<number>();
  /** Своя полоса мира по x: за её краем строит сосед. */
  constructor(readonly lo = -Infinity, readonly hi = Infinity) {}
  private k = (x: number, z: number) => (x + 8000) * 20000 + (z + 8000);
  mark(x0: number, z0: number, x1: number, z1: number) {
    for (let x = Math.floor(x0); x < Math.ceil(x1); x++) for (let z = Math.floor(z0); z < Math.ceil(z1); z++) this.cells.add(this.k(x, z));
  }
  free(x0: number, z0: number, x1: number, z1: number) {
    for (let x = Math.floor(x0); x < Math.ceil(x1); x++) for (let z = Math.floor(z0); z < Math.ceil(z1); z++) if (this.cells.has(this.k(x, z))) return false;
    return true;
  }
  /** Занять место, если оно свободно и в своей полосе. */
  take(x0: number, z0: number, x1: number, z1: number) {
    if (x0 < this.lo || x1 > this.hi || !this.free(x0, z0, x1, z1)) return false;
    this.mark(x0, z0, x1, z1);
    return true;
  }
}

export interface Ctx {
  s: VoxelStore;
  plan: Plan;
  r: () => number;
  smoke: [number, number, number][];
  anim: Anim[];
  pens: Pen[];
  /** Места, где жители сидят или стоят (лавочки, пирс). */
  idle: [number, number, number][];
  /** Морские заливы: эллипсы воды (центр и радиусы). */
  water: { x: number; z: number; rx: number; rz: number }[];
}

/** Рамка участка: локальные координаты (u, v) → мир с поворотом к дороге. */
export class Frame {
  constructor(readonly s: VoxelStore, readonly ox: number, readonly oz: number, readonly w: number, readonly d: number, readonly face: Face = 'pz') {}
  /** Мировые x, z точки рамки. */
  at(u: number, v: number): [number, number] {
    const { ox, oz, w, d } = this;
    switch (this.face) {
      case 'pz': return [ox + u, oz + v];
      case 'nz': return [ox + w - u, oz + d - v];
      case 'px': return [ox + v, oz + w - u];
      case 'nx': return [ox + d - v, oz + u];
    }
  }
  /** Сколько места рамка занимает в мире. */
  get box(): [number, number, number, number] {
    const flip = this.face === 'px' || this.face === 'nx';
    return [this.ox, this.oz, this.ox + (flip ? this.d : this.w), this.oz + (flip ? this.w : this.d)];
  }
  private rect(u0: number, v0: number, u1: number, v1: number): [number, number, number, number] {
    const [ax, az] = this.at(u0, v0), [bx, bz] = this.at(u1, v1);
    return [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)];
  }
  fill(u0: number, y0: number, v0: number, u1: number, y1: number, v1: number, c: ColorArg, glow = false) {
    const [x0, z0, x1, z1] = this.rect(u0, v0, u1, v1);
    this.s.fill(x0, y0, z0, x1, y1, z1, c, glow);
  }
  block(u0: number, y0: number, v0: number, u1: number, y1: number, v1: number, c: number, glow = false) {
    const [x0, z0, x1, z1] = this.rect(u0, v0, u1, v1);
    this.s.block(x0, y0, z0, x1, y1, z1, c, glow);
  }
  /** Один воксель в точке рамки. */
  put(u: number, y: number, v: number, c: number, glow = false) {
    this.fill(u, y, v, u + VS, y + VS, v + VS, c, glow);
  }
}

// ---------- палитры ----------
export const C = {
  wood: 0x6b4a36, wood2: 0x5e4130, plank: 0x9a7452, log: [0x8a5e3c, 0x7a5232, 0x946844],
  glass: 0x9cc6cf, glassDark: 0x6f93a3, lit: 0xffd98f, white: 0xfaf2e6,
  stone: [0x9a958c, 0x8a857c, 0xa8a398], brick: [0xa8553e, 0x9a4a36, 0xb4604a],
  leaves: [0x6f9a5a, 0x7fab63, 0x5f8a4e, 0x89b46a], birch: [0x8fbf63, 0x9fcb6f, 0x7fb056],
  pine: [0x4f7d4f, 0x5a8a56, 0x467046], poplar: [0x5f8f4a, 0x6a9a52],
  flowers: [0xe2604a, 0xf2c230, 0xfaf2e6, 0xc87ad0, 0x5fa8e8, 0xf08aa8],
  grass: [0x8ab55c, 0x7fab52, 0x9cc46a], soil: [0x8a6a4a, 0x7d5f42],
  roofs: [0xb4563f, 0x6d7f9a, 0x5f8a6a, 0x8a4a3a, 0x4a5a7a, 0x9a6a3a],
  walls: [0xf1d7c4, 0xdfe6d2, 0xf2e6c8, 0xe6d6e6, 0xd8e4ec, 0xf4e0b0],
  cars: [0xe9e2d6, 0x3b7fbf, 0xe2604a, 0x2b3340, 0xe8a84a, 0x5a6a7a, 0x4f9a6a, 0xd9d6cf],
};

// ---------- дома ----------

/** Двускатная крыша вдоль u: скаты к фасаду и к заду. Возвращает высоту конька. */
function gable(f: Frame, u0: number, u1: number, v0: number, v1: number, y: number, roof: number, over = 0.25) {
  let l = 0;
  for (; l * VS < (v1 - v0) / 2 + over; l++) {
    const a = v0 - over + l * VS, b = v1 + over - l * VS;
    if (b <= a) break;
    f.fill(u0 - over, y + l * VS, a, u1 + over, y + (l + 1) * VS, b, (_i, j) => (j % 2 ? roof : shade(roof, 0.9)));
  }
  return y + l * VS;
}

/** Окно с рамой: светится вечером у части домов. */
function windowAt(f: Frame, u: number, y: number, v: number, w: number, h: number, frame: number, lit: boolean) {
  f.fill(u - 0.25, y - 0.25, v, u + w + 0.25, y + h + 0.25, v + 0.25, frame);
  f.fill(u, y, v, u + w, y + h, v + 0.25, lit ? C.lit : C.glass, lit);
}

export function shade(c: number, k: number): number {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((c >> 8) & 255) * k));
  const b = Math.min(255, Math.round((c & 255) * k));
  return (r << 16) | (g << 8) | b;
}

/** Изба: бревенчатые стены, резные наличники, крыльцо, печная труба. */
export function izba(ctx: Ctx, f: Frame, roof: number, trim: number) {
  const w = f.w, d = f.d, h = 2.25;
  const u0 = 0.5, u1 = w - 0.5, v0 = 0.5, v1 = d - 0.75;
  f.fill(u0, 0, v0, u1, 0.25, v1, 0x7a6a5a); // фундамент
  f.fill(u0, 0.25, v0, u1, h, v1, (i, j, k) => (j % 2 ? pick(C.log, i, j, k) : shade(pick(C.log, i, j, k), 0.85)));
  const top = gable(f, u0, u1, v0, v1, h, roof);
  // фронтон досками
  f.fill(u0 + 0.5, h, v1 - 0.25, u1 - 0.5, top - 0.5, v1, C.plank);
  f.put(w / 2 - 0.125, h + 0.5, v1, C.lit, ctx.r() > 0.5);
  const lit = ctx.r() > 0.4;
  for (const u of [u0 + 0.5, u1 - 1.25]) {
    windowAt(f, u, 0.75, v1, 0.75, 0.75, trim, lit && u > w / 2);
    f.fill(u - 0.25, 1.75, v1 + 0.25, u + 1, 2, v1 + 0.5, trim); // резной козырёк наличника
  }
  // крыльцо с дверью сбоку
  f.fill(w / 2 - 0.5, 0.25, v1, w / 2 + 0.25, 1.75, v1 + 0.25, C.wood2);
  f.fill(w / 2 - 0.75, 0, v1, w / 2 + 0.5, 0.25, v1 + 0.75, C.plank);
  const [cx, cz] = f.at(u1 - 1, v0 + 1);
  f.fill(u1 - 1.25, h, v0 + 0.75, u1 - 0.75, top + 0.5, v0 + 1.25, C.brick[0]);
  ctx.smoke.push([cx, top + 0.6, cz]);
}

/** Кирпичный или штукатуренный двухэтажный дом. */
export function house2(ctx: Ctx, f: Frame, wall: number, roof: number) {
  const w = f.w, d = f.d, h = 4.5;
  const u0 = 0.5, u1 = w - 0.5, v0 = 0.5, v1 = d - 0.5;
  f.fill(u0, 0, v0, u1, h, v1, (_i, j) => (j === 0 || j === 9 ? shade(wall, 0.85) : wall));
  const top = gable(f, u0, u1, v0, v1, h, roof);
  for (let fl = 0; fl < 2; fl++)
    for (let u = u0 + 0.75; u < u1 - 0.75; u += 1.5) windowAt(f, u, 0.75 + fl * 2.25, v1, 0.75, 1, C.white, ctx.r() > 0.6);
  f.fill(w / 2 - 0.5, 0, v1, w / 2 + 0.25, 1.75, v1 + 0.25, C.wood);
  f.fill(w / 2 - 1, 2.5, v1, w / 2 + 0.75, 2.75, v1 + 0.75, shade(wall, 0.8)); // балкон
  f.fill(w / 2 - 1, 2.75, v1 + 0.5, w / 2 + 0.75, 3.25, v1 + 0.75, C.wood2);
  const [cx, cz] = f.at(u0 + 1, v0 + 1);
  f.fill(u0 + 0.75, h, v0 + 0.75, u0 + 1.25, top + 0.25, v0 + 1.25, C.brick[1]);
  ctx.smoke.push([cx, top + 0.4, cz]);
}

/** Дача: маленький домик с верандой и крутой крышей. */
export function dacha(ctx: Ctx, f: Frame, wall: number, roof: number) {
  const w = f.w, d = f.d, h = 1.75;
  const u0 = 0.75, u1 = w - 0.75, v0 = 0.5, v1 = d - 1.5;
  f.fill(u0, 0, v0, u1, h, v1, wall);
  gable(f, u0, u1, v0, v1, h, roof, 0.25);
  windowAt(f, u0 + 0.5, 0.75, v1, 0.75, 0.75, C.white, ctx.r() > 0.5);
  f.fill(u1 - 1.25, 0, v1, u1 - 0.5, 1.5, v1 + 0.25, C.wood);
  // веранда: настил, столбики, навес
  f.fill(u0, 0, v1, u1, 0.25, v1 + 1, C.plank);
  for (const u of [u0, u1 - 0.25]) f.fill(u, 0.25, v1 + 0.75, u + 0.25, 1.75, v1 + 1, C.wood);
  f.fill(u0 - 0.25, 1.75, v1, u1 + 0.25, 2, v1 + 1.25, roof);
}

/** Коттедж: два объёма, плоская крыша, гараж, большие окна. */
export function cottage(ctx: Ctx, f: Frame, wall: number, roof: number) {
  const w = f.w, d = f.d;
  f.fill(0.5, 0, 0.5, w - 2.5, 5, d - 0.5, wall);
  f.fill(w - 2.5, 0, 1.5, w - 0.5, 2.75, d - 0.5, shade(wall, 0.92));
  f.fill(0.25, 5, 0.25, w - 2.25, 5.25, d - 0.25, roof);
  f.fill(w - 2.75, 2.75, 1.25, w - 0.25, 3, d - 0.25, roof);
  f.fill(w - 2.25, 0.25, d - 0.5, w - 0.75, 2.25, d - 0.25, (_i, j) => (j % 2 ? 0xd9d6cf : 0xc9c6bf)); // ворота гаража
  for (let u = 1; u < w - 3.5; u += 1.75) {
    windowAt(f, u, 0.5, d - 0.5, 1.25, 1.75, 0x40404a, ctx.r() > 0.5);
    windowAt(f, u, 3, d - 0.5, 1.25, 1.25, 0x40404a, ctx.r() > 0.6);
  }
  f.fill(0.25, 0, d - 0.25, w - 2.5, 0.25, d + 0.75, C.stone[2]); // терраса
}

/** Барак или общежитие: длинный двухэтажный дом с множеством окон. */
export function barrack(ctx: Ctx, f: Frame, wall: number, roof: number, floors = 2) {
  const w = f.w, d = f.d, h = floors * 2.5 + 0.5;
  const u0 = 0.5, u1 = w - 0.5, v0 = 0.5, v1 = d - 0.5;
  f.block(u0, 0, v0, u1, h, v1, wall);
  for (let fl = 0; fl <= floors; fl++) f.block(u0 - 0.05, fl * 2.5 + 0.25, v0 - 0.05, u1 + 0.05, fl * 2.5 + 0.5, v1 + 0.05, shade(wall, 0.85));
  gable(f, u0, u1, v0, v1, h, roof, 0.25);
  for (let fl = 0; fl < floors; fl++)
    for (let u = u0 + 0.75; u < u1 - 0.75; u += 1.25) {
      windowAt(f, u, 0.75 + fl * 2.5, v1, 0.5, 1, C.white, ctx.r() > 0.65);
      windowAt(f, u, 0.75 + fl * 2.5, v0 - 0.25, 0.5, 1, C.white, ctx.r() > 0.8);
    }
  f.fill(w / 2 - 0.5, 0, v1, w / 2 + 0.5, 2, v1 + 0.25, C.wood);
  f.fill(w / 2 - 0.75, 2, v1, w / 2 + 0.75, 2.25, v1 + 0.75, roof);
}

/** Панельный дом: окна со всех сторон, балконы, козырьки подъездов, лифтовая будка. */
export function panel(ctx: Ctx, f: Frame, wall: number, floors: number, accent = 0x7fa3b8) {
  const w = f.w, d = f.d, h = floors * 1.25 + 0.5;
  const u0 = 0.25, u1 = w - 0.25, v0 = 0.5, v1 = d - 0.5;
  f.block(u0, 0, v0, u1, h, v1, wall);
  for (let fl = 0; fl <= floors; fl++) f.block(u0 - 0.05, fl * 1.25 + 0.4, v0 - 0.05, u1 + 0.05, fl * 1.25 + 0.5, v1 + 0.05, shade(wall, 0.88));
  f.block(u0 - 0.25, h, v0 - 0.25, u1 + 0.25, h + 0.25, v1 + 0.25, 0x8c8378);
  f.block(w / 2 - 0.75, h + 0.25, v0 + 1, w / 2 + 0.75, h + 1, v1 - 1, 0xa8a090);
  const glow = (u: number, fl: number, back: number) => hash(vi(u * 7 + back), fl, vi(f.ox + f.oz)) > 0.55;
  for (let fl = 0; fl < floors; fl++) {
    const y = 0.75 + fl * 1.25;
    for (let u = u0 + 0.5; u < u1 - 0.5; u += 1) {
      const lit = glow(u, fl, 0);
      f.fill(u, y, v1, u + 0.5, y + 0.5, v1 + 0.25, lit ? C.lit : accent, lit);
      const lb = glow(u, fl, 1);
      f.fill(u, y, v0 - 0.25, u + 0.5, y + 0.5, v0, lb ? C.lit : accent, lb);
    }
    if (fl > 0) for (let u = u0 + 1.5; u < u1 - 1.5; u += 3) f.fill(u, y - 0.25, v1, u + 1.25, y, v1 + 0.5, shade(wall, 0.8)); // балконы
  }
  for (let u = 2; u < w - 1.5; u += 4) {
    f.fill(u, 0, v1, u + 0.75, 1, v1 + 0.25, C.wood2);
    f.fill(u - 0.25, 1, v1, u + 1, 1.25, v1 + 0.75, 0x8c8378);
    const [ix, iz] = f.at(u + 1.5, v1 + 1);
    ctx.idle.push([ix, 0.25, iz]);
  }
}

/** Стеклянная башня: гладкие блоки, светящиеся полосы этажей вечером. */
export function tower(_ctx: Ctx, f: Frame, floors: number, glass: number, frame = 0xd8dce4) {
  const w = f.w, d = f.d, h = floors * 1.25;
  f.block(0.5, 0, 0.5, w - 0.5, h, d - 0.5, glass);
  for (let fl = 1; fl <= floors; fl += 2) f.block(0.4, fl * 1.25 - 0.15, 0.4, w - 0.4, fl * 1.25, d - 0.4, frame);
  for (let fl = 0; fl < floors; fl++) {
    const n = hash(vi(f.ox), fl, vi(f.oz));
    if (n > 0.45) f.block(0.5 + n * (w - 3), fl * 1.25 + 0.3, d - 0.55, 1.5 + n * (w - 3), fl * 1.25 + 0.9, d - 0.45, C.lit, true);
    if (n < 0.35) f.block(0.45, fl * 1.25 + 0.3, 1 + n * 2, 0.55, fl * 1.25 + 0.9, 2 + n * 2, C.lit, true);
  }
  f.block(0.25, h, 0.25, w - 0.25, h + 0.4, d - 0.25, frame);
  f.block(w / 2 - 1, h + 0.4, d / 2 - 1, w / 2 + 1, h + 1.6, d / 2 + 1, 0x9aa0aa);
  f.block(0.5, 0, d - 0.6, w - 0.5, 1.6, d - 0.4, 0x2b3340); // вход
}

/** Купеческий дом: цветные стены, белые наличники, арки витрин внизу. */
export function merchant(ctx: Ctx, f: Frame, wall: number, roof: number, floors = 2) {
  const w = f.w, d = f.d, h = floors * 2 + 0.75;
  f.block(0.25, 0, 0.5, w - 0.25, h, d - 0.5, wall);
  f.block(0.2, 0, 0.45, w - 0.2, 0.75, d - 0.45, shade(wall, 0.85));
  f.block(0, h - 0.5, 0.25, w, h, d - 0.25, C.white); // карниз
  f.block(0.25, h, 0.5, w - 0.25, h + 0.75, d - 0.5, roof);
  f.block(0.75, h + 0.75, 1, w - 0.75, h + 1.25, d - 1, roof);
  for (let u = 0.75; u < w - 1; u += 1.5) {
    f.fill(u, 0.25, d - 0.5, u + 1, 1.5, d - 0.25, C.lit, ctx.r() > 0.3); // витрина
    f.fill(u - 0.25, 1.5, d - 0.5, u + 1.25, 1.75, d - 0.25, C.white);
    for (let fl = 1; fl < floors; fl++) windowAt(f, u + 0.25, fl * 2 + 0.25, d - 0.5, 0.5, 1, C.white, ctx.r() > 0.6);
  }
}

/** Сталинка: светлая, с арками внизу, пилястрами и шпилем. */
export function stalinka(ctx: Ctx, f: Frame, wall: number, floors: number) {
  const w = f.w, d = f.d, h = floors * 1.5 + 1;
  f.block(0.5, 0, 0.5, w - 0.5, h, d - 0.5, wall);
  f.block(0.45, 0, 0.45, w - 0.45, 1, d - 0.45, 0xc8b89a);
  for (let u = 0.5; u < w - 0.5; u += 2) f.block(u, 1, d - 0.55, u + 0.25, h, d - 0.4, shade(wall, 1.06));
  f.block(0.25, h, 0.25, w - 0.25, h + 0.5, d - 0.25, C.white);
  f.block(1, h + 0.5, 1, w - 1, h + 1.25, d - 1, 0x8a6a4a);
  for (let u = 1; u < w - 1.5; u += 1.25)
    for (let fl = 0; fl < floors; fl++) windowAt(f, u, 1.5 + fl * 1.5, d - 0.5, 0.5, 0.75, C.white, ctx.r() > 0.55);
  f.fill(w / 2 - 0.5, h + 1.25, d / 2 - 0.5, w / 2 + 0.5, h + 3, d / 2 + 0.5, 0xe8d8b0);
  f.fill(w / 2 - 0.25, h + 3, d / 2 - 0.25, w / 2, h + 4.5, d / 2, 0xd9a441);
}

/** Шале: каменный цоколь, деревянный верх, крутая крыша. */
export function chalet(ctx: Ctx, f: Frame, roof: number) {
  const w = f.w, d = f.d;
  f.fill(0.5, 0, 0.5, w - 0.5, 1.5, d - 0.75, (i, j, k) => pick(C.stone, i, j, k));
  f.fill(0.5, 1.5, 0.5, w - 0.5, 3.25, d - 0.75, (i, j, k) => pick(C.log, i, j, k));
  const top = gable(f, 0.5, w - 0.5, 0.5, d - 0.75, 3.25, roof, 0.5);
  f.fill(1, 1.75, d - 0.75, w - 1, 2, d + 0.25, C.wood2); // балкон
  f.fill(1, 2, d, w - 1, 2.5, d + 0.25, C.wood);
  windowAt(f, 1.25, 0.5, d - 0.75, 0.75, 0.75, C.wood, ctx.r() > 0.4);
  windowAt(f, w - 2, 2.25, d - 0.75, 0.75, 0.75, C.wood, ctx.r() > 0.4);
  const [cx, cz] = f.at(w - 1.25, 1.25);
  f.fill(w - 1.5, 3.25, 1, w - 1, top + 0.5, 1.5, C.stone[1]);
  ctx.smoke.push([cx, top + 0.6, cz]);
}

/** Вилла: белая, плоская крыша, бассейн перед домом. */
export function villa(ctx: Ctx, f: Frame, accent: number) {
  const w = f.w, d = f.d;
  f.fill(0.5, 0, 0.5, w - 0.5, 3, d - 3, 0xf6f2ea);
  f.fill(1.5, 3, 0.5, w - 1.5, 5.5, d - 4, 0xf6f2ea);
  f.fill(0.25, 3, 0.25, w - 0.25, 3.25, d - 2.75, accent);
  f.fill(1.25, 5.5, 0.25, w - 1.25, 5.75, d - 3.75, accent);
  for (let u = 1; u < w - 1.5; u += 2) windowAt(f, u, 0.5, d - 3, 1.5, 2, 0xd8d8d8, ctx.r() > 0.5);
  f.fill(1, 0, d - 2.5, w - 1, 0.25, d - 0.5, 0xe8e0d0);
  f.fill(1.5, 0.05, d - 2.25, w - 1.5, 0.25, d - 0.75, 0x5fc8e8, true); // бассейн
}

/** Склад: длинный ангар с рифлёной стеной и подъёмными воротами. */
export function warehouse(_ctx: Ctx, f: Frame, wall: number) {
  const w = f.w, d = f.d;
  f.block(0.5, 0, 0.5, w - 0.5, 4, d - 0.5, wall);
  for (let u = 0.5; u < w - 0.5; u += 0.75) { f.block(u, 0, d - 0.55, u + 0.25, 4, d - 0.45, shade(wall, 0.88)); f.block(u, 0, 0.45, u + 0.25, 4, 0.55, shade(wall, 0.88)); }
  f.block(0.25, 4, 0.25, w - 0.25, 4.25, d - 0.25, shade(wall, 0.75));
  for (let u = 1; u < w - 2.5; u += 3.5) f.fill(u, 0.25, d - 0.5, u + 2.25, 3, d - 0.25, (_i, j) => (j % 2 ? 0x9aa0a8 : 0x8a9098));
}

// ---------- дворы ----------

/** Забор по краю рамки с калиткой у фасада. */
export function fence(f: Frame, color: number, gateU: number, picket = true) {
  const { w, d } = f;
  const post = (u: number, v: number) => f.fill(u, 0, v, u + 0.25, picket ? 1 : 0.75, v + 0.25, color);
  for (let u = 0; u < w; u += 0.5) {
    if (u < gateU - 0.5 || u > gateU + 0.75) post(u, d - 0.25);
    post(u, 0);
  }
  for (let v = 0; v < d; v += 0.5) {
    post(0, v);
    post(w - 0.25, v);
  }
  if (!picket) {
    f.fill(0, 0.5, 0, w, 0.75, 0.25, color);
    f.fill(0, 0.5, 0, 0.25, 0.75, d, color);
    f.fill(w - 0.25, 0.5, 0, w, 0.75, d, color);
  }
}

export function shed(f: Frame, u: number, v: number, roof: number) {
  f.fill(u, 0, v, u + 1.5, 1.5, v + 1.25, C.plank);
  f.fill(u - 0.25, 1.5, v - 0.25, u + 1.75, 1.75, v + 1.5, roof);
  f.fill(u + 0.5, 0, v + 1.25, u + 1, 1.25, v + 1.5, C.wood2);
}
export function woodpile(f: Frame, u: number, v: number) {
  f.fill(u, 0, v, u + 1.5, 0.75, v + 0.5, (i, j) => ((i + j) % 2 ? 0xb88a5a : 0x9a6a42));
}
export function well(f: Frame, u: number, v: number) {
  f.fill(u, 0, v, u + 1, 0.75, v + 1, (i, j, k) => pick(C.stone, i, j, k));
  f.fill(u + 0.25, 0.5, v + 0.25, u + 0.75, 0.75, v + 0.75, 0x3a5a7a);
  f.fill(u, 0.75, v + 0.375, u + 0.25, 1.75, v + 0.625, C.wood);
  f.fill(u + 0.75, 0.75, v + 0.375, u + 1, 1.75, v + 0.625, C.wood);
  f.fill(u - 0.25, 1.75, v - 0.125, u + 1.25, 2, v + 1.125, C.roofs[0]);
}
export function clothesline(f: Frame, u: number, v: number, len: number) {
  f.fill(u, 0, v, u + 0.25, 1.75, v + 0.25, C.wood);
  f.fill(u + len, 0, v, u + len + 0.25, 1.75, v + 0.25, C.wood);
  for (let x = u + 0.5; x < u + len; x += 0.5) {
    const c = pick([C.white, 0x5fa8e8, 0xe2604a, 0xf2c230, C.white], vi(x), 3, vi(v));
    f.fill(x, 1.25, v, x + 0.25, 1.5 + (hash(vi(x), 1, 1) > 0.5 ? 0.25 : 0), v + 0.25, c);
  }
}
export function greenhouse(f: Frame, u: number, v: number) {
  f.fill(u, 0, v, u + 1.25, 1.25, v + 2, 0xcfe8e0, true);
  f.fill(u + 0.25, 0, v + 0.25, u + 1, 0.5, v + 1.75, 0x5f8a4e);
}
export function beds(f: Frame, u: number, v: number, w: number, d: number) {
  f.fill(u, 0, v, u + w, 0.25, v + d, (i, j, k) => (k % 3 === 0 ? pick(C.leaves, i, j, k) : pick(C.soil, i, j, k)));
  for (let x = u; x < u + w; x += 0.75) if (hash(vi(x), 2, vi(v)) > 0.5) f.put(x, 0.25, v + 0.25, pick(C.flowers, vi(x), 1, vi(v)));
}
export function doghouse(ctx: Ctx, f: Frame, u: number, v: number) {
  f.fill(u, 0, v, u + 0.75, 0.5, v + 0.75, C.plank);
  f.fill(u - 0.125, 0.5, v - 0.125, u + 0.875, 0.75, v + 0.875, C.roofs[0]);
  const [x, z] = f.at(u, v);
  ctx.pens.push({ kind: 'dog', x0: x - 1.5, z0: z - 1.5, x1: x + 1.5, z1: z + 1.5, n: 1 });
}
export function bench(f: Frame, u: number, v: number, len = 1.5) {
  f.fill(u, 0, v, u + 0.25, 0.25, v + 0.5, C.wood2);
  f.fill(u + len - 0.25, 0, v, u + len, 0.25, v + 0.5, C.wood2);
  f.fill(u, 0.25, v, u + len, 0.5, v + 0.5, C.plank);
  f.fill(u, 0.5, v, u + len, 0.75, v + 0.25, C.plank);
}

// ---------- улица ----------

/** Стела с названием на въезде: цветная табличка на двух ногах. */
export function stela(s: VoxelStore, x: number, z: number, color: number) {
  s.fill(x, 0, z, x + 0.25, 2.5, z + 0.25, 0x6a6a72);
  s.fill(x + 2.25, 0, z, x + 2.5, 2.5, z + 0.25, 0x6a6a72);
  s.fill(x - 0.25, 1.5, z, x + 2.75, 2.75, z + 0.25, color);
  for (let u = x + 0.25; u < x + 2.25; u += 0.5) s.put(vi(u), vi(2), vi(z) + 1, C.white);
}

/** Остановка: навес на столбиках, лавка внутри, табличка. */
export function busStop(ctx: Ctx, f: Frame, color: number) {
  const w = f.w;
  f.fill(0, 0, 0, w, 0.25, 1.5, 0xd8d0c0);
  f.fill(0.25, 0.25, 0.25, w - 0.25, 2.25, 0.5, 0xbfe0ee, true);
  for (const u of [0.25, w - 0.5]) f.fill(u, 0.25, 0.25, u + 0.25, 2.25, 1.25, 0x6a6a72);
  f.fill(0, 2.25, 0, w, 2.5, 1.5, color);
  bench(f, 0.75, 0.5, w - 1.5);
  f.fill(w + 0.25, 0, 1, w + 0.5, 2.5, 1.25, 0x6a6a72);
  f.fill(w, 2, 1, w + 0.75, 2.75, 1.25, 0x3b7fbf);
  const [x, z] = f.at(w / 2, 0.75);
  ctx.idle.push([x, 0.25, z]);
}

/** Столбы с провисающими проводами вдоль улицы. */
export function powerLine(s: VoxelStore, xa: number, xb: number, z: number, step = 10) {
  const posts: number[] = [];
  for (let x = xa; x <= xb; x += step) posts.push(x);
  for (const x of posts) {
    s.fill(x, 0, z, x + 0.25, 4, z + 0.25, 0x6b5a48);
    s.fill(x - 0.25, 3.5, z - 0.25, x + 0.5, 3.75, z + 0.5, 0x6b5a48);
  }
  for (let n = 0; n + 1 < posts.length; n++) {
    const a = posts[n], b = posts[n + 1];
    for (let x = a + 0.25; x < b; x += VS) {
      const t = (x - a) / (b - a);
      const y = 3.5 - Math.sin(t * Math.PI) * 0.6;
      s.put(vi(x), vi(y), vi(z), 0x5a5a64);
    }
  }
}

export function lamp(s: VoxelStore, x: number, z: number, city = false) {
  const i = vi(x), k = vi(z);
  const h = city ? 16 : 12;
  for (let j = 0; j < h; j++) s.put(i, j, k, 0x40404a);
  s.put(i, h - 1, k + 1, 0x40404a);
  s.putGlow(i, h - 2, k + 1, 0xfff2c8);
  if (city) { s.put(i, h - 1, k - 1, 0x40404a); s.putGlow(i, h - 2, k - 1, 0xfff2c8); }
}
export function bin(s: VoxelStore, x: number, z: number) {
  s.fill(x, 0, z, x + 0.25, 0.5, z + 0.25, 0x4f7a5a);
}
export function trafficLight(s: VoxelStore, x: number, z: number) {
  s.fill(x, 0, z, x + 0.25, 2.5, z + 0.25, 0x40404a);
  s.fill(x, 2.5, z, x + 0.25, 3.25, z + 0.25, 0x2a2a30);
  s.putGlow(vi(x), vi(3), vi(z) + 1, 0xe2604a);
  s.putGlow(vi(x), vi(2.5), vi(z) + 1, 0x6fd06a);
}
export function flowerbed(s: VoxelStore, x: number, z: number, w: number, d: number) {
  s.fill(x, 0, z, x + w, 0.25, z + d, C.stone[2]);
  s.fill(x + 0.25, 0.25, z + 0.25, x + w - 0.25, 0.5, z + d - 0.25, (i, j, k) => (hash(i, j, k) > 0.5 ? pick(C.flowers, i, j, k) : pick(C.leaves, i, j, k)));
}

/** Стоящая машина вдоль x или z. */
export function parkedCar(s: VoxelStore, x: number, z: number, c: number, alongZ = false) {
  const L = 9, W = 4, i0 = vi(x), k0 = vi(z);
  const put = (a: number, b: number, j: number, col: number) => (alongZ ? s.put(i0 + b, j, k0 + a, col) : s.put(i0 + a, j, k0 + b, col));
  for (let a = 0; a < L; a++) for (let b = 0; b < W; b++) { put(a, b, 1, c); put(a, b, 2, c); }
  for (let a = 2; a < L - 2; a++) for (let b = 0; b < W; b++) {
    const edge = a === 2 || a === L - 3 || b === 0 || b === W - 1;
    put(a, b, 3, edge ? 0x2b3340 : c); put(a, b, 4, c);
  }
  [[1, 0], [L - 2, 0], [1, W - 1], [L - 2, W - 1]].forEach(([a, b]) => put(a, b, 0, 0x222222));
}

// ---------- природа ----------

export type Tree = 'oak' | 'birch' | 'pine' | 'apple' | 'poplar' | 'willow' | 'palm' | 'maple' | 'young';

/** Дерево нужной породы; h — примерная высота в метрах. */
export function tree(s: VoxelStore, kind: Tree, x: number, z: number, h: number, autumn = false) {
  const cx = vi(x), cz = vi(z);
  const leaves = autumn ? [0xd9a441, 0xc8743a, 0xe8c050] : kind === 'birch' ? C.birch : kind === 'poplar' ? C.poplar : C.leaves;
  if (kind === 'pine') return pine(s, cx, cz, h);
  if (kind === 'palm') return palm(s, cx, cz, h);
  const trunk = kind === 'birch' ? (j: number) => (j % 3 === 1 ? 0x2a2a2a : 0xeeeae0) : () => C.wood;
  const th = Math.round((h * (kind === 'poplar' ? 0.25 : kind === 'willow' ? 0.35 : 0.45)) / VS);
  for (let j = 0; j < th; j++) { s.put(cx, j, cz, trunk(j)); if (kind === 'oak' || kind === 'willow') { s.put(cx + 1, j, cz, C.wood2); s.put(cx, j, cz + 1, C.wood2); s.put(cx + 1, j, cz + 1, C.wood); } }
  const R = (h * (kind === 'poplar' ? 0.2 : kind === 'apple' ? 0.45 : kind === 'young' ? 0.3 : 0.4)) / VS;
  const Ry = kind === 'poplar' ? R * 3.5 : kind === 'willow' ? R * 0.9 : R * 1.05;
  const cy = th + Ry * 0.7;
  const ri = Math.ceil(R) + 1, ry = Math.ceil(Ry) + 1;
  for (let i = -ri; i <= ri; i++) for (let j = -ry; j <= ry; j++) for (let k = -ri; k <= ri; k++) {
    if (kind === 'willow' && j < -Ry * 0.2 && Math.hypot(i, k) < R * 0.75) continue;
    const dd = Math.hypot(i / R, j / Ry, k / R) + hash(cx + i, j, cz + k) * 0.25;
    if (dd < 1.05) {
      const fruit = kind === 'apple' && dd > 0.9 && hash(cx + i, j + 5, cz + k) > 0.85;
      s.put(cx + i, Math.round(cy + j), cz + k, fruit ? 0xd84a3a : pick(leaves, cx + i, j, cz + k));
    }
  }
  if (kind === 'willow')
    for (let i = -ri; i <= ri; i += 2) for (let k = -ri; k <= ri; k += 2)
      if (Math.abs(Math.hypot(i, k) - R * 0.9) < 1) for (let j = Math.round(cy - Ry * 0.9); j < cy; j++) s.put(cx + i, j, cz + k, leaves[1]);
}

/**
 * Дерево на краю локации: несколько гладких блоков вместо сотен вокселей.
 * Издалека выглядит как обычное, а телефону почти ничего не стоит.
 */
export function lowTree(s: VoxelStore, kind: Tree, x: number, z: number, h: number) {
  const n = hash(vi(x), 5, vi(z));
  if (kind === 'pine') {
    s.block(x - 0.15, 0, z - 0.15, x + 0.15, h * 0.3, z + 0.15, C.wood);
    for (let l = 0; l < 3; l++) {
      const r = (h * 0.3) * (1 - l * 0.28), y = h * (0.2 + l * 0.25);
      s.block(x - r, y, z - r, x + r, y + h * 0.3, z + r, C.pine[(l + Math.floor(n * 3)) % 3]);
    }
    return;
  }
  if (kind === 'palm') return palm(s, vi(x), vi(z), h);
  const leaves = kind === 'birch' ? C.birch : kind === 'poplar' ? C.poplar : C.leaves;
  const tall = kind === 'poplar' ? 2.2 : 1;
  s.block(x - 0.15, 0, z - 0.15, x + 0.15, h * 0.45, z + 0.15, kind === 'birch' ? 0xeeeae0 : C.wood);
  const r = h * (kind === 'poplar' ? 0.2 : 0.38);
  s.block(x - r, h * 0.4, z - r * 0.8, x + r, h * 0.4 + r * 1.5 * tall, z + r * 0.8, leaves[Math.floor(n * leaves.length)]);
  s.block(x - r * 0.75, h * 0.4 - r * 0.2, z - r, x + r * 0.75, h * 0.4 + r * 1.3 * tall, z + r, leaves[(Math.floor(n * 7) + 1) % leaves.length]);
  s.block(x - r * 0.5, h * 0.4 + r * 1.2 * tall, z - r * 0.5, x + r * 0.5, h * 0.4 + r * 1.8 * tall, z + r * 0.5, leaves[(Math.floor(n * 5) + 2) % leaves.length]);
}

function pine(s: VoxelStore, cx: number, cz: number, h: number) {
  const H = Math.round(h / VS);
  for (let j = 0; j < 4; j++) s.put(cx, j, cz, C.wood);
  for (let j = 3; j < H; j++) {
    const rr = (1 - (j - 3) / (H - 3)) * (h * 0.32) / VS + (j % 3 === 0 ? 0.8 : 0);
    for (let i = -Math.ceil(rr); i <= rr; i++) for (let k = -Math.ceil(rr); k <= rr; k++)
      if (Math.hypot(i, k) <= rr) s.put(cx + i, j, cz + k, pick(C.pine, i, j, k));
  }
}

function palm(s: VoxelStore, cx: number, cz: number, h: number) {
  const H = Math.round(h / VS);
  for (let j = 0; j < H; j++) s.put(cx + Math.round(Math.sin(j / 6) * 1), j, cz, j % 2 ? 0x9a7a52 : 0x8a6a42);
  const tx = cx + Math.round(Math.sin((H - 1) / 6));
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]])
    for (let n = 1; n <= 6; n++) s.put(tx + dx * n, H - Math.floor((n * n) / 9), cz + dz * n, pick(C.leaves, n, dx, dz));
  s.put(tx, H, cz, 0x6f9a5a);
}

export function bush(s: VoxelStore, x: number, z: number, r = 0.75, c = C.leaves) {
  const R = r / VS, cx = vi(x), cz = vi(z);
  for (let i = -R; i <= R; i++) for (let j = 0; j <= R; j++) for (let k = -R; k <= R; k++)
    if (Math.hypot(i / R, j / R, k / R) + hash(cx + i, j, cz + k) * 0.3 < 1.05) s.put(cx + Math.round(i), j, cz + Math.round(k), pick(c, cx + i, j, cz + k));
}
export function flowers(s: VoxelStore, x: number, z: number, w: number, d: number) {
  for (let i = vi(x); i < vi(x + w); i++) for (let k = vi(z); k < vi(z + d); k++) {
    const n = hash(i, 9, k);
    if (n > 0.8) s.put(i, 0, k, pick(C.flowers, i, 0, k));
    else if (n > 0.6) s.put(i, 0, k, pick(C.grass, i, 1, k));
  }
}
export function rock(s: VoxelStore, x: number, z: number, r = 0.6) {
  const R = r / VS, cx = vi(x), cz = vi(z);
  for (let i = -R; i <= R; i++) for (let j = 0; j <= R * 0.7; j++) for (let k = -R; k <= R; k++)
    if (Math.hypot(i / R, j / (R * 0.7), k / R) + hash(cx + i, j, cz + k) * 0.3 < 1) s.put(cx + Math.round(i), j, cz + Math.round(k), pick(C.stone, i, j, k));
}
export function haystack(s: VoxelStore, x: number, z: number) {
  const cx = vi(x), cz = vi(z);
  for (let j = 0; j < 8; j++) {
    const r = 4 - j * 0.45;
    for (let i = -4; i <= 4; i++) for (let k = -4; k <= 4; k++) if (Math.hypot(i, k) <= r) s.put(cx + i, j, cz + k, pick([0xe8c870, 0xd9b85c, 0xdcc070], i, j, k));
  }
}

/** Пруд: голубая чаша с песчаным берегом и камышами. */
export function pond(ctx: Ctx, x: number, z: number, rx: number, rz: number, ducks = true) {
  const s = ctx.s;
  for (let i = vi(x - rx - 0.5); i <= vi(x + rx + 0.5); i++) for (let k = vi(z - rz - 0.5); k <= vi(z + rz + 0.5); k++) {
    const d = Math.hypot((i * VS - x) / rx, (k * VS - z) / rz);
    if (d < 0.85) s.put(i, -1, k, 0x4f8fb0);
    else if (d < 1) s.put(i, -1, k, 0xc8b890);
    if (d >= 0.85 && d < 1 && hash(i, 4, k) > 0.85) { s.put(i, 0, k, 0x6f8a4a); s.put(i, 1, k, 0x7a6a3a); }
  }
  ctx.plan.mark(x - rx - 0.5, z - rz - 0.5, x + rx + 0.5, z + rz + 0.5);
  if (ducks) ctx.pens.push({ kind: 'duck', x0: x - rx * 0.5, z0: z - rz * 0.5, x1: x + rx * 0.5, z1: z + rz * 0.5, n: 3 });
}

export function field(s: VoxelStore, x0: number, z0: number, w: number, d: number, crop: 'wheat' | 'potato' | 'sunflower' | 'cabbage') {
  for (let i = vi(x0); i < vi(x0 + w); i++)
    for (let k = vi(z0); k < vi(z0 + d); k++) {
      const row = k % 4 < 2;
      if (crop === 'wheat') { s.put(i, 0, k, row ? pick([0xe8c870, 0xdcb85c], i, 0, k) : 0xc8b060); if (row && hash(i, 1, k) > 0.6) s.put(i, 1, k, 0xe8c870); }
      else if (crop === 'potato') s.put(i, 0, k, row ? pick(C.leaves, i, 0, k) : pick(C.soil, i, 0, k));
      else if (crop === 'cabbage') s.put(i, 0, k, row && i % 3 ? 0x9cc87a : pick(C.soil, i, 0, k));
      else {
        s.put(i, 0, k, row ? 0x6f9a5a : pick(C.soil, i, 0, k));
        if (row && i % 4 === 0 && k % 4 === 0) { s.put(i, 1, k, 0x6f9a5a); s.put(i, 2, k, 0x5f8a4e); s.put(i, 3, k, 0xf2c230); }
      }
    }
}

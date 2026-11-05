import type { ColorArg } from './voxels';
import { VoxelStore, hash, pick, vi, VS, FS } from './voxels';

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

/** Стоящая машина вдоль x или z: гладкая модель с круглыми колёсами, как у едущих (угол x, z, место 2.25×1 м). */
export function parkedCar(s: VoxelStore, x: number, z: number, c: number, alongZ = false) {
  s.car(x, z, c, alongZ);
}

// ---------- природа ----------

export type Tree = 'oak' | 'birch' | 'pine' | 'apple' | 'poplar' | 'willow' | 'palm' | 'maple' | 'young';

/** Дерево нужной породы; h — примерная высота в метрах. Крона лиственных качается от ветра. */
export function tree(s: VoxelStore, kind: Tree, x: number, z: number, h: number, autumn = false) {
  const cx = vi(x), cz = vi(z);
  const apple = kind === 'apple';
  const leaves = autumn ? [0xd9a441, 0xc8743a, 0xe8c050] : kind === 'birch' ? C.birch : kind === 'poplar' ? C.poplar
    : apple ? [0x5a8a4a, 0x4f7d42, 0x63934f, 0x557f46] : C.leaves;
  if (kind === 'pine') return pine(s, cx, cz, h);
  if (kind === 'palm') return palm(s, cx, cz, h);
  const trunk = kind === 'birch' ? (j: number) => (j % 3 === 1 ? 0x2a2a2a : 0xeeeae0) : () => C.wood;
  const th = Math.round((h * (kind === 'poplar' ? 0.25 : kind === 'willow' ? 0.35 : 0.45)) / VS);
  for (let j = 0; j < th; j++) { s.put(cx, j, cz, trunk(j)); if (kind === 'oak' || kind === 'willow') { s.put(cx + 1, j, cz, C.wood2); s.put(cx, j, cz + 1, C.wood2); s.put(cx + 1, j, cz + 1, C.wood); } }
  const R = (h * (kind === 'poplar' ? 0.2 : apple ? 0.45 : kind === 'young' ? 0.3 : 0.4)) / VS;
  const Ry = kind === 'poplar' ? R * 3.5 : kind === 'willow' ? R * 0.9 : R * 1.05;
  const cy = th + Ry * 0.7;
  const ri = Math.ceil(R) + 1, ry = Math.ceil(Ry) + 1;
  s.swaying = true;
  const fruit: [number, number, number][] = [];
  for (let i = -ri; i <= ri; i++) for (let j = -ry; j <= ry; j++) for (let k = -ri; k <= ri; k++) {
    if (kind === 'willow' && j < -Ry * 0.2 && Math.hypot(i, k) < R * 0.75) continue;
    const dd = Math.hypot(i / R, j / Ry, k / R) + hash(cx + i, j, cz + k) * 0.25;
    if (dd < 1.05) {
      s.put(cx + i, Math.round(cy + j), cz + k, pick(leaves, cx + i, j, cz + k));
      // яблоки висят снаружи кроны: на воксель дальше от центра, яркие, видно издалека
      if (apple && dd > 0.85 && j > -Ry * 0.8 && hash(cx + i, j + 5, cz + k) > 0.8) fruit.push([i, j, k]);
    }
  }
  for (const [i, j, k] of fruit) {
    const n = Math.hypot(i, j, k) || 1;
    const fi = cx + i + Math.round(i / n), fj = Math.round(cy + j + j / n), fk = cz + k + Math.round(k / n);
    s.put(fi, fj, fk, hash(fi, fj, fk) > 0.7 ? 0xc41a16 : 0xe8261e);
  }
  if (kind === 'willow')
    for (let i = -ri; i <= ri; i += 2) for (let k = -ri; k <= ri; k += 2)
      if (Math.abs(Math.hypot(i, k) - R * 0.9) < 1) for (let j = Math.round(cy - Ry * 0.9); j < cy; j++) s.put(cx + i, j, cz + k, leaves[1]);
  s.swaying = false;
}

/**
 * Дерево на краю локации: несколько гладких блоков вместо сотен вокселей.
 * Блоков хватает на ярусы, светлые и тёмные шапки кроны — а телефону почти ничего не стоит.
 */
export function lowTree(s: VoxelStore, kind: Tree, x: number, z: number, h: number) {
  const n = hash(vi(x), 5, vi(z));
  const rnd = (q: number) => hash(vi(x) + q, 11, vi(z) - q);
  if (kind === 'pine') {
    const H = h * 1.3;
    s.block(x - 0.15, 0, z - 0.15, x + 0.15, H * 0.35, z + 0.15, C.wood);
    const tiers = 5;
    for (let l = 0; l < tiers; l++) {
      const r = (H * 0.27) * (1 - l * 0.17), y = H * (0.16 + l * 0.15);
      const c = C.pine[(l + Math.floor(n * 3)) % 3];
      s.block(x - r, y, z - r, x + r, y + 0.2, z + r, shade(c, 0.78)); // тёмный низ яруса
      s.block(x - r * 0.75, y + 0.2, z - r * 0.75, x + r * 0.75, y + H * 0.12, z + r * 0.75, c);
      s.block(x - r * 0.45, y + H * 0.12, z - r * 0.45, x + r * 0.45, y + H * 0.17, z + r * 0.45, shade(c, 1.1));
    }
    s.block(x - 0.12, H * 0.9, z - 0.12, x + 0.12, H * 1.02, z + 0.12, C.pine[1]);
    return;
  }
  if (kind === 'palm') return palm(s, vi(x), vi(z), h);
  const leaves = kind === 'birch' ? C.birch : kind === 'poplar' ? C.poplar : C.leaves;
  const tall = kind === 'poplar' ? 2.2 : 1;
  const birch = kind === 'birch';
  s.block(x - 0.15, 0, z - 0.15, x + 0.15, h * 0.45, z + 0.15, birch ? 0xeeeae0 : C.wood);
  if (birch) for (const y of [0.3, 0.75, 1.1]) s.block(x - 0.16, y, z - 0.16, x + 0.16, y + 0.08, z + 0.16, 0x2a2a2a);
  else s.block(x - 0.22, 0, z - 0.22, x + 0.22, 0.25, z + 0.22, C.wood2); // корни
  const r = h * (kind === 'poplar' ? 0.2 : 0.38);
  const y0 = h * 0.4;
  // крона из дюжины «облачков» разного размера по поверхности эллипсоида: снизу темнее, сверху светлее
  const cy = y0 + r * 0.8 * tall;
  s.block(x - r * 0.7, cy - r * 0.6 * tall, z - r * 0.7, x + r * 0.7, cy + r * 0.6 * tall, z + r * 0.7, shade(leaves[0], 0.85));
  for (let q = 0; q < 12; q++) {
    const a = q * 2.4 + rnd(q) * 0.8, el = (rnd(q + 20) * 2 - 1) * 0.9;
    const d = r * (0.55 + rnd(q + 9) * 0.2), rr = r * (0.28 + rnd(q + 7) * 0.18);
    const bx = x + Math.cos(a) * d * Math.sqrt(1 - el * el), bz = z + Math.sin(a) * d * Math.sqrt(1 - el * el), by = cy + el * r * 0.75 * tall;
    const light = 0.82 + (el + 1) * 0.15 + rnd(q + 5) * 0.06;
    s.block(bx - rr, by - rr * 0.85, bz - rr, bx + rr, by + rr * 0.85, bz + rr, shade(leaves[(q + Math.floor(n * 5)) % leaves.length], light));
  }
}

/** Сосна: ствол и ярусы-«юбки» с тёмным низом и светлыми кончиками, чтобы слои читались. */
function pine(s: VoxelStore, cx: number, cz: number, h: number) {
  const H = Math.round((h * 1.4) / VS);
  const trunkH = Math.round(H * 0.22);
  for (let j = 0; j < H - 2; j++) s.put(cx, j, cz, j < trunkH ? C.wood : C.wood2);
  const tiers = H > 26 ? 5 : 4;
  const maxR = (h * 0.4) / VS;
  const span = H - trunkH - 2;
  const step = span / tiers;
  for (let t = 0; t < tiers; t++) {
    const base = trunkH + Math.round(t * step);
    const tierH = Math.round(step) + 3;
    const Rb = maxR * (1 - t / (tiers + 0.6));
    const rad = (j: number) => (j >= tierH ? -1 : Math.max(0.6, Rb * Math.pow(1 - j / tierH, 1.4)));
    for (let j = 0; j < tierH; j++) {
      const rr = rad(j), up = rad(j + 1);
      const ri = Math.ceil(rr);
      for (let i = -ri; i <= ri; i++) for (let k = -ri; k <= ri; k++) {
        const d = Math.hypot(i, k);
        if (d > rr) continue;
        const c0 = pick(C.pine, cx + i, base + j, cz + k);
        // тёмная нижняя кромка яруса, светлый верх «ступеньки» — так слои читаются издалека
        const col = j === 0 ? shade(c0, 0.66) : d > up ? shade(c0, 1.18) : c0;
        s.put(cx + i, base + j, cz + k, col);
      }
    }
  }
  for (let j = H - 3; j < H; j++) s.put(cx, j, cz, C.pine[2]);
}

function palm(s: VoxelStore, cx: number, cz: number, h: number) {
  const H = Math.round(h / VS);
  for (let j = 0; j < H; j++) s.put(cx + Math.round(Math.sin(j / 6) * 1), j, cz, j % 2 ? 0x9a7a52 : 0x8a6a42);
  const tx = cx + Math.round(Math.sin((H - 1) / 6));
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]])
    for (let n = 1; n <= 6; n++) s.put(tx + dx * n, H - Math.floor((n * n) / 9), cz + dz * n, pick(C.leaves, n, dx, dz));
  s.put(tx, H, cz, 0x6f9a5a);
}

const fi = (u: number) => Math.floor(u / FS + 1e-6);

/** Куст из мелких вокселей: несколько неровных шапок листвы, тёмный низ, светлые верхушки, ягоды или цветочки. */
export function bush(s: VoxelStore, x: number, z: number, r = 0.75, c = C.leaves) {
  const R = r / FS, cx = fi(x), cz = fi(z);
  const lumps: [number, number, number, number][] = [[0, R * 0.5, 0, R * 0.95]];
  const nl = 4 + Math.floor(hash(cx, 1, cz) * 2);
  for (let q = 0; q < nl; q++) {
    const a = (q / nl) * Math.PI * 2 + hash(cx, q, cz), d = R * (0.5 + hash(cz, q, cx) * 0.2);
    lumps.push([Math.cos(a) * d, R * (0.3 + hash(cx, q + 4, cz) * 0.35), Math.sin(a) * d, R * (0.45 + hash(cz, q + 2, cx) * 0.2)]);
  }
  const berry = hash(cx, 9, cz) > 0.5 ? 0xd8384a : 0xfaf2e6;
  const top = Math.ceil(R * 1.45), W = Math.ceil(R * 1.4);
  for (let i = -W; i <= W; i++) for (let j = 0; j <= top; j++) for (let k = -W; k <= W; k++) {
    let best = 9;
    for (const [lx, ly, lz, lr] of lumps) best = Math.min(best, Math.hypot((i - lx) / lr, (j - ly) / (lr * 0.9), (k - lz) / lr));
    const nz = hash(cx + i, j, cz + k);
    const d = best + nz * 0.12;
    if (d >= 1) continue;
    let col = pick(c, cx + i, j, cz + k);
    if (j <= 2) col = shade(col, 0.72 + j * 0.06);
    else if (d > 0.82 && j >= top * 0.6 && nz > 0.45) col = shade(col, 1.15);
    if (d > 0.85 && j > 3 && nz > 0.965) col = berry;
    s.putFine(cx + i, j, cz + k, col);
  }
}

/** Цветы на траве: ростки со стеблем и листьями, сверху цветок из лепестков с серединкой; между ними пучки травы. */
export function flowers(s: VoxelStore, x: number, z: number, w: number, d: number) {
  const stem = 0x4f7d42, leaf = 0x6f9a4a;
  for (let i = vi(x); i < vi(x + w); i++) for (let k = vi(z); k < vi(z + d); k++) {
    const n = hash(i, 9, k);
    // клетка 25 см: росток в случайной точке клетки
    const ox = i * 2 + (hash(i, 13, k) > 0.5 ? 1 : 0), oz = k * 2 + (hash(i, 14, k) > 0.5 ? 1 : 0);
    if (n > 0.74) {
      const h = 2 + Math.floor(hash(i, 10, k) * 3);
      for (let j = 0; j < h; j++) s.putFine(ox, j, oz, stem);
      s.putFine(ox + (hash(i, 12, k) > 0.5 ? 1 : -1), 1, oz, leaf);
      if (h > 3) s.putFine(ox, 2, oz + 1, leaf);
      const petal = pick(C.flowers, i, 0, k);
      const big = hash(i, 15, k) > 0.5;
      s.putFine(ox, h, oz, big ? 0xf2c230 : petal);
      if (big) for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) s.putFine(ox + a, h, oz + b, petal);
      else s.putFine(ox, h + 1, oz, petal);
    } else if (n > 0.35) {
      const g = pick(C.grass, i, 1, k);
      const t = 1 + Math.floor(hash(i, 16, k) * 3);
      for (let j = 0; j < t; j++) s.putFine(ox, j, oz, shade(g, 0.9 + j * 0.08));
      if (t > 1) s.putFine(ox + 1, 0, oz, g);
    }
  }
}

/** Камень из мелких вокселей: округлый валун и пара камешков рядом; верх светлее, низ темнее, кое-где мох. */
export function rock(s: VoxelStore, x: number, z: number, r = 0.6) {
  const R = r / FS, cx = fi(x), cz = fi(z);
  const parts: [number, number, number][] = [[0, 0, R]];
  const a = hash(cx, 3, cz) * Math.PI * 2;
  parts.push([Math.cos(a) * R * 1.05, Math.sin(a) * R * 1.05, R * 0.45]);
  if (R > 5) parts.push([Math.cos(a + 2.4) * R * 1.1, Math.sin(a + 2.4) * R * 1.1, R * 0.3]);
  for (const [px, pz, pr] of parts) {
    const ry = pr * 0.7, ri = Math.ceil(pr) + 1;
    for (let i = -ri; i <= ri; i++) for (let j = 0; j <= Math.ceil(ry); j++) for (let k = -ri; k <= ri; k++) {
      const gi = cx + Math.round(px) + i, gk = cz + Math.round(pz) + k;
      const dd = Math.hypot(i / pr, (j + 0.5) / (ry + 0.5), k / pr) + hash(gi, j, gk) * 0.05;
      if (dd >= 1) continue;
      const up = j / Math.max(1, ry);
      let col = up > 0.65 ? C.stone[2] : up > 0.25 ? pick(C.stone, gi, j, gk) : shade(C.stone[1], 0.86);
      if (up > 0.5 && dd > 0.78 && hash(gi >> 1, j + 7, gk >> 1) > 0.8) col = 0x6f8a4a; // мох пятнами
      s.putFine(gi, j, gk, col);
    }
  }
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

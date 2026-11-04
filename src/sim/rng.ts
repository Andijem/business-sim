/**
 * Детерминированный генератор mulberry32. Состояние — одно 32-битное число,
 * поэтому оно хранится прямо в сохранении и игра воспроизводится один в один.
 */
export interface Rng {
  s: number;
}

export function makeRng(seed: number): Rng {
  return { s: seed >>> 0 };
}

/** Число в [0, 1). Меняет состояние генератора. */
export function next(r: Rng): number {
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Целое в [0, n). */
export function int(r: Rng, n: number): number {
  return Math.floor(next(r) * n);
}

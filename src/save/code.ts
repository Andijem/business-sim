import { newGame } from '../sim/state';
import type { GameState } from '../sim/types';

/** Код прогресса для переноса между устройствами (защита от очистки данных в Safari). */
export function exportCode(st: GameState): string {
  const bytes = new TextEncoder().encode(JSON.stringify(st));
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

export function importCode(code: string): GameState | null {
  try {
    const bin = atob(code.trim());
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const st = JSON.parse(new TextDecoder().decode(bytes)) as GameState;
    return isGameState(st) ? st : null;
  } catch {
    return null;
  }
}

/** Совпадают ли поля объекта с образцом из новой игры (null в образце — любое значение). */
function sameShape(ref: object, x: unknown): boolean {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return Object.entries(ref).every(([k, v]) => {
    if (v === null || v === undefined) return true;
    if (Array.isArray(v)) return Array.isArray(o[k]);
    return typeof o[k] === typeof v;
  });
}

let REF: GameState | null = null;

/**
 * Сохранение подходит, если у игры, компаний и точек есть все поля текущей версии.
 * Сохранения из ранних сборок (до этапа 1) отбрасываются, чтобы не ломать экран.
 */
export function isGameState(x: unknown): x is GameState {
  REF ??= newGame(1);
  const s = x as GameState;
  if (!sameShape(REF, s) || s.version !== REF.version || s.companies.length !== 2) return false;
  const co = REF.companies[0];
  return s.companies.every((c) => sameShape(co, c) && sameShape(co.depts, c.depts)
    && c.points.every((p) => sameShape(co.points[0], p)));
}

import { newGame } from '../sim/state';
import { advanceDay } from '../sim/tick';
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

/** Дописывает в объект поля, которых нет в старом сохранении, значениями из новой игры. */
function fill(ref: object, x: Record<string, unknown>) {
  for (const [k, v] of Object.entries(ref)) if (!(k in x)) x[k] = structuredClone(v);
}

/**
 * Сохранение подходит, если это партия текущей версии. Поля, добавленные позже,
 * дописываются значениями по умолчанию; неполная статистика дня сбрасывается
 * (её пересчитает следующий день). Совсем чужие данные отбрасываются.
 */
export function isGameState(x: unknown): x is GameState {
  REF ??= newGame(1);
  const s = x as GameState;
  if (!s || typeof s !== 'object' || s.version !== REF.version || !Array.isArray(s.companies) || s.companies.length !== 2) return false;
  if (!s.companies.every((c) => c && typeof c.cash === 'number' && Array.isArray(c.points))) return false;
  fill(REF, s as unknown as Record<string, unknown>);
  const co = REF.companies[0];
  const pt = co.points[0];
  const statKeys = Object.keys(simulatedStats());
  for (const c of s.companies) {
    fill(co, c as unknown as Record<string, unknown>);
    fill(co.depts, c.depts as unknown as Record<string, unknown>);
    for (const p of c.points) {
      fill(pt, p as unknown as Record<string, unknown>);
      if (p.last && !statKeys.every((k) => typeof (p.last as unknown as Record<string, unknown>)[k] === 'number')) p.last = null;
    }
  }
  return sameShape(REF, s) && s.companies.every((c) => sameShape(co, c) && c.points.every((p) => sameShape(pt, p)));
}

let STATS: object | null = null;
/** Образец статистики дня: точка новой игры после одного дня. */
function simulatedStats(): object {
  if (!STATS) {
    const st = newGame(1);
    advanceDay(st);
    STATS = st.companies[0].points[0].last!;
  }
  return STATS;
}

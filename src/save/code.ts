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

export function isGameState(x: unknown): x is GameState {
  const s = x as GameState;
  return !!s && s.version === 1 && typeof s.day === 'number' && Array.isArray(s.companies) && s.companies.length === 2;
}

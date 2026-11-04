import { describe, expect, it } from 'vitest';
import { exportCode, importCode } from './code';
import { newGame } from '../sim/state';
import { advanceDay } from '../sim/tick';

describe('код прогресса', () => {
  it('переносит игру целиком, включая кириллицу', () => {
    const st = newGame(4);
    for (let i = 0; i < 20; i++) advanceDay(st);
    st.companies[0].name = 'Кофейня «Угол»';
    expect(importCode(exportCode(st))).toEqual(st);
  });
  it('мусор не ломает игру', () => {
    expect(importCode('не код')).toBeNull();
    expect(importCode(btoa('{"a":1}'))).toBeNull();
  });
  it('старое сохранение без новых полей отбрасывается', () => {
    const st = newGame(4) as unknown as { companies: { points: Record<string, unknown>[] }[] };
    delete st.companies[0].points[0].rep;
    expect(importCode(exportCode(st as never))).toBeNull();
  });
});

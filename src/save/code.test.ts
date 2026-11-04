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
  it('старое сохранение дополняется новыми полями и не ломается', () => {
    const st = newGame(4);
    advanceDay(st);
    const raw = st as unknown as { options?: unknown; companies: { points: Record<string, unknown>[] }[] };
    delete raw.options;
    delete raw.companies[0].points[0].newDays;
    delete (raw.companies[0].points[0].last as Record<string, unknown>).waitPen;
    const back = importCode(exportCode(st))!;
    expect(back.options).toEqual(newGame(1).options);
    expect(back.companies[0].points[0].newDays).toBe(7);
    expect(back.companies[0].points[0].last).toBeNull();
    advanceDay(back);
    expect(back.companies[0].points[0].last?.waitPen).toBeTypeOf('number');
  });
  it('партия с чужой структурой отбрасывается', () => {
    expect(importCode(exportCode({ version: 1, day: 3, companies: [{ cash: 1, points: [] }, {}] } as never))).toBeNull();
  });
});

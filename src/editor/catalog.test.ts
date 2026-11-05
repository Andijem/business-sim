import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ITEMS, defaults, newStage } from './catalog';
import { withColors } from './recolor';
import { exportText, parseImport } from './state';
import { hasKey } from '../i18n';

describe('редактор предметов', () => {
  it('у каждого предмета есть название, описание и подписи настроек', () => {
    for (const it of ITEMS) {
      expect(hasKey(`ed.item.${it.id}`), it.id).toBe(true);
      expect(hasKey(`ed.desc.${it.id}`), it.id).toBe(true);
      for (const p of it.params ?? []) {
        expect(hasKey(`ed.param.${p.key}`), `${it.id}.${p.key}`).toBe(true);
        for (const o of p.opts ?? []) if (!o.startsWith('#')) expect(hasKey(o), o).toBe(true);
      }
    }
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
  });

  it('каждый предмет собирается и что-то рисует, на крайних значениях настроек тоже', () => {
    for (const it of ITEMS) {
      const variants = [defaults(it), Object.fromEntries((it.params ?? []).map((p) => [p.key, p.max])), Object.fromEntries((it.params ?? []).map((p) => [p.key, p.min]))];
      for (const p of variants) {
        const st = newStage();
        it.build(st, p);
        const n = st.ctx.s.solid.size + st.ctx.s.glow.size + st.ctx.s.leaves.size + st.ctx.s.fine.size + st.ctx.s.cars.length + st.ctx.s.blocks.length + st.extra.length + st.figures.length;
        expect(n, it.id).toBeGreaterThan(0);
      }
    }
  });

  it('замена цвета перекрашивает модель и не трогает игру вне редактора', () => {
    const izba = ITEMS.find((i) => i.id === 'izba')!;
    const build = (map: Map<number, number>) => withColors(map, () => { const st = newStage(); izba.build(st, defaults(izba)); return st.ctx.s; });
    const a = build(new Map());
    const top = a.swatches[0].c;
    const b = build(new Map([[top, 0x123456]]));
    const colors = (s: typeof a.out) => new Set([...s.solid.values()].map((v) => v[3]));
    expect(colors(a.out).has(top)).toBe(true);
    expect(colors(b.out).has(top)).toBe(false);
    expect(colors(b.out).has(0x123456)).toBe(true);
    // вне редактора цвета не меняются
    const st = newStage();
    izba.build(st, defaults(izba));
    expect(new Set([...st.ctx.s.solid.values()].map((v) => v[3])).has(top)).toBe(true);
  });

  it('выгрузка читается обратно', () => {
    const state = { current: 'izba', items: { izba: { status: 'fix' as const, note: 'крышу ниже', colors: { '#8a5e3c': '#a06a40' } } } };
    const text = exportText(state, ITEMS, 'kopeechkino');
    expect(text).toContain('Изба');
    expect(text).toContain('крышу ниже');
    expect(parseImport(text)).toEqual(state.items);
  });

  it('здания бизнесов отдают крышу и фасад для разреза', () => {
    const coffee = ITEMS.find((i) => i.id === 'coffee')!;
    const st = newStage();
    coffee.build(st, defaults(coffee));
    expect(st.cutaway.length).toBe(2);
    expect(st.extra[0]).toBeInstanceOf(THREE.Group);
  });
});

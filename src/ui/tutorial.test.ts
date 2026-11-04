import { describe, expect, it } from 'vitest';
import { hasKey } from '../i18n';
import { newGame, advanceDay, endDay, finishDay } from '../sim';
import { makeSmart } from '../sim/strategies';
import { nextHint } from './tutorial';

describe('подсказки новичку', () => {
  it('первый день — прожить день', () => {
    expect(nextHint(newGame(1))).toEqual({ key: 'tut.first'.concat('Day'), target: 'day1' });
  });
  it('на всём пути до захвата у подсказки есть текст, карточка всегда первой', () => {
    const st = newGame(2);
    const smart = makeSmart();
    const seen = new Set<string>();
    for (let d = 0; d < 120; d++) {
      const h = nextHint(st);
      seen.add(h.key);
      expect(hasKey(h.key), h.key).toBe(true);
      if (st.pending.length) expect(h.key).toBe('tut.card');
      endDay(st);
      smart(st);
      finishDay(st);
    }
    expect(seen.has('tut.best')).toBe(true);
    expect(seen.has('tut.card')).toBe(true);
  });
  it('пассивный игрок видит подсказки, а не пустоту', () => {
    const st = newGame(3);
    for (let d = 0; d < 30; d++) advanceDay(st);
    expect(hasKey(nextHint(st).key)).toBe(true);
  });
});

import { sceneHint } from './play';
describe('подсказки на сцене', () => {
  it('первые дни объясняют экран, у всех подсказок есть текст', () => {
    const st = newGame(5);
    expect(sceneHint(st).key).toBe('tut.scene.firstDay');
    for (let d = 0; d < 20; d++) {
      expect(hasKey(sceneHint(st).key), sceneHint(st).key).toBe(true);
      advanceDay(st);
    }
  });
});

import { applyAction, cardDef, resolveCard } from '../sim';
import type { Action } from '../sim';
import { bestMove } from './advice';

/** Игрок, который делает только то, что говорит подсказка, а на карточки отвечает осторожно. */
function followHints(seed: number, days: number) {
  const st = newGame(seed);
  let third: number | null = null;
  const fails: string[] = [];
  for (let d = 0; d < days && !st.bankrupt; d++) {
    endDay(st);
    for (const pc of [...st.pending]) {
      const c = cardDef(pc.card);
      resolveCard(st, pc.uid, (c.options.find((o) => o.cautious) ?? c.options[0]).id);
    }
    for (let i = 0; i < 3; i++) {
      const h = nextHint(st);
      let x: Action | null = null;
      if (h.key === 'tut.queue' || h.key === 'tut.forSale') {
        const id = Number(/data-id="(\d+)"/.exec(h.sel ?? '')?.[1]);
        x = { a: h.key === 'tut.queue' ? 'hire' : 'buyout', id };
      } else if (h.key === 'tut.best' || h.key === 'tut.bestFree') x = bestMove(st)?.x ?? null;
      if (!x) break;
      const r = applyAction(st, x);
      if (!r.ok) {
        fails.push(`${st.day}: ${h.key} ${JSON.stringify(x)} → ${r.reason}`);
        break;
      }
    }
    finishDay(st);
    if (third == null && st.companies[0].points.length >= 3) third = st.day;
  }
  return { st, third, fails };
}

describe('от старта до третьей точки без тупиков', () => {
  it.each([1, 2, 3])('по одним подсказкам (сид %i): ходы проходят, третья точка до 30-го дня, к 70-му не в минусе', (seed) => {
    const { st, third, fails } = followHints(seed, 70);
    expect(fails).toEqual([]);
    expect(st.bankrupt).toBe(false);
    expect(third, 'третья точка').not.toBeNull();
    expect(third!).toBeLessThanOrEqual(30);
    expect(st.companies[0].cash).toBeGreaterThan(0);
  }, 60_000);
});

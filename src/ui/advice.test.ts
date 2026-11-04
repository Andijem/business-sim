import { describe, expect, it } from 'vitest';
import { newGame } from '../sim';
import { assistOn } from './advice';

describe('подсказки для новичка', () => {
  it('работают до трёх захваченных деревень', () => {
    const st = newGame(1);
    expect(assistOn(st)).toBe(true);
    st.captured = { kopeechkino: 50, barysh: 100 };
    expect(assistOn(st)).toBe(true);
    st.captured.groshevo = 150;
    expect(assistOn(st)).toBe(false);
  });
});

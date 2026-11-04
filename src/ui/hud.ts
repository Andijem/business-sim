import { t, tk } from '../i18n';
import type { GameState } from '../sim';
import { seasonOf } from '../sim';
import './hud.css';

export interface Hud {
  update(st: GameState): void;
}

export function mountHud(root: HTMLElement, onBalance: () => void): Hud {
  root.innerHTML = `
    <div class="top">
      <div class="chip"><small>${t('chip.cash')}</small><span data-k="cash"></span></div>
      <div class="chip"><small>${t('chip.reputation')}</small><span data-k="rep"></span></div>
      <div class="chip"><small data-k="day"></small><span data-k="season"></span></div>
    </div>
    <button class="balance-btn">${t('ui.balance')}</button>
    <div class="note">${t('hud.note')}</div>`;
  root.querySelector('.balance-btn')!.addEventListener('click', onBalance);
  const q = (k: string) => root.querySelector(`[data-k="${k}"]`)!;
  return {
    update(st) {
      const me = st.companies[0];
      const rep = me.points.length ? me.points.reduce((a, p) => a + p.rep, 0) / me.points.length : 0;
      q('cash').textContent = `✦ ${Math.round(me.cash).toLocaleString('ru-RU')}`;
      q('rep').textContent = `★ ${rep.toFixed(1)}`;
      q('day').textContent = t('chip.day', { day: st.day + 1 });
      q('season').textContent = tk(`season.${seasonOf(st.day)}`);
    },
  };
}

/** Подпись над точкой в 3D: позицию обновляет сцена при каждом кадре. */
export function makePin(root: HTMLElement, cls: string, title: string, sub: string) {
  const el = document.createElement('div');
  el.className = `pin ${cls}`;
  el.innerHTML = `${title}<small>${sub}</small>`;
  root.appendChild(el);
  return (x: number, y: number, visible: boolean) => {
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.display = visible ? '' : 'none';
  };
}

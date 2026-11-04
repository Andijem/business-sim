import { t } from '../i18n';
import './hud.css';

export function mountHud(root: HTMLElement) {
  root.innerHTML = `
    <div class="top">
      <div class="chip"><small>${t('chip.cash')}</small>✦ 18 420</div>
      <div class="chip"><small>${t('chip.reputation')}</small>★ 4.3</div>
      <div class="chip"><small>${t('chip.day', { day: 1, time: '09:15' })}</small>${t('chip.morning')}</div>
    </div>
    <div class="note">${t('stage0.note')}</div>`;
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

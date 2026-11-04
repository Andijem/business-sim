import { t, tk } from '../i18n';
import { DEPTS, ECO, VILLAGES, forecast, rivalry, seasonOf } from '../sim';
import type { GameState, NicheId } from '../sim';
import type { BalanceScreen, Sheet } from './balance';
import { nextHint, type Hint } from './tutorial';
import './play.css';

const money = (x: number) => Math.round(x).toLocaleString('ru-RU');
const signed = (x: number) => (x >= 0 ? '+' : '−') + money(Math.abs(x));
const ICON: Record<string, string> = { coffee: '☕', store: '🛒', wash: '🚗' };

/** Что экран просит у сцены и часов. */
export interface PlayHost {
  getState(): GameState;
  balance: BalanceScreen;
  /** Подлететь к точке игрока и показать её в разрезе. */
  focusPoint(id: number): void;
  /** Подлететь к свободному участку или точке Хваткина. */
  focusLot(village: string, niche: NicheId | null, rivalId?: number): void;
  focusVillage(id: string): void;
  speed(): number;
  setSpeed(x: number): void;
  endDayNow(): void;
  hour(): number;
  village(): string;
}

export interface PlayScreen {
  update(): void;
  /** Подписи над участками: позиции считает сцена. */
  pins: HTMLElement;
}

const hintsOn = () => { try { return localStorage.getItem('temka.hints') !== 'off'; } catch { return true; } };

/** Подсказка для сцены: те же правила, что в текстовом режиме, но первые дни объясняют новый экран. */
export function sceneHint(st: GameState): Hint {
  const h = nextHint(st);
  if (h.key === 'tut.firstDay') return { key: 'tut.scene.firstDay', target: 'skip' };
  if (h.key === 'tut.days') return { key: st.day < 2 ? 'tut.scene.tapPoint' : 'tut.scene.days', target: st.day < 2 ? 'strip' : 'skip' };
  return h;
}

/** Куда ведёт подсказка: шторка, которую откроет тап по ней. */
function hintSheet(st: GameState, h: Hint): Sheet | null {
  const sel = h.sel ?? '';
  const id = Number(/data-id="(\d+)"/.exec(sel)?.[1]);
  const v = /data-v="([^"]*)"/.exec(sel)?.[1];
  switch (h.target) {
    case 'card': return { kind: 'cards' };
    case 'dept': return { kind: 'depts' };
    case 'buyout': return id ? { kind: 'rival', id } : { kind: 'manage' };
    case 'open': {
      if (v) {
        const [village, niche] = v.split('|');
        return { kind: 'lot', village, niche: niche as NicheId };
      }
      return { kind: 'manage' };
    }
    case 'hire': case 'fire': case 'hall': case 'nicheUp': case 'priceUp': case 'priceDown': case 'raw': case 'format': case 'manager':
      return id ? { kind: 'point', id } : st.companies[0].points[0] ? { kind: 'point', id: st.companies[0].points[0].id } : null;
    default: return null;
  }
}

export function mountPlay(root: HTMLElement, host: PlayHost): PlayScreen {
  const el = document.createElement('div');
  el.className = 'play';
  root.appendChild(el);
  const pins = document.createElement('div');
  pins.className = 'pins';
  root.insertBefore(pins, el);
  let last = '';
  let hint: Hint | null = null;

  function render() {
    const st = host.getState();
    const me = st.companies[0];
    const upkeep = DEPTS.reduce((a, d) => a + ECO.deptUpkeep[me.depts[d]], 0);
    const yProfit = me.points.reduce((a, p) => a + (p.last?.profit ?? 0), 0) - upkeep;
    const rep = me.points.length ? me.points.reduce((a, p) => a + p.rep, 0) / me.points.length : 0;
    const h = host.hour();
    const clock = `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 6) * 10).padStart(2, '0')}`;
    const sp = host.speed();
    const villages = VILLAGES.filter((v) => st.unlocked.includes(v.id));
    hint = hintsOn() && !st.pending.length ? sceneHint(st) : null;
    const strip = me.points.map((p) => {
      const L = p.last;
      const warn = (L?.profit ?? 0) < 0 || (L ? L.qlost > 0.08 * L.served : false);
      return `<button class="pt${warn ? ' warn' : ''}" data-a="point" data-id="${p.id}">
        <span class="ic">${ICON[p.niche]}</span><b>${tk(`niche.${p.niche}`)}</b>
        <small>★ ${p.rep.toFixed(1)} · ${t('play.guests', { n: Math.round(L?.served ?? 0) })}</small>
        <em class="${(L?.profit ?? 0) < 0 ? 'neg' : ''}">${signed(L?.profit ?? 0)} ${t('play.perDay')}</em></button>`;
    }).join('');
    const html = `
      <div class="chips">
        <button class="chip cash" data-a="money"><small>${t('chip.cash')}</small>${money(me.cash)} Б
          <em class="${yProfit < 0 ? 'neg' : ''}">${t('play.yesterday', { v: signed(yProfit) })}</em></button>
        <button class="chip" data-a="stars"><small>${t('chip.reputation')}</small>★ ${rep.toFixed(1)}</button>
        <button class="chip" data-a="rival"><small>${t('play.rival')}</small>⚔️ ${Math.round(rivalry(st).share * 100)}%</button>
        <div class="chip"><small>${t('chip.day', { day: st.day + 1 })} · ${tk(`season.${seasonOf(st.day)}`)}</small>${clock}</div>
      </div>
      ${villages.length > 1 ? `<div class="vtabs">${villages.map((v) => `<button class="${v.id === host.village() ? 'on' : ''}" data-a="village" data-v="${v.id}">${tk(`village.${v.id}`)}</button>`).join('')}</div>` : ''}
      <div class="side">
        <button data-a="speed" class="${sp === 0 ? 'on' : ''}" title="${t('play.pause')}">${sp === 0 ? '▶' : '⏸'}</button>
        <button data-a="fast" class="${sp > 1 ? 'on' : ''}">×${sp > 1 ? 3 : 1}</button>
        <button data-a="skip" class="${hint?.target === 'skip' ? 'pulse' : ''}" title="${t('play.skip')}">⏭</button>
        <button data-a="depts" class="${hint?.target === 'dept' ? 'pulse' : ''}">🏢</button>
        <button data-a="full">📊</button>
        <button data-a="help">❓</button>
      </div>
      ${hint ? `<button class="bubble" data-a="hint">💡 ${tk(hint.key, {
        ...hint.params, niche: hint.params?.niche ? tk(`niche.${hint.params.niche}`) : '',
      })}</button>` : ''}
      <div class="strip${hint?.target === 'strip' ? ' pulse' : ''}">${strip}
        <button class="pt add${hint?.target === 'open' ? ' pulse' : ''}" data-a="add"><span class="ic">＋</span><b>${t('play.add')}</b>
          <small>${t('play.addHint')}</small></button></div>`;
    if (html !== last) {
      el.innerHTML = html;
      last = html;
      // точку, о которой говорит подсказка, подсвечиваем в полоске
      const id = /data-id="(\d+)"/.exec(hint?.sel ?? '')?.[1];
      if (id && hintSheet(st, hint!)?.kind === 'point') el.querySelector(`.pt[data-id="${id}"]`)?.classList.add('pulse');
    }
  }

  el.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest('button');
    if (!b) return;
    const st = host.getState();
    switch (b.dataset.a) {
      case 'point': {
        const id = Number(b.dataset.id);
        host.focusPoint(id);
        host.balance.open({ kind: 'point', id });
        break;
      }
      case 'money': host.balance.open({ kind: 'money' }); break;
      case 'rival': host.balance.open({ kind: 'rival', id: -1 }); break;
      case 'stars': {
        const p = st.companies[0].points[0];
        if (p) { host.focusPoint(p.id); host.balance.open({ kind: 'point', id: p.id }); }
        break;
      }
      case 'depts': host.balance.open({ kind: 'depts' }); break;
      case 'full': host.balance.open({ kind: 'full' }); break;
      case 'help': host.balance.open({ kind: 'help' }); break;
      case 'speed': host.setSpeed(host.speed() === 0 ? 1 : 0); break;
      case 'fast': host.setSpeed(host.speed() > 1 ? 1 : 3); break;
      case 'skip': host.endDayNow(); break;
      case 'village': host.focusVillage(b.dataset.v!); break;
      case 'add': {
        // ближайший свободный участок в открытых деревнях
        const v = VILLAGES.find((x) => x.id === host.village() && st.unlocked.includes(x.id)) ?? VILLAGES[0];
        host.focusLot(v.id, null);
        host.balance.open({ kind: 'manage' });
        break;
      }
      case 'hint': {
        if (!hint) break;
        const s = hintSheet(st, hint);
        if (s?.kind === 'point') host.focusPoint(s.id);
        if (s?.kind === 'lot') host.focusLot(s.village, s.niche);
        if (s?.kind === 'rival') host.focusLot('', null, s.id);
        if (s) host.balance.open(s);
        else if (hint.target === 'skip') host.endDayNow();
        break;
      }
    }
    render();
  });

  return {
    update: render,
    pins,
  };
}

/** Сколько денег принесёт день по прогнозу (для подписи «обычно»). */
export const typicalDay = (st: GameState) => forecast(st).perDay;

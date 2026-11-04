import { tk } from '../i18n';
import { DEPTS, NICHES, VILLAGES, baseline, effect, findPoint, freeLot, nichesOpen } from '../sim';
import type { Action, GameState, Raw, Seg, Try, WhatIf } from '../sim';

/** Сколько деревень игрок захватывает с подсказками; дальше он играет сам. */
export const ASSIST_VILLAGES = 3;
export const assistOn = (st: GameState) => Object.keys(st.captured).length < ASSIST_VILLAGES;

const money = (x: number) => Math.round(x).toLocaleString('ru-RU');
const signed = (x: number) => (x >= 0 ? '+' : '−') + money(Math.abs(x));

/** Отпечаток состояния: пока он тот же, примерки берутся из кэша. */
function stamp(st: GameState): string {
  const me = st.companies[0];
  return [st.seed, st.day, st.events.length, Math.round(me.cash), Object.values(me.depts).join(''),
    me.points.map((p) => [p.id, p.staff, p.hall, p.upgrades, p.priceIdx.toFixed(4), p.raw, p.seg, p.manager ? 1 : 0].join(':')).join(','),
    st.companies[1].points.length].join('|');
}

let key = '';
let base: ReturnType<typeof baseline> | undefined;
const cache = new Map<string, Try>();

/** Примерить действие: что оно даст через 2 недели по сравнению с «ничего не делать». */
export function tryAction(st: GameState, x: Action): Try {
  const k = stamp(st);
  if (k !== key) {
    key = k;
    base = undefined;
    cache.clear();
  }
  const ck = JSON.stringify(x);
  let r = cache.get(ck);
  if (!r) {
    base ??= baseline(st);
    r = effect(st, x, base);
    cache.set(ck, r);
  }
  return r;
}

/** Действие по кнопке точки (data-a и data-v). */
export function pointAction(id: number, a: string, v = ''): Action | null {
  switch (a) {
    case 'hire': case 'fire': case 'hall': case 'nicheUp': case 'priceUp': case 'priceDown': case 'manager': case 'buyout':
      return { a, id };
    case 'raw': return { a, id, raw: Number(v) as Raw };
    case 'format': return { a, id, seg: Number(v) as Seg };
    default: return null;
  }
}

/** Строка под кнопкой: сколько прибыли в день даст действие и когда окупится. */
export function fxText(e: Try): { text: string; cls: string } {
  if ('fail' in e) return { text: tk(`ui.fail.${e.fail}`), cls: 'muted' };
  const parts: string[] = [];
  parts.push(Math.abs(e.perDay) >= 10 ? tk('ui.fx.perDay', { v: signed(e.perDay) }) : tk('ui.fx.flat'));
  if (Math.abs(e.guests) >= 1) parts.push(tk('ui.fx.guests', { v: signed(e.guests) }));
  if (Math.abs(e.rep) >= 0.05) parts.push(`★ ${e.rep > 0 ? '+' : '−'}${Math.abs(e.rep).toFixed(1).replace('.', ',')}`);
  if (e.payback != null) parts.push(tk('ui.fx.payback', { days: e.payback }));
  else if (e.cost > 0) parts.push(tk('ui.fx.never'));
  if (e.short > 0) parts.push(tk('ui.fx.short', { v: money(e.short) }));
  return { text: `≈ ${parts.join(' · ')}`, cls: e.perDay >= 10 ? 'pos' : e.perDay <= -10 ? 'neg' : 'muted' };
}

export function fxHtml(e: Try | null): string {
  if (!e) return '';
  const f = fxText(e);
  return `<small class="fx ${f.cls}">${f.text}</small>`;
}

/** Все действия, которые сейчас имеет смысл примерить. */
export function candidates(st: GameState): Action[] {
  const out: Action[] = [];
  for (const p of st.companies[0].points) {
    for (const a of ['hire', 'hall', 'nicheUp', 'priceUp', 'priceDown'] as const) out.push({ a, id: p.id });
    for (const r of [-1, 0, 1] as Raw[]) if (r !== p.raw) out.push({ a: 'raw', id: p.id, raw: r });
  }
  for (const d of DEPTS) out.push({ a: 'dept', dept: d });
  for (const V of VILLAGES.filter((v) => st.unlocked.includes(v.id)))
    for (const n of nichesOpen(st.unlocked, V))
      if (freeLot(st, V.id, n)) for (const s of [-1, 0, 1] as Seg[]) out.push({ a: 'open', village: V.id, niche: n, seg: s });
  for (const p of st.companies[1].points) if (st.unlocked.includes(p.village)) out.push({ a: 'buyout', id: p.id });
  return out;
}

export interface Best { x: Action; e: WhatIf }

/** Лучший доступный ход: больше всего денег за 4 недели с учётом цены. */
export function bestMove(st: GameState): Best | null {
  let best: Best | null = null;
  let bestScore = 0;
  for (const x of candidates(st)) {
    const e = tryAction(st, x);
    if ('fail' in e || e.short > 0 || e.perDay < 50) continue;
    const score = e.perDay * 28 - e.cost;
    if (score > bestScore) {
      bestScore = score;
      best = { x, e };
    }
  }
  return best;
}

/** «Кофейня, Копеечкино» для точки игрока или Хваткина. */
export function placeOf(st: GameState, x: Action): string {
  if (x.a === 'open') return `${tk(`niche.${x.niche}`)}, ${tk(`village.${x.village}`)}`;
  if ('id' in x) {
    const p = findPoint(st, x.id) ?? st.companies[1].points.find((q) => q.id === x.id);
    if (p) return `${tk(`niche.${p.niche}`)}, ${tk(`village.${p.village}`)}`;
  }
  return '';
}

/** Человеческое описание хода для подсказки. */
export function describe(st: GameState, x: Action): string {
  const place = placeOf(st, x);
  switch (x.a) {
    case 'raw': return tk('ui.do.raw', { raw: tk(`raw.${x.raw}`), place });
    case 'format': return tk('ui.do.format', { seg: tk(`seg.${x.seg}`), place });
    case 'dept': return tk('ui.do.dept', { dept: tk(`dept.${x.dept}`) });
    case 'open': return tk('ui.do.open', { seg: tk(`segName.${x.niche}.${x.seg}`), place: tk(`village.${x.village}`) });
    case 'nicheUp': {
      const p = findPoint(st, x.id);
      const up = p ? NICHES[p.niche].upgrades[p.upgrades] : undefined;
      return tk('ui.do.nicheUp', { up: up ? tk(`upgrade.${up.id}`) : '', place });
    }
    default: return tk(`ui.do.${x.a}`, { place });
  }
}

/** Селектор кнопки, которую подсветить для хода. */
export function selectorOf(x: Action): string {
  if (x.a === 'dept') return `button[data-a="dept"][data-v="${x.dept}"]`;
  if (x.a === 'open') return `button[data-a="open"][data-v="${x.village}|${x.niche}|${x.seg}"]`;
  if (x.a === 'raw') return `button[data-a="raw"][data-id="${x.id}"]`;
  if (x.a === 'format') return `button[data-a="format"][data-id="${x.id}"][data-v="${x.seg}"]`;
  return `button[data-a="${x.a}"][data-id="${x.id}"]`;
}

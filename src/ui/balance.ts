import { t, tk } from '../i18n';
import {
  DEPTS, ECO, NICHES, VILLAGES, buyDept, buyNicheUpgrade, buyout, buyoutPrice, cardDef, changeFormat, countPoints,
  deptCap, endDay, finishDay, fire, fixedCosts, forecast, freeLot, yesterday, hallPrice, hire, loanLimit, nicheUpgradePrice, openPoint,
  OFFLINE_MAX_DAYS, openPrice, overdraftLimit, repFlow, rivalHistory, rivalry, repFromSat, seg, resolveCard, seasonOf, setManager, setPrice, setRaw, setUsn, takeLoan, upgradeHall,
} from '../sim';
import type { GameEvent, GameState, NicheId, Point, Raw, Result, Seg } from '../sim';
import { makeSmart } from '../sim/strategies';
import { nextHint } from './tutorial';
import { ASSIST_VILLAGES, assistOn, fxHtml as fxRaw, pointAction, tryAction } from './advice';
import { log } from '../sim';
import { ACHIEVEMENTS, BOOSTS, SPEED_MS, buyBoost, type BoostId } from '../meta/coins';
import { getMeta, saveMetaNow } from '../meta/store';
import { musicIsOn, soundOn, toggleMusic, toggleSound } from './sound';
import './balance.css';

const money = (x: number) => Math.round(x).toLocaleString('ru-RU');
const signed = (x: number) => (x >= 0 ? '+' : '−') + money(Math.abs(x));
const SEG_LIST: Seg[] = [-1, 0, 1];
import { NICHE_ICON as ICON } from './icons';
type Tab = 'points' | 'money' | 'manage';
const TABS: Tab[] = ['points', 'money', 'manage'];

/** На какой вкладке живёт кнопка, которую подсвечивает подсказка. */
const TAB_OF: Record<string, Tab> = {
  hire: 'points', fire: 'points', hall: 'points', nicheUp: 'points', priceUp: 'points', priceDown: 'points',
  raw: 'points', format: 'points', manager: 'points',
  dept: 'manage', open: 'manage', buyout: 'manage', auto7: 'manage', new: 'manage',
};

/** Подставляет русские названия вместо идентификаторов в параметрах событий. */
export function eventText(e: GameEvent): string {
  const p: Record<string, string | number> = { ...(e.params ?? {}) };
  if (typeof p.niche === 'string') p.niche = tk(`niche.${p.niche}`);
  if (typeof p.village === 'string') p.village = tk(`village.${p.village}`);
  if (typeof p.dept === 'string') p.dept = tk(`dept.${p.dept}`);
  if (p.seg != null) p.seg = tk(`seg.${p.seg}`);
  if (typeof p.up === 'string') p.up = tk(`upgrade.${p.up}`);
  if (typeof p.price === 'number') p.price = money(p.price);
  if (typeof p.amount === 'number') p.amount = money(p.amount);
  if (typeof p.card === 'string') {
    if (typeof p.option === 'string') p.option = tk(`card.${p.card}.${p.option}`);
    p.card = tk(`card.${p.card}.title`);
  }
  return tk(e.key, p);
}

/** Что показывает панель: весь текстовый режим или одну шторку поверх сцены. */
export type Sheet =
  | { kind: 'full' }
  | { kind: 'point'; id: number }
  | { kind: 'lot'; village: string; niche: NicheId }
  | { kind: 'rival'; id: number }
  | { kind: 'depts' }
  | { kind: 'cards' }
  | { kind: 'summary' }
  | { kind: 'money' }
  | { kind: 'manage' }
  | { kind: 'help' }
  | { kind: 'shop' }
  | { kind: 'away'; days: number; day0: number; cash0: number; max?: number };

export interface BalanceScreen {
  open(sheet?: Sheet): void;
  render(): void;
  isOpen(): boolean;
  close(): void;
}

/**
 * Текстовый режим игры: сверху касса и время, под ними решения и подсказка,
 * дальше три вкладки — мои точки, деньги, управление.
 * На этапе 2 его заменят сцена, карточка решения и шторка отдела.
 */
export function mountBalance(
  root: HTMLElement,
  getState: () => GameState,
  onChange: (st: GameState) => void,
  onNewGame: () => void,
  onImport: (code: string) => boolean,
  exportCode: () => string,
  onClose: () => void = () => {},
): BalanceScreen {
  let sheet: Sheet = { kind: 'full' };
  const el = document.createElement('div');
  el.className = 'balance hidden';
  root.appendChild(el);
  let toast = '';
  /** Окно в «Инструментах»: системные confirm/prompt в просмотрщиках HTML заблокированы. */
  let dialog: '' | 'new' | 'export' | 'import' = '';
  let dialogErr = false;
  let help = false;
  let tab: Tab = 'points';
  const smart = makeSmart();
  const store = {
    get: (): boolean => { try { return localStorage.getItem('temka.hints') !== 'off'; } catch { return true; } },
    set: (on: boolean) => { try { localStorage.setItem('temka.hints', on ? 'on' : 'off'); } catch { /* приватный режим */ } },
  };
  let hints = store.get();
  /** Прогноз под кнопками и подсказки сами выключаются после трёх захваченных деревень (кнопка «Подсказки» вернёт их). */
  const fxHtml: typeof fxRaw = (e) => (hints ? fxRaw(e) : '');
  /** Игрок дорос до большого бизнеса: один раз выключаем подсказки и пишем об этом. */
  function checkAssist(st: GameState) {
    if (!assistOn(st) && !st.events.some((e) => e.key === 'ev.assistOff')) {
      log(st, 'ev.assistOff', { n: ASSIST_VILLAGES });
      hints = false;
      store.set(false);
      toast = t('ui.assistOff', { n: ASSIST_VILLAGES });
      onChange(st);
    }
  }

  const act = (r: Result | boolean) => {
    toast = typeof r === 'object' && !r.ok ? tk(`ui.fail.${r.reason}`) : '';
    onChange(getState());
    render();
  };

  const day = (n: number, auto = false) => {
    const st = getState();
    for (let i = 0; i < n && !st.bankrupt; i++) {
      endDay(st);
      if (auto) smart(st);
      finishDay(st);
    }
    act(true);
  };

  const stat = (label: string, value: string, warn = false) =>
    `<div class="stat${warn ? ' warn' : ''}"><small>${label}</small>${value}</div>`;

  function pointCard(p: Point): string {
    const N = NICHES[p.niche];
    const L = p.last;
    const lost = Math.round(L?.lost ?? 0);
    const up = N.upgrades[p.upgrades];
    const st = getState();
    const fx = (a: string, extra: string) => {
      const x = pointAction(p.id, a, /data-v="([^"]*)"/.exec(extra)?.[1]);
      return x ? fxHtml(tryAction(st, x)) : '';
    };
    const btn = (a: string, label: string, extra = '') => `<button data-a="${a}" data-id="${p.id}" ${extra}>${label}${fx(a, extra)}</button>`;
    const ghost = (a: string, label: string, extra = '') => `<button class="ghost" data-a="${a}" data-id="${p.id}" ${extra}>${label}${fx(a, extra)}</button>`;
    const tags = [
      tk(`segName.${p.niche}.${p.seg}`),
      tk(`traffic.${p.traffic}`),
      p.newDays > 0 ? `✨ ${t('ui.novelty', { days: p.newDays })}` : '',
      p.closedDays > 0 ? `🔧 ${t('ui.closed', { days: p.closedDays })}` : '',
      p.manager ? `👔 ${t('ui.manager')}` : '',
    ].filter(Boolean).map((x) => `<span class="tag">${x}</span>`).join('');
    return `<div class="pcard">
      <div class="ptitle"><span class="icon">${ICON[p.niche] ?? '🏠'}</span>
        <div><b>${tk(`niche.${p.niche}`)}</b><small>${tk(`village.${p.village}`)}</small></div>
        <span class="stars">★ ${p.rep.toFixed(1)}</span></div>
      <div class="tags">${tags}</div>
      ${p.closedDays > 0 ? `<div class="btns"><button class="ghost coin" data-a="boost" data-v="rebuild" data-id="${p.id}">${t('shop.rebuildBtn', { cost: BOOSTS.rebuild.cost })}</button></div>` : ''}
      <div class="stats">
        ${stat(t('ui.st.guests'), `${t('ui.st.guestsVal', { served: Math.round(L?.served ?? 0), demand: Math.round(L?.demand ?? 0) })}${lost > 0 ? `<em>${t('ui.st.lost', { lost })}</em>` : ''}`, lost > 0.08 * (L?.served ?? 0))}
        ${stat(t('ui.st.profit'), `${signed(L?.profit ?? 0)} <small>${t('ui.perDay')}</small>`, (L?.profit ?? 0) < 0)}
        ${stat(t('ui.st.staff'), `${p.staff} / ${N.slots[p.hall]}`)}
        ${stat(t('ui.st.hall'), `${p.hall + 1} / 4`)}
        ${stat(t('ui.st.quality'), String(Math.round(L?.q ?? 0)))}
        ${stat(t('ui.st.service'), String(Math.round(L?.s ?? 0)))}
      </div>
      ${L ? repDetails(p) : ''}
      ${L ? `<details class="why"><summary>${t('ui.why')}</summary>${bdTable({
        rev: L.rev, cogs: L.cogs, wages: L.wages, rent: L.rent, acquiring: L.acquiring, repair: L.repair, depts: 0, profit: L.profit,
      }, false)}</details>` : ''}
      <div class="grp"><small>${t('ui.grp.people')}</small>${btn('hire', t('ui.hire'))}${ghost('fire', t('ui.fire'))}
        ${p.hall >= ECO.manager.minHall ? ghost('manager', p.manager ? t('ui.managerOff') : t('ui.manager')) : ''}</div>
      <div class="grp"><small>${t('ui.grp.growth')}</small>
        ${p.hall < 3 ? btn('hall', t('ui.hall', { level: p.hall + 2, cost: money(hallPrice(p)) })) : ''}
        ${up && p.upgrades < p.hall ? btn('nicheUp', t('ui.nicheUp', { name: tk(`upgrade.${up.id}`), cost: money(nicheUpgradePrice(p)) })) : ''}</div>
      <div class="grp"><small>${t('ui.grp.price')} · ${t('ui.priceNow', { price: p.priceIdx.toFixed(2), raw: tk(`raw.${p.raw}`) })}</small>
        ${ghost('priceDown', t('ui.priceDown'))}${ghost('priceUp', t('ui.priceUp'))}${([-1, 0, 1] as Raw[]).filter((r) => r !== p.raw).map((r) => ghost('raw', t('ui.raw', { raw: tk(`raw.${r}`) }), `data-v="${r}"`)).join('')}</div>
      <div class="grp"><small>${t('ui.grp.format')}</small>${SEG_LIST.filter((s) => s !== p.seg)
        .map((s) => ghost('format', t('ui.format', { seg: tk(`seg.${s}`), cost: money(openPrice(p.niche, s, p.village) * ECO.formatChange.costShare) }), `data-v="${s}"`))
        .join('')}</div>
    </div>`;
  }

  /** «Почему столько звёзд»: слагаемые довольства и куда движется рейтинг. */
  function repDetails(p: Point): string {
    const L = p.last!;
    const S = seg(p.seg);
    const [wq, ws, wv] = S.sat;
    const f = (x: number) => x.toFixed(0);
    const row = (k: string, v: number, params: Record<string, string | number> = {}) =>
      `<tr><td>${tk(`ui.rp.${k}`, params)}<small>${tk(`ui.rp.${k}.hint`)}</small></td><td class="${v < 0 ? 'neg' : 'pos'}">${v < 0 ? '−' : '+'}${f(Math.abs(v))}</td></tr>`;
    const target = repFromSat(L.sat);
    const trend = target > p.rep + 0.05 ? 'up' : target < p.rep - 0.05 ? 'down' : 'flat';
    const top = [wq, ws, wv].indexOf(Math.max(wq, ws, wv));
    return `<details class="why"><summary>${t('ui.rp.title', { rep: p.rep.toFixed(1).replace('.', ',') })}</summary>
      <small class="muted">${t('ui.rp.intro', { up: Math.round((repFlow(5) / repFlow(3) - 1) * 100) })}</small>
      <table class="bd">
        ${row('quality', wq * L.q, { v: f(L.q), w: String(wq).replace('.', ',') })}
        ${row('service', ws * L.s, { v: f(L.s), w: String(ws).replace('.', ',') })}
        ${row('value', wv * L.value, { v: f(L.value), w: String(wv).replace('.', ',') })}
        ${L.waitPen > 0.5 ? row('wait', -L.waitPen) : ''}
        ${L.needPen > 0.5 ? row('need', -L.needPen) : ''}
        <tr class="sum"><td>${t('ui.rp.sat')}</td><td>${f(L.sat)} / 100</td></tr></table>
      <div><b>${t(`ui.rp.trend.${trend}` as 'ui.rp.trend.up', { target: target.toFixed(1).replace('.', ',') })}</b></div>
      <small class="muted">${t('ui.rp.weights', { seg: tk(`segName.${p.niche}.${p.seg}`), top: tk(`ui.rp.w.${top}`) })}</small>
    </details>`;
  }

  /** Таблица «выручка минус расходы = прибыль» с подсказкой к каждой строке. */
  function bdTable(b: ReturnType<typeof yesterday>, withHints: boolean): string {
    const rows: [string, number][] = [
      ['rev', b.rev], ['cogs', -b.cogs], ['wages', -b.wages], ['rent', -b.rent], ['acquiring', -b.acquiring],
      ['repair', -b.repair], ['depts', -b.depts],
    ];
    const line = ([k, v]: [string, number]) => (v === 0 && k !== 'rev' ? '' : `<tr><td>${tk(`ui.bd.${k}`)}${
      withHints ? `<small>${tk(`ui.bd.${k}.hint`)}</small>` : ''}</td><td class="${v < 0 ? 'neg' : 'pos'}">${signed(v)}</td></tr>`);
    return `<table class="bd">${rows.map(line).join('')}<tr class="sum"><td>${t('ui.bd.profit')}${
      withHints ? `<small>${t('ui.bd.tax.hint')}</small>` : ''}</td><td class="${b.profit < 0 ? 'neg' : 'pos'}">${signed(b.profit)}</td></tr></table>`;
  }

  function pointsTab(st: GameState): string {
    return `<div class="muted legend">${t('ui.fx.legend')}</div>${st.companies[0].points.map(pointCard).join('')}`;
  }

  function moneyTab(st: GameState): string {
    const me = st.companies[0];
    const upkeep = DEPTS.reduce((a, d) => a + ECO.deptUpkeep[me.depts[d]], 0);
    const costs = me.points.reduce((a, p) => a + fixedCosts(p), 0) + upkeep;
    const tax = st.usn === 6
      ? me.seasonRev * ECO.tax.usn6
      : Math.max(ECO.tax.usn15 * (me.seasonRev - me.seasonCost), ECO.tax.usn15Min * me.seasonRev);
    const hist = st.revHistory.slice(-14);
    const max = Math.max(1, ...hist);
    const bars = hist.map((v) => `<i style="height:${Math.max(3, Math.round((v / max) * 48))}px" title="${money(v)}"></i>`).join('');
    const loans = st.loans.length
      ? st.loans.map((l) => `<div class="row">${t('ui.loanRow', {
          kind: tk(`ui.loan.${l.kind}`), principal: money(l.principal), payment: money(l.payment), weeks: l.weeksLeft,
        })}</div>`).join('')
      : `<div class="muted">${t('ui.noLoans')}</div>`;
    const limit = Math.floor(loanLimit(st) / 10000) * 10000;
    const fc = forecast(st);
    return `<div class="panel">
        <div class="big">${t('ui.money.cash')}: <b>${money(me.cash)} Б</b></div>
        <div>${t('ui.money.costs', { costs: money(costs) })}</div>
        ${hist.length ? `<small class="muted">${t('ui.money.chart')}</small><div class="bars">${bars}</div>` : ''}
      </div>
      <h3>${t('ui.fc.title')}</h3><div class="panel"><table class="bd">
        <tr><td>${t('ui.fc.perDay')}</td><td class="${fc.perDay < 0 ? 'neg' : 'pos'}">${signed(fc.perDay)}</td></tr>
        <tr><td>${t('ui.fc.season', { days: fc.daysToSeason })}</td><td class="neg">${signed(-fc.tax)}</td></tr>
        ${fc.loanPayments ? `<tr><td>${t('ui.fc.loans')}</td><td class="neg">${signed(-fc.loanPayments)}</td></tr>` : ''}
        <tr class="sum"><td>${t('ui.fc.cash')}</td><td>${money(fc.cashAtSeasonEnd)}</td></tr></table>
        <small class="muted">${t('ui.fc.note')}</small></div>
      <h3>${t('ui.bd.title')}</h3><div class="panel">${bdTable(yesterday(st), true)}</div>
      <h3>${t('ui.money.tax')}</h3><div class="panel">
        <div>${t('ui.usn', { usn: st.usn })} · ${t('ui.money.season', { rev: money(me.seasonRev), tax: money(tax) })}</div>
        <small class="muted">${t('ui.money.taxText')}</small>
        <div class="btns"><button class="ghost" data-a="usn">${t('ui.usnSwitch', { usn: st.usn === 6 ? 15 : 6 })}</button></div>
      </div>
      <h3>🏦 ${t('bank.name')}</h3><div class="panel">
        <small class="muted">${t('bank.tagline')}</small>
        ${loans}
        <div>${t('ui.money.overdraft', { limit: money(overdraftLimit(st)) })}</div>
        ${st.negDays > 0 ? `<div class="toast">${t('ui.money.negative', { days: st.negDays })}</div>` : ''}
        ${limit >= 10000 ? `<div class="btns"><button class="ghost" data-a="loan" data-v="${limit}">${t('ui.loanTake', { amount: money(limit) })}</button></div>` : ''}
      </div>
      <h3>${t('bank.products')}</h3><div class="panel bank">
        ${['account', 'books', 'acquiring', 'credit'].map((k) => `<div class="prod"><b>${tk(`bank.${k}`)}</b><small>${tk(`bank.${k}.fx`)}</small></div>`).join('')}
        <small class="muted">${t('bank.soon')}</small>
      </div>`;
  }

  /** Шкала «Ты против Хваткина»: доля рынка, расклад по нишам и лента его ходов. */
  function rivalBlock(st: GameState): string {
    const r = rivalry(st);
    const rv = st.companies[1];
    const pct = (x: number) => Math.round(x * 100);
    const bar = (x: number) => `<div class="vs"><i style="width:${pct(x)}%"></i></div>`;
    const trend = r.shareLastWeek == null ? ''
      : ` <small class="muted">${t('ui.vs.week', { pct: pct(r.shareLastWeek) })}</small>`;
    const verdict = r.share >= 0.6 ? 'lead' : r.share >= 0.45 ? 'even' : 'behind';
    const rows = r.niches.map((n) => `<div class="vsrow"><span>${ICON[n.niche]} ${tk(`niche.${n.niche}`)} · ${tk(`village.${n.village}`)}</span>
      ${bar(n.share)}<b>${pct(n.share)}%</b>
      <small class="muted">${t('ui.vs.line', { mine: Math.round(n.mine), theirs: Math.round(n.theirs), pm: n.pointsMine, pt: n.pointsTheirs })}</small></div>`).join('');
    const hist = rivalHistory(st).map((e) => `<div class="ev"><span>${e.day + 1}</span> ${eventText(e)}</div>`).join('')
      || `<div class="muted">${t('ui.vs.quiet')}</div>`;
    return `<h3>${t('ui.vs.title')}</h3><div class="panel">
        <div class="vstop"><span>${t('ui.vs.share')}</span><b>${pct(r.share)}%</b>${trend}</div>
        ${bar(r.share)}<div class="vslegend"><span>${t('ui.vs.me')}</span><span>${t('ui.vs.him')}</span></div>
        <div class="muted">${tk(`ui.vs.${verdict}`)}</div>
        ${rows}
        <div class="vshim">${t('ui.vs.state', { points: rv.points.filter((p) => !p.forSale).length, mkt: rv.depts.mkt, hr: rv.depts.hr, cash: money(rv.cash) })}</div>
        <details class="why"><summary>${t('ui.vs.howTitle')}</summary><div>${t('ui.vs.how')}</div></details>
        <h4>${t('ui.vs.history')}</h4>${hist}</div>`;
  }

  function dialogHtml(): string {
    const close = `<button class="ghost" data-a="dialogClose">${t('ui.cancel')}</button>`;
    if (dialog === 'new') return `<div class="panel dialog"><b>${t('ui.confirmNew')}</b>
      <div class="btns"><button data-a="newYes">${t('ui.newYes')}</button>${close}</div></div>`;
    if (dialog === 'export') return `<div class="panel dialog"><b>${t('ui.exportCode')}</b><small class="muted">${t('ui.exportHint')}</small>
      <textarea readonly rows="4">${exportCode()}</textarea>
      <div class="btns"><button data-a="copyCode">${t('ui.copy')}</button>${close}</div></div>`;
    if (dialog === 'import') return `<div class="panel dialog"><b>${t('ui.importPrompt')}</b>
      <textarea rows="4" data-k="code"></textarea>${dialogErr ? `<div class="toast">${t('ui.badCode')}</div>` : ''}
      <div class="btns"><button data-a="importGo">${t('ui.importCode')}</button>${close}</div></div>`;
    return '';
  }

  function manageTab(st: GameState): string {
    const villages = VILLAGES.map((V) => {
      const status = V.id in st.captured
        ? `✅ ${t('ui.captured', { day: st.captured[V.id] + 1 })}`
        : st.unlocked.includes(V.id)
          ? (Object.keys(V.lots) as NicheId[]).map((n) => {
              const mine = countPoints(st, 0, V.id, n);
              const theirs = countPoints(st, 1, V.id, n);
              return `<span class="tag ${mine > theirs ? 'ok' : ''}">${ICON[n]} ${t('ui.score', { niche: tk(`niche.${n}`), mine, theirs })}</span>`;
            }).join(' ')
          : `🔒 ${t('ui.locked')}`;
      return `<div class="row"><b>${tk(`village.${V.id}`)}</b><div class="tags">${status}</div></div>`;
    }).join('');
    const open: string[] = [];
    for (const V of VILLAGES.filter((v) => st.unlocked.includes(v.id))) {
      for (const n of Object.keys(V.lots) as NicheId[]) {
        if (freeLot(st, V.id, n)) open.push(openRow(st, V.id, n));
      }
    }
    const depts = deptsHtml(st);
    const rival = st.companies[1].points.map((p) => rivalRow(st, p)).join('');
    const events = st.events.slice(-14).reverse().map((e) => `<div class="ev"><span>${e.day + 1}</span> ${eventText(e)}</div>`).join('');
    return `${rivalBlock(st)}
      <h3>${t('ui.villages')}</h3><div class="panel">${villages}</div>
      <h3>${t('ui.open')}</h3><div class="panel">${open.join('') || `<div class="muted">${t('ui.noLots')}</div>`}</div>
      <h3>${t('ui.depts')}</h3><div class="panel">${depts}</div>
      <h3>${t('ui.rival')}</h3><div class="panel">${rival}</div>
      <h3>${t('ui.manage.tools')}</h3><div class="panel btns">
        <button data-a="auto7">${t('ui.auto7')}</button>
        <button class="ghost" data-a="export">${t('ui.exportCode')}</button>
        <button class="ghost" data-a="import">${t('ui.importCode')}</button>
        <button class="ghost" data-a="new">${t('ui.newGame')}</button></div>
      ${dialogHtml()}
      <h3>${t('ui.events')}</h3><div class="panel">${events}</div>`;
  }

  function deptsHtml(st: GameState): string {
    const me = st.companies[0];
    return DEPTS.map((d) => {
      const l = me.depts[d];
      const can = l < deptCap(st);
      return `<div class="row"><b>${tk(`dept.${d}`)}</b> · ${t('ui.level', { level: l })}
        <small class="muted">${tk(`ui.dept.${d}`)}</small>
        <div class="btns">${can ? `<button data-a="dept" data-v="${d}">${t('ui.deptBuy', { level: l + 1, cost: money(ECO.deptCost[l]) })}${fxHtml(tryAction(st, { a: 'dept', dept: d }))}${d === 'acc' ? `<small class="fx">${t('ui.fx.accNote')}</small>` : ''}</button>` : `<span class="muted">${t('ui.deptMax')}</span>`}</div></div>`;
    }).join('');
  }

  function rivalRow(st: GameState, p: Point): string {
    return `<div class="row">${ICON[p.niche]} ${t('ui.rivalLine', {
        niche: tk(`niche.${p.niche}`), village: tk(`village.${p.village}`), traffic: tk(`traffic.${p.traffic}`),
        rep: p.rep.toFixed(1), price: p.priceIdx.toFixed(2),
      })}${p.forSale ? ` <span class="tag warn">${t('ui.forSale')}</span>` : ''}
      ${st.unlocked.includes(p.village) ? `<div class="btns"><button data-a="buyout" data-id="${p.id}">${t('ui.buyout', { cost: money(buyoutPrice(p)) })}${fxHtml(tryAction(st, { a: 'buyout', id: p.id }))}</button></div>` : ''}</div>`;
  }

  /** Кнопки открытия точки на свободном участке. */
  function openRow(st: GameState, v: string, n: NicheId): string {
    return `<div class="row"><b>${ICON[n]} ${tk(`niche.${n}`)}</b> · ${tk(`village.${v}`)}<div class="btns">${SEG_LIST.map(
      (s) => `<button data-a="open" data-v="${v}|${n}|${s}">${tk(`segName.${n}.${s}`)} · ${money(openPrice(n, s, v))} Б${
        fxHtml(tryAction(st, { a: 'open', village: v, niche: n, seg: s }))}</button>`,
    ).join('')}<button class="ghost" data-a="openLoan" data-v="${v}|${n}|0">${t('ui.openLoan')}</button></div></div>`;
  }

  function cardsHtml(st: GameState): string {
    const me = st.companies[0];
    return st.pending.map((pc) => {
      const c = cardDef(pc.card);
      const p = me.points.find((x) => x.id === pc.pointId);
      return `<div class="card"><small>${p ? `${ICON[p.niche]} ${tk(`niche.${p.niche}`)} · ${tk(`village.${p.village}`)}` : ''}</small>
        <b>${tk(`card.${c.id}.title`)}</b><div>${tk(`card.${c.id}.text`)}</div>
        ${c.options.map((o) => `<button data-a="card" data-id="${pc.uid}" data-v="${o.id}">${tk(`card.${c.id}.${o.id}`)}<small>${tk(`card.${c.id}.${o.id}.hint`)}</small></button>`).join('')}</div>`;
    }).join('');
  }

  /** Итог дня: деньги, гости, события вчерашнего дня и совет на завтра. */
  function summaryHtml(st: GameState): string {
    const me = st.companies[0];
    const served = me.points.reduce((a, p) => a + (p.last?.served ?? 0), 0);
    const lost = me.points.reduce((a, p) => a + (p.last?.lost ?? 0), 0);
    const evs = st.events.filter((e) => e.day === st.day - 1 && !e.key.startsWith('ev.card'))
      .map((e) => `<div class="ev">${eventText(e)}</div>`).join('');
    const hint = hints ? nextHint(st) : null;
    const won = st.events.filter((e) => e.day === st.day - 1 && e.key === 'ev.captured');
    const opened = st.events.filter((e) => e.day === st.day - 1 && e.key === 'ev.unlocked');
    const win = won.map((e) => `<div class="win">🎉 ${t('ui.sum.captured', { village: tk(`village.${e.params?.village}`) })}
      ${opened.map((o) => `<div>${t('ui.sum.unlocked', { village: tk(`village.${o.params?.village}`) })}</div>`).join('')}</div>`).join('');
    return `${win}<h3>${t('ui.sum.title', { day: st.day })}</h3>
      <div class="panel"><div class="big">${t('ui.sum.guests', { served: Math.round(served), lost: Math.round(lost) })}</div>
      ${bdTable(yesterday(st), false)}</div>
      ${evs ? `<div class="panel">${evs}</div>` : ''}
      ${hint && hint.key.startsWith('tut.best') ? `<div class="hint"><b>💡</b> ${tk(hint.key, { ...hint.params })}</div>` : ''}
      <div class="btns"><button data-a="close">${t('ui.sum.next')}</button></div>`;
  }

  /** Монетки: ежедневный вход, ускорители, достижения. Оплаты в версии 0.1 нет. */
  function shopHtml(st: GameState): string {
    const m = getMeta();
    const now = Date.now();
    const until = (ms: number) => new Date(ms).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const closed = st.companies[0].points.filter((p) => p.closedDays > 0);
    const boost = (id: BoostId, active: string) => `<div class="boost"><div><b>${tk(`shop.${id}`)}</b><small>${tk(`shop.${id}.how`)}</small>
        ${active ? `<small class="pos">${active}</small>` : ''}</div>
        ${id === 'rebuild'
          ? closed.length ? closed.map((p) => `<button class="coin" data-a="boost" data-v="rebuild" data-id="${p.id}">${tk(`niche.${p.niche}`)} · ${BOOSTS.rebuild.cost} 🪙</button>`).join('')
            : `<small class="muted">${t('shop.rebuild.none')}</small>`
          : `<button class="coin" data-a="boost" data-v="${id}">${BOOSTS[id].cost} 🪙</button>`}</div>`;
    const ach = ACHIEVEMENTS.map((a) => {
      const done = m.achieved.includes(a.id);
      return `<div class="ach${done ? ' done' : ''}"><span>${done ? '✅' : '○'}</span><div><b>${tk(`ach.${a.id}`)}</b><small>${tk(`ach.${a.id}.how`)}</small></div><em>+${a.coins} 🪙</em></div>`;
    }).join('');
    return `<h3>${t('shop.title')}</h3><div class="panel">
        <div class="big">🪙 ${m.coins}</div>
        <small class="muted">${t('shop.rule')}</small>
        <div>${t('shop.streak', { days: m.streak, next: 5 + Math.min(m.streak, 5) })}</div>
        <div class="btns"><button class="ghost" data-a="buyCoins">${t('shop.buy')}</button></div>
      </div>
      <h3>${t('shop.boosts')}</h3><div class="panel">
        ${boost('speed', now < m.speedUntil ? t('shop.activeUntil', { at: until(m.speedUntil) }) : '')}
        ${boost('longOffline', now < m.longOfflineUntil ? t('shop.activeUntil', { at: until(m.longOfflineUntil) }) : '')}
        ${boost('rebuild', '')}
      </div>
      <h3>${t('shop.ach')}</h3><div class="panel">${ach}</div>`;
  }

  function sheetHtml(st: GameState): string {
    const me = st.companies[0];
    switch (sheet.kind) {
      case 'point': {
        const p = me.points.find((x) => x.id === (sheet as { id: number }).id);
        return p ? pointCard(p) : '';
      }
      case 'lot': {
        const { village: v, niche: n } = sheet;
        return freeLot(st, v, n) ? `<h3>${t('ui.sheet.lot')}</h3><div class="panel">${openRow(st, v, n)}</div>`
          : `<div class="muted">${t('ui.noLots')}</div>`;
      }
      case 'rival': {
        const id = sheet.id;
        const p = st.companies[1].points.find((x) => x.id === id);
        return `${p ? `<h3>${t('ui.rival')}</h3><div class="panel">${rivalRow(st, p)}</div>` : ''}${rivalBlock(st)}`;
      }
      case 'depts': return `<h3>${t('ui.depts')}</h3><div class="panel">${deptsHtml(st)}</div>`;
      case 'cards': return cardsHtml(st);
      case 'summary': return summaryHtml(st);
      case 'money': return moneyTab(st);
      case 'shop': return shopHtml(st);
      case 'manage': return manageTab(st);
      case 'away': {
        const { days, day0, cash0, max } = sheet;
        const evs = st.events.filter((e) => e.day >= day0 && !['ev.cardNew', 'ev.tax'].includes(e.key));
        const auto = evs.filter((e) => e.key === 'ev.cardAuto' || e.key === 'ev.managerCard').length;
        const shown = evs.filter((e) => e.key !== 'ev.cardAuto').slice(-12).map((e) => `<div class="ev"><span>${e.day + 1}</span> ${eventText(e)}</div>`).join('');
        return `<h3>${t('ui.away.title')}</h3><div class="panel">
          <div class="big">${t('ui.away.days', { days })}</div>
          <div>${t('ui.away.cash', { from: money(cash0), to: money(me.cash), delta: signed(me.cash - cash0) })}</div>
          ${auto ? `<small class="muted">${t('ui.away.cards', { n: auto })}</small>` : ''}</div>
          ${shown ? `<div class="panel">${shown}</div>` : ''}
          <small class="muted">${t('ui.away.note', { max: max ?? OFFLINE_MAX_DAYS })}</small>
          <div class="btns"><button data-a="close">${t('ui.sum.next')}</button></div>`;
      }
      case 'help': return `<h3>${t('tut.help')}</h3><div class="panel">${t('tut.scene.help')}</div><div class="panel">${t('tut.helpText')}</div>
        <div class="panel muted">${t('ui.a2hsHelp')}</div>
        <div class="btns"><button class="ghost" data-a="hints">${hints ? t('tut.hide') : t('tut.show')}</button>
          <button class="ghost" data-a="sound">${soundOn() ? t('ui.soundOff') : t('ui.soundOn')}</button>
          <button class="ghost" data-a="music">${musicIsOn() ? t('ui.musicOff') : t('ui.musicOn')}</button></div>`;
      default: return '';
    }
  }

  function render() {
    const st = getState();
    checkAssist(st);
    if (sheet.kind !== 'full') {
      if (sheet.kind === 'cards' && !st.pending.length) return close();
      el.className = 'balance sheet';
      el.innerHTML = `<div class="sheet-back" data-close="1"></div><div class="sheet-body">
        <button class="sheet-x" data-a="close">✕</button>
        ${toast ? `<div class="toast">${toast}</div>` : ''}${sheetHtml(st)}</div>`;
      return;
    }
    el.className = 'balance';
    const me = st.companies[0];
    const rep = me.points.length ? me.points.reduce((a, p) => a + p.rep, 0) / me.points.length : 0;
    const dayProfit = me.points.reduce((a, p) => a + (p.last?.profit ?? 0), 0)
      - DEPTS.reduce((a, d) => a + ECO.deptUpkeep[me.depts[d]], 0);
    const hint = hints ? nextHint(st) : { key: '' };
    const hintTab = hint.target ? TAB_OF[hint.target] : undefined;
    const hintHtml = hints
      ? `<div class="hint"><b>💡 ${t('tut.title')}</b> ${tk(hint.key, {
          ...hint.params, niche: hint.params?.niche ? tk(`niche.${hint.params.niche}`) : '',
        })}${hintTab && hintTab !== tab ? ` <b>${t('ui.goTab', { tab: tk(`ui.tab.${hintTab}`) })}</b>` : ''}
        <button class="link" data-a="hints">${t('tut.hide')}</button></div>`
      : '';
    const cards = cardsHtml(st);
    const body = tab === 'points' ? pointsTab(st) : tab === 'money' ? moneyTab(st) : manageTab(st);
    el.innerHTML = `
      <div class="bar">
        <div class="cash"><small>${t('ui.cash')}</small><b>${money(me.cash)} Б</b><button class="link em ${dayProfit < 0 ? 'neg' : ''}" data-a="tab" data-v="money">${t('ui.fcShort', { y: signed(dayProfit), sign: signed(forecast(st).perDay) })}</button></div>
        <div class="meta"><span>${t('ui.dayLine', { day: st.day + 1, season: tk(`season.${seasonOf(st.day)}`), year: Math.floor(st.day / 28) + 1 })}</span>
          <span>★ ${rep.toFixed(1)} · ${t('ui.pointsCount')}: ${me.points.length} · <button class="link" data-a="tab" data-v="manage">⚔️ ${Math.round(rivalry(st).share * 100)}%</button></span></div>
        <div class="time"><button data-a="day1">${t('ui.next1')}</button><button data-a="day7">${t('ui.next7')}</button></div>
        <div class="menu"><button class="link" data-a="help">${t('tut.help')}</button>
          ${hints ? '' : `<button class="link" data-a="hints">${t('tut.show')}</button>`}
          <button class="link" data-a="close">${t('ui.close')}</button></div>
      </div>
      ${st.bankrupt ? `<div class="toast">${t('ui.bankrupt')}</div>` : ''}
      ${toast ? `<div class="toast">${toast}</div>` : ''}
      ${help ? `<div class="help">${t('tut.helpText')}</div>` : ''}
      ${hintHtml}
      ${cards ? `<h3>${t('ui.cards')}</h3>${cards}` : ''}
      <nav class="tabs">${TABS.map((x) => `<button class="${x === tab ? 'on' : ''}${hints && x === hintTab && x !== tab ? ' pulse' : ''}" data-a="tab" data-v="${x}">${tk(`ui.tab.${x}`)}</button>`).join('')}</nav>
      <div class="tabbody">${body}</div>`;
    const bar = el.querySelector<HTMLElement>('.bar');
    if (bar) el.style.setProperty('--bar-h', `${bar.offsetHeight}px`);
    if (hints && hint.target) {
      const sel = hint.sel ?? (hint.target === 'card' ? '.card button' : `button[data-a="${hint.target}"]`);
      el.querySelector(sel)?.classList.add('pulse');
    }
  }

  function close() {
    el.classList.add('hidden');
    toast = '';
    sheet = { kind: 'full' };
    onClose();
  }

  el.addEventListener('click', (ev) => {
    if ((ev.target as HTMLElement).dataset.close) return close();
    const b = (ev.target as HTMLElement).closest('button');
    if (!b) return;
    const st = getState();
    const id = Number(b.dataset.id);
    const v = b.dataset.v ?? '';
    const p = st.companies[0].points.find((x) => x.id === id);
    switch (b.dataset.a) {
      case 'close': return close();
      case 'help': help = !help; return render();
      case 'hints': hints = !hints; store.set(hints); return render();
      case 'tab': tab = v as Tab; el.scrollTop = 0; return render();
      case 'day1': return day(1);
      case 'day7': return day(7);
      case 'auto7': return day(7, true);
      case 'hire': return act(hire(st, id));
      case 'fire': return act(fire(st, id));
      case 'hall': return act(upgradeHall(st, id));
      case 'nicheUp': return act(buyNicheUpgrade(st, id));
      case 'raw': return act(setRaw(st, id, Number(v) as Raw));
      case 'priceUp': return act(setPrice(st, id, (p?.priceIdx ?? 1) * 1.05));
      case 'priceDown': return act(setPrice(st, id, (p?.priceIdx ?? 1) / 1.05));
      case 'manager': return act(setManager(st, id, p?.manager ? null : { price: 'hold', raw: p?.raw ?? 0, hire: true }));
      case 'format': return act(changeFormat(st, id, Number(v) as Seg));
      case 'open':
      case 'openLoan': {
        const [vid, n, s] = v.split('|');
        const r = openPoint(st, vid, n as NicheId, Number(s) as Seg, { pay: b.dataset.a === 'openLoan' ? 'loan' : 'cash' });
        if (r.ok) {
          tab = 'points';
          if (sheet.kind !== 'full') sheet = { kind: 'point', id: st.companies[0].points[st.companies[0].points.length - 1].id };
        }
        return act(r);
      }
      case 'buyout': {
        const r = buyout(st, id);
        if (r.ok) {
          tab = 'points';
          if (sheet.kind !== 'full') sheet = { kind: 'point', id };
        }
        return act(r);
      }
      case 'dept': return act(buyDept(st, v as (typeof DEPTS)[number]));
      case 'card': return act(resolveCard(st, id, v));
      case 'usn': return act(setUsn(st, st.usn === 6 ? 15 : 6));
      case 'loan': return act(takeLoan(st, Number(v)));
      case 'boost': {
        const r = buyBoost(getMeta(), v as BoostId, Date.now(), st, id);
        if (r.ok) saveMetaNow();
        toast = r.ok ? tk(`shop.${v}.done`, { min: SPEED_MS / 60000 }) : '';
        if (!r.ok) return act(r);
        onChange(st);
        return render();
      }
      case 'sound': toggleSound(); return render();
      case 'music': toggleMusic(); return render();
      case 'buyCoins': toast = t('shop.noPay'); return render();
      case 'export':
      case 'import':
      case 'new':
        dialog = b.dataset.a as typeof dialog;
        dialogErr = false;
        return render();
      case 'dialogClose':
        dialog = '';
        return render();
      case 'copyCode': {
        const ta = el.querySelector<HTMLTextAreaElement>('.dialog textarea');
        ta?.select();
        navigator.clipboard?.writeText(exportCode()).catch(() => document.execCommand?.('copy'));
        return;
      }
      case 'importGo': {
        const code = el.querySelector<HTMLTextAreaElement>('[data-k="code"]')?.value.trim() ?? '';
        if (!code || !onImport(code)) {
          dialogErr = true;
          return render();
        }
        dialog = '';
        tab = 'points';
        render();
        return window.scrollTo(0, 0);
      }
      case 'newYes':
        dialog = '';
        tab = 'points';
        onNewGame();
        render();
        return window.scrollTo(0, 0);
    }
  });

  return {
    open(s: Sheet = { kind: 'full' }) {
      sheet = s;
      toast = '';
      el.classList.remove('hidden');
      el.scrollTop = 0;
      render();
    },
    render() {
      if (!el.classList.contains('hidden')) render();
    },
    isOpen: () => !el.classList.contains('hidden'),
    close,
  };
}

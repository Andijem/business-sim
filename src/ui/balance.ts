import { t, tk } from '../i18n';
import {
  DEPTS, ECO, NICHES, VILLAGES, buyDept, buyNicheUpgrade, buyout, buyoutPrice, cardDef, changeFormat, countPoints,
  deptCap, endDay, finishDay, fire, fixedCosts, forecast, freeLot, yesterday, hallPrice, hire, loanLimit, nicheUpgradePrice, openPoint,
  openPrice, overdraftLimit, repFlow, repFromSat, seg, resolveCard, seasonOf, setManager, setPrice, setRaw, setUsn, takeLoan, upgradeHall,
} from '../sim';
import type { GameEvent, GameState, NicheId, Point, Raw, Result, Seg } from '../sim';
import { makeSmart } from '../sim/strategies';
import { nextHint } from './tutorial';
import './balance.css';

const money = (x: number) => Math.round(x).toLocaleString('ru-RU');
const signed = (x: number) => (x >= 0 ? '+' : '−') + money(Math.abs(x));
const SEG_LIST: Seg[] = [-1, 0, 1];
const ICON: Record<string, string> = { coffee: '☕', store: '🛒', wash: '🚗' };
type Tab = 'points' | 'money' | 'manage';
const TABS: Tab[] = ['points', 'money', 'manage'];

/** На какой вкладке живёт кнопка, которую подсвечивает подсказка. */
const TAB_OF: Record<string, Tab> = {
  hire: 'points', hall: 'points', nicheUp: 'points',
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

export interface BalanceScreen {
  open(): void;
  render(): void;
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
): BalanceScreen {
  const el = document.createElement('div');
  el.className = 'balance hidden';
  root.appendChild(el);
  let toast = '';
  let help = false;
  let tab: Tab = 'points';
  const smart = makeSmart();
  const store = {
    get: (): boolean => { try { return localStorage.getItem('temka.hints') !== 'off'; } catch { return true; } },
    set: (on: boolean) => { try { localStorage.setItem('temka.hints', on ? 'on' : 'off'); } catch { /* приватный режим */ } },
  };
  let hints = store.get();

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
    const nextRaw = (((p.raw + 2) % 3) - 1) as Raw;
    const up = N.upgrades[p.upgrades];
    const btn = (a: string, label: string, extra = '') => `<button data-a="${a}" data-id="${p.id}" ${extra}>${label}</button>`;
    const ghost = (a: string, label: string, extra = '') => `<button class="ghost" data-a="${a}" data-id="${p.id}" ${extra}>${label}</button>`;
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
        ${ghost('priceDown', t('ui.priceDown'))}${ghost('priceUp', t('ui.priceUp'))}${ghost('raw', t('ui.raw', { raw: tk(`raw.${nextRaw}`) }), `data-v="${nextRaw}"`)}</div>
      <div class="grp"><small>${t('ui.grp.format')}</small>${SEG_LIST.filter((s) => s !== p.seg)
        .map((s) => ghost('format', t('ui.format', { seg: tk(`seg.${s}`), cost: money(openPrice(p.niche, s) * ECO.formatChange.costShare) }), `data-v="${s}"`))
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
    return st.companies[0].points.map(pointCard).join('');
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
      <h3>${t('ui.money.bank')}</h3><div class="panel">
        ${loans}
        <div>${t('ui.money.overdraft', { limit: money(overdraftLimit(st)) })}</div>
        ${st.negDays > 0 ? `<div class="toast">${t('ui.money.negative', { days: st.negDays })}</div>` : ''}
        ${limit >= 10000 ? `<div class="btns"><button class="ghost" data-a="loan" data-v="${limit}">${t('ui.loanTake', { amount: money(limit) })}</button></div>` : ''}
      </div>`;
  }

  function manageTab(st: GameState): string {
    const me = st.companies[0];
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
        if (!freeLot(st, V.id, n)) continue;
        open.push(`<div class="row"><b>${ICON[n]} ${tk(`niche.${n}`)}</b> · ${tk(`village.${V.id}`)}<div class="btns">${SEG_LIST.map(
          (s) => `<button data-a="open" data-v="${V.id}|${n}|${s}">${tk(`segName.${n}.${s}`)} · ${money(openPrice(n, s))} Б</button>`,
        ).join('')}<button class="ghost" data-a="openLoan" data-v="${V.id}|${n}|0">${t('ui.openLoan')}</button></div></div>`);
      }
    }
    const depts = DEPTS.map((d) => {
      const l = me.depts[d];
      const can = l < deptCap(st);
      return `<div class="row"><b>${tk(`dept.${d}`)}</b> · ${t('ui.level', { level: l })}
        <small class="muted">${tk(`ui.dept.${d}`)}</small>
        <div class="btns">${can ? `<button data-a="dept" data-v="${d}">${t('ui.deptBuy', { level: l + 1, cost: money(ECO.deptCost[l]) })}</button>` : `<span class="muted">${t('ui.deptMax')}</span>`}</div></div>`;
    }).join('');
    const rival = st.companies[1].points.map((p) => `<div class="row">${ICON[p.niche]} ${t('ui.rivalLine', {
        niche: tk(`niche.${p.niche}`), village: tk(`village.${p.village}`), traffic: tk(`traffic.${p.traffic}`),
        rep: p.rep.toFixed(1), price: p.priceIdx.toFixed(2),
      })}${p.forSale ? ` <span class="tag warn">${t('ui.forSale')}</span>` : ''}
      ${st.unlocked.includes(p.village) ? `<div class="btns"><button data-a="buyout" data-id="${p.id}">${t('ui.buyout', { cost: money(buyoutPrice(p)) })}</button></div>` : ''}</div>`).join('');
    const events = st.events.slice(-14).reverse().map((e) => `<div class="ev"><span>${e.day + 1}</span> ${eventText(e)}</div>`).join('');
    return `<h3>${t('ui.villages')}</h3><div class="panel">${villages}</div>
      <h3>${t('ui.open')}</h3><div class="panel">${open.join('') || `<div class="muted">${t('ui.noLots')}</div>`}</div>
      <h3>${t('ui.depts')}</h3><div class="panel">${depts}</div>
      <h3>${t('ui.rival')}</h3><div class="panel">${rival}</div>
      <h3>${t('ui.manage.tools')}</h3><div class="panel btns">
        <button data-a="auto7">${t('ui.auto7')}</button>
        <button class="ghost" data-a="export">${t('ui.exportCode')}</button>
        <button class="ghost" data-a="import">${t('ui.importCode')}</button>
        <button class="ghost" data-a="new">${t('ui.newGame')}</button></div>
      <h3>${t('ui.events')}</h3><div class="panel">${events}</div>`;
  }

  function render() {
    const st = getState();
    const me = st.companies[0];
    const rep = me.points.length ? me.points.reduce((a, p) => a + p.rep, 0) / me.points.length : 0;
    const dayProfit = me.points.reduce((a, p) => a + (p.last?.profit ?? 0), 0)
      - DEPTS.reduce((a, d) => a + ECO.deptUpkeep[me.depts[d]], 0);
    const hint = nextHint(st);
    const hintTab = hint.target ? TAB_OF[hint.target] : undefined;
    const hintHtml = hints
      ? `<div class="hint"><b>💡 ${t('tut.title')}</b> ${tk(hint.key, {
          ...hint.params, niche: hint.params?.niche ? tk(`niche.${hint.params.niche}`) : '',
        })}${hintTab && hintTab !== tab ? ` <b>${t('ui.goTab', { tab: tk(`ui.tab.${hintTab}`) })}</b>` : ''}
        <button class="link" data-a="hints">${t('tut.hide')}</button></div>`
      : '';
    const cards = st.pending.map((pc) => {
      const c = cardDef(pc.card);
      const p = me.points.find((x) => x.id === pc.pointId);
      return `<div class="card"><small>${p ? `${ICON[p.niche]} ${tk(`niche.${p.niche}`)} · ${tk(`village.${p.village}`)}` : ''}</small>
        <b>${tk(`card.${c.id}.title`)}</b><div>${tk(`card.${c.id}.text`)}</div>
        ${c.options.map((o) => `<button data-a="card" data-id="${pc.uid}" data-v="${o.id}">${tk(`card.${c.id}.${o.id}`)}<small>${tk(`card.${c.id}.${o.id}.hint`)}</small></button>`).join('')}</div>`;
    }).join('');
    const body = tab === 'points' ? pointsTab(st) : tab === 'money' ? moneyTab(st) : manageTab(st);
    el.innerHTML = `
      <div class="bar">
        <div class="cash"><small>${t('ui.cash')}</small><b>${money(me.cash)} Б</b><button class="link em ${dayProfit < 0 ? 'neg' : ''}" data-a="tab" data-v="money">${t('ui.fcShort', { y: signed(dayProfit), sign: signed(forecast(st).perDay) })}</button></div>
        <div class="meta"><span>${t('ui.dayLine', { day: st.day + 1, season: tk(`season.${seasonOf(st.day)}`), year: Math.floor(st.day / 28) + 1 })}</span>
          <span>★ ${rep.toFixed(1)} · ${t('ui.pointsCount')}: ${me.points.length}</span></div>
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
      const sel = hint.target === 'card' ? '.card button' : `button[data-a="${hint.target}"]`;
      el.querySelector(sel)?.classList.add('pulse');
    }
  }

  el.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest('button');
    if (!b) return;
    const st = getState();
    const id = Number(b.dataset.id);
    const v = b.dataset.v ?? '';
    const p = st.companies[0].points.find((x) => x.id === id);
    switch (b.dataset.a) {
      case 'close': el.classList.add('hidden'); return;
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
        if (r.ok) tab = 'points';
        return act(r);
      }
      case 'buyout': {
        const r = buyout(st, id);
        if (r.ok) tab = 'points';
        return act(r);
      }
      case 'dept': return act(buyDept(st, v as (typeof DEPTS)[number]));
      case 'card': return act(resolveCard(st, id, v));
      case 'usn': return act(setUsn(st, st.usn === 6 ? 15 : 6));
      case 'loan': return act(takeLoan(st, Number(v)));
      case 'export': {
        const code = exportCode();
        navigator.clipboard?.writeText(code).catch(() => {});
        prompt(t('ui.exportCode'), code);
        return;
      }
      case 'import': {
        const code = prompt(t('ui.importPrompt'));
        if (code && !onImport(code)) alert(t('ui.badCode'));
        return render();
      }
      case 'new':
        if (confirm(t('ui.confirmNew'))) onNewGame();
        return render();
    }
  });

  return {
    open() {
      el.classList.remove('hidden');
      render();
    },
    render() {
      if (!el.classList.contains('hidden')) render();
    },
  };
}

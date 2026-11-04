import { t, tk } from '../i18n';
import {
  DEPTS, ECO, NICHES, VILLAGES, buyDept, buyNicheUpgrade, buyout, buyoutPrice, cardDef, changeFormat, countPoints,
  deptCap, endDay, finishDay, fire, freeLot, hallPrice, hire, loanLimit, nicheUpgradePrice, openPoint, openPrice,
  resolveCard, seasonOf, setManager, setPrice, setRaw, setUsn, takeLoan, upgradeHall,
} from '../sim';
import type { GameEvent, GameState, NicheId, Raw, Result, Seg } from '../sim';
import { makeSmart } from '../sim/strategies';
import './balance.css';

const money = (x: number) => Math.round(x).toLocaleString('ru-RU');
const SEG_LIST: Seg[] = [-1, 0, 1];

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
 * Простой текстовый экран для проверки баланса: всё ядро доступно кнопками.
 * Позже его заменят сцена, карточка решения и шторка отдела (этап 2).
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
  const smart = makeSmart();

  const act = (r: Result | boolean) => {
    if (typeof r === 'object' && !r.ok) toast = tk(`ui.fail.${r.reason}`);
    else toast = '';
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

  function pointsHtml(st: GameState): string {
    return st.companies[0].points
      .map((p) => {
        const N = NICHES[p.niche];
        const L = p.last;
        const flags = [
          p.newDays > 0 ? t('ui.novelty', { days: p.newDays }) : '',
          p.closedDays > 0 ? t('ui.closed', { days: p.closedDays }) : '',
          p.manager ? t('ui.manager') : '',
        ].filter(Boolean);
        const nextRaw = (((p.raw + 2) % 3) - 1) as Raw;
        const up = N.upgrades[p.upgrades];
        const btn = (a: string, label: string, extra = '') => `<button data-a="${a}" data-id="${p.id}" ${extra}>${label}</button>`;
        return `<div class="row">
          <b>${t('ui.pointLine', {
            niche: tk(`niche.${p.niche}`), village: tk(`village.${p.village}`),
            format: tk(`segName.${p.niche}.${p.seg}`), traffic: tk(`traffic.${p.traffic}`),
          })}</b>${flags.length ? ` <i>${flags.join(' · ')}</i>` : ''}
          <div>${t('ui.pointStats', {
            rep: p.rep.toFixed(1), served: Math.round(L?.served ?? 0), demand: Math.round(L?.demand ?? 0),
            profit: money(L?.profit ?? 0), staff: p.staff, slots: N.slots[p.hall], hall: p.hall + 1, up: p.upgrades,
          })}</div>
          <div>${t('ui.pointFlags', { raw: tk(`raw.${p.raw}`), price: p.priceIdx.toFixed(2) })}</div>
          <div class="btns">
            ${btn('hire', t('ui.hire'))}${btn('fire', t('ui.fire'))}
            ${p.hall < 3 ? btn('hall', t('ui.hall', { level: p.hall + 2, cost: money(hallPrice(p)) })) : ''}
            ${up && p.upgrades < p.hall ? btn('nicheUp', t('ui.nicheUp', { name: tk(`upgrade.${up.id}`), cost: money(nicheUpgradePrice(p)) })) : ''}
            ${btn('raw', t('ui.raw', { raw: tk(`raw.${nextRaw}`) }), `data-v="${nextRaw}"`)}
            ${btn('priceUp', t('ui.priceUp'))}${btn('priceDown', t('ui.priceDown'))}
            ${p.hall >= ECO.manager.minHall ? btn('manager', p.manager ? t('ui.managerOff') : t('ui.manager')) : ''}
            ${SEG_LIST.filter((s) => s !== p.seg)
              .map((s) => btn('format', t('ui.format', { seg: tk(`seg.${s}`), cost: money(openPrice(p.niche, s) * ECO.formatChange.costShare) }), `data-v="${s}"`))
              .join('')}
          </div>
        </div>`;
      })
      .join('');
  }

  function openHtml(st: GameState): string {
    const rows: string[] = [];
    for (const V of VILLAGES.filter((v) => st.unlocked.includes(v.id))) {
      for (const n of Object.keys(V.lots) as NicheId[]) {
        if (!freeLot(st, V.id, n)) continue;
        rows.push(
          `<div class="row"><b>${tk(`village.${V.id}`)}</b> ${SEG_LIST.map(
            (s) => `<button data-a="open" data-v="${V.id}|${n}|${s}">${t('ui.openBtn', {
              niche: tk(`niche.${n}`), seg: tk(`seg.${s}`), cost: money(openPrice(n, s)),
            })}</button><button class="ghost" data-a="openLoan" data-v="${V.id}|${n}|${s}">${t('ui.openLoan')}</button>`,
          ).join(' ')}</div>`,
        );
      }
    }
    return rows.join('') || `<div class="muted">${t('ui.noLots')}</div>`;
  }

  function render() {
    const st = getState();
    const me = st.companies[0];
    const season = tk(`season.${seasonOf(st.day)}`);
    const loans = st.loans.length
      ? st.loans.map((l) => t('ui.loanRow', {
          kind: tk(`ui.loan.${l.kind}`), principal: money(l.principal), payment: money(l.payment), weeks: l.weeksLeft,
        })).join('<br>')
      : t('ui.noLoans');
    const cards = st.pending.length
      ? st.pending.map((pc) => {
          const c = cardDef(pc.card);
          return `<div class="card"><b>${tk(`card.${c.id}.title`)}</b><div>${tk(`card.${c.id}.text`)}</div>
            ${c.options.map((o) => `<button data-a="card" data-id="${pc.uid}" data-v="${o.id}">${tk(`card.${c.id}.${o.id}`)}<small>${tk(`card.${c.id}.${o.id}.hint`)}</small></button>`).join('')}</div>`;
        }).join('')
      : `<div class="muted">${t('ui.noCards')}</div>`;
    const rivalHtml = st.companies[1].points
      .map((p) => `<div class="row">${t('ui.rivalLine', {
        niche: tk(`niche.${p.niche}`), village: tk(`village.${p.village}`), traffic: tk(`traffic.${p.traffic}`),
        rep: p.rep.toFixed(1), price: p.priceIdx.toFixed(2),
      })}${p.forSale ? ` <i>${t('ui.forSale')}</i>` : ''}
        ${st.unlocked.includes(p.village) ? `<button data-a="buyout" data-id="${p.id}">${t('ui.buyout', { cost: money(buyoutPrice(p)) })}</button>` : ''}</div>`)
      .join('');
    const depts = DEPTS.map((d) => {
      const l = me.depts[d];
      const can = l < deptCap(st);
      return `<div class="row">${t('ui.deptLine', { dept: tk(`dept.${d}`), level: l })}
        ${can ? `<button data-a="dept" data-v="${d}">${t('ui.deptBuy', { level: l + 1, cost: money(ECO.deptCost[l]) })}</button>` : ''}</div>`;
    }).join('');
    const villages = VILLAGES.map((V) => {
      const status = V.id in st.captured
        ? t('ui.captured', { day: st.captured[V.id] + 1 })
        : st.unlocked.includes(V.id)
          ? (Object.keys(V.lots) as NicheId[]).map((n) => t('ui.score', {
              niche: tk(`niche.${n}`), mine: countPoints(st, 0, V.id, n), theirs: countPoints(st, 1, V.id, n),
            })).join(' · ')
          : t('ui.locked');
      return `<div class="row">${t('ui.villageLine', { village: tk(`village.${V.id}`), status })}</div>`;
    }).join('');
    const events = st.events.slice(-14).reverse()
      .map((e) => `<div class="ev"><span>${e.day + 1}</span> ${eventText(e)}</div>`).join('');
    const limit = loanLimit(st);
    el.innerHTML = `
      <header><b>${t('ui.title')}</b><button data-a="close">${t('ui.close')}</button></header>
      ${st.bankrupt ? `<div class="toast">${t('ui.bankrupt')}</div>` : ''}
      ${toast ? `<div class="toast">${toast}</div>` : ''}
      <section>
        <div>${t('ui.dayLine', { day: st.day + 1, season, year: Math.floor(st.day / 28) + 1 })}</div>
        <div class="big">${t('ui.cash')}: ${money(me.cash)} Б · ${t('ui.usn', { usn: st.usn })}
          <button class="ghost" data-a="usn">${t('ui.usnSwitch', { usn: st.usn === 6 ? 15 : 6 })}</button></div>
        <div>${t('ui.loans')}: ${loans} ${limit >= 10000 ? `<button class="ghost" data-a="loan" data-v="${Math.floor(limit / 10000) * 10000}">${t('ui.loanTake', { amount: money(Math.floor(limit / 10000) * 10000) })}</button>` : ''}</div>
        <div class="btns">
          <button data-a="day1">${t('ui.next1')}</button><button data-a="day7">${t('ui.next7')}</button>
          <button data-a="auto7">${t('ui.auto7')}</button>
          <button class="ghost" data-a="export">${t('ui.exportCode')}</button>
          <button class="ghost" data-a="import">${t('ui.importCode')}</button>
          <button class="ghost" data-a="new">${t('ui.newGame')}</button>
        </div>
      </section>
      <h3>${t('ui.cards')}</h3>${cards}
      <h3>${t('ui.villages')}</h3>${villages}
      <h3>${t('ui.myPoints')}</h3>${pointsHtml(st)}
      <h3>${t('ui.open')}</h3>${openHtml(st)}
      <h3>${t('ui.depts')}</h3>${depts}
      <h3>${t('ui.rival')}</h3>${rivalHtml}
      <h3>${t('ui.events')}</h3>${events}`;
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
        return act(openPoint(st, vid, n as NicheId, Number(s) as Seg, { pay: b.dataset.a === 'openLoan' ? 'loan' : 'cash' }));
      }
      case 'buyout': return act(buyout(st, id));
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

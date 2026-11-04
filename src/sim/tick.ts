import { log, player, rival } from './actions';
import { drawCards, expireCards, runScheduled } from './cards';
import { DEPTS, ECO, VILLAGES, village } from './data';
import { spawnRivals } from './state';
import { runManagers } from './manager';
import { simulateDay } from './market';
import { next } from './rng';
import type { DeptId, GameState } from './types';

export const YEAR = 28;
export const SEASON = 7;

/** Деревня захвачена, когда в каждой её нише у игрока больше точек, чем у Хваткина. */
export function checkCapture(st: GameState) {
  const unlockedNow = VILLAGES.filter((v) => st.unlocked.includes(v.id));
  for (const V of unlockedNow) {
    if (V.id in st.captured) continue;
    let ok = true;
    for (const niche of Object.keys(V.lots)) {
      const mine = player(st).points.filter((p) => p.village === V.id && p.niche === niche).length;
      const theirs = rival(st).points.filter((p) => p.village === V.id && p.niche === niche && !p.forSale).length;
      ok = ok && mine > theirs;
    }
    if (ok) {
      st.captured[V.id] = st.day;
      log(st, 'ev.captured', { village: V.id });
      const limit = st.options.villages ?? VILLAGES.length;
      const nextIdx = VILLAGES.findIndex((x) => x.id === V.unlocks);
      if (V.unlocks && !st.unlocked.includes(V.unlocks) && nextIdx < limit) {
        st.unlocked.push(V.unlocks);
        if (village(V.unlocks).lateRival) spawnRivals(st, V.unlocks);
        log(st, 'ev.unlocked', { village: V.unlocks });
      }
    }
  }
}

function seasonEnd(st: GameState) {
  const T = ECO.tax;
  st.companies.forEach((co, i) => {
    const isPlayer = i === 0;
    let tax = co.seasonRev * T.usn6;
    let chance = Math.max(0, T.fineChance - T.finePerAcc * co.depts.acc);
    if (isPlayer && st.usn === 15) {
      tax = Math.max(T.usn15 * (co.seasonRev - co.seasonCost), T.usn15Min * co.seasonRev);
      if (co.depts.acc < 2) chance *= T.usn15FineMultNoAcc2;
    }
    if (next(st.rng.market) < chance) {
      tax *= T.fineMult;
      if (isPlayer) log(st, 'ev.fine');
    }
    co.cash -= tax;
    if (isPlayer) log(st, 'ev.tax', { amount: Math.round(tax) });
    co.seasonRev = 0;
    co.seasonCost = 0;
  });
  // Хваткин: неделя в убытке — демпинг −10%, две недели — точка на продаже.
  for (const p of rival(st).points) {
    p.lossWeeks = p.weekProfit < 0 ? p.lossWeeks + 1 : 0;
    if (p.lossWeeks >= 1 && !p.cutPrice) {
      p.priceIdx *= ECO.rival.dumpMult;
      p.cutPrice = true;
      log(st, 'ev.rivalDump', { niche: p.niche, village: p.village });
    } else if (p.lossWeeks >= 2 && !p.forSale) {
      p.forSale = true;
      p.forSaleUntil = st.day + 7;
      log(st, 'ev.rivalSale', { niche: p.niche, village: p.village, id: p.id });
    }
  }
  for (const co of st.companies)
    for (const p of co.points) {
      p.weekRevLast = p.weekRev;
      p.weekRev = 0;
      p.weekProfit = 0;
    }
  if (st.options.finance) payLoans(st);
}

function payLoans(st: GameState) {
  const co = player(st);
  for (const l of st.loans) {
    const interest = l.principal * l.weekly;
    const pay = Math.min(l.payment, l.principal + interest);
    co.cash -= pay;
    l.principal = Math.max(0, l.principal + interest - pay);
    l.weeksLeft -= 1;
  }
  const done = st.loans.filter((l) => l.weeksLeft <= 0 || l.principal < 1);
  for (const l of done) log(st, l.kind === 'rescue' ? 'ev.rescuePaid' : 'ev.loanPaid');
  st.loans = st.loans.filter((l) => !done.includes(l));
}

export const overdraftLimit = (st: GameState): number => {
  const h = st.revHistory.slice(-7);
  const avg = h.length ? h.reduce((a, b) => a + b, 0) / h.length : 0;
  return avg * ECO.finance.overdraftRevenueDays;
};

/** Овердрафт до 3 дней выручки под 3% в неделю; 14 дней в минусе или выход за лимит — спасительный кредит. */
function overdraft(st: GameState) {
  const f = ECO.finance;
  const co = player(st);
  if (co.cash >= 0) {
    st.negDays = 0;
    return;
  }
  co.cash -= (-co.cash * f.overdraftWeekly) / 7;
  st.negDays += 1;
  const rescue = st.loans.some((l) => l.kind === 'rescue');
  if (co.cash < -overdraftLimit(st) || st.negDays >= f.rescueAfterDays) {
    if (rescue) {
      st.bankrupt = true;
      log(st, 'ev.bankrupt');
      return;
    }
    const amount = -co.cash;
    const r = f.rescueWeekly;
    const payment = (amount * r) / (1 - (1 + r) ** -f.rescueWeeks);
    st.loans.push({ kind: 'rescue', principal: amount, weekly: r, payment, weeksLeft: f.rescueWeeks });
    co.cash = 0;
    st.negDays = 0;
    log(st, 'ev.rescue', { amount: Math.round(amount) });
  }
}

/** Первая половина дня: рынок, расходы, конец сезона и года. Затем игрок (или автопилот) действует. */
export function endDay(st: GameState): { rain: boolean; afterRain: boolean } {
  const before = player(st).points.reduce((a, p) => a + p.weekRev, 0);
  const w = simulateDay(st);
  const revToday = player(st).points.reduce((a, p) => a + p.weekRev, 0) - before;
  st.revHistory.push(revToday);
  if (st.revHistory.length > 28) st.revHistory.shift();
  for (const co of st.companies) {
    const up = DEPTS.reduce((a, d) => a + ECO.deptUpkeep[co.depts[d]], 0);
    co.cash -= up;
    co.seasonCost += up;
  }
  for (const co of st.companies)
    for (const p of co.points) {
      for (const m of p.mods) if (m.days > 0) m.days -= 1;
      p.mods = p.mods.filter((m) => m.days !== 0);
    }
  if (st.day % SEASON === SEASON - 1) seasonEnd(st);
  if (st.day % YEAR === YEAR - 1) {
    for (const d of ECO.rival.yearlyDepts as DeptId[]) {
      const was = rival(st).depts[d];
      rival(st).depts[d] = Math.min(ECO.rival.deptCap, was + 1);
      if (rival(st).depts[d] > was) log(st, 'ev.rivalInvest', { dept: d, level: rival(st).depts[d] });
    }
  }
  if (st.options.rivalCloses) closeUnsold(st);
  if (st.options.finance) overdraft(st);
  runManagers(st);
  return w;
}

function closeUnsold(st: GameState) {
  const rv = rival(st).points;
  for (const p of [...rv]) {
    if (p.forSale && st.day >= p.forSaleUntil) {
      rv.splice(rv.indexOf(p), 1);
      log(st, 'ev.rivalClosed', { niche: p.niche, village: p.village });
    }
  }
}

/** Вторая половина дня: захват деревень, карточки, переход на следующий день. */
export function finishDay(st: GameState) {
  checkCapture(st);
  runScheduled(st);
  if (st.options.cards) {
    expireCards(st);
    drawCards(st);
  }
  st.day += 1;
}

/** Целый день без решений игрока (для офлайн-прогресса и тестов). */
export function advanceDay(st: GameState) {
  endDay(st);
  finishDay(st);
}

/**
 * Офлайн-прогресс: пока игра закрыта, дни идут сами (автопилот), но медленнее, чем в игре:
 * 10–15 минут активной игры, потом 3–4 часа офлайна набирают неделю (решение FAJI).
 */
export const OFFLINE_MAX_DAYS = 7;
/** Сколько секунд отсутствия стоит один день автопилота: 30 минут, неделя за 3,5 часа. */
export const OFFLINE_DAY_SEC = 30 * 60;
export function catchUp(st: GameState, awaySec: number, daySec = OFFLINE_DAY_SEC, maxDays = OFFLINE_MAX_DAYS): number {
  const days = Math.max(0, Math.min(maxDays, Math.floor(awaySec / daySec)));
  for (let i = 0; i < days && !st.bankrupt; i++) advanceDay(st);
  return days;
}

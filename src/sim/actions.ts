import { DEPTS, ECO, NICHES, seg, village } from './data';
import { makePoint, takeLot } from './state';
import type { DeptId, GameState, ManagerRules, NicheId, Point, Raw, Seg, VillageId } from './types';

export type Result = { ok: true } | { ok: false; reason: string };
const OK: Result = { ok: true };
const fail = (reason: string): Result => ({ ok: false, reason });

export function log(st: GameState, key: string, params?: Record<string, string | number>) {
  st.events.push({ day: st.day, key, params });
  if (st.events.length > 400) st.events.splice(0, st.events.length - 400);
}

export const player = (st: GameState) => st.companies[0];
export const rival = (st: GameState) => st.companies[1];

export function findPoint(st: GameState, id: number): Point | undefined {
  return st.companies[0].points.find((p) => p.id === id) ?? st.companies[1].points.find((p) => p.id === id);
}

/** Точек ниши в деревне у владельца (точки на продаже Хваткин в счёт захвата не берёт). */
export function countPoints(st: GameState, owner: 0 | 1, v: VillageId, niche: NicheId, skipForSale = owner === 1) {
  return st.companies[owner].points.filter((p) => p.village === v && p.niche === niche && !(skipForSale && p.forSale))
    .length;
}

export function freeLot(st: GameState, v: VillageId, niche: NicheId): boolean {
  const used = st.companies.reduce(
    (n, c) => n + c.points.filter((p) => p.village === v && p.niche === niche).length,
    0,
  );
  return used < (village(v).lots[niche] ?? 0);
}

/** Пока действует спасительный кредит, расширение заморожено. */
export const frozen = (st: GameState): boolean => st.loans.some((l) => l.kind === 'rescue');

export const openPrice = (niche: NicheId, s: Seg): number => NICHES[niche].openCost * seg(s).open;

export interface OpenOpts {
  raw?: Raw;
  priceIdx?: number;
  pay?: 'cash' | 'loan';
}

export function openPoint(st: GameState, v: VillageId, niche: NicheId, s: Seg, o: OpenOpts = {}): Result {
  if (frozen(st)) return fail('frozen');
  if (!st.unlocked.includes(v)) return fail('locked');
  if (!(niche in village(v).lots)) return fail('niche');
  if (!freeLot(st, v, niche)) return fail('noLot');
  const cost = openPrice(niche, s);
  const co = player(st);
  if (o.pay === 'loan') {
    const r = takeLoan(st, cost);
    if (!r.ok) return r;
  } else if (co.cash < cost) return fail('cash');
  co.cash -= cost;
  const p = makePoint(st, niche, v, 0, { raw: o.raw ?? 0, priceIdx: o.priceIdx ?? 1.0, seg: s });
  p.newDays = ECO.novelty.days;
  p.traffic = takeLot(st, v, niche);
  co.points.push(p);
  log(st, 'ev.open', { niche, village: v });
  return OK;
}

export function hire(st: GameState, id: number): Result {
  const p = findPoint(st, id);
  if (!p || p.owner !== 0) return fail('point');
  if (p.staff >= NICHES[p.niche].slots[p.hall]) return fail('slots');
  p.staff += 1;
  log(st, 'ev.hire', { niche: p.niche, village: p.village, staff: p.staff });
  return OK;
}

export function fire(st: GameState, id: number): Result {
  const p = findPoint(st, id);
  if (!p || p.owner !== 0) return fail('point');
  if (p.staff <= 1) return fail('lastStaff');
  p.staff -= 1;
  return OK;
}

export const hallPrice = (p: Point): number => NICHES[p.niche].hallCost[p.hall + 1] * seg(p.seg).open;

export function upgradeHall(st: GameState, id: number): Result {
  const p = findPoint(st, id);
  if (!p || p.owner !== 0) return fail('point');
  if (frozen(st)) return fail('frozen');
  if (p.hall >= 3) return fail('max');
  const cost = hallPrice(p);
  if (player(st).cash < cost) return fail('cash');
  player(st).cash -= cost;
  p.hall += 1;
  log(st, 'ev.hall', { niche: p.niche, village: p.village, level: p.hall + 1 });
  return OK;
}

/** Прокачки ниши открываются по одной на зале 2, 3 и 4. */
export const nicheUpgradePrice = (p: Point): number =>
  NICHES[p.niche].openCost * seg(p.seg).open * ECO.nicheUpgradeCost[p.upgrades];

export function buyNicheUpgrade(st: GameState, id: number): Result {
  const p = findPoint(st, id);
  if (!p || p.owner !== 0) return fail('point');
  if (frozen(st)) return fail('frozen');
  if (p.upgrades >= 3) return fail('max');
  if (p.upgrades >= p.hall) return fail('hall');
  const cost = nicheUpgradePrice(p);
  if (player(st).cash < cost) return fail('cash');
  player(st).cash -= cost;
  p.upgrades += 1;
  log(st, 'ev.nicheUpgrade', { niche: p.niche, village: p.village, up: NICHES[p.niche].upgrades[p.upgrades - 1].id });
  return OK;
}

/** Уровень отдела не выше числа точек + 1 (и не выше 5). */
export const deptCap = (st: GameState): number => Math.min(5, player(st).points.length + 1);

export function buyDept(st: GameState, d: DeptId): Result {
  if (!DEPTS.includes(d)) return fail('dept');
  if (frozen(st)) return fail('frozen');
  const co = player(st);
  const l = co.depts[d];
  if (l >= deptCap(st)) return fail('cap');
  const cost = ECO.deptCost[l];
  if (co.cash < cost) return fail('cash');
  co.cash -= cost;
  co.depts[d] += 1;
  log(st, 'ev.dept', { dept: d, level: l + 1 });
  return OK;
}

/** Цена выкупа точки Хваткина: 0,5 (или 0,3 на продаже) цены открытия + 10 дней её прибыли. */
export function buyoutPrice(p: Point): number {
  const b = ECO.buyout;
  const base = NICHES[p.niche].openCost * seg(p.seg).open * (p.forSale ? b.forSaleShare : b.openShare);
  return roundHalfEven((base + b.profitDays * Math.max(0, p.profitEma ?? 0)) / 1000) * 1000;
}

function roundHalfEven(x: number): number {
  const f = Math.floor(x);
  const d = x - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

export function buyout(st: GameState, id: number, o: { priceIdx?: number; raw?: Raw } = {}): Result {
  const p = findPoint(st, id);
  if (!p || p.owner !== 1) return fail('point');
  if (frozen(st)) return fail('frozen');
  if (!st.unlocked.includes(p.village)) return fail('locked');
  const price = buyoutPrice(p);
  const co = player(st);
  if (co.cash < price) return fail('cash');
  co.cash -= price;
  const rv = rival(st).points;
  rv.splice(rv.indexOf(p), 1);
  p.owner = 0;
  p.forSale = false;
  p.forSaleUntil = -1;
  if (o.priceIdx != null) p.priceIdx = o.priceIdx;
  if (o.raw != null) p.raw = o.raw;
  co.points.push(p);
  log(st, 'ev.buyout', { niche: p.niche, village: p.village, price });
  return OK;
}

export function setPrice(st: GameState, id: number, priceIdx: number): Result {
  const p = findPoint(st, id);
  if (!p || p.owner !== 0) return fail('point');
  p.priceIdx = Math.max(0.5, Math.min(2, priceIdx));
  return OK;
}

export function setRaw(st: GameState, id: number, raw: Raw): Result {
  const p = findPoint(st, id);
  if (!p || p.owner !== 0) return fail('point');
  p.raw = raw;
  return OK;
}

/** Смена формата: ремонт за 50% цены открытия нового формата, 3 дня закрыто, репутация наполовину к 3★. */
export function changeFormat(st: GameState, id: number, s: Seg): Result {
  const p = findPoint(st, id);
  if (!p || p.owner !== 0) return fail('point');
  if (p.seg === s) return fail('same');
  if (frozen(st)) return fail('frozen');
  const cost = openPrice(p.niche, s) * ECO.formatChange.costShare;
  if (player(st).cash < cost) return fail('cash');
  player(st).cash -= cost;
  p.seg = s;
  p.closedDays = ECO.formatChange.closedDays;
  p.rep = (p.rep + 3) / 2;
  p.satEma = 25 + ((p.rep - 1) / 4) * 55;
  log(st, 'ev.format', { niche: p.niche, village: p.village, seg: s });
  return OK;
}

/** Управляющий: только при зале 3-го уровня, стоит полторы зарплаты. */
export function setManager(st: GameState, id: number, rules: ManagerRules | null): Result {
  const p = findPoint(st, id);
  if (!p || p.owner !== 0) return fail('point');
  if (rules && p.hall < ECO.manager.minHall) return fail('hall');
  p.manager = rules;
  return OK;
}

/** Режим УСН: выбирается в первый сезон, потом раз в год весной и только с Бухгалтерией 2-го уровня. */
export function setUsn(st: GameState, usn: 6 | 15): Result {
  if (st.usn === usn) return OK;
  const year = Math.floor(st.day / 28);
  const firstSeason = st.day < 7 && st.usnYear < 0;
  const spring = st.day % 28 < 7;
  if (!firstSeason) {
    if (!spring) return fail('season');
    if (player(st).depts.acc < 2) return fail('acc');
    if (st.usnYear === year) return fail('year');
  }
  st.usn = usn;
  st.usnYear = year;
  log(st, 'ev.usn', { usn });
  return OK;
}

/** Кредит на развитие: один за раз, не больше 10 дней прибыли компании, платежи раз в сезон. */
export function loanLimit(st: GameState): number {
  const profit = player(st).points.reduce((a, p) => a + Math.max(0, p.profitEma ?? 0), 0);
  const owed = st.loans.reduce((a, l) => a + l.principal, 0);
  return Math.max(0, Math.round(profit * ECO.finance.loanMaxProfitDays - owed));
}

export function loanRate(st: GameState): number {
  const f = ECO.finance;
  return Math.max(0.01, f.loanWeekly - f.loanAccDiscount * player(st).depts.acc);
}

export function takeLoan(st: GameState, amount: number): Result {
  if (!st.options.finance) return fail('finance');
  if (frozen(st)) return fail('frozen');
  if (st.loans.filter((l) => l.kind === 'loan').length >= ECO.finance.loanMaxCount) return fail('limit');
  if (amount <= 0 || amount > loanLimit(st)) return fail('limit');
  const f = ECO.finance;
  const r = loanRate(st);
  const payment = (amount * r) / (1 - (1 + r) ** -f.loanWeeks);
  st.loans.push({ kind: 'loan', principal: amount, weekly: r, payment, weeksLeft: f.loanWeeks });
  player(st).cash += amount;
  log(st, 'ev.loan', { amount: Math.round(amount) });
  return OK;
}

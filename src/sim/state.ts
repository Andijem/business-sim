import { DEPTS, ECO, NICHES, START, VILLAGES, village } from './data';
import { makeRng } from './rng';
import type { Company, GameOptions, GameState, NicheId, Owner, Point, Raw, Seg, VillageId } from './types';

export interface PointInit {
  raw?: Raw;
  priceIdx?: number;
  staff?: number;
  rep?: number;
  seg?: Seg;
}

export function makePoint(st: GameState, niche: NicheId, v: VillageId, owner: Owner, o: PointInit = {}): Point {
  const rep = o.rep ?? 3.0;
  return {
    id: st.nextId++,
    niche,
    village: v,
    owner,
    seg: o.seg ?? 0,
    raw: o.raw ?? 0,
    priceIdx: o.priceIdx ?? 1.0,
    staff: o.staff ?? 1,
    skill: 40,
    hall: 0,
    upgrades: 0,
    rep,
    satEma: 25 + ((rep - 1) / 4) * 55,
    loyal: 0.4,
    broken: 0,
    weekRev: 0,
    weekProfit: 0,
    weekRevLast: 0,
    lossWeeks: 0,
    forSale: false,
    forSaleUntil: -1,
    cutPrice: false,
    traffic: 1.0,
    newDays: 0,
    handover: 0,
    revenge: 0,
    closedDays: 0,
    profitEma: null,
    last: null,
    mods: [],
    manager: null,
  };
}

function company(name: string, cash: number): Company {
  const depts = Object.fromEntries(DEPTS.map((d) => [d, 0])) as Company['depts'];
  return { name, cash, depts, points: [], seasonRev: 0, seasonCost: 0 };
}

export const allPoints = (st: GameState): Point[] => [...st.companies[0].points, ...st.companies[1].points];

/**
 * Лучший свободный участок для новой точки: участки ниши в деревне идут от бойкого к дворовому,
 * занятые вычёркиваются по их проходимости.
 */
export function takeLot(st: GameState, v: VillageId, niche: NicheId): number {
  const used = allPoints(st)
    .filter((p) => p.village === v && p.niche === niche)
    .map((p) => p.traffic)
    .sort((a, b) => b - a);
  const pool = [...(village(v).traffic[niche] ?? Array(9).fill(1.0))];
  for (const t of used) {
    const i = pool.indexOf(t);
    if (i >= 0) pool.splice(i, 1);
  }
  return pool.length ? pool[0] : 1.0;
}

export const DEFAULT_OPTIONS: GameOptions = { cards: true, finance: true, rivalCloses: true };

export function newGame(seed: number, options: Partial<GameOptions> = {}, playerInit: PointInit = {}): GameState {
  const st: GameState = {
    version: 1,
    seed,
    day: 0,
    rng: { market: makeRng(seed), cards: makeRng(seed ^ 0x9e3779b9) },
    companies: [company('player', START.playerCash), company('rival', START.rivalCash)],
    unlocked: [VILLAGES[0].id],
    captured: {},
    events: [],
    nextId: 1,
    usn: 6,
    usnYear: -1,
    revHistory: [],
    negDays: 0,
    loans: [],
    bankrupt: false,
    pending: [],
    scheduled: [],
    cardCooldown: {},
    options: { ...DEFAULT_OPTIONS, ...options },
  };
  const [player] = st.companies;
  const first = makePoint(st, START.player.niche as NicheId, START.player.village, 0, playerInit);
  first.newDays = ECO.novelty.days;
  player.points.push(first);
  for (const V of VILLAGES) if (!V.lateRival) spawnRivals(st, V.id);
  first.traffic = 1.0;
  return st;
}

/**
 * Точки Хваткина в деревне. Деревни v0.1 заселены с первого дня (как в модели баланса),
 * деревни с lateRival — в день, когда открываются: до этого их не видно и они не тратят случайные числа.
 */
export function spawnRivals(st: GameState, v: VillageId) {
  const rival = st.companies[1];
  const fresh: Point[] = [];
  for (const r of START.rival) {
    // Точка с after появляется, когда открывается та деревня (новые ниши старой деревни).
    if (((r as { after?: string }).after ?? r.village) !== v) continue;
    const p = makePoint(st, r.niche as NicheId, r.village, 1, { ...r, seg: -1 });
    p.skill = START.rivalSkill;
    rival.points.push(p);
    fresh.push(p);
  }
  // Район города: «Всё схвачено» держит долю участков каждой ниши во всех трёх сегментах.
  const R = village(v).rival;
  if (R) {
    for (const [niche, lots] of Object.entries(village(v).lots) as [NicheId, number][]) {
      const n = Math.max(1, Math.round(lots * R.share));
      for (let i = 0; i < n; i++) {
        const s = ([0, -1, 1] as Seg[])[i % 3];
        const p = makePoint(st, niche, v, 1, { seg: s, rep: R.rep, staff: Math.min(R.staff, NICHES[niche].slots[R.hall]) });
        p.skill = R.skill;
        p.hall = R.hall;
        rival.points.push(p);
        fresh.push(p);
      }
    }
  }
  // Хваткин занимает лучшие участки, стартовый киоск игрока стоит на обычной улице.
  for (const p of fresh) p.traffic = takeLot(st, p.village, p.niche);
}

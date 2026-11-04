import type { Rng } from './rng';
import type niches from './data/niches.json';

export type NicheId = keyof typeof niches;
export type VillageId = string;
export type DeptId = 'buy' | 'hr' | 'mkt' | 'acc';
/** Сегмент (формат) точки: −1 эконом, 0 средний, 1 премиум. */
export type Seg = -1 | 0 | 1;
/** Сырьё: −1 дешёвое, 0 обычное, 1 лучшее. */
export type Raw = -1 | 0 | 1;
export type Owner = 0 | 1; // 0 — игрок, 1 — ИП Хваткин

/** Временный или постоянный модификатор точки (от карточек и событий). */
export interface Mod {
  stat: 'flow' | 'price' | 'cogs' | 'quality' | 'service' | 'wage' | 'breakdown' | 'capacity' | 'loyal';
  mult?: number;
  add?: number;
  /** Сколько дней ещё действует; −1 — навсегда. */
  days: number;
  src: string;
}

export interface DayStats {
  demand: number;
  served: number;
  lost: number;
  qlost: number;
  util: number;
  q: number;
  s: number;
  sat: number;
  rev: number;
  profit: number;
  /** Разбор расходов дня: товар, зарплаты, аренда с коммуналкой, эквайринг, ремонт. */
  cogs: number;
  wages: number;
  rent: number;
  acquiring: number;
  repair: number;
  /** Слагаемые довольства: выгода цены, штраф за очередь, штраф премиум-гостя. */
  value: number;
  waitPen: number;
  needPen: number;
}

export interface ManagerRules {
  price: 'hold' | 'match';
  raw: Raw;
  hire: boolean;
}

export interface Point {
  id: number;
  niche: NicheId;
  village: VillageId;
  owner: Owner;
  seg: Seg;
  raw: Raw;
  priceIdx: number;
  staff: number;
  skill: number;
  /** Индекс уровня зала: 0..3 (зал 1..4). */
  hall: number;
  /** Сколько прокачек ниши куплено (0..3). */
  upgrades: number;
  rep: number;
  satEma: number;
  loyal: number;
  broken: number;
  weekRev: number;
  weekProfit: number;
  weekRevLast: number;
  lossWeeks: number;
  forSale: boolean;
  /** День, до которого висит предложение о продаже (Хваткин). */
  forSaleUntil: number;
  cutPrice: boolean;
  traffic: number;
  newDays: number;
  /** Дни передачи после выкупа: новый хозяин привыкает, сервис ниже. */
  handover: number;
  /** Дни демпинга Хваткина после выкупа его точки в этой деревне (цена ×0,9). */
  revenge: number;
  closedDays: number;
  profitEma: number | null;
  last: DayStats | null;
  mods: Mod[];
  manager: ManagerRules | null;
}

export interface Company {
  name: string;
  cash: number;
  depts: Record<DeptId, number>;
  points: Point[];
  seasonRev: number;
  seasonCost: number;
}

export interface GameEvent {
  day: number;
  key: string;
  params?: Record<string, string | number>;
}

export interface Loan {
  kind: 'loan' | 'rescue';
  principal: number;
  weekly: number;
  /** Платёж раз в сезон (неделю). */
  payment: number;
  weeksLeft: number;
}


export interface PendingCard {
  uid: number;
  card: string;
  pointId: number;
  day: number;
}

export interface GameOptions {
  /** Карточки решений. */
  cards: boolean;
  /** Овердрафт, кредиты, проценты. Выключается только для сверки с моделью баланса. */
  finance: boolean;
  /** Хваткин закрывает точку, если её не выкупили за 7 дней продажи. */
  rivalCloses: boolean;
  /** Сколько деревень в игре (по порядку открытия); не задано — все. Для сверки с моделью v0.1 — 2. */
  villages?: number;
}

export interface GameState {
  version: 1;
  seed: number;
  day: number;
  rng: { market: Rng; cards: Rng };
  companies: [Company, Company];
  unlocked: VillageId[];
  captured: Record<VillageId, number>;
  events: GameEvent[];
  nextId: number;
  usn: 6 | 15;
  usnYear: number;
  revHistory: number[];
  negDays: number;
  loans: Loan[];
  bankrupt: boolean;
  pending: PendingCard[];
  /** Отложенные последствия карточек («деньги вернут через неделю»). */
  scheduled: { day: number; pointId: number; card: string; effects: unknown[] }[];
  cardCooldown: Record<string, number>;
  options: GameOptions;
  /** День победы: захвачены все деревни и районы, «Всё схвачено» продаёт игроку вывеску. */
  wonDay?: number;
}

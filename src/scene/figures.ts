import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Фигурки для движущихся объектов: люди, машины, животные.
 * Каждая часть — одна геометрия из нескольких коробок с цветами вершин,
 * поэтому сотня фигурок рисуется несколькими InstancedMesh (по одному на часть).
 * Руки, ноги и хвосты — отдельные части с суставами: их поворачивает поза шага.
 * Смотрят вдоль +x, стоят на y = 0.
 */
type Box = [number, number, number, number, number, number, number];

/** Цвета вершин в нужном виде: без uv и без индексов, чтобы любые части склеивались. */
function painted(g: THREE.BufferGeometry, c: number): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  geo.deleteAttribute('uv');
  const col = new THREE.Color().setHex(c);
  const n = geo.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([col.r, col.g, col.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

export function boxes(list: Box[]): THREE.BufferGeometry {
  return mergeGeometries(list.map(([x0, y0, z0, x1, y1, z1, c]) => {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return painted(g, c);
  }))!;
}

const W = 0xffffff; // белое красится цветом инстанса
const SKIN = 0xf0c8a8;
const DARK = 0x2a2a2a;

// ---------- суставы и поза ----------

/** Как двигается часть: ноги и руки качаются вокруг оси z (вперёд-назад), хвост — вбок. */
export type Joint = 'none' | 'hipL' | 'hipR' | 'kneeL' | 'kneeR' | 'shoulderL' | 'shoulderR' | 'elbowL' | 'elbowR'
  | 'legFL' | 'legFR' | 'legBL' | 'legBR' | 'tail' | 'wag';
/** Чем красится белое в части: основным цветом (одежда, окрас), волосами, штанами или ничем. */
export type Tint = 'main' | 'hair' | 'pants' | null;

export interface RigPart {
  geo: () => THREE.BufferGeometry;
  tint: Tint;
  /** Индекс родительской части (−1 — само тело). */
  parent: number;
  pivot: [number, number, number];
  joint: Joint;
}

/** Угол сустава: phase — фаза шага, amp — насколько идёт (0 стоит, 1 идёт), t — время для хвостов. */
function angle(j: Joint, phase: number, amp: number, t: number): number {
  const s = Math.sin(phase), c = Math.cos(phase);
  switch (j) {
    case 'hipL': return amp * 0.5 * s;
    case 'hipR': return -amp * 0.5 * s;
    case 'kneeL': return -amp * 0.85 * Math.max(0, c);
    case 'kneeR': return -amp * 0.85 * Math.max(0, -c);
    case 'shoulderL': return -amp * 0.45 * s;
    case 'shoulderR': return amp * 0.45 * s;
    case 'elbowL': return 0.12 + amp * 0.35 * Math.max(0, -s);
    case 'elbowR': return 0.12 + amp * 0.35 * Math.max(0, s);
    case 'legFL': case 'legBR': return amp * 0.55 * s;
    case 'legFR': case 'legBL': return -amp * 0.55 * s;
    case 'tail': return Math.sin(t * 2.1) * 0.3 + Math.sin(t * 0.7) * 0.15;
    case 'wag': return Math.sin(t * 11) * (0.25 + amp * 0.35);
    default: return 0;
  }
}

const _m = new THREE.Matrix4(), _t = new THREE.Matrix4(), _r = new THREE.Matrix4();

/** Матрицы частей в координатах фигурки для данной позы. */
export function pose(parts: RigPart[], phase: number, amp: number, t: number, out: THREE.Matrix4[]) {
  parts.forEach((p, i) => {
    const m = (out[i] ??= new THREE.Matrix4());
    if (p.parent >= 0) m.copy(out[p.parent]); else m.identity();
    if (p.joint === 'none') return;
    const a = angle(p.joint, phase, amp, t);
    const [x, y, z] = p.pivot;
    const axis = p.joint === 'tail' || p.joint === 'wag' ? 'x' : 'z';
    _r.makeRotationAxis(axis === 'x' ? X : Z, a);
    _m.copy(_t.makeTranslation(x, y, z)).multiply(_r).multiply(_t.makeTranslation(-x, -y, -z));
    m.multiply(_m);
  });
}
const X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1);

const part = (geo: () => THREE.BufferGeometry, tint: Tint = null, joint: Joint = 'none', pivot: [number, number, number] = [0, 0, 0], parent = -1): RigPart =>
  ({ geo, tint, joint, pivot, parent });

// ---------- человек ----------

/** Нога: бедро от таза до колена, голень с ботинком; side — z центра ноги. */
const thigh = (z: number) => () => boxes([[-0.045, 0.235, z - 0.045, 0.05, 0.46, z + 0.045, W]]);
const shin = (z: number) => () => boxes([
  [-0.04, 0.035, z - 0.04, 0.045, 0.245, z + 0.04, W],
  [-0.05, 0, z - 0.045, 0.085, 0.045, z + 0.045, 0x2a2622], // ботинок носком вперёд
]);
const upperArm = (z: number) => () => boxes([[-0.04, 0.6, z - 0.035, 0.04, 0.8, z + 0.035, W]]);
const forearm = (z: number) => () => boxes([
  [-0.033, 0.45, z - 0.03, 0.033, 0.61, z + 0.03, SKIN],
  [-0.035, 0.405, z - 0.032, 0.04, 0.455, z + 0.032, 0xe8bc9a], // кисть
]);

/** Человечек: таз, туловище, голова с лицом, волосы, руки и ноги из двух частей с локтем и коленом. */
export const PERSON: RigPart[] = [
  part(() => boxes([
    [-0.085, 0.47, -0.125, 0.085, 0.79, 0.125, W], // туловище
    [-0.07, 0.79, -0.15, 0.07, 0.81, 0.15, W], // плечи
    [0.084, 0.62, -0.02, 0.088, 0.76, 0.02, 0xd8d0c0], // пуговицы-планка
  ]), 'main'),
  part(() => boxes([
    [-0.08, 0.43, -0.115, 0.08, 0.5, 0.115, W], // таз
    [-0.082, 0.49, -0.118, 0.082, 0.51, 0.118, 0x3a2e28], // ремень
  ]), 'pants'),
  part(() => boxes([
    [-0.035, 0.8, -0.04, 0.035, 0.85, 0.04, SKIN], // шея
    [-0.1, 0.845, -0.1, 0.1, 1.05, 0.1, SKIN], // голова
    [0.1, 0.94, -0.065, 0.104, 0.975, -0.025, 0xffffff], // белки глаз
    [0.1, 0.94, 0.025, 0.104, 0.975, 0.065, 0xffffff],
    [0.102, 0.942, -0.05, 0.108, 0.972, -0.03, 0x2a2020], // зрачки
    [0.102, 0.942, 0.03, 0.108, 0.972, 0.05, 0x2a2020],
    [0.1, 0.985, -0.07, 0.106, 0.997, -0.02, 0x5a4030], // брови
    [0.1, 0.985, 0.02, 0.106, 0.997, 0.07, 0x5a4030],
    [0.1, 0.9, -0.016, 0.125, 0.945, 0.016, 0xe8b494], // нос
    [0.1, 0.875, -0.04, 0.106, 0.888, 0.04, 0xb8574a], // рот
    [-0.025, 0.91, -0.112, 0.02, 0.97, -0.1, 0xe8bc9a], // уши
    [-0.025, 0.91, 0.1, 0.02, 0.97, 0.112, 0xe8bc9a],
  ])),
  part(() => boxes([
    [-0.112, 1.03, -0.11, 0.08, 1.09, 0.11, W], // макушка
    [-0.115, 0.88, -0.11, -0.06, 1.05, 0.11, W], // затылок
    [-0.06, 0.95, -0.112, 0.04, 1.05, -0.098, W], // виски
    [-0.06, 0.95, 0.098, 0.04, 1.05, 0.112, W],
    [0.06, 1.0, -0.105, 0.105, 1.06, 0.105, W], // чёлка
  ]), 'hair'),
  part(thigh(-0.06), 'pants', 'hipL', [0, 0.45, -0.06]),
  part(shin(-0.06), 'pants', 'kneeL', [0, 0.24, -0.06], 4),
  part(thigh(0.06), 'pants', 'hipR', [0, 0.45, 0.06]),
  part(shin(0.06), 'pants', 'kneeR', [0, 0.24, 0.06], 6),
  part(upperArm(-0.165), 'main', 'shoulderL', [0, 0.78, -0.165]),
  part(forearm(-0.165), null, 'elbowL', [0, 0.605, -0.165], 8),
  part(upperArm(0.165), 'main', 'shoulderR', [0, 0.78, 0.165]),
  part(forearm(0.165), null, 'elbowR', [0, 0.605, 0.165], 10),
];
export const PANTS = [0x3a4a6a, 0x2f3540, 0x5a5048, 0x4a5a3a, 0x6a6a72];

// ---------- машины ----------

/** Кузов по профилю сбоку: капот, лобовое, крыша, заднее стекло, багажник. */
function profile(pts: [number, number][], depth: number, color: number): THREE.BufferGeometry {
  const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 4 });
  g.translate(0, 0, -depth / 2);
  return painted(g, color);
}
function wheel(x: number, z: number, r: number): THREE.BufferGeometry[] {
  const tire = new THREE.CylinderGeometry(r, r, 0.17, 14);
  tire.rotateX(Math.PI / 2);
  tire.translate(x, r, z);
  const hub = new THREE.CylinderGeometry(r * 0.55, r * 0.55, 0.18, 10);
  hub.rotateX(Math.PI / 2);
  hub.translate(x, r, z);
  return [painted(tire, 0x222326), painted(hub, 0xb8bcc4)];
}

/** Легковушка: длина 2.25 м, ширина 1 м. Кузов белый (красится цветом машины), стёкла, колёса, бамперы. */
export const CAR = (): THREE.BufferGeometry => {
  const r = 0.19;
  const body = profile([
    [0.04, 0.17], [0.3, 0.17], [0.3, 0.3], [0.62, 0.3], [0.62, 0.17], [1.6, 0.17], [1.6, 0.3], [1.92, 0.3], [1.92, 0.17],
    [2.2, 0.17], [2.26, 0.26], [2.25, 0.47], [2.1, 0.53], [1.72, 0.58], [1.44, 0.93], [1.36, 0.96], [0.68, 0.96], [0.58, 0.92],
    [0.32, 0.64], [0.06, 0.6], [0.0, 0.5], [0.0, 0.25],
  ], 0.96, W);
  const glass = profile([[0.36, 0.645], [1.7, 0.6], [1.43, 0.925], [1.36, 0.95], [0.68, 0.95], [0.6, 0.915]], 0.98, 0x2b3a4a);
  const pillar = boxes([[0.96, 0.62, -0.495, 1.02, 0.95, 0.495, W]]); // средняя стойка между окнами
  const trim = boxes([
    [2.22, 0.15, -0.47, 2.29, 0.3, 0.47, 0x3a3c42], // передний бампер
    [-0.04, 0.15, -0.47, 0.03, 0.3, 0.47, 0x3a3c42], // задний бампер
    [2.2, 0.31, -0.18, 2.255, 0.4, 0.18, 0x2a2c30], // решётка
    [-0.01, 0.42, -0.44, 0.01, 0.5, -0.28, 0xc8302a], // задние фонари
    [-0.01, 0.42, 0.28, 0.01, 0.5, 0.44, 0xc8302a],
    [1.55, 0.6, -0.54, 1.62, 0.66, -0.48, 0x2a2c30], // зеркала
    [1.55, 0.6, 0.48, 1.62, 0.66, 0.54, 0x2a2c30],
    [0.8, 0.5, -0.484, 0.9, 0.52, -0.48, 0x9a9ca4], // ручки дверей
    [0.8, 0.5, 0.48, 0.9, 0.52, 0.484, 0x9a9ca4],
    [1.25, 0.5, -0.484, 1.35, 0.52, -0.48, 0x9a9ca4],
    [1.25, 0.5, 0.48, 1.35, 0.52, 0.484, 0x9a9ca4],
  ]);
  const wheels = [...wheel(0.46, -0.41, r), ...wheel(0.46, 0.41, r), ...wheel(1.76, -0.41, r), ...wheel(1.76, 0.41, r)];
  return mergeGeometries([body, glass, pillar, trim, ...wheels])!;
};
/** Фары машины: отдельно, чтобы светиться вечером (материал светящихся окон). */
export const CAR_LIGHTS = (): THREE.BufferGeometry => boxes([
  [2.245, 0.36, -0.43, 2.27, 0.45, -0.25, W],
  [2.245, 0.36, 0.25, 2.27, 0.45, 0.43, W],
]);

export const BUS = (): THREE.BufferGeometry => boxes([
  [0, 0.2, -0.6, 5.5, 2.4, 0.6, W],
  [0.3, 1.2, -0.62, 5.2, 1.9, 0.62, 0x2b3340],
  [5.45, 1.1, -0.5, 5.52, 2.1, 0.5, 0x2b3340],
  [0.6, 0, -0.64, 1.3, 0.45, -0.5, 0x222222],
  [4.0, 0, -0.64, 4.7, 0.45, -0.5, 0x222222],
  [0.6, 0, 0.5, 1.3, 0.45, 0.64, 0x222222],
  [4.0, 0, 0.5, 4.7, 0.45, 0.64, 0x222222],
]);

// ---------- животные ----------

/** Четыре ноги на суставах у плеч и бёдер: fx/bx — x передних и задних, top — высота сустава. */
function legs(fx: number, bx: number, top: number, w: number, z: number, c: number, tint: Tint): RigPart[] {
  const leg = (x: number, zz: number) => () => boxes([[x - w / 2, 0, zz - w / 2, x + w / 2, top + 0.02, zz + w / 2, c]]);
  return [
    part(leg(fx, -z), tint, 'legFL', [fx, top, -z]),
    part(leg(fx, z), tint, 'legFR', [fx, top, z]),
    part(leg(bx, -z), tint, 'legBL', [bx, top, -z]),
    part(leg(bx, z), tint, 'legBR', [bx, top, z]),
  ];
}

/** Животные: размеры в метрах, морда смотрит на +x. Части с суставами двигаются при ходьбе. */
export const RIGS: Record<string, RigPart[]> = {
  person: PERSON,
  hen: [part(() => boxes([[-0.12, 0.1, -0.09, 0.12, 0.3, 0.09, W], [0.08, 0.25, -0.05, 0.18, 0.38, 0.05, W], [0.1, 0.38, -0.02, 0.16, 0.43, 0.02, 0xd84a3a], [0.18, 0.3, -0.02, 0.22, 0.33, 0.02, 0xe8a84a], [-0.02, 0, -0.04, 0.02, 0.1, 0.04, 0xe8a84a]]), 'main')],
  dog: [
    part(() => boxes([[-0.3, 0.25, -0.12, 0.25, 0.5, 0.12, W], [0.2, 0.4, -0.1, 0.42, 0.62, 0.1, W], [0.38, 0.42, -0.06, 0.48, 0.52, 0.06, DARK], [0.22, 0.6, -0.1, 0.28, 0.68, -0.04, W], [0.22, 0.6, 0.04, 0.28, 0.68, 0.1, W]]), 'main'),
    part(() => boxes([[-0.36, 0.45, -0.03, -0.28, 0.65, 0.03, W]]), 'main', 'wag', [-0.3, 0.47, 0]),
    ...legs(0.18, -0.22, 0.27, 0.08, 0.065, W, 'main'),
  ],
  cat: [
    part(() => boxes([
      [-0.2, 0.12, -0.08, 0.16, 0.3, 0.08, W], [0.12, 0.22, -0.08, 0.28, 0.38, 0.08, W],
      [0.14, 0.38, -0.07, 0.19, 0.44, -0.03, W], [0.14, 0.38, 0.03, 0.19, 0.44, 0.07, W],
      [0.278, 0.3, -0.06, 0.29, 0.335, -0.025, 0x9ad04a], [0.278, 0.3, 0.025, 0.29, 0.335, 0.06, 0x9ad04a], // глаза
      [0.285, 0.305, -0.048, 0.294, 0.33, -0.037, 0x1a1a1a], [0.285, 0.305, 0.037, 0.294, 0.33, 0.048, 0x1a1a1a], // зрачки
      [0.28, 0.265, -0.015, 0.295, 0.285, 0.015, 0xe8909a], // нос
    ]), 'main'),
    part(() => boxes([[-0.245, 0.24, -0.025, -0.195, 0.52, 0.025, W], [-0.25, 0.5, -0.025, -0.2, 0.56, 0.025, W]]), 'main', 'tail', [-0.22, 0.26, 0]),
    ...legs(0.11, -0.15, 0.14, 0.055, 0.045, W, 'main'),
  ],
  cow: [
    part(() => boxes([[-0.7, 0.55, -0.35, 0.6, 1.25, 0.35, 0xf6f2ea], [-0.4, 0.8, -0.36, 0.0, 1.2, 0.36, 0x2a2a2a], [0.1, 0.6, -0.36, 0.4, 0.9, 0.36, 0x2a2a2a], [0.55, 0.8, -0.2, 0.95, 1.2, 0.2, 0xf6f2ea], [0.85, 0.8, -0.18, 1.0, 0.95, 0.18, 0xf0b8a8], [0.6, 1.2, -0.25, 0.7, 1.3, -0.15, 0xe8e0d0], [0.6, 1.2, 0.15, 0.7, 1.3, 0.25, 0xe8e0d0]])),
    ...legs(0.42, -0.52, 0.56, 0.15, 0.22, 0xf6f2ea, null),
  ],
  goat: [
    part(() => boxes([[-0.4, 0.35, -0.17, 0.35, 0.75, 0.17, 0xeee6d8], [0.3, 0.6, -0.11, 0.55, 0.9, 0.11, 0xeee6d8], [0.32, 0.9, -0.08, 0.38, 1.05, -0.03, 0x8a7a6a], [0.32, 0.9, 0.03, 0.38, 1.05, 0.08, 0x8a7a6a], [0.45, 0.5, -0.03, 0.52, 0.6, 0.03, 0xd8d0c0]])),
    ...legs(0.26, -0.31, 0.36, 0.08, 0.1, 0xd8d0c0, null),
  ],
  // утка: обтекаемое тело ступеньками, поднятый хвост, грудка, крылья, зелёная голова с белым ошейником
  duck: [part(() => boxes([
    [-0.11, -0.01, -0.07, 0.09, 0.02, 0.07, 0xb8b4ac], // днище
    [-0.14, 0.02, -0.09, 0.12, 0.12, 0.09, 0xc8c4bc], // тело
    [-0.1, 0.12, -0.07, 0.08, 0.145, 0.07, 0xc8c4bc], // спинка
    [0.1, 0.03, -0.075, 0.155, 0.12, 0.075, 0x8a5a3a], // грудка
    [-0.2, 0.08, -0.04, -0.13, 0.12, 0.04, 0x3a3a3a], // хвост
    [-0.23, 0.11, -0.025, -0.19, 0.15, 0.025, 0xf6f2ea], // кончик хвоста торчит вверх
    [-0.11, 0.06, -0.095, 0.07, 0.125, -0.085, 0x8a8478], // крылья
    [-0.11, 0.06, 0.085, 0.07, 0.125, 0.095, 0x8a8478],
    [-0.04, 0.08, -0.098, 0.02, 0.11, -0.094, 0x3a5aa8], // синее «зеркальце»
    [-0.04, 0.08, 0.094, 0.02, 0.11, 0.098, 0x3a5aa8],
    [0.1, 0.12, -0.04, 0.155, 0.135, 0.04, 0xf6f2ea], // белый ошейник
    [0.1, 0.135, -0.04, 0.155, 0.2, 0.04, 0x2f7a4a], // шея
    [0.08, 0.19, -0.05, 0.19, 0.27, 0.05, 0x2f7a4a], // голова
    [0.17, 0.225, -0.052, 0.18, 0.24, -0.04, 0x111111], // глаза
    [0.17, 0.225, 0.04, 0.18, 0.24, 0.052, 0x111111],
    [0.19, 0.2, -0.03, 0.27, 0.23, 0.03, 0xe8b830], // клюв
  ]))],
  gull: [part(() => boxes([[-0.2, -0.06, -0.07, 0.2, 0.06, 0.07, 0xf6f6f6], [-0.05, -0.02, -0.55, 0.12, 0.02, 0.55, 0xc8ccd2], [0.2, -0.02, -0.02, 0.27, 0.02, 0.02, 0xf2c230]]))],
  pigeon: [part(() => boxes([[-0.12, 0.05, -0.07, 0.12, 0.18, 0.07, 0x8a9098], [0.08, 0.14, -0.05, 0.16, 0.24, 0.05, 0x6a7a8a], [-0.18, 0.1, -0.04, -0.1, 0.14, 0.04, 0x5a6068]]))],
  crow: [part(() => boxes([[-0.15, 0.05, -0.08, 0.15, 0.2, 0.08, 0x2a2a30], [0.1, 0.16, -0.06, 0.2, 0.26, 0.06, 0x2a2a30], [0.2, 0.18, -0.02, 0.27, 0.21, 0.02, 0x40404a]]))],
  squirrel: [part(() => boxes([[-0.1, 0.05, -0.06, 0.1, 0.18, 0.06, 0xc8743a], [0.06, 0.12, -0.05, 0.15, 0.22, 0.05, 0xc8743a], [-0.2, 0.1, -0.05, -0.08, 0.38, 0.05, 0xd88a4a]]))],
};
export const ANIMAL_KINDS = Object.keys(RIGS).filter((k) => k !== 'person');

/** Скорость (м/с) и рост полёта для разных животных. */
export const ANIMAL_SPEED: Record<string, number> = { hen: 0.5, dog: 1.6, cat: 0.8, cow: 0.3, goat: 0.5, duck: 0.35, gull: 4, pigeon: 0.6, crow: 0.7, squirrel: 1.8 };
/** Сколько шагов в секунду на метр скорости: у мелких ноги мелькают чаще. */
export const STEP_RATE: Record<string, number> = { person: 6.5, dog: 7, cat: 12, cow: 9, goat: 10 };
export const FLYING = new Set(['gull']);

/**
 * Толпа одинаковых фигурок: по InstancedMesh на каждую часть.
 * set() ставит фигурку в позу, flush() отдаёт кадр видеокарте.
 */
export class Crowd {
  readonly group = new THREE.Group();
  readonly meshes: THREE.InstancedMesh[];
  private local: THREE.Matrix4[] = [];
  private m = new THREE.Matrix4();
  private c = new THREE.Color();

  constructor(readonly parts: RigPart[], readonly max: number, mat: THREE.Material = new THREE.MeshLambertMaterial({ vertexColors: true })) {
    this.meshes = parts.map((p) => {
      const mesh = new THREE.InstancedMesh(p.geo(), mat, max);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.setColorAt(0, this.c.setHex(0xffffff));
      this.group.add(mesh);
      return mesh;
    });
  }

  /** n — номер фигурки, base — где она стоит, phase/amp — шаг, tints — цвета одежды или окраса. */
  set(n: number, base: THREE.Matrix4, phase: number, amp: number, t: number, tints: { main?: number; hair?: number; pants?: number }) {
    pose(this.parts, phase, amp, t, this.local);
    this.parts.forEach((p, i) => {
      const mesh = this.meshes[i];
      mesh.setMatrixAt(n, this.m.multiplyMatrices(base, this.local[i]));
      mesh.setColorAt(n, this.c.setHex(p.tint ? tints[p.tint] ?? 0xffffff : 0xffffff));
    });
  }

  flush(n: number) {
    for (const m of this.meshes) {
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
}

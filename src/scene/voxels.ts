import * as THREE from 'three';
import { CAR } from './figures';

/** Размер одного вокселя в метрах мира. */
export const VS = 0.25;
/** Мелкий воксель для небольших предметов (цветы, камни, кусты): вдвое подробнее. */
export const FS = 0.125;

export type ColorFn = (i: number, j: number, k: number) => number | null;
export type ColorArg = number | ColorFn;

const OFF = 1 << 10; // координаты вокселей в диапазоне −1024…1023
const key = (i: number, j: number, k: number) => ((i + OFF) * 2048 + (j + OFF)) * 2048 + (k + OFF);

/** Детерминированный шум 0…1 по координатам — для «живых» оттенков без случайности между запусками. */
export function hash(i: number, j: number, k: number): number {
  let h = (i * 374761393 + j * 668265263 + k * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export const pick = <T>(arr: readonly T[], i: number, j: number, k: number): T =>
  arr[Math.floor(hash(i, j, k) * arr.length) % arr.length];

/** Перевод мировой координаты в индекс вокселя. */
export const vi = (u: number) => Math.floor(u / VS + 1e-6);

/** Время для шевеления листвы (секунды): идёт, только пока идёт игровое время. */
export const WIND = { value: 0 };

const SWAY = `#include <begin_vertex>
  #ifdef USE_INSTANCING
  vec3 ip = instanceMatrix[3].xyz;
  float sw = sin(uWind * 1.6 + ip.x * 0.9 + ip.z * 0.7 + ip.y * 1.7);
  transformed.x += sw * 0.022;
  transformed.z += cos(uWind * 1.25 + ip.x * 0.6 + ip.y * 1.1) * 0.018;
  #endif`;
/** Листва: те же кубики, но каждый чуть качается от ветра, у каждого вокселя своя фаза. */
function swaying<T extends THREE.Material>(m: T): T {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWind = WIND;
    sh.vertexShader = 'uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', SWAY);
  };
  return m;
}
const leafMaterial = () => swaying(new THREE.MeshLambertMaterial({ color: 0xffffff }));
/** Тень листвы качается вместе с ней. */
const LEAF_DEPTH = swaying(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }));

/** Общие материалы: время суток меняет цвет светящихся окон сразу у всех зданий. */
export const MATS = {
  solid: new THREE.MeshLambertMaterial({ color: 0xffffff }),
  glow: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  leaves: leafMaterial(),
  figure: new THREE.MeshLambertMaterial({ vertexColors: true }),
};
let carGeo: THREE.BufferGeometry | null = null;
const GEO = new THREE.BoxGeometry(0.25, 0.25, 0.25);
const FINE_GEO = new THREE.BoxGeometry(FS, FS, FS);
const UNIT = new THREE.BoxGeometry(1, 1, 1);

export class VoxelStore {
  readonly solid = new Map<number, [number, number, number, number]>();
  readonly glow = new Map<number, [number, number, number, number]>();
  /** Листва деревьев: качается от ветра. */
  readonly leaves = new Map<number, [number, number, number, number]>();
  /** Мелкие воксели (FS): индексы в долях по 12.5 см. */
  readonly fine = new Map<number, [number, number, number, number]>();
  /** Пока true, put() кладёт воксели в листву (так дерево отмечает крону). */
  swaying = false;
  /** Стоящие машины: гладкие модели вместо вокселей (x, z — угол, как у воксельной). */
  readonly cars: { x: number; z: number; c: number; alongZ: boolean }[] = [];
  /** Крупные гладкие коробки (вода, башни, горы): одна инстанция вместо тысяч вокселей. */
  readonly blocks: { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; c: number; glow: boolean }[] = [];

  put(i: number, j: number, k: number, c: number | null) {
    if (c == null) return;
    const kk = key(i, j, k);
    this.glow.delete(kk);
    if (this.swaying) { this.solid.delete(kk); this.leaves.set(kk, [i, j, k, c]); return; }
    this.leaves.delete(kk);
    this.solid.set(kk, [i, j, k, c]);
  }
  putGlow(i: number, j: number, k: number, c: number) {
    const kk = key(i, j, k);
    this.solid.delete(kk);
    this.leaves.delete(kk);
    this.glow.set(kk, [i, j, k, c]);
  }
  /** Мелкий воксель: i, j, k в единицах FS. */
  putFine(i: number, j: number, k: number, c: number) {
    this.fine.set(key(i, j, k), [i, j, k, c]);
  }
  /** Машина у обочины или во дворе: угол (x, z), вдоль x или вдоль z. */
  car(x: number, z: number, c: number, alongZ = false) {
    this.cars.push({ x, z, c, alongZ });
  }
  remove(i: number, j: number, k: number) {
    const kk = key(i, j, k);
    this.solid.delete(kk);
    this.glow.delete(kk);
    this.leaves.delete(kk);
  }
  has(i: number, j: number, k: number) {
    return this.solid.has(key(i, j, k));
  }
  /** Заливает коробку в мировых координатах [x0,x1)×[y0,y1)×[z0,z1). */
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: ColorArg, glow = false) {
    for (let i = vi(x0); i < vi(x1); i++)
      for (let j = vi(y0); j < vi(y1); j++)
        for (let k = vi(z0); k < vi(z1); k++) {
          const col = typeof c === 'function' ? c(i, j, k) : c;
          if (col == null) continue;
          if (glow) this.putGlow(i, j, k, col);
          else this.put(i, j, k, col);
        }
  }
  /** Гладкая коробка в мировых координатах: дёшево для больших плоскостей. */
  block(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number, glow = false) {
    if (x1 <= x0 || y1 <= y0 || z1 <= z0) return;
    this.blocks.push({ x0, y0, z0, x1, y1, z1, c, glow });
  }
  /** Сколько инстансов уйдёт в кадр: для проверки бюджета на телефоне. */
  count(): number {
    return this.visibleSolid().length + this.glow.size + this.blocks.length + this.visibleLeaves().length + this.visibleFine().length + this.cars.length * 12;
  }
  clear(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
    for (let i = vi(x0); i < vi(x1); i++)
      for (let j = vi(y0); j < vi(y1); j++) for (let k = vi(z0); k < vi(z1); k++) this.remove(i, j, k);
  }

  /** Воксели, у которых видна хотя бы одна грань (низ не считаем: камера сверху). */
  visibleSolid(): [number, number, number, number][] {
    const out: [number, number, number, number][] = [];
    for (const v of this.solid.values()) {
      const [i, j, k] = v;
      if (
        !this.has(i + 1, j, k) || !this.has(i - 1, j, k) || !this.has(i, j + 1, k) ||
        !this.has(i, j, k + 1) || !this.has(i, j, k - 1)
      ) out.push(v);
    }
    return out;
  }

  private hasAny(i: number, j: number, k: number) {
    const kk = key(i, j, k);
    return this.solid.has(kk) || this.leaves.has(kk);
  }
  visibleFine(): [number, number, number, number][] {
    const out: [number, number, number, number][] = [];
    const f = this.fine;
    for (const v of f.values()) {
      const [i, j, k] = v;
      if (!f.has(key(i + 1, j, k)) || !f.has(key(i - 1, j, k)) || !f.has(key(i, j + 1, k)) || !f.has(key(i, j, k + 1)) || !f.has(key(i, j, k - 1))) out.push(v);
    }
    return out;
  }
  /** Листья снаружи кроны: внутренние не видно. */
  visibleLeaves(): [number, number, number, number][] {
    const out: [number, number, number, number][] = [];
    for (const v of this.leaves.values()) {
      const [i, j, k] = v;
      if (!this.hasAny(i + 1, j, k) || !this.hasAny(i - 1, j, k) || !this.hasAny(i, j + 1, k) || !this.hasAny(i, j - 1, k) ||
        !this.hasAny(i, j, k + 1) || !this.hasAny(i, j, k - 1)) out.push(v);
    }
    return out;
  }

  /**
   * Собирает два InstancedMesh: обычные воксели (освещаются) и светящиеся (окна, фары).
   * По кубу на воксель через InstancedMesh: на телефоне держит ~100 тыс. кубов.
   */
  build(): THREE.Group {
    const group = new THREE.Group();
    const geo = GEO;
    const make = (list: [number, number, number, number][], mat: THREE.Material, shadows: boolean, size = VS) => {
      const mesh = new THREE.InstancedMesh(size === VS ? geo : FINE_GEO, mat, Math.max(1, list.length));
      mesh.count = list.length;
      const m4 = new THREE.Matrix4();
      const col = new THREE.Color();
      list.forEach(([i, j, k, c], n) => {
        m4.makeTranslation((i + 0.5) * size, (j + 0.5) * size, (k + 0.5) * size);
        mesh.setMatrixAt(n, m4);
        const f = 0.95 + hash(i, j, k) * 0.1;
        col.setHex(c).multiplyScalar(f);
        mesh.setColorAt(n, col);
      });
      mesh.castShadow = mesh.receiveShadow = shadows;
      group.add(mesh);
      return mesh;
    };
    const solid = this.visibleSolid();
    if (solid.length) make(solid, MATS.solid, true);
    if (this.glow.size) make([...this.glow.values()], MATS.glow, false);
    const leaves = this.visibleLeaves();
    if (leaves.length) make(leaves, MATS.leaves, true).customDepthMaterial = LEAF_DEPTH;
    const fine = this.visibleFine();
    if (fine.length) make(fine, MATS.solid, true, FS);
    if (this.cars.length) {
      carGeo ??= CAR();
      const mesh = new THREE.InstancedMesh(carGeo, MATS.figure, this.cars.length);
      const m4 = new THREE.Matrix4(), col = new THREE.Color();
      this.cars.forEach((c, n) => {
        // модель смотрит вдоль +x, длина 2.25 м, ширина 1 м по центру z
        if (c.alongZ) m4.makeRotationY(-Math.PI / 2).setPosition(c.x + 0.5, 0, c.z);
        else m4.makeTranslation(c.x, 0, c.z + 0.5);
        mesh.setMatrixAt(n, m4);
        mesh.setColorAt(n, col.setHex(c.c));
      });
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    }
    for (const glow of [false, true]) {
      const list = this.blocks.filter((b) => b.glow === glow);
      if (!list.length) continue;
      const mesh = new THREE.InstancedMesh(UNIT, glow ? MATS.glow : MATS.solid, list.length);
      const m4 = new THREE.Matrix4(), col = new THREE.Color();
      list.forEach((b, n) => {
        m4.makeScale(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0).setPosition((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
        mesh.setMatrixAt(n, m4);
        mesh.setColorAt(n, col.setHex(b.c));
      });
      mesh.castShadow = mesh.receiveShadow = !glow;
      group.add(mesh);
    }
    return group;
  }
}

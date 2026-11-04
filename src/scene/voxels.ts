import * as THREE from 'three';

/** Размер одного вокселя в метрах мира. */
export const VS = 0.25;

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

/** Общие материалы: время суток меняет цвет светящихся окон сразу у всех зданий. */
export const MATS = {
  solid: new THREE.MeshLambertMaterial({ color: 0xffffff }),
  glow: new THREE.MeshBasicMaterial({ color: 0xffffff }),
};
const GEO = new THREE.BoxGeometry(0.25, 0.25, 0.25);

export class VoxelStore {
  readonly solid = new Map<number, [number, number, number, number]>();
  readonly glow = new Map<number, [number, number, number, number]>();

  put(i: number, j: number, k: number, c: number | null) {
    if (c == null) return;
    const kk = key(i, j, k);
    this.glow.delete(kk);
    this.solid.set(kk, [i, j, k, c]);
  }
  putGlow(i: number, j: number, k: number, c: number) {
    const kk = key(i, j, k);
    this.solid.delete(kk);
    this.glow.set(kk, [i, j, k, c]);
  }
  remove(i: number, j: number, k: number) {
    const kk = key(i, j, k);
    this.solid.delete(kk);
    this.glow.delete(kk);
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

  /**
   * Собирает два InstancedMesh: обычные воксели (освещаются) и светящиеся (окна, фары).
   * По кубу на воксель через InstancedMesh: на телефоне держит ~100 тыс. кубов.
   */
  build(): THREE.Group {
    const group = new THREE.Group();
    const geo = GEO;
    const make = (list: [number, number, number, number][], mat: THREE.Material, shadows: boolean) => {
      const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
      mesh.count = list.length;
      const m4 = new THREE.Matrix4();
      const col = new THREE.Color();
      list.forEach(([i, j, k, c], n) => {
        m4.makeTranslation((i + 0.5) * VS, (j + 0.5) * VS, (k + 0.5) * VS);
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
    return group;
  }
}

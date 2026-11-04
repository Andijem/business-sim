import * as THREE from 'three';
import { VILLAGES } from '../sim';
import type { GameState } from '../sim';
import { buildLot, placeLot, pointSig, type BuildingMesh } from './buildings';
import { lotsOf, slotOf, villageX, lotCenter, type Lot } from './layout';

export interface LotView {
  key: string;
  lot: Lot;
  sig: string;
  mesh: BuildingMesh;
  center: THREE.Vector3;
}

/** Здания точек на участках: перестраивает только те, у которых что-то изменилось. */
export class LotsView {
  readonly group = new THREE.Group();
  readonly views = new Map<string, LotView>();
  private cut: string | null = null;
  /** Здания, которые только что перестроились: «вырастают» с пружинкой. */
  private pops: { g: THREE.Object3D; t0: number }[] = [];
  private ready = false;

  sync(st: GameState): boolean {
    let changed = false;
    for (const V of VILLAGES) {
      for (const lot of lotsOf(st, V.id)) {
        const key = `${V.id}:${lot.slot}`;
        const sig = pointSig(lot.point);
        const old = this.views.get(key);
        if (old && old.sig === sig) {
          old.lot = lot;
          continue;
        }
        if (old) {
          this.group.remove(old.mesh.group);
          old.mesh.group.traverse((o) => (o as THREE.InstancedMesh).dispose?.());
        }
        const mesh = buildLot(lot.point);
        placeLot(mesh.group, slotOf(lot), villageX(V.id));
        const [cx, cz] = lotCenter(lot);
        this.views.set(key, { key, lot, sig, mesh, center: new THREE.Vector3(cx, 0, cz) });
        this.group.add(mesh.group);
        if (this.ready && old) {
          mesh.group.scale.y = 0.01;
          this.pops.push({ g: mesh.group, t0: performance.now() });
        }
        changed = true;
      }
    }
    if (changed) this.applyCut();
    this.ready = true;
    return changed;
  }

  /** Шаг анимации прокачки; true — пока что-то пружинит и нужен кадр. */
  animate(now: number): boolean {
    this.pops = this.pops.filter((p) => {
      const t = (now - p.t0) / 1000;
      if (t >= 0.9) {
        p.g.scale.y = 1;
        return false;
      }
      p.g.scale.y = 1 - Math.exp(-6 * t) * Math.cos(14 * t);
      return true;
    });
    return this.pops.length > 0;
  }

  /** Разрез: у выбранного здания снимаются крыша и фасад. */
  setCutaway(key: string | null) {
    this.cut = key;
    this.applyCut();
  }

  private applyCut() {
    for (const v of this.views.values()) {
      const open = v.key === this.cut;
      v.mesh.roof.visible = !open;
      v.mesh.front.visible = !open;
    }
  }

  byPoint(id: number): LotView | undefined {
    for (const v of this.views.values()) if (v.lot.point?.id === id) return v;
    return undefined;
  }
}

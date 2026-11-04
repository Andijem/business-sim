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
        changed = true;
      }
    }
    if (changed) this.applyCut();
    return changed;
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

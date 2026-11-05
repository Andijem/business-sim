import * as THREE from 'three';
import { Crowd, PANTS, RIGS, STEP_RATE } from './figures';
import type { LotView } from './lots';
import { slotOf, villageX } from './layout';

const MAX = 160;
const COLORS = [0x3b7fbf, 0xe8a84a, 0x7a5ea8, 0xd65a5a, 0x5a6a7a, 0x4f9a6a, 0xe2604a, 0x2b3340];
const HAIR = [0x3a2a20, 0x5a3a2a, 0xd9b870, 0x2a2a2a, 0x8a5a3a];
const SPEED = 1.6;
const SIZE = new THREE.Vector3(1.35, 1.35, 1.35); // метров в секунду реального времени

interface Agent {
  path: THREE.Vector3[];
  seg: number;
  t: number;
  wait: number;
  color: number;
  hair: number;
  pants: number;
  phase: number;
}

/** Где у участка вход и по какой линии тротуара к нему идти. */
function routeTo(v: LotView, fromLeft: boolean): THREE.Vector3[] {
  const vx = villageX(v.lot.village);
  const c = v.center;
  const side = fromLeft ? -32 : 32;
  const f = slotOf(v.lot).face;
  const yard = f === 'nx' || f === 'px';
  if (yard) {
    // дворы: по главному тротуару до боковой улицы, потом на север
    const lane = vx + (c.x > vx - 6 ? -3.75 : -8.25);
    return [new THREE.Vector3(vx + side, 0, 0.5), new THREE.Vector3(lane, 0, 0.5), new THREE.Vector3(lane, 0, c.z),
      new THREE.Vector3(c.x + (c.x > lane ? -3 : 3), 0, c.z)];
  }
  const north = c.z < 3;
  const z = north ? 0.5 : 5.5;
  return [new THREE.Vector3(vx + side, 0, z), new THREE.Vector3(c.x, 0, z), new THREE.Vector3(c.x, 0, north ? -0.6 : 6.6)];
}

/** Прохожие и гости: идут по тротуару к точке, заходят и уходят. Сколько их — по вчерашним гостям точки. */
export class People {
  readonly group = new THREE.Group();
  private crowd = new Crowd(RIGS.person, MAX);
  private agents: Agent[] = [];
  private acc = new Map<string, number>();
  private m = new THREE.Matrix4();
  private seed = 1;

  constructor() {
    this.group.add(this.crowd.group);
  }

  private rnd() {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  /**
   * dt — секунды реального времени, gameHours — сколько игровых часов прошло за dt, hour — текущий час.
   * Возвращает true, если на сцене кто-то есть (нужно перерисовать).
   */
  update(dt: number, gameHours: number, hour: number, lots: Iterable<LotView>): boolean {
    const open = hour >= 8 && hour < 22;
    if (open && gameHours > 0) {
      for (const v of lots) {
        const p = v.lot.point;
        if (!p || p.closedDays > 0) continue;
        const perHour = (p.last?.served ?? (p.owner === 0 ? 40 : 60)) / 14;
        // показываем примерно каждого пятого гостя, чтобы не было толпы
        const k = (this.acc.get(v.key) ?? 0) + (perHour * gameHours) / 5;
        let n = Math.floor(k);
        this.acc.set(v.key, k - n);
        while (n-- > 0 && this.agents.length < MAX) {
          const there = routeTo(v, this.rnd() < 0.5);
          const back = [...there].reverse();
          back[back.length - 1] = back[back.length - 1].clone().setX(back[back.length - 1].x * -1 + 2 * villageX(v.lot.village));
          this.agents.push({ path: [...there, ...back.slice(1)], seg: 0, t: 0, wait: 0, color: COLORS[Math.floor(this.rnd() * COLORS.length)], hair: HAIR[Math.floor(this.rnd() * HAIR.length)], pants: PANTS[Math.floor(this.rnd() * PANTS.length)], phase: this.rnd() * 6 });
        }
      }
    }
    // движение
    const alive: Agent[] = [];
    for (const a of this.agents) {
      if (a.wait > 0) a.wait -= dt;
      else {
        a.phase += dt * SPEED * STEP_RATE.person / SIZE.x;
        let step = SPEED * dt;
        while (step > 0 && a.seg < a.path.length - 1) {
          const A = a.path[a.seg], B = a.path[a.seg + 1];
          const len = A.distanceTo(B);
          const left = len * (1 - a.t);
          if (step < left) {
            a.t += step / Math.max(len, 1e-3);
            step = 0;
          } else {
            step -= left;
            a.seg += 1;
            a.t = 0;
            // у двери гость «заходит» на пару секунд
            if (a.seg === Math.floor(a.path.length / 2)) {
              a.wait = 1.5 + this.rnd() * 2;
              break;
            }
          }
        }
      }
      if (a.seg < a.path.length - 1) alive.push(a);
    }
    this.agents = alive;
    let n = 0;
    const pos = new THREE.Vector3();
    for (const a of this.agents) {
      if (a.wait > 0) continue; // внутри
      const A = a.path[a.seg], B = a.path[a.seg + 1];
      pos.copy(A).lerp(B, a.t);
      const bob = Math.abs(Math.sin(a.phase)) * 0.025;
      this.m.makeRotationY(Math.atan2(-(B.z - A.z), B.x - A.x)).scale(SIZE).setPosition(pos.x, 0.25 + bob, pos.z);
      this.crowd.set(n, this.m, a.phase, 1, a.phase, { main: a.color, hair: a.hair, pants: a.pants });
      n++;
    }
    this.crowd.flush(n);
    return n > 0 || this.agents.length > 0;
  }
}

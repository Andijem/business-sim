import * as THREE from 'three';
import { ANIMALS, ANIMAL_SPEED, BUS, CAR, FLYING, PERSON_BODY, PERSON_HEAD } from './figures';
import type { Anim } from './props';
import type { Place } from './village';

/**
 * Жизнь вокруг бизнесов: машины на дороге, жители на тротуарах и лавочках,
 * животные во дворах, дым из труб, мельницы и лодки.
 * Двигается только пока идёт игровое время и только рядом с камерой — пауза ничего не тратит.
 */

const SHIRTS = [0x3b7fbf, 0xe8a84a, 0x7a5ea8, 0xd65a5a, 0x5a6a7a, 0x4f9a6a, 0xe2604a, 0xf2e2b0, 0x58b8a8, 0xc87a9a];
const HAIR = [0x3a2a20, 0x5a3a2a, 0xd9b870, 0x2a2a2a, 0x8a5a3a, 0xc8c8c8];
const CARS = [0xe9e2d6, 0x3b7fbf, 0xe2604a, 0x2b3340, 0xe8a84a, 0x5a6a7a, 0x4f9a6a, 0xd9d6cf, 0x8a3a3a];
const PET: Record<string, number[]> = { dog: [0x8a5e3c, 0xd9b870, 0x3a3a3a, 0xc8743a], cat: [0x8a8a92, 0xd88a4a, 0x2a2a2a, 0xeee6d8] };
const RADIUS = 140; // м: дальше от камеры жизнь не считаем

const lambert = () => new THREE.MeshLambertMaterial({ vertexColors: true });

interface Car { x: number; lane: 1 | -1; v: number; max: number; color: number; bus: boolean }
interface Walker { x: number; z: number; path: [number, number][]; seg: number; wait: number; shirt: number; hair: number; speed: number; idle: boolean; scale: number }
interface Critter { kind: string; x: number; z: number; tx: number; tz: number; wait: number; pen: { x0: number; z0: number; x1: number; z1: number }; color: number; h: number; ang: number }
interface Puff { x: number; y: number; z: number; t: number }

function mesh(geo: THREE.BufferGeometry, max: number, mat: THREE.Material = lambert()) {
  const m = new THREE.InstancedMesh(geo, mat, max);
  m.count = 0;
  m.frustumCulled = false;
  m.setColorAt(0, new THREE.Color());
  return m;
}

export class Life {
  readonly group = new THREE.Group();
  private cars: Car[] = [];
  private walkers = new Map<string, Walker[]>();
  private critters = new Map<string, Critter[]>();
  private puffs: Puff[] = [];
  private puffAcc = 0;
  private seed = 7;
  private t = 0;
  private carMesh = mesh(CAR(), 60);
  private busMesh = mesh(BUS(), 8);
  private bodyMesh = mesh(PERSON_BODY(), 260);
  private headMesh = mesh(PERSON_HEAD(), 260);
  private smokeMesh = mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), 240, new THREE.MeshLambertMaterial({ color: 0xe8e8ec, transparent: true, opacity: 0.7, depthWrite: false }));
  private animalMesh: Record<string, THREE.InstancedMesh> = {};
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private c = new THREE.Color();
  private v = new THREE.Vector3();
  private sc = new THREE.Vector3(1, 1, 1);

  constructor(private places: Place[], private road: [number, number]) {
    this.group.add(this.carMesh, this.busMesh, this.bodyMesh, this.headMesh, this.smokeMesh);
    for (const [k, geo] of Object.entries(ANIMALS)) {
      this.animalMesh[k] = mesh(geo(), 48);
      this.group.add(this.animalMesh[k]);
    }
  }

  private rnd() {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }
  private pick<T>(a: readonly T[]): T {
    return a[Math.floor(this.rnd() * a.length)];
  }

  /**
   * dt — реальные секунды, running — идёт ли игровое время, hour — час, camX — куда смотрит камера.
   * true — если что-то сдвинулось и нужен новый кадр.
   */
  update(dt: number, running: boolean, hour: number, camX: number): boolean {
    if (!running) return false;
    this.t += dt;
    const night = hour < 6.5 || hour >= 22;
    const near = this.places.filter((p) => p.built && Math.abs(p.x - camX) - p.half < RADIUS);
    this.traffic(dt, night, camX, near);
    this.people(dt, night, near);
    this.animals(dt, near);
    this.smoke(dt, near);
    for (const p of near) for (const o of p.movers) {
      const a = o.userData.anim as Anim;
      if (a.kind === 'spin') o.rotation[a.axis ?? 'z'] += a.speed * dt;
      else {
        o.position.y = (o.userData.y as number) + Math.sin(this.t * a.speed + a.x) * 0.08;
        o.rotation.z = Math.sin(this.t * a.speed * 0.7 + a.z) * 0.04;
      }
    }
    return true;
  }

  // ---------- машины ----------
  private traffic(dt: number, night: boolean, camX: number, near: Place[]) {
    const want = night ? 3 : near.some((p) => p.city) ? 14 : 8;
    const lo = Math.max(this.road[0], camX - RADIUS), hi = Math.min(this.road[1], camX + RADIUS);
    this.cars = this.cars.filter((c) => c.x > lo - 10 && c.x < hi + 10);
    // пустую дорогу (старт, перелёт камеры) заполняем сразу, дальше машины въезжают с краёв
    const fill = this.cars.length < want / 2;
    if (this.cars.length < want && (fill || this.rnd() < dt * 2)) {
      const lane: 1 | -1 = this.rnd() < 0.5 ? 1 : -1;
      const x = fill ? lo + this.rnd() * (hi - lo) : lane > 0 ? lo : hi;
      if (!this.cars.some((c) => c.lane === lane && Math.abs(c.x - x) < 12)) {
        const bus = near.some((p) => p.city) && this.rnd() < 0.15;
        const max = bus ? 6 : 7 + this.rnd() * 5;
        this.cars.push({ x, lane, v: max, max, color: bus ? this.pick([0xf2c230, 0x3b7fbf, 0xe2604a]) : this.pick(CARS), bus });
      }
    }
    for (const c of this.cars) {
      // держим дистанцию до впереди идущей машины
      let gap = Infinity;
      for (const o of this.cars) if (o !== c && o.lane === c.lane) { const d = (o.x - c.x) * c.lane; if (d > 0 && d < gap) gap = d; }
      const target = gap < 9 ? Math.min(c.max, Math.max(0, (gap - 5) * 1.5)) : c.max;
      c.v += (target - c.v) * Math.min(1, dt * 2);
      c.x += c.v * c.lane * dt;
    }
    let nc = 0, nb = 0;
    for (const c of this.cars) {
      const len = c.bus ? 5.5 : 2.25;
      // правостороннее движение: на восток — по южной полосе
      const z = c.lane > 0 ? 3.9 : 2.1;
      this.q.setFromEuler(this.e.set(0, c.lane > 0 ? 0 : Math.PI, 0));
      this.m.compose(this.v.set(c.x - (c.lane > 0 ? len : -len) / 2, 0, z), this.q, this.sc.set(1, 1, 1));
      const target = c.bus ? this.busMesh : this.carMesh;
      const n = c.bus ? nb++ : nc++;
      target.setMatrixAt(n, this.m);
      target.setColorAt(n, this.c.setHex(c.color));
    }
    this.flush(this.carMesh, nc);
    this.flush(this.busMesh, nb);
  }

  // ---------- жители ----------
  private people(dt: number, night: boolean, near: Place[]) {
    let n = 0;
    for (const [id, list] of this.walkers) if (!near.some((p) => p.id === id)) { this.walkers.delete(id); void list; }
    for (const p of near) {
      let list = this.walkers.get(p.id);
      if (!list) { list = []; this.walkers.set(p.id, list); }
      const want = night ? 1 : (p.city ? 22 : 12) + Math.min(8, p.idle.length);
      if (list.length < want && this.rnd() < dt * 3) list.push(this.spawnWalker(p));
      for (let i = list.length - 1; i >= 0; i--) {
        const w = list[i];
        if (w.wait > 0) { w.wait -= dt; if (w.wait <= 0 && w.idle) list.splice(i, 1); continue; }
        if (w.seg >= w.path.length - 1) {
          if (night || this.rnd() < 0.3) { list.splice(i, 1); continue; }
          w.wait = 1 + this.rnd() * 3;
          w.path = this.route(p, w.x, w.z);
          w.seg = 0;
          continue;
        }
        const [bx, bz] = w.path[w.seg + 1];
        const dx = bx - w.x, dz = bz - w.z, d = Math.hypot(dx, dz);
        const step = w.speed * dt;
        if (d <= step) { w.x = bx; w.z = bz; w.seg++; }
        else { w.x += (dx / d) * step; w.z += (dz / d) * step; }
      }
      for (const w of list) {
        if (n >= 260) break;
        const moving = w.wait <= 0 && w.seg < w.path.length - 1;
        let ang = 0;
        if (moving) { const [bx, bz] = w.path[w.seg + 1]; ang = Math.atan2(-(bz - w.z), bx - w.x); }
        else ang = (w.x * 7) % 6.28;
        const bob = moving ? Math.abs(Math.sin(this.t * 9 + w.x)) * 0.04 : 0;
        this.q.setFromEuler(this.e.set(0, ang, 0));
        this.m.compose(this.v.set(w.x, 0.25 + bob, w.z), this.q, this.sc.setScalar(w.scale));
        this.bodyMesh.setMatrixAt(n, this.m);
        this.bodyMesh.setColorAt(n, this.c.setHex(w.shirt));
        this.headMesh.setMatrixAt(n, this.m);
        this.headMesh.setColorAt(n, this.c.setHex(w.hair));
        n++;
      }
    }
    this.flush(this.bodyMesh, n);
    this.flush(this.headMesh, n);
  }

  private spawnWalker(p: Place): Walker {
    const kid = this.rnd() < 0.15;
    const w: Walker = { x: 0, z: 0, path: [], seg: 0, wait: 0, shirt: this.pick(SHIRTS), hair: this.pick(HAIR), speed: 0.9 + this.rnd() * 0.6, idle: false, scale: kid ? 0.95 : 1.3 + this.rnd() * 0.15 };
    // часть жителей сидит на лавочках и стоит на остановках
    if (p.idle.length && this.rnd() < 0.35) {
      const [x, , z] = this.pick(p.idle);
      Object.assign(w, { x: x + (this.rnd() - 0.5) * 0.6, z, idle: true, wait: 15 + this.rnd() * 40 });
      w.path = [[w.x, w.z]];
      return w;
    }
    const side = this.rnd() < 0.5 ? 0.5 : 5.5;
    w.x = p.x + (this.rnd() * 2 - 1) * p.half;
    w.z = side;
    w.path = this.route(p, w.x, w.z);
    return w;
  }

  /** Маршрут по тротуарам: вдоль главной улицы, иногда на боковую и по зебре. */
  private route(p: Place, x: number, z: number): [number, number][] {
    const tx = p.x + (this.rnd() * 2 - 1) * (p.half - 2);
    const path: [number, number][] = [[x, z]];
    const r = this.rnd();
    if (r < 0.25) {
      // через зебру на другую сторону
      const zx = p.x - 3.2 + this.rnd() * 3;
      const other = z < 3 ? 5.5 : 0.5;
      path.push([zx, z], [zx, other], [tx, other]);
    } else if (r < 0.4) {
      // на север по боковой улице
      const lane = p.x - (this.rnd() < 0.5 ? 8.25 : 3.75);
      path.push([lane, z < 3 ? z : 0.5], [lane, -6 - this.rnd() * 20]);
      if (z >= 3) path.splice(1, 0, [p.x - 3.2, z], [p.x - 3.2, 0.5]);
    } else path.push([tx, z]);
    return path;
  }

  // ---------- животные ----------
  private animals(dt: number, near: Place[]) {
    const counts: Record<string, number> = {};
    for (const k in this.animalMesh) counts[k] = 0;
    for (const [id] of this.critters) if (!near.some((p) => p.id === id)) this.critters.delete(id);
    for (const p of near) {
      let list = this.critters.get(p.id);
      if (!list) {
        list = [];
        for (const pen of p.pens) for (let i = 0; i < pen.n; i++) {
          const x = pen.x0 + this.rnd() * (pen.x1 - pen.x0), z = pen.z0 + this.rnd() * (pen.z1 - pen.z0);
          const pet = PET[pen.kind];
          list.push({ kind: pen.kind, x, z, tx: x, tz: z, wait: this.rnd() * 3, pen, color: pet ? this.pick(pet) : 0xffffff, h: FLYING.has(pen.kind) ? 6 + this.rnd() * 6 : 0, ang: 0 });
        }
        this.critters.set(p.id, list);
      }
      for (const a of list) {
        const sp = ANIMAL_SPEED[a.kind] ?? 0.5;
        if (FLYING.has(a.kind)) {
          // чайки кружат над водой
          a.ang += dt * sp / 8;
          const cx = (a.pen.x0 + a.pen.x1) / 2, cz = (a.pen.z0 + a.pen.z1) / 2;
          const rx = (a.pen.x1 - a.pen.x0) / 2, rz = (a.pen.z1 - a.pen.z0) / 2;
          const ph = a.x * 0.37;
          a.tx = cx + Math.cos(a.ang + ph) * rx * 0.8;
          a.tz = cz + Math.sin(a.ang + ph) * rz * 0.8;
          continue;
        }
        if (a.wait > 0) { a.wait -= dt; continue; }
        const dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz);
        if (d < 0.05) {
          a.wait = 0.5 + this.rnd() * (a.kind === 'cow' ? 8 : 3);
          const r = a.kind === 'dog' || a.kind === 'cat' ? 4 : 2.5;
          a.tx = Math.min(a.pen.x1, Math.max(a.pen.x0, a.x + (this.rnd() * 2 - 1) * r));
          a.tz = Math.min(a.pen.z1, Math.max(a.pen.z0, a.z + (this.rnd() * 2 - 1) * r));
          continue;
        }
        const step = Math.min(d, sp * dt);
        a.x += (dx / d) * step;
        a.z += (dz / d) * step;
        a.ang = Math.atan2(-dz, dx);
      }
      for (const a of list) {
        const m = this.animalMesh[a.kind];
        if (!m || counts[a.kind] >= 48) continue;
        let x = a.x, z = a.z, y = 0.25, ang = a.ang, roll = 0;
        if (FLYING.has(a.kind)) {
          x = a.tx; z = a.tz; y = a.h + Math.sin(this.t + a.x) * 0.5;
          ang = -(a.ang + a.x * 0.37) - Math.PI / 2;
          roll = Math.sin(this.t * 6 + a.x) * 0.3;
        } else if (a.kind === 'duck') y = 0;
        else if (a.wait <= 0) y += Math.abs(Math.sin(this.t * 10 + a.x)) * 0.03;
        this.q.setFromEuler(this.e.set(roll, ang, 0));
        this.m.compose(this.v.set(x, y, z), this.q, this.sc.set(1, 1, 1));
        m.setMatrixAt(counts[a.kind], this.m);
        m.setColorAt(counts[a.kind], this.c.setHex(a.color));
        counts[a.kind]++;
      }
    }
    for (const k in this.animalMesh) this.flush(this.animalMesh[k], counts[k]);
  }

  // ---------- дым ----------
  private smoke(dt: number, near: Place[]) {
    this.puffAcc += dt;
    if (this.puffAcc > 0.35) {
      this.puffAcc = 0;
      for (const p of near) for (const [x, y, z] of p.smoke) if (this.rnd() < 0.3 && this.puffs.length < 240) this.puffs.push({ x, y, z, t: 0 });
    }
    let n = 0;
    this.puffs = this.puffs.filter((f) => (f.t += dt) < 4);
    for (const f of this.puffs) {
      const k = f.t / 4;
      const s = 0.5 + k * 1.8 * (1 - k * 0.6);
      this.m.compose(this.v.set(f.x + k * 1.5, f.y + f.t * 0.7, f.z - k * 0.5), this.q.identity(), this.sc.setScalar(s * (1 - k * 0.5)));
      this.smokeMesh.setMatrixAt(n, this.m);
      this.smokeMesh.setColorAt(n, this.c.setScalar(0.95 - k * 0.15));
      n++;
    }
    this.flush(this.smokeMesh, n);
  }

  private flush(m: THREE.InstancedMesh, n: number) {
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  /** Сколько сейчас машин, жителей и животных — для проверок. */
  stats() {
    let w = 0, a = 0;
    for (const l of this.walkers.values()) w += l.length;
    for (const l of this.critters.values()) a += l.length;
    return { cars: this.cars.length, walkers: w, animals: a, puffs: this.puffs.length };
  }
}

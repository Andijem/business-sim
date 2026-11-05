import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildWorld } from './village';
import { THEMES } from './places';
import { VILLAGES } from '../sim';

/** Сколько кубиков-инстансов уйдёт на видеокарту у куска мира. */
function count(o: THREE.Object3D) {
  let n = 0;
  o.traverse((m) => { if ((m as THREE.InstancedMesh).isInstancedMesh) n += (m as THREE.InstancedMesh).count; });
  return n;
}

describe('мир вокруг бизнесов', () => {
  const w = buildWorld();
  while (w.step());
  it('у каждого места своя тема и всё построилось', () => {
    for (const V of VILLAGES) expect(THEMES[V.id], V.id).toBeTruthy();
    expect(w.places.every((p) => p.built)).toBe(true);
  });
  it('каждое место укладывается в бюджет телефона', () => {
    // кусок мира = все меши одного места (без реки)
    const chunks = w.group.children.filter((c) => c.type === 'Group').slice(0, VILLAGES.length);
    for (const c of chunks) expect(count(c)).toBeLessThan(110_000);
  });
  it('в местах есть жизнь: животные, дым из труб, жители на лавочках', () => {
    for (const p of w.places) {
      expect(p.pens.length, p.id).toBeGreaterThan(0);
      expect(p.idle.length, p.id).toBeGreaterThan(0);
    }
    expect(w.places.filter((p) => p.smoke.length > 0).length).toBeGreaterThanOrEqual(8);
    expect(w.places.find((p) => p.id === 'grosh')!.anim.some((a) => a.kind === 'spin')).toBe(true);
  });
  it('мир не зависит от порядка постройки', () => {
    const a = buildWorld();
    a.ensure(w.places[10].x, 1);
    while (a.step());
    const sig = (b: typeof w) => b.places.map((p) => `${p.id}:${p.pens.length}:${p.smoke.length}:${p.idle.length}`).join(' ');
    expect(sig(a)).toBe(sig(w));
  });
});

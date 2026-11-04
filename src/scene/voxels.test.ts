import { describe, expect, it } from 'vitest';
import { VoxelStore, vi, VS } from './voxels';

describe('VoxelStore', () => {
  it('fill заполняет коробку в мировых координатах', () => {
    const s = new VoxelStore();
    s.fill(0, 0, 0, 1, 1, 1, 0xff0000);
    expect(s.solid.size).toBe((1 / VS) ** 3);
    expect(vi(0.99)).toBe(3);
  });
  it('скрытые внутренние воксели не рисуются', () => {
    const s = new VoxelStore();
    s.fill(0, 0, 0, 1, 1, 1, 0x00ff00); // куб 4×4×4
    // внутренние 2×2×2 скрыты, нижний слой виден только снизу — его тоже не рисуем,
    // кроме вокселей с боковыми гранями
    const visible = s.visibleSolid().length;
    expect(visible).toBeLessThan(64);
    expect(visible).toBe(64 - 2 * 2 * 3);
  });
  it('светящиеся воксели вытесняют обычные и наоборот', () => {
    const s = new VoxelStore();
    s.put(1, 1, 1, 0x111111);
    s.putGlow(1, 1, 1, 0xffffff);
    expect(s.has(1, 1, 1)).toBe(false);
    expect(s.glow.size).toBe(1);
  });
});

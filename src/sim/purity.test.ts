import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

it('симуляция — чистый TypeScript без three.js, DOM и Math.random', () => {
  const dir = join(__dirname);
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts') && !x.endsWith('.test.ts'))) {
    const src = readFileSync(join(dir, f), 'utf8');
    expect(src, f).not.toMatch(/from 'three'|document\.|window\.|Math\.random|Date\.now|\.\.\/ui|\.\.\/scene/);
  }
});

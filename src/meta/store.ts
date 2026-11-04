import { loadMeta, saveMeta } from '../save/idb';
import { isMeta, newMeta, type Meta } from './coins';

/** Монетки игрока на этом устройстве (одна копия на всё приложение). */
let meta: Meta = newMeta();
const listeners: (() => void)[] = [];

export const getMeta = () => meta;
export const onMeta = (f: () => void) => listeners.push(f);

export function saveMetaNow() {
  saveMeta(meta).catch(() => {});
  for (const f of listeners) f();
}

export async function loadMetaNow(): Promise<Meta> {
  const m = await loadMeta();
  if (isMeta(m)) meta = { ...newMeta(), ...m };
  return meta;
}

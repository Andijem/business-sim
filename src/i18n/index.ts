import ru from './ru.json';

type Key = keyof typeof ru;
const dict: Record<string, string> = ru;

/** Текст по ключу с подстановкой {параметров}. Все тексты игры живут в файлах перевода. */
export function t(key: Key, params: Record<string, string | number> = {}): string {
  const raw = dict[key] ?? key;
  return raw.replace(/\{(\w+)\}/g, (_, p: string) => String(params[p] ?? `{${p}}`));
}

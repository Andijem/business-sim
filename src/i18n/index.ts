import ru from './ru.json';

type Key = keyof typeof ru;
const dict: Record<string, string> = ru;

const fill = (raw: string, params: Record<string, string | number>) =>
  raw.replace(/\{(\w+)\}/g, (_, p: string) => String(params[p] ?? `{${p}}`));

/** Текст по ключу с подстановкой {параметров}. Все тексты игры живут в файлах перевода. */
export function t(key: Key, params: Record<string, string | number> = {}): string {
  return fill(dict[key] ?? key, params);
}

/** То же для ключей, собранных на лету (карточки, события, ниши). */
export function tk(key: string, params: Record<string, string | number> = {}): string {
  return fill(dict[key] ?? key, params);
}

export const hasKey = (key: string): boolean => key in dict;

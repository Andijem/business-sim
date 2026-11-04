// Заглушка для сборки в один HTML-файл: при открытии через file:// service worker недоступен.
export function registerSW(_opts?: unknown) {
  return async () => {};
}

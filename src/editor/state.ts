import { tk } from '../i18n';
import { defaults, type Item } from './catalog';

/** Правки одного предмета: оценка, комментарий, замены цветов и настройки. */
export interface ItemEdit {
  status?: 'ok' | 'fix';
  note?: string;
  /** Исходный цвет из кода → новый, оба как #rrggbb. */
  colors?: Record<string, string>;
  params?: Record<string, number>;
}
export interface EditorState {
  current: string;
  items: Record<string, ItemEdit>;
}

const KEY = 'temka-editor-v1';

/** Хранилище браузера может быть недоступно (приватный режим, файл с диска): тогда правки живут до закрытия. */
export function loadState(): EditorState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as EditorState;
      if (s && typeof s === 'object' && s.items) return s;
    }
  } catch { /* нет хранилища */ }
  return { current: '', items: {} };
}
export function saveState(s: EditorState) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* нет хранилища */ }
}

const MARK = '--- JSON ---';

/** Текст для Claude: что поправить по-человечески и тот же список в JSON для переноса в игру. */
export function exportText(s: EditorState, items: Item[], place: string): string {
  const lines = [tk('ed.out.head', { place: tk(`village.${place}`), date: new Date().toISOString().slice(0, 10) }), ''];
  const data: Record<string, ItemEdit> = {};
  let n = 0;
  for (const it of items) {
    const e = s.items[it.id];
    if (!e) continue;
    const colors = Object.entries(e.colors ?? {});
    const params = Object.entries(e.params ?? {});
    if (!e.status && !e.note?.trim() && !colors.length && !params.length) continue;
    data[it.id] = e;
    n++;
    const st = e.status === 'ok' ? tk('ed.out.ok') : e.status === 'fix' ? tk('ed.out.fix') : tk('ed.out.edited');
    lines.push(`${n}. ${tk(`ed.item.${it.id}`)} (${it.id}) — ${st}`);
    if (e.note?.trim()) lines.push(`   ${tk('ed.out.note')}: ${e.note.trim()}`);
    if (colors.length) lines.push(`   ${tk('ed.out.colors')}: ${colors.map(([a, b]) => `${a} → ${b}`).join(', ')}`);
    if (params.length) {
      const def = defaults(it);
      lines.push(`   ${tk('ed.out.params')}: ${params.map(([k, v]) => `${tk(`ed.param.${k}`)} ${v} (${tk('ed.out.was')} ${def[k]})`).join(', ')}`);
    }
  }
  if (!n) lines.push(tk('ed.out.empty'));
  lines.push('', MARK, JSON.stringify({ place, items: data }, null, 1));
  return lines.join('\n');
}

/** Загружает правки из выгрузки (или просто JSON) — например, чтобы перенести их с ПК на телефон. */
export function parseImport(text: string): Record<string, ItemEdit> | null {
  const at = text.indexOf(MARK);
  const raw = at >= 0 ? text.slice(at + MARK.length) : text;
  try {
    const j = JSON.parse(raw.trim()) as { items?: Record<string, ItemEdit> };
    return j && typeof j.items === 'object' ? j.items : null;
  } catch {
    return null;
  }
}

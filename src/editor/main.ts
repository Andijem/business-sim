import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { setupWorld } from '../scene/world';
import { ANIMALS, CAR, PERSON_BODY, PERSON_HEAD } from '../scene/figures';
import { tk } from '../i18n';
import { ITEMS, PLACES, SECTIONS, defaults, newStage, type Figure, type Item, type Params } from './catalog';
import { hex, recolorGeometry, tint, unhex, withColors, type Swatch } from './recolor';
import { exportText, loadState, parseImport, saveState, type EditorState, type ItemEdit } from './state';
import './editor.css';

/**
 * Редактор предметов: каждый предмет мира отдельно на поворотном столе.
 * Модели те же, что в игре (src/scene), правки цветов и размеров копятся в списке
 * и выгружаются текстом, который можно отдать Claude, чтобы перенести их в игру.
 */

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

document.title = tk('ed.title');
document.body.innerHTML = `
<header class="top">
  <div class="brand"><b>${tk('ed.brand')}</b><span>${tk('ed.title')}</span></div>
  <div class="places" id="places"></div>
  <select id="pick" class="pick" aria-label="${tk('ed.list')}"></select>
  <div class="actions">
    <span class="progress" id="progress"></span>
    <button id="exportBtn" class="primary">${tk('ed.export')}</button>
  </div>
</header>
<aside class="list" id="list" aria-label="${tk('ed.list')}"></aside>
<main class="stage">
  <div id="view" class="view"></div>
  <div class="hud">
    <div class="caption"><span id="counter"></span><b id="caption"></b></div>
    <button class="nav prev" id="prev" aria-label="${tk('ed.prev')}">‹</button>
    <button class="nav next" id="next" aria-label="${tk('ed.next')}">›</button>
    <div class="tools">
      <label class="tool"><input type="checkbox" id="spin" checked> ${tk('ed.spin')}</label>
      <label class="tool" id="cutTool"><input type="checkbox" id="cut"> ${tk('ed.cutaway')}</label>
      <label class="tool"><input type="checkbox" id="orig"> ${tk('ed.original')}</label>
      <label class="tool time">🕑 <input type="range" id="hour" min="5" max="23.5" step="0.5" value="13"> <span id="hourV"></span></label>
    </div>
  </div>
</main>
<aside class="panel" id="panel"></aside>
<dialog id="dlg">
  <form method="dialog" class="dlg">
    <h2>${tk('ed.exportTitle')}</h2>
    <p class="muted">${tk('ed.exportHint')}</p>
    <textarea id="exportText" rows="14" spellcheck="false"></textarea>
    <div class="row">
      <button type="button" id="copyBtn" class="primary">${tk('ed.copy')}</button>
      <button type="button" id="saveBtn">${tk('ed.download')}</button>
      <button type="button" id="importBtn">${tk('ed.import')}</button>
      <span class="muted" id="dlgNote"></span>
      <button value="close" class="right">${tk('ed.close')}</button>
    </div>
  </form>
</dialog>`;

// ---------- сцена ----------
const view = $('#view');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
view.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const world = setupWorld(scene);
// туман игры рассчитан на улицу; здесь предмет рядом, туман только у горизонта
Object.assign(scene.fog as THREE.Fog, { near: 300, far: 900 });
const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 1200);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.autoRotate = true;
controls.autoRotateSpeed = 1.6;
controls.maxPolarAngle = Math.PI * 0.49;
// поворотный стол: светлый круг под предметом
const table = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.02, 64), new THREE.MeshLambertMaterial({ color: 0xe9e2d2 }));
table.receiveShadow = true;
table.position.y = -0.03;
scene.add(table);
let current: THREE.Group | null = null;
let cutaway: THREE.Object3D[] = [];

function resize() {
  const w = view.clientWidth, h = view.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(view);

const figureGeo = (f: Figure): THREE.BufferGeometry[] =>
  f.kind === 'person' ? [PERSON_BODY(), PERSON_HEAD()] : f.kind === 'car' ? [CAR()] : [ANIMALS[f.kind]()];

function figureMesh(f: Figure): THREE.Group {
  const g = new THREE.Group();
  figureGeo(f).forEach((geo, n) => {
    const c = n === 1 ? f.hair ?? 0xffffff : f.tint;
    const m = new THREE.Mesh(recolorGeometry(geo), new THREE.MeshLambertMaterial({ vertexColors: true, color: tint(c) }));
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  });
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.rot;
  g.scale.setScalar(f.scale);
  return g;
}

function smokePuffs(list: [number, number, number][]): THREE.Object3D {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0xe8e8ec, transparent: true, opacity: 0.7, depthWrite: false });
  const geo = new THREE.BoxGeometry(0.35, 0.35, 0.35);
  for (const [x, y, z] of list) for (let n = 0; n < 3; n++) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x + n * 0.15, y + n * 0.45, z - n * 0.05);
    m.scale.setScalar(1 + n * 0.3);
    g.add(m);
  }
  return g;
}

/** Собирает предмет с правками и ставит его на стол. Возвращает палитру исходных цветов. */
function show(it: Item, edit: ItemEdit, original: boolean): Swatch[] {
  if (current) { scene.remove(current); disposeTree(current); }
  const p: Params = { ...defaults(it), ...(original ? {} : edit.params) };
  const map = new Map<number, number>(original ? [] : Object.entries(edit.colors ?? {}).map(([a, b]) => [unhex(a), unhex(b)]));
  const { out, swatches } = withColors(map, () => {
    const st = newStage(1);
    it.build(st, p);
    const g = new THREE.Group();
    g.add(st.ctx.s.build());
    for (const e of st.extra) g.add(e);
    for (const f of st.figures) g.add(figureMesh(f));
    if (st.ctx.smoke.length) g.add(smokePuffs(st.ctx.smoke));
    return { g, cut: st.cutaway };
  });
  current = out.g;
  cutaway = out.cut;
  scene.add(current);
  applyCut();
  frameCamera(current);
  return swatches;
}

function disposeTree(o: THREE.Object3D) {
  o.traverse((m) => {
    const mesh = m as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry && !(mesh as THREE.InstancedMesh).isInstancedMesh) mesh.geometry.dispose();
    if ((mesh as THREE.InstancedMesh).isInstancedMesh) (mesh as THREE.InstancedMesh).dispose();
  });
}

let framedFor = '';
function frameCamera(g: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(g);
  if (box.isEmpty()) box.set(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 1, 1));
  const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const r = Math.max(0.6, Math.hypot(size.x, size.z) / 2);
  table.scale.set(r * 1.25, 1, r * 1.25);
  table.position.x = c.x;
  table.position.z = c.z;
  // при смене настроек того же предмета камеру не дёргаем
  if (framedFor === state.current) { controls.target.set(c.x, c.y, c.z); return; }
  framedFor = state.current;
  const rad = Math.max(0.8, size.length() / 2);
  const dist = rad / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.05;
  const dir = new THREE.Vector3(0.75, 0.55, 1).normalize();
  camera.position.copy(c).addScaledVector(dir, dist);
  camera.near = dist / 100;
  camera.far = dist * 40 + 600;
  camera.updateProjectionMatrix();
  controls.target.copy(c);
  controls.minDistance = rad * 0.6;
  controls.maxDistance = dist * 4;
  // тени по размеру предмета: чётче для мелочи
  const sh = world.sun.shadow.camera;
  const e = Math.max(4, rad * 1.6);
  Object.assign(sh, { left: -e, right: e, top: e, bottom: -e });
  sh.updateProjectionMatrix();
  world.sun.target.position.copy(c);
}

function applyCut() {
  const on = ($('#cut') as HTMLInputElement).checked;
  for (const o of cutaway) o.visible = !on;
}

// ---------- состояние ----------
const state: EditorState = loadState();
if (!ITEMS.some((i) => i.id === state.current)) state.current = ITEMS[0].id;
const place = PLACES[0];
const items = ITEMS.filter((i) => i.places.includes(place));
const editOf = (id: string): ItemEdit => (state.items[id] ??= {});
const name = (it: Item) => tk(`ed.item.${it.id}`);
const touched = (e: ItemEdit | undefined) => !!e && (!!e.status || !!e.note?.trim() || Object.keys(e.colors ?? {}).length > 0 || Object.keys(e.params ?? {}).length > 0);

function persist() { saveState(state); renderList(); renderProgress(); }

// ---------- список ----------
function renderPlaces() {
  const box = $('#places');
  box.innerHTML = '';
  for (const id of ['kopeechkino', 'barysh', 'grosh', 'navarinka', 'kreditovka', 'dolzhkovo']) {
    const b = el('button', 'chip', tk(`village.${id}`));
    const ready = PLACES.includes(id);
    b.disabled = !ready;
    b.setAttribute('aria-pressed', String(id === place));
    if (!ready) b.title = tk('ed.soon');
    box.appendChild(b);
  }
}

function statusMark(e: ItemEdit | undefined) {
  if (e?.status === 'ok') return '✓';
  if (e?.status === 'fix' || touched(e)) return '✎';
  return '';
}

function renderList() {
  const list = $('#list');
  const pick = $('#pick') as HTMLSelectElement;
  list.innerHTML = '';
  pick.innerHTML = '';
  for (const sec of SECTIONS) {
    const its = items.filter((i) => i.section === sec);
    if (!its.length) continue;
    list.appendChild(el('h3', '', tk(`ed.sec.${sec}`)));
    const og = document.createElement('optgroup');
    og.label = tk(`ed.sec.${sec}`);
    for (const it of its) {
      const e = state.items[it.id];
      const b = el('button', 'item');
      b.appendChild(el('span', '', name(it)));
      const mark = statusMark(e);
      if (mark) b.appendChild(el('i', e?.status === 'ok' ? 'ok' : 'fix', mark));
      b.setAttribute('aria-current', String(it.id === state.current));
      b.onclick = () => select(it.id);
      list.appendChild(b);
      const o = document.createElement('option');
      o.value = it.id;
      o.textContent = (mark ? mark + ' ' : '') + name(it);
      o.selected = it.id === state.current;
      og.appendChild(o);
    }
    pick.appendChild(og);
  }
  list.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' });
}
($('#pick') as HTMLSelectElement).onchange = (e) => select((e.target as HTMLSelectElement).value);

function renderProgress() {
  const done = items.filter((i) => state.items[i.id]?.status === 'ok').length;
  const fix = items.filter((i) => state.items[i.id]?.status !== 'ok' && touched(state.items[i.id])).length;
  $('#progress').textContent = tk('ed.progress', { ok: done, fix, all: items.length });
}

// ---------- панель предмета ----------
function renderPanel(swatches: Swatch[]) {
  const it = items.find((i) => i.id === state.current)!;
  const e = editOf(it.id);
  const panel = $('#panel');
  panel.innerHTML = '';
  panel.appendChild(el('h2', '', name(it)));
  panel.appendChild(el('p', 'where', tk(`ed.sec.${it.section}`) + ' · ' + it.places.map((p) => tk(`village.${p}`)).join(', ')));
  panel.appendChild(el('p', 'desc', tk(`ed.desc.${it.id}`)));

  // оценка
  const rate = el('div', 'rate');
  for (const [st, label] of [['ok', 'ed.ok'], ['fix', 'ed.fix']] as const) {
    const b = el('button', 'rate-' + st, tk(label));
    b.setAttribute('aria-pressed', String(e.status === st));
    b.onclick = () => { e.status = e.status === st ? undefined : st; persist(); renderPanel(swatches); };
    rate.appendChild(b);
  }
  panel.appendChild(rate);

  const note = el('textarea', 'note') as HTMLTextAreaElement;
  note.placeholder = tk('ed.notePh');
  note.rows = 3;
  note.value = e.note ?? '';
  note.oninput = () => { e.note = note.value; if (note.value.trim() && !e.status) e.status = 'fix'; saveState(state); renderProgress(); };
  note.onchange = () => persist();
  panel.appendChild(el('label', 'lbl', tk('ed.note')));
  panel.appendChild(note);

  // настройки
  const defs = it.params ?? [];
  if (defs.length) {
    panel.appendChild(el('h4', '', tk('ed.params')));
    const base = defaults(it);
    for (const d of defs) {
      const row = el('div', 'param');
      const val = e.params?.[d.key] ?? d.def;
      row.appendChild(el('span', 'pname', tk(`ed.param.${d.key}`)));
      if (d.opts) {
        const box = el('div', 'opts');
        d.opts.forEach((o, n) => {
          const b = el('button', o.startsWith('#') ? 'opt sw' : 'opt', o.startsWith('#') ? '' : tk(o));
          if (o.startsWith('#')) { b.style.background = o; b.title = o; }
          b.setAttribute('aria-pressed', String(n === val));
          b.onclick = () => setParam(it, d.key, n, base[d.key]);
          box.appendChild(b);
        });
        row.appendChild(box);
      } else {
        const r = el('input') as HTMLInputElement;
        Object.assign(r, { type: 'range', min: String(d.min), max: String(d.max), step: String(d.step), value: String(val) });
        const out = el('output', '', fmt(val));
        r.oninput = () => { out.textContent = fmt(+r.value); setParam(it, d.key, +r.value, base[d.key], false); };
        r.onchange = () => renderPanel(lastSwatches);
        row.append(r, out);
      }
      if (e.params && d.key in e.params) row.classList.add('changed');
      panel.appendChild(row);
    }
  }

  // цвета
  panel.appendChild(el('h4', '', tk('ed.colors')));
  panel.appendChild(el('p', 'muted small', tk('ed.colorsHint')));
  const grid = el('div', 'colors');
  for (const s of swatches.slice(0, 40)) {
    const from = hex(s.c);
    const now = e.colors?.[from];
    const cell = el('label', 'color' + (now ? ' changed' : ''));
    const inp = el('input') as HTMLInputElement;
    inp.type = 'color';
    inp.value = now ?? from;
    inp.oninput = () => setColor(it, from, inp.value, false);
    inp.onchange = () => { setColor(it, from, inp.value); };
    const chip = el('span', 'was');
    chip.style.background = from;
    cell.append(chip, inp, el('code', '', now ? `${from}→${now}` : from + (s.glow ? ' ✨' : '')));
    cell.title = tk('ed.colorCount', { n: s.n });
    grid.appendChild(cell);
  }
  panel.appendChild(grid);

  const reset = el('button', 'reset', tk('ed.reset'));
  reset.onclick = () => { delete e.colors; delete e.params; persist(); refresh(); };
  panel.appendChild(reset);
}

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, ''));

function setParam(it: Item, key: string, v: number, def: number, rerenderPanel = true) {
  const e = editOf(it.id);
  e.params ??= {};
  if (v === def) delete e.params[key]; else e.params[key] = v;
  if (!Object.keys(e.params).length) delete e.params;
  saveState(state);
  lastSwatches = show(it, e, isOrig());
  if (rerenderPanel) { renderPanel(lastSwatches); renderList(); renderProgress(); }
}
function setColor(it: Item, from: string, to: string, final = true) {
  const e = editOf(it.id);
  e.colors ??= {};
  if (to.toLowerCase() === from.toLowerCase()) delete e.colors[from]; else e.colors[from] = to.toLowerCase();
  if (!Object.keys(e.colors).length) delete e.colors;
  saveState(state);
  lastSwatches = show(it, e, isOrig());
  if (final) { renderPanel(lastSwatches); renderList(); renderProgress(); }
}

const isOrig = () => ($('#orig') as HTMLInputElement).checked;
let lastSwatches: Swatch[] = [];

function refresh() {
  const it = items.find((i) => i.id === state.current)!;
  const idx = items.indexOf(it);
  $('#counter').textContent = `${idx + 1} / ${items.length}`;
  $('#caption').textContent = name(it);
  ($('#cutTool') as HTMLElement).hidden = it.section !== 'biz';
  lastSwatches = show(it, editOf(it.id), isOrig());
  renderPanel(lastSwatches);
  renderList();
  renderProgress();
}

function select(id: string) {
  state.current = id;
  saveState(state);
  refresh();
}
function step(d: number) {
  const idx = items.findIndex((i) => i.id === state.current);
  select(items[(idx + d + items.length) % items.length].id);
}
$('#prev').onclick = () => step(-1);
$('#next').onclick = () => step(1);
document.addEventListener('keydown', (ev) => {
  const t = ev.target as HTMLElement;
  if (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.tagName === 'SELECT') return;
  if (ev.key === 'ArrowRight') step(1);
  if (ev.key === 'ArrowLeft') step(-1);
});

($('#spin') as HTMLInputElement).onchange = (e) => { controls.autoRotate = (e.target as HTMLInputElement).checked; };
($('#cut') as HTMLInputElement).onchange = applyCut;
($('#orig') as HTMLInputElement).onchange = () => { lastSwatches = show(items.find((i) => i.id === state.current)!, editOf(state.current), isOrig()); };
const hour = $('#hour') as HTMLInputElement;
const setHour = () => {
  const h = +hour.value;
  world.setHour(h);
  $('#hourV').textContent = `${Math.floor(h)}:${h % 1 ? '30' : '00'}`;
};
hour.oninput = setHour;
setHour();

// ---------- выгрузка правок ----------
const dlg = $('#dlg') as HTMLDialogElement;
const txt = $('#exportText') as HTMLTextAreaElement;
const dlgNote = $('#dlgNote');
$('#exportBtn').onclick = () => {
  txt.value = exportText(state, items, place);
  dlgNote.textContent = '';
  dlg.showModal();
};
$('#copyBtn').onclick = async () => {
  try { await navigator.clipboard.writeText(txt.value); dlgNote.textContent = tk('ed.copied'); }
  catch { txt.select(); document.execCommand('copy'); dlgNote.textContent = tk('ed.copied'); }
};
$('#saveBtn').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txt.value], { type: 'text/plain;charset=utf-8' }));
  a.download = `temka-pravki-${place}.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('#importBtn').onclick = () => {
  const got = parseImport(txt.value);
  if (!got) { dlgNote.textContent = tk('ed.importBad'); return; }
  Object.assign(state.items, got);
  persist();
  refresh();
  dlgNote.textContent = tk('ed.imported', { n: Object.keys(got).length });
};

// ---------- кадр ----------
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});

renderPlaces();
resize();
refresh();

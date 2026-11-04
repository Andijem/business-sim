import * as THREE from 'three';
import { registerSW } from 'virtual:pwa-register';
import { buildWorld } from './scene/village';
import { setupWorld } from './scene/world';
import { LotsView, type LotView } from './scene/lots';
import { People } from './scene/people';
import { slotOf, villageX } from './scene/layout';
import { mountBalance, type Sheet } from './ui/balance';
import { mountPlay } from './ui/play';
import { NICHE_ICON } from './ui/icons';
import { t, tk } from './i18n';
import { OFFLINE_MAX_DAYS, village, nichesOpen, catchUp, endDay, finishDay, newGame, type GameState, type NicheId } from './sim';
import { checkAchievements, dailyLogin, offlineMax, timeMult } from './meta/coins';
import { getMeta, loadMetaNow, saveMetaNow } from './meta/store';
import { buzz, initSound, sfx } from './ui/sound';
import { loadGame, saveGame } from './save/idb';
import { exportCode, importCode } from './save/code';

registerSW({ immediate: true });

const app = document.getElementById('app')!;
const ui = document.getElementById('ui')!;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// тени пересчитываем, только когда сдвинулось солнце или камера: экономит батарею
renderer.shadowMap.autoUpdate = false;
let shadowHour = -1;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const world = setupWorld(scene);
scene.add(buildWorld());
const lots = new LotsView();
scene.add(lots.group);
const people = new People();
scene.add(people.group);

// ---------- игра ----------
let state: GameState = newGame((Date.now() & 0x7fffffff) >>> 0);

/** Игровой день идёт с 7:00 до 23:00; при скорости ×1 это 2 минуты. */
const DAY_START = 7, DAY_END = 23, DAY_SEC = 120;
let hour = DAY_START;
// #pause в адресе — старт на паузе (для проверок и скриншотов)
let speed = location.hash.includes('pause') ? 0 : 1;
let resumeSpeed = 1;

function persist(st: GameState) {
  if (lots.sync(st)) {
    syncPins();
    if (!dayClosing) sfx('up');
  }
  rewards(st);
  play.update();
  requestRender();
  saveGame(st).catch(() => {});
}

/** Достижения дают монетки: показываем и сохраняем. */
let metaReady = false;
function rewards(st: GameState) {
  if (!metaReady) return;
  const got = checkAchievements(st, getMeta());
  if (!got.length) return;
  saveMetaNow();
  for (const a of got) play.toast(t('shop.got', { name: tk(`ach.${a.id}`), n: a.coins }));
  sfx('coin');
}

const balance = mountBalance(
  ui,
  () => state,
  persist,
  () => {
    state = newGame((Date.now() & 0x7fffffff) >>> 0);
    hour = DAY_START;
    persist(state);
  },
  (code) => {
    const st = importCode(code);
    if (!st) return false;
    state = st;
    persist(state);
    return true;
  },
  () => exportCode(state),
  () => onSheetClosed(),
);

/** Шторка закрылась: убираем разрез, отлетаем назад, продолжаем время. */
function onSheetClosed() {
  lots.setCutaway(null);
  if (flyTo) {
    host.focusVillage(flyTo);
    flyTo = null;
  }
  goal.dist = Math.max(goal.dist, 64);
  goal.pitch = 0.9;
  if (state.pending.length) {
    balance.open({ kind: 'cards' });
    return;
  }
  speed = resumeSpeed;
  play.update();
  requestRender();
}

const openSheet = balance.open.bind(balance);
balance.open = (s) => {
  if (speed > 0) resumeSpeed = speed;
  speed = 0;
  openSheet(s);
  play.update();
};

/** Конец дня: рынок считает день, утром новые карточки. Потом итоги. */
/** Деревня, к которой подлететь после итогов дня (только что открылась дорога). */
let flyTo: string | null = null;
let dayClosing = false;
function closeDay() {
  if (state.bankrupt) return;
  const open0 = state.unlocked.length;
  const caught0 = Object.keys(state.captured).length;
  const cash0 = state.companies[0].cash;
  endDay(state);
  finishDay(state);
  if (state.unlocked.length > open0) flyTo = state.unlocked[state.unlocked.length - 1];
  hour = DAY_START;
  dayClosing = true;
  persist(state);
  dayClosing = false;
  const delta = state.companies[0].cash - cash0;
  play.dayFx(delta);
  if (Object.keys(state.captured).length > caught0) { sfx('win'); buzz([60, 40, 60, 40, 120]); }
  else if (delta < 0) { sfx('bad'); buzz(80); }
  else sfx('coin');
  balance.open({ kind: 'summary' });
}

// ---------- камера ----------
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 900);
const cam = { target: new THREE.Vector3(-4, 0, 1), yaw: 0.45, pitch: 0.9, dist: 70 };
const goal = { target: cam.target.clone(), yaw: cam.yaw, pitch: cam.pitch, dist: cam.dist };
let currentVillage = 'kopeechkino';

/** Пока открыта шторка, картинка сдвигается вверх, чтобы здание было видно над ней. */
let shift = 0;
function placeCamera() {
  const want = balance.isOpen() ? 0.27 : 0;
  shift += (want - shift) * 0.25;
  if (Math.abs(want - shift) < 0.002) shift = want;
  if (shift > 0) camera.setViewOffset(innerWidth, innerHeight, 0, innerHeight * shift, innerWidth, innerHeight);
  else camera.clearViewOffset();
  camera.position.set(
    cam.target.x + cam.dist * Math.cos(cam.pitch) * Math.sin(cam.yaw),
    cam.target.y + cam.dist * Math.sin(cam.pitch),
    cam.target.z + cam.dist * Math.cos(cam.pitch) * Math.cos(cam.yaw),
  );
  camera.lookAt(cam.target);
  world.sun.target.position.copy(cam.target);
  world.sun.position.add(cam.target);
}

function fly(v: LotView, cut: boolean) {
  currentVillage = v.lot.village;
  goal.target.copy(v.center).setY(1);
  // смотрим на фасад: камера с той стороны, куда он повёрнут
  goal.dist = cut ? 24 : 34;
  goal.pitch = cut ? 1.0 : 0.85;
  const face = slotOf(v.lot).face;
  const want = { pz: 0.35, nz: Math.PI + 0.35, px: Math.PI / 2 + 0.35, nx: -Math.PI / 2 + 0.35 }[face];
  // поворачиваем по кратчайшей дуге
  goal.yaw = cam.yaw + Math.atan2(Math.sin(want - cam.yaw), Math.cos(want - cam.yaw));
  lots.setCutaway(cut ? v.key : null);
  requestRender();
}

const host = {
  getState: () => state,
  balance,
  focusPoint(id: number) {
    const v = lots.byPoint(id);
    if (v) fly(v, true);
  },
  focusLot(village: string, niche: NicheId | null, rivalId?: number) {
    let v: LotView | undefined;
    if (rivalId != null) v = lots.byPoint(rivalId);
    else for (const x of lots.views.values()) if (x.lot.village === village && !x.lot.point && (!niche || x.lot.niche === niche)) { v = x; break; }
    if (v) fly(v, false);
  },
  focusVillage(id: string) {
    currentVillage = id;
    goal.target.set(villageX(id) - 4, 0, 1);
    goal.dist = 70;
    requestRender();
    play.update();
  },
  speed: () => speed,
  setSpeed(x: number) {
    speed = x;
    resumeSpeed = x || resumeSpeed;
    requestRender();
  },
  endDayNow: () => closeDay(),
  hour: () => hour,
  village: () => currentVillage,
};
const play = mountPlay(ui, host);

// ---------- подписи над участками ----------
const pinEls = new Map<string, HTMLButtonElement>();
function syncPins() {
  for (const v of lots.views.values()) {
    let b = pinEls.get(v.key);
    if (!b) {
      b = document.createElement('button');
      b.dataset.key = v.key;
      play.pins.appendChild(b);
      pinEls.set(v.key, b);
    }
    const p = v.lot.point;
    const locked = !state.unlocked.includes(v.lot.village);
    const soon = !p && !nichesOpen(state.unlocked, village(v.lot.village)).includes(v.lot.niche);
    const icon = NICHE_ICON[v.lot.niche] ?? '🏠';
    b.hidden = locked && !p;
    b.className = soon ? 'free soon' : !p ? 'free' : p.owner === 0 ? 'mine' : p.forSale ? 'sale' : village(p.village).city ? 'rival corp' : 'rival';
    b.innerHTML = soon
      ? `${icon} ${t('play.pin.soon')}`
      : !p
      ? `${icon} ${t('play.pin.free')}`
      : p.owner === 0
        ? `${icon} ★${p.rep.toFixed(1)}<small>${tk(`niche.${p.niche}`)}</small>`
        : `${icon} ${p.forSale ? t('play.pin.sale') : village(p.village).city ? t('play.pin.rivalCity') : t('play.pin.rival')}`;
  }
}
play.pins.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button');
  const v = b && lots.views.get(b.dataset.key ?? '');
  if (v) openLot(v);
});

function openLot(v: LotView) {
  const p = v.lot.point;
  if (!state.unlocked.includes(v.lot.village) && (!p || p.owner !== 0)) return;
  if (!p && !nichesOpen(state.unlocked, village(v.lot.village)).includes(v.lot.niche)) {
    const after = village(v.lot.village).later?.after;
    play.toast(t('play.soon', { village: after ? tk(`village.${after}`) : '' }));
    return;
  }
  if (!p) {
    fly(v, false);
    balance.open({ kind: 'lot', village: v.lot.village, niche: v.lot.niche });
  } else if (p.owner === 0) {
    fly(v, true);
    balance.open({ kind: 'point', id: p.id });
  } else {
    fly(v, false);
    balance.open({ kind: 'rival', id: p.id });
  }
}

const tmp = new THREE.Vector3();
function placePins() {
  for (const v of lots.views.values()) {
    const b = pinEls.get(v.key);
    if (!b || b.hidden) continue;
    tmp.copy(v.center).setY(v.lot.point ? 5.2 : 2.5).project(camera);
    const vis = tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1 && cam.dist > 26;
    b.style.display = vis ? '' : 'none';
    if (vis) b.style.transform = `translate(${((tmp.x + 1) / 2) * innerWidth}px, ${((1 - tmp.y) / 2) * innerHeight}px) translate(-50%, -100%)`;
  }
}

// ---------- кадр ----------
let dirty = true;
function requestRender() { dirty = true; }
let prev = performance.now();
let uiTick = 0;
let lastDraw = 0;
function frame(now: number) {
  const dt = Math.min(0.1, (now - prev) / 1000);
  prev = now;
  let moving = lots.animate(now);
  // плавный полёт камеры
  const k = 1 - Math.pow(0.002, dt);
  const want = balance.isOpen() ? 0.27 : 0;
  if (Math.abs(want - shift) > 0.002) moving = true;
  if (cam.target.distanceTo(goal.target) > 0.01 || Math.abs(cam.dist - goal.dist) > 0.01) {
    cam.target.lerp(goal.target, k);
    cam.dist += (goal.dist - cam.dist) * k;
    cam.pitch += (goal.pitch - cam.pitch) * k;
    moving = true;
  }
  if (Math.abs(goal.yaw - cam.yaw) > 0.001 || Math.abs(goal.pitch - cam.pitch) > 0.001) {
    cam.yaw += (goal.yaw - cam.yaw) * k;
    cam.pitch += (goal.pitch - cam.pitch) * k;
    moving = true;
  }
  // время
  let gameHours = 0;
  if (speed > 0 && !state.bankrupt) {
    gameHours = (dt * speed * timeMult(getMeta(), Date.now()) * (DAY_END - DAY_START)) / DAY_SEC;
    hour += gameHours;
    if (hour >= DAY_END) closeDay();
    uiTick += dt;
    if (uiTick > 0.5) {
      uiTick = 0;
      play.update();
    }
  }
  world.setHour(hour);
  const crowd = people.update(dt, gameHours, hour, lots.views.values());
  // пока идёт время, хватает 30 кадров в секунду: экономим батарею
  const busy = speed > 0 || crowd;
  if (dirty || moving || (busy && now - lastDraw > 32)) {
    lastDraw = now;
    if (moving || dirty || Math.abs(hour - shadowHour) > 0.15) {
      renderer.shadowMap.needsUpdate = true;
      shadowHour = hour;
    }
    dirty = false;
    placeCamera();
    renderer.render(scene, camera);
    placePins();
  }
  requestAnimationFrame(frame);
}

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = camera.aspect < 1 ? 42 : 30;
  camera.updateProjectionMatrix();
  requestRender();
}
addEventListener('resize', resize);
resize();

// ---------- жесты: один палец крутит, два — приближают, тап — открывает участок ----------
const touches = new Map<number, { x: number; y: number }>();
let pinch0 = 0, dist0 = 0, moved = 0;
const el = renderer.domElement;
el.addEventListener('pointerdown', (e) => {
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  moved = 0;
  if (touches.size === 2) {
    const [a, b] = [...touches.values()];
    pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
    dist0 = goal.dist;
  }
});
addEventListener('pointerup', (e) => {
  const was = touches.get(e.pointerId);
  touches.delete(e.pointerId);
  if (was && moved < 8 && e.target === el) tapAt(e.clientX, e.clientY);
});
addEventListener('pointercancel', (e) => touches.delete(e.pointerId));
addEventListener('pointermove', (e) => {
  const p = touches.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  moved += Math.abs(dx) + Math.abs(dy);
  p.x = e.clientX;
  p.y = e.clientY;
  if (touches.size === 1) {
    cam.yaw -= dx * 0.006;
    goal.yaw = cam.yaw;
    goal.pitch = cam.pitch = Math.min(1.35, Math.max(0.35, cam.pitch + dy * 0.004));
  } else if (touches.size === 2) {
    const [a, b] = [...touches.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch0 > 0) goal.dist = cam.dist = Math.min(90, Math.max(12, (dist0 * pinch0) / d));
  }
  requestRender();
});
el.addEventListener('wheel', (e) => {
  goal.dist = Math.min(90, Math.max(12, goal.dist * (1 + Math.sign(e.deltaY) * 0.1)));
  requestRender();
}, { passive: true });

const ray = new THREE.Raycaster();
function tapAt(x: number, y: number) {
  ray.setFromCamera(new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1), camera);
  const hit = ray.intersectObject(lots.group, true)[0];
  if (!hit) return;
  let o: THREE.Object3D | null = hit.object;
  while (o && o.parent !== lots.group) o = o.parent;
  for (const v of lots.views.values()) if (v.mesh.group === o) return openLot(v);
}

// ---------- старт ----------
/** Камера смотрит между перекрёстком и первой точкой игрока. */
function homeView() {
  const v = state.companies[0].points[0] && lots.byPoint(state.companies[0].points[0].id);
  if (v) {
    currentVillage = v.lot.village;
    goal.target.set((villageX(v.lot.village) - 4 + v.center.x) / 2, 0, (1 + v.center.z) / 2);
    cam.target.copy(goal.target);
  }
}
lots.sync(state);
homeView();
syncPins();
play.update();
/** Пока игры не было на экране, дни шли сами: догоняем и показываем, что случилось. */
function awayFor(sec: number) {
  const day0 = state.day, cash0 = state.companies[0].cash;
  const max = offlineMax(getMeta(), Date.now(), OFFLINE_MAX_DAYS);
  const days = catchUp(state, sec, undefined, max);
  if (!days) return;
  hour = DAY_START;
  persist(state);
  balance.open({ kind: 'away', days, day0, cash0, max });
}
initSound();
// iPhone: Safari может стереть данные сайта, если игра не на экране «Домой» — напоминаем один раз
{
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = (navigator as unknown as { standalone?: boolean }).standalone || matchMedia('(display-mode: standalone)').matches;
  let seen = false;
  try { seen = localStorage.getItem('temka.a2hs') === '1'; localStorage.setItem('temka.a2hs', '1'); } catch { /* приватный режим */ }
  if (ios && !standalone && !seen) setTimeout(() => play.toast(t('ui.a2hs')), 4000);
}
/** Монетки: ежедневный вход и достижения, которые уже есть в сохранении. */
loadMetaNow().then((m) => {
  metaReady = true;
  const n = dailyLogin(m, new Date());
  saveMetaNow();
  if (n) play.toast(t('shop.daily', { n }));
  rewards(state);
  play.update();
});
loadGame().then((saved) => {
  if (saved) {
    state = saved.state;
    persist(state);
    homeView();
    awayFor((Date.now() - saved.savedAt) / 1000);
  }
});
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    hiddenAt = Date.now();
    saveGame(state).catch(() => {});
  } else if (hiddenAt) {
    awayFor((Date.now() - hiddenAt) / 1000);
    hiddenAt = 0;
    const n = metaReady ? dailyLogin(getMeta(), new Date()) : 0;
    if (n) { saveMetaNow(); play.toast(t('shop.daily', { n })); play.update(); }
  }
});
requestAnimationFrame(frame);
// для автопроверок: поставить час и посмотреть состояние
Object.assign(window, { __ready: true, __temka: { setHour: (h: number) => { hour = h; requestRender(); }, state: () => state, closeSheet: () => balance.close(), away: (sec: number) => awayFor(sec),
  endDay: () => closeDay(), sheet: (s: Sheet) => balance.open(s), load: (code: string) => { const st = importCode(code); if (st) { state = st; persist(state); homeView(); } return !!st; },
  fly: (id: string) => host.focusVillage(id) } });

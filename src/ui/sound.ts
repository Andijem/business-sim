/**
 * Звук без файлов: короткие мягкие звуки синтезируются WebAudio, фон — тихие lo-fi аккорды.
 * Включается после первого касания (так требуют браузеры). Настройки — в localStorage.
 */
type Sfx = 'tap' | 'coin' | 'up' | 'bad' | 'win';

const get = (k: string, def: boolean) => { try { const v = localStorage.getItem(k); return v == null ? def : v === 'on'; } catch { return def; } };
const set = (k: string, v: boolean) => { try { localStorage.setItem(k, v ? 'on' : 'off'); } catch { /* приватный режим */ } };

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicGain: GainNode | null = null;
let musicTimer = 0;
let sfxOn = get('temka.sound', true);
let musicOn = get('temka.music', true);

function audio(): AudioContext | null {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  return ctx;
}

function note(freq: number, at: number, dur: number, vol: number, type: OscillatorType = 'sine', out?: AudioNode) {
  const a = ctx!;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(vol, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(out ?? master!);
  o.start(at);
  o.stop(at + dur + 0.05);
}

export function sfx(kind: Sfx) {
  if (!sfxOn) return;
  const a = audio();
  if (!a || a.state !== 'running') return;
  const t = a.currentTime;
  switch (kind) {
    case 'tap': note(660, t, 0.06, 0.05); break;
    case 'coin': note(988, t, 0.12, 0.08, 'triangle'); note(1319, t + 0.07, 0.25, 0.08, 'triangle'); break;
    case 'up': [523, 659, 784].forEach((f, i) => note(f, t + i * 0.07, 0.25, 0.07, 'triangle')); break;
    case 'bad': note(196, t, 0.35, 0.09); note(185, t + 0.05, 0.35, 0.05); break;
    case 'win': [523, 659, 784, 1047].forEach((f, i) => note(f, t + i * 0.11, 0.5, 0.08, 'triangle')); break;
  }
}

/** Вибрация на важных событиях (захват, плохой день); на iPhone её нет, там тихо. */
export function buzz(pattern: number | number[]) {
  if (sfxOn) navigator.vibrate?.(pattern);
}

// Am7 – Dm7 – G7 – Cmaj7, по 4 секунды, мягко и тихо
const CHORDS = [[220, 261.6, 329.6, 392], [146.8, 220, 261.6, 349.2], [196, 246.9, 293.7, 349.2], [130.8, 196, 246.9, 329.6]];
function startMusic() {
  const a = audio();
  if (!a || musicTimer || !musicOn) return;
  musicGain = a.createGain();
  musicGain.gain.value = 0.35;
  const lp = a.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 900;
  musicGain.connect(lp).connect(master!);
  let i = 0;
  const play = () => {
    if (!musicOn || a.state !== 'running') return;
    const t = a.currentTime + 0.05;
    CHORDS[i++ % CHORDS.length].forEach((f, k) => note(f, t + k * 0.04, 3.8, 0.035, k % 2 ? 'triangle' : 'sine', musicGain!));
  };
  play();
  musicTimer = window.setInterval(play, 4000);
}
function stopMusic() {
  clearInterval(musicTimer);
  musicTimer = 0;
  musicGain?.disconnect();
  musicGain = null;
}

/** Первое касание разрешает звук; дальше каждая кнопка тихо щёлкает. */
export function initSound() {
  const unlock = () => {
    const a = audio();
    a?.resume().then(() => startMusic()).catch(() => {});
  };
  addEventListener('pointerdown', unlock, { once: true, capture: true });
  addEventListener('click', (e) => { if ((e.target as HTMLElement).closest?.('button')) sfx('tap'); }, { capture: true });
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend().catch(() => {});
    else ctx.resume().catch(() => {});
  });
}

export const soundOn = () => sfxOn;
export const musicIsOn = () => musicOn;
export function toggleSound() { sfxOn = !sfxOn; set('temka.sound', sfxOn); }
export function toggleMusic() {
  musicOn = !musicOn;
  set('temka.music', musicOn);
  if (musicOn) { audio()?.resume().catch(() => {}); startMusic(); } else stopMusic();
}

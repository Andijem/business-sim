import * as THREE from 'three';
import { registerSW } from 'virtual:pwa-register';
import { VoxelStore } from './scene/voxels';
import { buildVillage, COFFEE } from './scene/village';
import { setupWorld } from './scene/world';
import { makePin, mountHud } from './ui/hud';
import { t } from './i18n';

registerSW({ immediate: true });

const app = document.getElementById('app')!;
const ui = document.getElementById('ui')!;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
setupWorld(scene);
const store = new VoxelStore();
buildVillage(store);
scene.add(store.build());

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 900);
const target = new THREE.Vector3(-1, -2, -2);
let yaw = Math.atan2(40, 60), dist = 85, pitch = 0.78;

mountHud(ui);
const pin = makePin(ui, '', t('shop.coffee'), t('village.kopeechkino'));
const pinPos = new THREE.Vector3(COFFEE.x0 + COFFEE.w / 2, COFFEE.h + 3, COFFEE.z0 + COFFEE.d / 2);

function placeCamera() {
  camera.position.set(
    target.x + dist * Math.cos(pitch) * Math.sin(yaw),
    target.y + dist * Math.sin(pitch),
    target.z + dist * Math.cos(pitch) * Math.cos(yaw),
  );
  camera.lookAt(target);
}

// Рисуем только когда что-то изменилось: экономит батарею телефона.
let dirty = true;
const requestRender = () => { dirty = true; };
function frame() {
  if (dirty) {
    dirty = false;
    placeCamera();
    renderer.render(scene, camera);
    const p = pinPos.clone().project(camera);
    pin(((p.x + 1) / 2) * innerWidth, ((1 - p.y) / 2) * innerHeight, p.z < 1);
  }
  requestAnimationFrame(frame);
}

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = camera.aspect < 1 ? 38 : 28;
  camera.updateProjectionMatrix();
  requestRender();
}
addEventListener('resize', resize);
resize();

// Один палец — поворот деревни вокруг центра.
let lastX: number | null = null;
renderer.domElement.addEventListener('pointerdown', (e) => { lastX = e.clientX; });
addEventListener('pointerup', () => { lastX = null; });
addEventListener('pointermove', (e) => {
  if (lastX == null) return;
  yaw -= (e.clientX - lastX) * 0.006;
  lastX = e.clientX;
  requestRender();
});

frame();
(window as unknown as { __ready: boolean }).__ready = true;

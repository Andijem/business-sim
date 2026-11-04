import * as THREE from 'three';
import { MATS } from './voxels';

/** Ключевые часы суток: цвета неба (верх, горизонт), сила солнца и подсветки, яркость окон. */
const KEYS: { h: number; top: number; hor: number; sun: number; hemi: number; glow: number; amb: number }[] = [
  { h: 0, top: 0x0e1530, hor: 0x2a3050, sun: 0, hemi: 0.5, glow: 1, amb: 0x4a5a9a },
  { h: 5.5, top: 0x1c2a52, hor: 0x5a4a7a, sun: 0.05, hemi: 0.55, glow: 1, amb: 0x5a5a9a },
  { h: 7, top: 0x5a7ab0, hor: 0xf6b48e, sun: 1.3, hemi: 1.0, glow: 0.7, amb: 0xffd2b0 },
  { h: 9, top: 0x86c3e6, hor: 0xfbe8d2, sun: 2.3, hemi: 1.35, glow: 0.35, amb: 0xdfefff },
  { h: 16, top: 0x86c3e6, hor: 0xfbe8d2, sun: 2.3, hemi: 1.35, glow: 0.35, amb: 0xdfefff },
  { h: 18.5, top: 0x7a6aa8, hor: 0xf8a77c, sun: 1.6, hemi: 1.0, glow: 0.7, amb: 0xffb898 },
  { h: 20.5, top: 0x2a2f62, hor: 0x8a5a7a, sun: 0.2, hemi: 0.6, glow: 1, amb: 0x8a78b8 },
  { h: 24, top: 0x0e1530, hor: 0x2a3050, sun: 0, hemi: 0.5, glow: 1, amb: 0x4a5a9a },
];

export interface World {
  /** Время суток в часах (0–24): небо, солнце, тени, окна. */
  setHour(h: number): void;
  sun: THREE.DirectionalLight;
}

function grassTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const shades = ['#9cc46a', '#93bb60', '#a6cc72', '#8ab55c'];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let x = 0; x < 64; x++) for (let y = 0; y < 64; y++) {
    g.fillStyle = shades[Math.floor(rnd() * shades.length)];
    g.fillRect(x, y, 1, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function setupWorld(scene: THREE.Scene): World {
  const uni = { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, bot: { value: new THREE.Color(0xbfe0ee) } };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(500, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: uni,
      vertexShader: 'varying float h;void main(){h=normalize(position).y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:
        'uniform vec3 top,hor,bot;varying float h;void main(){vec3 c=h>0.?mix(hor,top,smoothstep(0.,.5,h)):mix(hor,bot,smoothstep(0.,-.6,h));gl_FragColor=vec4(c,1.);}',
    }),
  );
  scene.add(sky);
  const hemi = new THREE.HemisphereLight(0xdfefff, 0xb08a60, 1.35);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  Object.assign(sun.shadow.camera, { left: -36, right: 36, top: 36, bottom: -36, near: 1, far: 160 });
  scene.add(sun, sun.target);
  // земля до горизонта: пиксельная трава в масштабе вокселя (1 пиксель = 25 см)
  const tex = grassTexture();
  tex.repeat.set(900 / 16, 900 / 16);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshLambertMaterial({ map: tex }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  scene.add(ground);
  scene.fog = new THREE.Fog(0xdde6dc, 90, 200);

  const a = new THREE.Color(), b = new THREE.Color();
  const lerpHex = (x: number, y: number, k: number) => a.setHex(x).lerp(b.setHex(y), k);
  return {
    sun,
    setHour(h: number) {
      const hh = ((h % 24) + 24) % 24;
      let i = 0;
      while (i < KEYS.length - 2 && KEYS[i + 1].h <= hh) i++;
      const A = KEYS[i], B = KEYS[i + 1];
      const k = (hh - A.h) / (B.h - A.h);
      uni.top.value.copy(lerpHex(A.top, B.top, k));
      uni.hor.value.copy(lerpHex(A.hor, B.hor, k));
      (scene.fog as THREE.Fog).color.copy(uni.hor.value).lerp(new THREE.Color(0xdde6dc), 0.4);
      sun.intensity = A.sun + (B.sun - A.sun) * k;
      hemi.intensity = A.hemi + (B.hemi - A.hemi) * k;
      hemi.color.copy(lerpHex(A.amb, B.amb, k));
      hemi.groundColor.copy(hemi.color).multiplyScalar(0.55);
      // солнце идёт с востока на запад, вечером теплеет
      const ang = ((hh - 6) / 14) * Math.PI;
      sun.position.set(Math.cos(ang) * 30, Math.max(6, Math.sin(ang) * 32), 14);
      sun.color.setHex(hh < 8 ? 0xffc89a : hh > 17 ? 0xff9f6a : 0xfff0d8);
      sun.castShadow = sun.intensity > 0.15;
      const g = A.glow + (B.glow - A.glow) * k;
      MATS.glow.color.setRGB(0.5 + 0.5 * g, 0.48 + 0.52 * g, 0.42 + 0.58 * g);
    },
  };
}

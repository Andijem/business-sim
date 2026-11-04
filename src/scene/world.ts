import * as THREE from 'three';

/** Небо-градиент, свет и тени. Время суток пока фиксировано (утро). */
export function setupWorld(scene: THREE.Scene) {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(500, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(0x86c3e6) },
        hor: { value: new THREE.Color(0xfbe8d2) },
        bot: { value: new THREE.Color(0xbfe0ee) },
      },
      vertexShader: 'varying float h;void main(){h=normalize(position).y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:
        'uniform vec3 top,hor,bot;varying float h;void main(){vec3 c=h>0.?mix(hor,top,smoothstep(0.,.5,h)):mix(hor,bot,smoothstep(0.,-.6,h));gl_FragColor=vec4(c,1.);}',
    }),
  );
  scene.add(sky);
  scene.add(new THREE.HemisphereLight(0xdfefff, 0xb08a60, 1.35));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.3);
  sun.position.set(18, 30, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 120 });
  scene.add(sun);
  // дальняя земля до горизонта, растворяется в дымке
  const far = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshLambertMaterial({ color: 0x96bb62 }));
  far.rotation.x = -Math.PI / 2;
  far.position.y = -0.27;
  far.receiveShadow = true;
  scene.add(far);
  scene.fog = new THREE.Fog(0xdde6dc, 80, 170);
}

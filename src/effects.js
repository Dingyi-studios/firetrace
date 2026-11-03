import * as THREE from 'three';
import { fireAt, fireIntensityGLSL, height, random } from './terrain.js';

export function createFlames(world, uniforms) {
  const rng = random(2024);
  const anchors = [], signals = [];
  for (let z = -61; z < 40; z += .88) {
    for (let x = -35; x < 56; x += .88) {
      const px = x + rng() * .88, pz = z + rng() * .88;
      const { edge, arrival, spot } = fireAt(px, pz);
      if (edge > .7 && spot > 2.3) continue;
      anchors.push(px, height(px, pz) + .12, pz);
      signals.push(edge, arrival, spot, rng());
    }
  }
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-.5, 0, 0, .5, 0, 0, .5, 1, 0, -.5, 1, 0], 3));
  geometry.setAttribute('anchor', new THREE.InstancedBufferAttribute(new Float32Array(anchors), 3));
  geometry.setAttribute('fireSignal', new THREE.InstancedBufferAttribute(new Float32Array(signals), 4));
  geometry.instanceCount = anchors.length / 3;
  const material = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `
      attribute vec3 anchor;
      attribute vec4 fireSignal;
      uniform float uHour, uClock, uSpread;
      varying vec2 flameUv;
      varying float strength, phase, seed;
      ${fireIntensityGLSL}
      void main(){
        phase=uClock*7.8+fireSignal.w*41.0;
        seed=fireSignal.w;
        strength=clamp(fireIntensity(uHour,fireSignal.x,fireSignal.y,fireSignal.z),0.0,1.0)*uSpread;
        flameUv=position.xy;
        if(strength<.11){
          gl_Position=vec4(2.0,2.0,2.0,1.0);
          return;
        }
        float flutter=.69+.19*sin(phase)+.12*sin(phase*2.13);
        float tall=(.56+1.40*seed)*flutter*sqrt(strength);
        vec4 base=modelViewMatrix*vec4(anchor,1.0);
        vec3 up=mat3(modelViewMatrix)*vec3(0.0,1.0,0.0);
        base.xyz+=up*position.y*tall;
        base.x+=position.x*(.68+.92*seed)*sqrt(strength);
        gl_Position=projectionMatrix*base;
      }`,
    fragmentShader: `
      varying vec2 flameUv;
      varying float strength, phase, seed;
      void main(){
        float h=flameUv.y;
        float bend=h*h*(.13*sin(phase*.68+h*6.0)+.12);
        float width=(.37+.055*sin(h*17.0-phase))*(1.0-h)*(.77+.23*sin(h*3.14159));
        float body=1.0-smoothstep(width*.64,width+.025,abs(flameUv.x-bend));
        float core=1.0-smoothstep(0.0,.31,abs(flameUv.x-bend));
        float heat=clamp((1.0-h)*(.64+.43*core)+.11*sin(h*16.0-phase),0.0,1.0);
        vec3 color=mix(vec3(.92,.16,.025),vec3(1.0,.63,.095),smoothstep(.13,.55,heat));
        color=mix(color,vec3(1.0,.94,.64),smoothstep(.54,.96,heat));
        float alpha=body*(1.0-smoothstep(.69,1.0,h))*smoothstep(0.0,.09,h)*min(.93,strength*1.57);
        if(alpha<.015) discard;
        gl_FragColor=vec4(color,alpha);
      }`,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  world.add(mesh);
  return mesh;
}

export const dropFallTime = .8;

export function createDropParticles(drop, route) {
  const rng = random(drop.quantity);
  const count = 252;
  const samples = Array.from({ length: count }, () => [rng(), rng() * 2 - 1, rng() * 2 - 1, rng()]);
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count), opacity = new Float32Array(count);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('opacity', new THREE.BufferAttribute(opacity, 1).setUsage(THREE.DynamicDrawUsage));
  const water = drop.substance === 'water';
  const material = new THREE.ShaderMaterial({
    uniforms: {
      core: { value: new THREE.Color(water ? '#f3fdff' : '#ffaf8d') },
      mist: { value: new THREE.Color(water ? '#94d3ed' : '#d64d3c') },
    },
    transparent: true, depthWrite: false,
    vertexShader: `
      attribute float size, opacity;
      varying float alpha;
      void main(){
        vec4 view=modelViewMatrix*vec4(position,1.0);
        gl_Position=projectionMatrix*view;
        gl_PointSize=clamp(size*730.0/max(1.0,-view.z),2.0,74.0);
        alpha=opacity;
      }`,
    fragmentShader: `
      uniform vec3 core, mist;
      varying float alpha;
      void main(){
        vec2 uv=gl_PointCoord*2.0-1.0;
        float d=dot(uv,uv);
        if(d>1.0||alpha<=0.0) discard;
        gl_FragColor=vec4(mix(core,mist,smoothstep(.04,1.0,d)),alpha*(1.0-smoothstep(.05,1.0,d)));
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Points(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  return {
    mesh,
    update(hour) {
      const tail = dropFallTime + .68;
      mesh.visible = hour >= drop.start && hour < drop.finish + tail;
      if (!mesh.visible) return;
      const earliest = Math.max(drop.start, hour - tail);
      const latest = Math.min(hour, drop.finish);
      const density = Math.min(1, (latest - earliest) / .38);
      for (let i = 0; i < count; i++) {
        const [seed, cross, along, grain] = samples[i];
        const release = earliest + seed * (latest - earliest);
        const age = hour - release;
        const t = (release - drop.start) / (drop.finish - drop.start);
        const p = route.getPointAt(t), direction = route.getTangentAt(t);
        const fall = Math.min(1, age / dropFallTime);
        const splash = Math.max(0, age - dropFallTime) / .68;
        const spread = .10 + fall * .43 + splash * 1.38;
        const x = p.x + direction.y * cross * spread + direction.x * along * .40 * fall;
        const z = p.y - direction.x * cross * spread + direction.y * along * .40 * fall;
        const ground = height(x, z);
        positions.set([x, ground + .18 + (drop.altitude - .75) * (1 - fall ** 1.65) + splash * grain * .65, z], i * 3);
        sizes[i] = .14 + grain * .36 + fall * .54 + splash * 1.22;
        opacity[i] = density * (1 - splash) ** 2 * (.18 + grain * .31);
      }
      for (const name of ['position', 'size', 'opacity']) geometry.attributes[name].needsUpdate = true;
    },
  };
}

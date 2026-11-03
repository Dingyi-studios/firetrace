import * as THREE from 'three';
import { clamp, clock, containment, events, firePath, sampleSeries } from './data.js';
import { pavedRoads, villages } from './roads.js';

export const mix = (a, b, t) => a + (b - a) * t;
export const smooth = (lo, hi, n) => {
  const t = clamp((n - lo) / (hi - lo));
  return t * t * (3 - 2 * t);
};

function hash(x, z) {
  let n = Math.imul(x, 374761393) + Math.imul(z, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

export function noise(x, z) {
  const i = Math.floor(x), j = Math.floor(z);
  const u = smooth(0, 1, x - i), v = smooth(0, 1, z - j);
  return mix(mix(hash(i, j), hash(i + 1, j), u), mix(hash(i, j + 1), hash(i + 1, j + 1), u), v);
}

export function random(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

const lakePath = new THREE.SplineCurve([
  [-39, -67], [-24, -70], [-13, -79], [4, -83], [19, -92], [30, -110], [23, -130], [5, -147], [8, -169],
].map(([x, z]) => new THREE.Vector2(x, z)));
const lakeSamples = lakePath.getPoints(70);

function lineDistance(x, z, samples) {
  let best = Infinity;
  for (const p of samples) {
    const d = (p.x - x) ** 2 + (p.y - z) ** 2;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

export const lakeLevel = 4.8;
export function lakeEdge(x, z) {
  if (z > -43 || x < -69 || x > 62 || z < -196) return 40;
  return lineDistance(x, z, lakeSamples) - (5.9 + 6 * noise(x * .105, z * .093) + 2 * Math.sin(z * .19));
}

function mountain(x, z, cx, cz, w, l, h, slope = 0) {
  return h * Math.exp(-(((x - cx + (z - cz) * slope) / w) ** 2 + ((z - cz) / l) ** 2) / 2);
}

function rawHeight(x, z) {
  const wx = x + 9 * (noise(x * .031 + 8, z * .034) - .5);
  const wz = z + 12 * (noise(x * .027, z * .036 + 21) - .5);
  const main = mountain(wx, wz, 13, -12, 20, 44, 26, .55);
  const west = mountain(wx, wz, -70, -25, 22, 55, 32, -.18);
  const east = mountain(wx, wz, 64, -15, 17, 55, 25, .33);
  const front = mountain(wx, wz, 32, 56, 24, 18, 16, -.7);
  const back = mountain(wx, wz, 7, -129, 120, 60, 20, .5);
  const envelope = Math.max(main, west, east, front, back);
  const canyon = 1 - .31 * Math.exp(-(((wx + 44 + Math.sin(wz * .075) * 5) / 11) ** 2));
  const mask = 0.53 + 0.41 * noise(wx * .046 + 22, wz * .042);
  let relief = 0, amplitude = .41, frequency = .072;
  for (let i = 0; i < 5; i++) {
    const n = noise((wx + wz * .32) * frequency + i * 11, (wz - wx * .15) * frequency - i * 7);
    relief += (1 - Math.abs(n * 2 - 1)) ** 2 * amplitude;
    frequency *= 1.98;
    amplitude *= .47;
  }
  const gullies = Math.abs(noise((wx - wz * .35) * .115, wz * .10 + 90) - .50);
  return 1.4 + envelope * (mask + relief * .66 - gullies * .46) * canyon + noise(wx * .27 + 40, wz * .30) * .9;
}

const size = 370, depth = 343, segments = 360, depthCenter = -52;
let heightGrid;

function naturalSurface(x, z, water = lakeEdge(x, z)) {
  const natural = rawHeight(x, z);
  if (water >= 12) return natural;
  const bank = lakeLevel + water * .55;
  return mix(bank, natural, smooth(0, 12, water));
}

const villageBenches = villages.map(({ at: [x, z] }) => ({
  x, z, height: naturalSurface(x, z) - .22,
}));

function villageTerrain(x, z, water = lakeEdge(x, z)) {
  const natural = naturalSurface(x, z, water);
  for (const bench of villageBenches) {
    const distance = Math.hypot(x - bench.x, z - bench.z);
    if (distance < 12) return mix(natural, bench.height, (1 - smooth(6.2, 12, distance)) * smooth(1, 3, water));
  }
  return natural;
}

const roadSampleGrid = new Map();
const roadGridSize = 4;
for (const { curve, width } of pavedRoads) {
  const points = curve.getSpacedPoints(Math.ceil(curve.getLength() * 3));
  points.forEach((point, i) => {
    // Average the road grade along the route before blending it into the terrain.
    const a = points[Math.max(0, i - 4)], b = points[Math.min(points.length - 1, i + 4)];
    const grade = (villageTerrain(a.x, a.y) + villageTerrain(point.x, point.y) * 2 + villageTerrain(b.x, b.y)) / 4 - .32;
    const col = Math.floor(point.x / roadGridSize), row = Math.floor(point.y / roadGridSize);
    const sample = { point, grade, width };
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const key = (col + dx) * 1000 + row + dz;
        if (!roadSampleGrid.has(key)) roadSampleGrid.set(key, []);
        roadSampleGrid.get(key).push(sample);
      }
    }
  });
}

function nearestRoad(x, z) {
  const col = Math.floor(x / roadGridSize), row = Math.floor(z / roadGridSize);
  const samples = roadSampleGrid.get(col * 1000 + row);
  let best = Infinity, nearest = null;
  if (samples) for (const sample of samples) {
    const d = (sample.point.x - x) ** 2 + (sample.point.y - z) ** 2;
    if (d < best) { best = d; nearest = sample; }
  }
  return best < 16 ? { ...nearest, distance: Math.sqrt(best) } : null;
}

export function nearPavedRoad(x, z) {
  const road = nearestRoad(x, z);
  return road && road.distance < road.width / 2 + .65;
}

function rawSurface(x, z) {
  const water = lakeEdge(x, z);
  let y = villageTerrain(x, z, water);
  const road = nearestRoad(x, z);
  if (road && water > 1) {
    const shoulder = road.width / 2 + .32;
    y = mix(road.grade, y, smooth(shoulder, shoulder + 2.1, road.distance));
  }
  return y;
}

export function height(x, z) {
  const col = (x / size + .5) * segments;
  const row = ((z - depthCenter) / depth + .5) * segments;
  if (!heightGrid || col < 0 || row < 0 || col >= segments || row >= segments) return rawSurface(x, z);
  const i = Math.floor(col), j = Math.floor(row);
  const u = col - i, v = row - j;
  const stride = segments + 1;
  const a = heightGrid[j * stride + i];
  const b = heightGrid[(j + 1) * stride + i];
  const c = heightGrid[(j + 1) * stride + i + 1];
  const d = heightGrid[j * stride + i + 1];
  return u + v <= 1 ? a + (d - a) * u + (b - a) * v : c + (b - c) * (1 - u) + (d - c) * (1 - v);
}

export function forest(x, z) {
  return clamp(.66 * noise(x * .055 + 38, z * .058) + .22 * noise(x * .21, z * .21 + 51) + .12 * noise(x * .5 - 10, z * .46));
}

// Advance the same burn field through alternating faster and slower periods.
const fireTravelHours = [[0, 0], [6, 5], [14, 15], [24, 25], [34, 45], [43, 63], [52, 79], [59, 89], [69, 92.7]];

export function fireAt(x, z) {
  const [ox, oz] = firePath[0];
  const along = (x - ox) * .54 - (z - oz) * .842;
  const across = (x - ox) * .842 + (z - oz) * .54;
  const rough = noise(x * .17, z * .19) * 3.9 + noise(x * .061 + 9, z * .064) * 7 - 5.5;
  const width = 9 + 10 * Math.sin(clamp((along + 9) / 88) * Math.PI) + 4 * Math.sin(along * .076);
  const edge = Math.max(Math.abs(across - 3.9 * Math.sin(along * .08)) - width, -along - 10, along - 83) + rough;
  const forward = Math.max(0, along);
  const localVariation = (noise(x * .1, z * .1) - .4) * 4 * smooth(0, 9, Math.hypot(along, across));
  const distance = forward * .53 + Math.max(0, -along) * 1.08
    + (Math.abs(across) / width) ** 1.55 * (8 + .17 * forward) + localVariation;
  const spot = Math.hypot((x - 18) * .91, z - 8);
  const traveled = events[0].time + sampleSeries(fireTravelHours, Math.max(0, distance));
  const spotArrival = events[2].time + spot * 2.4;
  const arrival = spot < 4 ? mix(Math.min(traveled, spotArrival), traveled, smooth(1.3, 4, spot)) : traveled;
  return { edge, arrival, spot, along, across };
}

export const pathNodes = firePath.map((at, index) => {
  const time = fireAt(...at).arrival;
  return { name: index ? clock(time) : '起火', note: index ? '' : clock(time), time, at };
});

export function groundInfo(x, z, hour) {
  const y = height(x, z);
  const dx = (height(x + .2, z) - height(x - .2, z)) / .4;
  const dz = (height(x, z + .2) - height(x, z - .2)) / .4;
  const { edge, arrival } = fireAt(x, z);
  return {
    x, z, elev: Math.round(825 + 42 * y), slope: Math.round(Math.atan(Math.hypot(dx, dz)) * 180 / Math.PI),
    aspect: (Math.atan2(-dx, dz) * 180 / Math.PI + 360) % 360,
    inside: edge <= 0, burned: edge <= 0 && hour >= arrival, arrival,
    fuel: lakeEdge(x, z) <= 0 ? '开阔水面' : forest(x, z) > .49 ? '混合针叶林 · 可燃物多' : '一年生草本 · 可燃物少',
  };
}

export const fireIntensityGLSL = `
  float fireIntensity(float hour,float edge,float arrival,float spotDistance){
    float burning=(1.0-smoothstep(89.0,${containment.toFixed(4)},hour))*step(${events[0].time.toFixed(4)},hour);
    float age=hour-arrival;
    float front=exp(-abs(age)*.67)*(1.0-smoothstep(-.3,.85,edge));
    float perimeter=exp(-abs(edge)*1.26)*smoothstep(-.7,.65,age)*mix(.66,.09,smoothstep(4.0,30.0,age));
    float spot=exp(-spotDistance*spotDistance*.95)*smoothstep(13.2,14.0,hour)*(1.0-smoothstep(16.0,23.0,hour));
    return max(front,perimeter)*burning+spot;
  }
`;

export function createTerrain(scene) {
  const uniforms = {
    uHour: { value: 26 }, uClock: { value: 0 }, uPlan: { value: 0 }, uThermal: { value: 0 },
    uScar: { value: .9 }, uSpread: { value: 1 }, uProbability: { value: .8 }, uAerial: { value: 1 },
  };
  const geometry = new THREE.PlaneGeometry(size, depth, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, 0, depthCenter);
  const pos = geometry.attributes.position;
  const signal = new Float32Array(pos.count * 4);
  const greens = new Float32Array(pos.count);
  heightGrid = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const y = rawSurface(x, z);
    pos.setY(i, y);
    heightGrid[i] = y;
    const { edge, arrival, spot } = fireAt(x, z);
    signal.set([edge, arrival, spot, lakeEdge(x, z)], i * 4);
    greens[i] = forest(x, z);
  }
  geometry.setAttribute('signal', new THREE.BufferAttribute(signal, 4));
  geometry.setAttribute('greens', new THREE.BufferAttribute(greens, 1));
  geometry.computeVertexNormals();
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      attribute vec4 signal;
      attribute float greens;
      varying vec4 vSignal;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vForest;
      varying float vDepth;
      void main(){
        vSignal=signal; vWorld=position; vNormal=normal; vForest=greens;
        vec4 mv=modelViewMatrix*vec4(position,1.0);
        vDepth=-mv.z;
        gl_Position=projectionMatrix*mv;
      }`,
    fragmentShader: `
      uniform float uHour, uClock, uPlan, uThermal, uScar, uSpread, uProbability, uAerial;
      varying vec4 vSignal;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vForest;
      varying float vDepth;
      float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123); }
      float n(vec2 p) {
        vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
      }
      ${fireIntensityGLSL}
      vec3 iron(float t){
        vec3 c=mix(vec3(.023,.007,.07),vec3(.19,.015,.38),smoothstep(0.0,.27,t));
        c=mix(c,vec3(.64,.025,.23),smoothstep(.25,.55,t));
        c=mix(c,vec3(.99,.43,.048),smoothstep(.48,.76,t));
        return mix(c,vec3(1.0,1.0,.77),smoothstep(.74,1.0,t));
      }
      void main(){
        vec2 p=vWorld.xz;
        vec3 normal=normalize(vNormal);
        float steep=1.0-normal.y;
        float grain=n(p*2.9)*.53+n(p*10.0)*.30+n(p*27.0)*.17;
        float rock=n(p*.49+vWorld.y*.24)*.55+grain*.45;
        float greenery=smoothstep(.43,.68,vForest)*(.83-.35*steep);
        float lambert=clamp(dot(normal,normalize(vec3(-.56,.72,.46))),-.25,1.0);
        float light=.52+.54*lambert;
        vec3 sand=mix(vec3(.45,.36,.245),vec3(.84,.745,.555),clamp(rock+steep*.29,0.0,1.0));
        vec3 vegetation=mix(vec3(.15,.175,.095),vec3(.38,.39,.225),grain);
        vec3 surface=mix(sand,vegetation,greenery);
        surface=mix(vec3(.66,.60,.48),surface,uAerial);
        float edge=vSignal.x;
        float delta=uHour-vSignal.y;
        float burnt=(1.0-smoothstep(-.35,1.1,edge))*smoothstep(-.18,.2,delta);
        float probability=exp(-pow(length((p-vec2(-13.0,26.0))/vec2(8.0,7.0)),2.0)*1.5);
        probability+=.32*exp(-pow(length((p-vec2(18.0,8.0))/vec2(7.0,6.0)),2.0)*1.5)*step(8.0,uHour);
        float intensity=fireIntensity(uHour,edge,vSignal.y,vSignal.z);
        float flicker=.79+.21*n(p*2.5+vec2(uClock*3.1,-uClock*1.7));
        float fire=clamp(intensity*flicker*(.9+.37*grain),0.0,1.0);
        float halo=smoothstep(.035,.34,fire);
        float hot=smoothstep(.23,.82,fire);
        vec3 charcoal=mix(vec3(.115,.105,.093),vec3(.40,.35,.30),clamp(rock+steep*.5,0.0,1.0));
        surface=mix(surface,charcoal,burnt*uScar);
        surface*=light*(.84+.27*grain);
        surface=mix(surface,vec3(.75,.244,.083),.23*probability*uProbability);
        surface=mix(surface,vec3(.87,.22,.025),halo*.72*uSpread);
        surface=mix(surface,mix(vec3(1.0,.49,.045),vec3(1.0,.94,.61),hot),smoothstep(.20,.71,fire)*uSpread);
        float water=1.0-smoothstep(-.3,.30,vSignal.w);
        vec3 waterColor=mix(vec3(.22,.35,.42),vec3(.29,.415,.46),n(p*vec2(.55,2.8))*.6);
        surface=mix(surface,waterColor,water);
        surface=mix(surface,vec3(.60,.66,.675),smoothstep(83.0,243.0,vDepth)*.71);
        if(uPlan>.5){
          float contourCoord=vWorld.y/.91;
          float contour=1.0-smoothstep(.015,.13,abs(fract(contourCoord+.5)-.5));
          vec3 paper=mix(vec3(.946,.937,.897),vec3(.73,.80,.65),smoothstep(.35,.70,vForest*.75 + rock*.25)*uAerial);
          paper*=.968+.045*grain;
          paper=mix(paper,vec3(.59,.57,.48),contour*.19);
          paper=mix(paper,vec3(.75,.41,.31),burnt*uScar*.49);
          paper=mix(paper,vec3(.98,.48,.20),halo*.81*uSpread);
          paper=mix(paper,vec3(.74,.17,.06),hot*.84*uSpread);
          paper=mix(paper,vec3(.89,.25,.16),probability*.54*uProbability);
          float finalEdge=1.0-smoothstep(.10,.38,abs(edge));
          paper=mix(paper,vec3(.47,.42,.35),finalEdge*.64*uScar*step(.45,fract((p.x+p.y)*1.7)));
          surface=mix(paper,vec3(.59,.73,.77),water);
        }
        if(uThermal>.5){
          float warmth=(.085+.107*light+.065*grain-.067*greenery)*(1.0-water*.57);
          warmth+=burnt*(.07+.11*rock)+fire*.90*uSpread;
          warmth=clamp(warmth,0.0,1.0);
          surface=uThermal>1.5?vec3(warmth):iron(warmth);
        }
        gl_FragColor=vec4(surface,1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Ridgeview terrain';
  scene.add(mesh);

  const water = new THREE.PlaneGeometry(100, 130, 100, 130);
  water.rotateX(-Math.PI / 2);
  water.translate(-3, lakeLevel + .016, -118);
  const points = water.attributes.position;
  const index = water.index.array;
  const keep = [];
  for (let i = 0; i < index.length; i += 3) {
    if ([index[i], index[i + 1], index[i + 2]].every((j) => lakeEdge(points.getX(j), points.getZ(j)) < -.45)) keep.push(index[i], index[i + 1], index[i + 2]);
  }
  water.setIndex(keep);
  const lake = new THREE.Mesh(water, new THREE.MeshBasicMaterial({ color: '#435c68' }));
  scene.add(lake);
  return { mesh, lake, uniforms };
}

export function flatPath(points, segments = 64) {
  const curve = new THREE.SplineCurve(points.map(([x, z]) => new THREE.Vector2(x, z)));
  return curve.getPoints(segments);
}

export function ribbon(samples, width, color, opacity = 1, offset = .15, crossSegments = 1) {
  const vertices = [], indices = [], uv = [];
  let distance = 0;
  const stride = crossSegments + 1;
  for (let i = 0; i < samples.length; i++) {
    const { x, y: z } = samples[i];
    if (i) distance += samples[i].distanceTo(samples[i - 1]);
    const a = samples[Math.max(0, i - 1)], b = samples[Math.min(samples.length - 1, i + 1)];
    const tangent = new THREE.Vector2().subVectors(b, a).normalize();
    for (let column = 0; column <= crossSegments; column++) {
      const u = column / crossSegments;
      const px = x + (u - .5) * tangent.y * width;
      const pz = z - (u - .5) * tangent.x * width;
      vertices.push(px, height(px, pz) + offset, pz);
      uv.push(u, distance);
      if (i && column) {
        const j = i * stride + column;
        indices.push(j - stride - 1, j - stride, j - 1, j - 1, j - stride, j);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, side: THREE.DoubleSide, depthWrite: opacity === 1, polygonOffset: true, polygonOffsetFactor: -2 }));
}

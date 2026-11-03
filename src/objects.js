import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, drones, resources, pathNodes } from './data.js';
import { airDrops, defenses, deployments, dismountHours, lineProgress, progressAt, replayRate, toReplaySeconds } from './operations.js';
import { createDropParticles } from './effects.js';
import { fireAt, flatPath, forest, height, lakeEdge, nearPavedRoad, noise, random, ribbon } from './terrain.js';
import { oakRoad, pavedRoads, roadCurve, roadPath, roadPoint, villages } from './roads.js';

const mat = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });
const metal = mat('#dddccf'), red = mat('#b33124'), dark = mat('#242622');
const glass = mat('#43575f'), yellow = mat('#d8aa48'), shirt = mat('#dba437');
function primitive(parent, geometry, material, x, y, z, rx = 0, ry = 0, rz = 0) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  parent.add(mesh);
  return mesh;
}
function box(parent, dims, material, x, y, z, rx = 0, ry = 0, rz = 0) {
  return primitive(parent, new THREE.BoxGeometry(...dims), material, x, y, z, rx, ry, rz);
}

function aircraft(unit) {
  const model = new THREE.Group();
  const rotor = unit.id.startsWith('H-');
  const quad = unit.kind === 'drone' && !unit.fixedWing;
  const hull = unit.kind === 'drone' ? dark : metal;
  if (quad) {
    box(model, [.22, .1, .33], hull, 0, 0, 0);
    box(model, [.12, .09, .1], glass, 0, -.06, -.13);
    for (const side of [-1, 1]) {
      box(model, [.065, .04, .73], hull, 0, 0, 0, 0, side * Math.PI / 4);
      for (const front of [-1, 1]) {
        const x = side * .24, z = front * .24;
        primitive(model, new THREE.CylinderGeometry(.065, .065, .06, 8), dark, x, .015, z);
        box(model, [.36, .012, .025], metal, x, .056, z, 0, (side + front) * .65);
        primitive(model, new THREE.SphereGeometry(.026, 6, 4), side > 0 ? red : mat('#8dcc65'), x, -.025, z);
      }
    }
  } else {
    const body = primitive(model, new THREE.SphereGeometry(1, 12, 9), hull, 0, 0, 0);
    body.scale.set(rotor ? .22 : .15, .14, rotor ? .49 : .82);
    const cockpit = primitive(model, new THREE.SphereGeometry(1, 9, 6), glass, 0, .045, rotor ? -.28 : -.59);
    cockpit.scale.set(.135, .105, .17);
    if (rotor) {
      box(model, [.10, .12, .81], hull, 0, .026, .53);
      const blades = new THREE.Group();
      blades.position.set(0, .25, -.04);
      box(blades, [1.92, .018, .055], dark, 0, 0, 0);
      box(blades, [1.63, .018, .048], dark, 0, 0, 0, 0, Math.PI / 2);
      model.add(blades);
      model.userData.blades = blades;
      box(model, [.02, .32, .04], dark, 0, .15, .94);
      box(model, [.4, .08, .62], red, 0, -.12, .10);
    } else {
      for (const side of [-1, 1]) {
        box(model, [.82, .037, .24], hull, side * .43, -.01, .12, 0, -side * .24);
        box(model, [.17, .039, .24], red, side * .79, -.009, .20, 0, -side * .24);
        box(model, [.33, .028, .13], hull, side * .18, .085, .64, 0, -side * .25);
        if (unit.kind === 'air') {
          const engines = unit.id === 'T-131' || unit.id === 'T-162' ? [.33, .60] : [.42];
          for (const x of engines) {
            primitive(model, new THREE.CylinderGeometry(.075, .085, .29, 10), metal, side * x, -.066, .08, Math.PI / 2);
            primitive(model, new THREE.CylinderGeometry(.052, .052, .008, 8), dark, side * x, -.066, -.071, Math.PI / 2);
            if (unit.id === 'T-131' || unit.id === 'AA-52') box(model, [.27, .018, .018], dark, side * x, -.066, -.098, 0, 0, side * .7);
          }
        }
      }
      box(model, [.033, .28, .18], unit.kind === 'air' ? red : hull, 0, .19, .62, .25);
      if (unit.id === 'T-910') primitive(model, new THREE.CylinderGeometry(.081, .086, .24, 9), metal, 0, .14, .49, Math.PI / 2);
    }
  }
  model.scale.setScalar(unit.kind === 'drone' ? 1.1 : unit.id === 'T-910' ? 3.25 : 2.25);
  return model;
}

function groundUnit(unit) {
  const model = new THREE.Group();
  if (unit.kind === 'crew' && unit.id !== 'DZ-4') {
    model.userData.walkers = [];
    for (let i = 0; i < Math.min(unit.personnel, 6); i++) {
      const person = new THREE.Group();
      person.position.set((i % 3 - 1) * .23, 0, Math.floor(i / 3) * .34);
      box(person, [.088, .125, .065], shirt, 0, .224, 0);
      primitive(person, new THREE.SphereGeometry(.046, 6, 4), yellow, 0, .325, 0);
      const legs = [-1, 1].map((side) => {
        const pivot = new THREE.Group();
        pivot.position.set(side * .023, .16, 0);
        box(pivot, [.037, .16, .047], dark, 0, -.076, 0);
        person.add(pivot);
        box(person, [.028, .105, .035], shirt, side * .055, .214, 0, .14, 0, side * .17);
        return pivot;
      });
      model.add(person);
      model.userData.walkers.push(legs);
    }
    model.scale.setScalar(1.45);
    return model;
  }
  const body = unit.id === 'DZ-4' ? yellow : red;
  box(model, [.36, .14, .70], body, 0, .16, 0);
  box(model, [.32, .16, .23], body, 0, .28, -.215);
  box(model, [.27, .073, .011], glass, 0, .306, -.334);
  box(model, [.33, .028, .24], metal, 0, .373, -.22);
  box(model, [.31, .133, .36], metal, 0, .266, .124);
  box(model, [.14, .041, .047], glass, 0, .402, -.20);
  box(model, [.38, .037, .07], metal, 0, .139, -.37);
  for (const x of [-.174, .174]) {
    for (const z of [-.237, .223]) primitive(model, new THREE.CylinderGeometry(.086, .086, .07, 8), dark, x, .094, z, 0, 0, Math.PI / 2);
    box(model, [.045, .04, .009], metal, x * .69, .207, -.354);
  }
  if (unit.id === 'DZ-4') box(model, [.53, .17, .04], yellow, 0, .18, -.47);
  return model;
}

export function createEntities(world) {
  return new Map([...drones, ...resources].map((unit) => {
    const model = ['air', 'drone'].includes(unit.kind) ? aircraft(unit) : groundUnit(unit);
    world.add(model);
    return [unit.id, model];
  }));
}

const dropRoutes = new Map(airDrops.map((drop) => [drop.id, roadCurve(drop.path)]));
const defenseRoutes = defenses.map((line) => {
  const deployment = deployments.find(({ crew }) => crew === line.id);
  const [x, z] = deployment?.turnout ?? line.approach[0];
  const assembly = [x + 2.4, z + 1.1];
  const dismountRoute = deployment ? roadCurve([[x, z + .28], [x + .65, z + .8], assembly]) : null;
  return { ...line, deployment, dismountRoute, route: roadCurve(line.path),
    approachRoute: roadCurve(deployment ? [assembly, ...line.approach.slice(1)] : line.approach) };
});
const roadLift = .19;
const truckRoutes = new Map(deployments.map((deployment) => {
  const [from, to] = deployment.road;
  const direction = Math.sign(to - from);
  const p = roadPoint(roadPath, to, .43 * direction);
  const d = roadPath.getTangent(to).multiplyScalar(direction);
  const lane = (curve, first, last) => {
    const count = Math.max(4, Math.ceil(Math.abs(last - first) * 160));
    return Array.from({ length: count + 1 }, (_, i) =>
      roadPoint(curve, THREE.MathUtils.lerp(first, last, i / count), .43 * Math.sign(last - first)));
  };
  const mainLane = lane(roadPath, from, to);
  const connectorLane = deployment.connector ? lane(oakRoad, ...deployment.connector).slice(0, -1) : [];
  const approach = new THREE.SplineCurve([...connectorLane, ...mainLane]);
  const turnoutRoute = roadCurve([[p.x, p.y], [p.x + d.x * .6, p.y + d.y * .6], deployment.turnout]);
  return [deployment.truck, { ...deployment, approach, turnoutRoute }];
}));

function positionOn(curve, progress, lift) {
  const p = curve.getPointAt(progress);
  const d = curve.getTangentAt(progress);
  return { x: p.x, z: p.y, y: height(p.x, p.y) + lift, yaw: Math.atan2(-d.x, -d.y) };
}

function aircraftPose(unit, hour) {
  const [cx, cz] = unit.at;
  const drone = unit.kind === 'drone';
  const phase = toReplaySeconds(hour) * (drone ? .085 : .039) + unit.index * 2.17;
  const rx = drone ? 4 + unit.index * .85 : 22;
  const rz = drone ? 3.5 + unit.index * .32 : 18;
  const x = cx + Math.sin(phase) * rx;
  const z = cz + Math.cos(phase) * rz;
  return { x, z, y: height(x, z) + 2.4 + unit.alt / 275, yaw: Math.atan2(-Math.cos(phase) * rx, Math.sin(phase) * rz) };
}

function interpolatePose(a, b, t) {
  const delta = Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw));
  const x = THREE.MathUtils.lerp(a.x, b.x, t), z = THREE.MathUtils.lerp(a.z, b.z, t);
  return { x, z, y: Math.max(height(x, z) + .3, THREE.MathUtils.lerp(a.y, b.y, t)), yaw: a.yaw + delta * t };
}

export function place(unit, hour) {
  if (unit.kind === 'drone' || unit.kind === 'air') {
    const drop = airDrops.find(({ id }) => id === unit.id);
    const orbit = aircraftPose(unit, hour);
    if (!drop || hour < drop.start - 4 || hour > drop.finish + 4) return orbit;
    const route = dropRoutes.get(unit.id);
    const progress = progressAt(hour, drop.start, drop.finish);
    const run = positionOn(route, progress, drop.altitude);
    if (hour >= drop.start && hour <= drop.finish) return run;
    const entry = hour < drop.start;
    const extra = (hour - (entry ? drop.start : drop.finish)) * 5.3;
    run.x -= Math.sin(run.yaw) * extra;
    run.z -= Math.cos(run.yaw) * extra;
    run.y = Math.max(run.y, height(run.x, run.z) + 3.8);
    const weight = entry ? progressAt(hour, drop.start - 4, drop.start) : 1 - progressAt(hour, drop.finish, drop.finish + 4);
    return interpolatePose(orbit, run, weight * weight * (3 - 2 * weight));
  }

  const truck = truckRoutes.get(unit.id);
  if (truck) {
    const [from, to] = truck.road;
    if (hour >= truck.arrival - .8) {
      const turnaround = unit.id === 'E-45' ? truck.arrival + 2 : Infinity;
      if (hour <= turnaround) return positionOn(truck.turnoutRoute, progressAt(hour, truck.arrival - .8, truck.arrival), roadLift);
      if (hour < turnaround + .8) {
        const pose = positionOn(truck.turnoutRoute, 1 - progressAt(hour, turnaround, turnaround + .8), roadLift);
        return { ...pose, yaw: pose.yaw + Math.PI };
      }
      const phase = (hour - turnaround - .8) * .105;
      const t = to - .18 * Math.sin(phase);
      const d = roadPath.getTangent(t).multiplyScalar(-Math.sign(Math.cos(phase)));
      const p = roadPoint(roadPath, t, .43 * Math.sign(to - from));
      return { x: p.x, z: p.y, y: height(p.x, p.y) + roadLift, yaw: Math.atan2(-d.x, -d.y) };
    }
    return positionOn(truck.approach, progressAt(hour, truck.entry, truck.arrival - .8), roadLift);
  }
  if (unit.id === 'WT-12') {
    const phase = hour * .025 + .16;
    const p = roadPoint(roadPath, .43 + Math.sin(phase) * .26, .43);
    const d = roadPath.getTangent(.43 + Math.sin(phase) * .26).multiplyScalar(Math.sign(Math.cos(phase)));
    return { x: p.x, z: p.y, y: height(p.x, p.y) + roadLift, yaw: Math.atan2(-d.x, -d.y) };
  }
  const lines = defenseRoutes.filter(({ id }) => id === unit.id);
  if (lines.length) {
    const line = lines.findLast(({ start }) => hour >= start - 3) ?? lines[0];
    if (hour < line.start) {
      const assemblyEnd = line.deployment ? line.deployment.arrival + dismountHours : 0;
      if (line.dismountRoute && hour < assemblyEnd) {
        const t = progressAt(hour, line.deployment.arrival, assemblyEnd);
        return { ...positionOn(line.dismountRoute, t, THREE.MathUtils.lerp(.34, .045, Math.min(1, t * 3))), walking: t > 0 };
      }
      const t = progressAt(hour, Math.max(assemblyEnd, line.start - 3), line.start);
      return { ...positionOn(line.approachRoute, t, .045), walking: t > 0 };
    }
    return { ...positionOn(line.route, lineProgress(line, hour), .17), walking: hour < line.finish };
  }
  const [x, z] = unit.at;
  return { x, z, y: height(x, z) + .12, yaw: -unit.heading * Math.PI / 180 };
}

function mergeRibbons(items) {
  const group = new THREE.Group();
  for (const [paths, width, color, opacity, offset] of items) {
    const meshes = paths.map((path) => ribbon(path, width, color, opacity, offset));
    if (!meshes.length) continue;
    group.add(new THREE.Mesh(mergeGeometries(meshes.map((mesh) => mesh.geometry)), meshes[0].material));
    meshes.forEach((mesh, index) => { mesh.geometry.dispose(); if (index) mesh.material.dispose(); });
  }
  return group;
}

function asphalt(samples, width, marked) {
  const mesh = ribbon(samples, marked ? width / .84 : width, '#33363a', 1, roadLift - (marked ? .01 : .055), 8);
  mesh.material.dispose();
  mesh.material = new THREE.ShaderMaterial({
    uniforms: { marked: { value: marked ? 1 : 0 } },
    side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    vertexShader: `
      varying vec2 roadUv;
      void main(){
        roadUv=uv;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
      }`,
    fragmentShader: `
      uniform float marked;
      varying vec2 roadUv;
      void main(){
        float grain=fract(sin(dot(floor(roadUv*vec2(120.0,68.0)),vec2(12.9898,78.233)))*43758.5453);
        float edgeDistance=min(roadUv.x,1.0-roadUv.x);
        float aa=max(fwidth(roadUv.x),.004);
        float edge=1.0-smoothstep(.013,.013+aa,abs(edgeDistance-.12));
        float center=1.0-smoothstep(.020,.020+aa,abs(roadUv.x-.5));
        float dash=1.0-smoothstep(.52,.56,fract(roadUv.y/.97));
        vec3 base=vec3(.23,.245,.26)+(grain-.5)*.085*(1.0-smoothstep(.01,.06,aa));
        base=mix(base,vec3(.55,.49,.38)+(grain-.5)*.06,(1.0-smoothstep(.075,.085,edgeDistance))*marked);
        base=mix(base,vec3(.86,.86,.79),edge*marked);
        base=mix(base,vec3(.99,.73,.20),dash*center*marked);
        gl_FragColor=vec4(base,1.0);
      }`,
  });
  return mesh;
}

export function createInfrastructure(world) {
  const highways = pavedRoads.map(({ curve, width }) => ({ width, points: curve.getSpacedPoints(Math.ceil(curve.getLength() * 5)) }));
  const pullouts = [...truckRoutes.values()].map(({ turnoutRoute }) => turnoutRoute.getSpacedPoints(22));
  const roads = new THREE.Group();
  for (const { points, width } of highways) roads.add(asphalt(points, width, true));
  for (const points of pullouts) roads.add(asphalt(points, .96, false));
  world.add(roads);
  const trails = mergeRibbons([[[
    flatPath([[-66, 49], [-50, 35], [-32, 30], [-25, 20], [-29, 11], [-18, 2], [-11, -11]]),
    flatPath([[47, 15], [42, 1], [34, -15], [44, -28], [57, -47]]),
    flatPath([[-42, -45], [-14, -40], [10, -54], [42, -64]]),
  ], .22, '#e0c691', .92, .23]]);
  world.add(trails);
  const structures = new THREE.Group();
  const detail = new THREE.Group();
  const rng = random(172);
  const wallMaterials = ['#e5d3b6', '#d7b895', '#c6c2ae'].map(mat);
  const roofMaterials = ['#8d4d3a', '#5d686b', '#9a7f60'].map(mat);
  const footprintMaterial = new THREE.MeshBasicMaterial({ color: '#d5b477', side: THREE.DoubleSide });
  for (const village of villages) {
    const { curve, t, houses } = village;
    for (let i = 0; i < houses; i++) {
      const side = i % 2 ? -1 : 1;
      const row = Math.floor(i / 2);
      const along = t + (row - 2.5) * .014;
      const point = roadPoint(curve, along, side * (2.3 + rng() * 1.4));
      const x = point.x, z = point.y;
      const y = height(x, z), tangent = curve.getTangent(along);
      const yaw = Math.atan2(-tangent.x, -tangent.y);
      const house = new THREE.Group();
      house.position.set(x, y, z);
      house.rotation.y = yaw;
      const width = .75 + rng() * .37, length = .72 + rng() * .56, wallHeight = .42 + rng() * .22;
      box(house, [width, wallHeight, length], wallMaterials[i % 3], 0, wallHeight / 2 - .04, 0);
      const roof = primitive(house, new THREE.ConeGeometry(1, .34, 4), roofMaterials[i % 3], 0, wallHeight + .11, 0, 0, Math.PI / 4);
      roof.scale.set(width * .82, 1, length * .82);
      box(house, [.17, .28, .024], glass, 0, .15, length / 2 + .018);
      box(house, [.18, .15, .024], glass, -width * .29, wallHeight * .59, length / 2 + .018);
      structures.add(house);
      const footprint = new THREE.Mesh(new THREE.PlaneGeometry(width, length), footprintMaterial);
      footprint.rotation.set(-Math.PI / 2, 0, yaw);
      footprint.position.set(x, y + .24, z);
      detail.add(footprint);
    }
  }
  world.add(structures, detail);
  const boundary = mergeRibbons([[[flatPath([[-75, 55], [-38, 52], [-4, 48], [52, 42], [79, 16], [79, -35], [51, -62], [11, -66], [-34, -59], [-67, -40], [-75, 55]], 380)], .13, '#5c699a', .9, .38]]);
  world.add(boundary);
  return { roads, trails, structures, detail, boundary };
}

export function createFireGraphics(world) {
  const suppression = new THREE.Group();
  const lines = defenseRoutes.map((line) => {
    const path = line.route.getSpacedPoints(125);
    const bed = ribbon(path, 1.08, '#4d4931', .80, .33);
    const edge = ribbon(path, .34, '#fff0a8', 1, .63);
    suppression.add(bed, edge);
    return { line, meshes: [bed, edge] };
  });
  const drops = airDrops.map((drop) => {
    const water = drop.substance === 'water';
    const strip = ribbon(dropRoutes.get(drop.id).getSpacedPoints(100), drop.width, water ? '#5dabc6' : '#e34c39', .72, .3);
    const mist = createDropParticles(drop, dropRoutes.get(drop.id));
    suppression.add(strip, mist.mesh);
    return { drop, strip, mist };
  });
  world.add(suppression);

  const route = new THREE.Group();
  const curves = [
    [[-13, 26], [-7, 20], [-5, 13], [1, 10], [5, 9]],
    [[5, 9], [10, 6], [12, 0], [14, -7]],
    [[14, -7], [18, -13], [20, -20], [23, -23]],
    [[23, -23], [29, -29], [29, -36], [33, -42]],
  ];
  curves.forEach((points, i) => {
    const samples = flatPath(points, 80);
    const line = i % 2 ? mergeRibbons([[Array.from({ length: 10 }, (_, j) => samples.slice(j * 8, j * 8 + 5)), .20, '#f9cf66', 1, .40]])
      : ribbon(samples, .20, '#f9cf66', 1, .40);
    line.userData.time = pathNodes[i].time;
    route.add(line);
  });
  const arrows = new THREE.Group();
  for (const [points, time] of [
    [[[-11, 18], [-8, 9], [-4, 4], [2, 2], [5, 1]], 4],
    [[[-6, -2], [-2, -6], [7, -7], [14, -7]], 10],
    [[[14, -14], [18, -17], [19, -21], [24, -22]], 16],
  ]) {
    const samples = flatPath(points, 50);
    const arrow = new THREE.Group();
    arrow.userData.time = time;
    arrow.add(ribbon(samples, .36, '#f37c42', 1, .38));
    for (const idx of [22, 42]) {
      const a = samples[idx], b = samples[idx + 1];
      const dx = b.x - a.x, dz = b.y - a.y, l = Math.hypot(dx, dz);
      const x = dx / l, z = dz / l;
      const coords = [[a.x + x * 2.4, a.y + z * 2.4], [a.x - x - z * .88, a.y - z + x * .88], [a.x - x + z * .88, a.y - z - x * .88]];
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(coords.flatMap(([px, pz]) => [px, height(px, pz) + .52, pz]), 3));
      arrow.add(new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color: '#fb8043', side: THREE.DoubleSide })));
    }
    arrows.add(arrow);
  }
  world.add(route, arrows);
  return { suppression, lines, drops, route, arrows };
}

export function createWind(world) {
  const rng = random(8971);
  const pts = [], phase = [], fade = [];
  for (let i = 0; i < 200; i++) {
    const x0 = -86 + rng() * 145, z0 = -70 + rng() * 143;
    const len = 7 + rng() * 17, start = rng();
    const point = (t) => {
      const x = x0 + t * len, z = z0 - t * len * .24 + 1.9 * Math.sin(x * .10 + z0 * .09) * t;
      return [x, height(x, z) + 2 + .7 * Math.sin(t * 4), z];
    };
    for (let j = 0; j < 21; j++) {
      pts.push(...point(j / 21), ...point((j + 1) / 21));
      phase.push(start + j / 21, start + (j + 1) / 21);
      fade.push(Math.sin(j / 21 * Math.PI), Math.sin((j + 1) / 21 * Math.PI));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  geometry.setAttribute('phase', new THREE.Float32BufferAttribute(phase, 1));
  geometry.setAttribute('fade', new THREE.Float32BufferAttribute(fade, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { clock: { value: 0 }, opacity: { value: .70 } }, transparent: true, depthWrite: false,
    vertexShader: `attribute float phase; attribute float fade; varying float p; varying float f;
      void main(){p=phase;f=fade;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `uniform float clock; uniform float opacity; varying float p; varying float f;
      void main(){float pulse=pow(1.0-fract(p-clock*.37),3.3);gl_FragColor=vec4(.97,.98,.94,opacity*f*(.22+.78*pulse));}`,
  });
  const wind = new THREE.LineSegments(geometry, material);
  world.add(wind);
  return wind;
}

export function createVegetation(world, uniforms) {
  const conifer = mergeGeometries([
    new THREE.ConeGeometry(.40, 1.29, 6).translate(0, .77, 0),
    new THREE.ConeGeometry(.32, 1.06, 6).translate(0, 1.15, 0),
    new THREE.CylinderGeometry(.053, .082, .44, 5).translate(0, .22, 0),
  ]);
  const shrubs = new THREE.IcosahedronGeometry(.51, 0).scale(1, .77, .91).translate(0, .35, 0);
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      attribute float burnAt;
      varying vec3 vShade; varying vec3 vNormal; varying float vDepth; varying float vBurn;
      void main(){
        vShade=instanceColor;
        vNormal=normalize(mat3(instanceMatrix)*normal);
        vBurn=burnAt;
        vec4 mv=modelViewMatrix*instanceMatrix*vec4(position,1.0);
        vDepth=-mv.z; gl_Position=projectionMatrix*mv;
      }`,
    fragmentShader: `
      uniform float uHour, uThermal, uScar;
      varying vec3 vShade; varying vec3 vNormal; varying float vDepth; varying float vBurn;
      void main(){
        float light=.58+max(dot(normalize(vNormal),normalize(vec3(-.56,.72,.46))),-.18)*.60;
        float burn=step(vBurn,uHour)*uScar;
        vec3 color=mix(vShade,vec3(.205,.174,.14),burn)*light;
        color=mix(color,vec3(.60,.66,.675),smoothstep(83.0,243.0,vDepth)*.71);
        if(uThermal>.5)color=uThermal>1.5?vec3(.10,.10,.10)*light:vec3(.06,.012,.15)*light;
        gl_FragColor=vec4(color,1.0);
      }`,
  });
  const rng = random(83193);
  const items = [[], []];
  for (let i = 0; i < 95000; i++) {
    const x = -153 + rng() * 306, z = -197 + rng() * 290;
    const density = forest(x, z);
    if (rng() > .045 + density ** 3.0 * 1.27 || lakeEdge(x, z) < .5) continue;
    const h = height(x, z);
    const slope = Math.abs(height(x + .3, z) - h) + Math.abs(height(x, z + .3) - h);
    if (rng() < slope * .30) continue;
    if (nearPavedRoad(x, z) || villages.some(({ at: [cx, cz] }) => (cx - x) ** 2 + (cz - z) ** 2 < 8.5 ** 2)) continue;
    const bush = rng() < .38;
    const fire = fireAt(x, z);
    if (fire.edge < -.1 && rng() < .63) continue;
    const s = (.34 + rng() ** 1.65 * 1.05) * (bush ? 1.07 : .81);
    const tree = { x, z, h, s, rot: rng() * Math.PI * 2, tall: .65 + rng() * .7, color: rng(), burn: fire.edge < 0 ? fire.arrival : 999 };
    items[+bush].push(tree);
  }
  const matrix = new THREE.Object3D();
  const rgb = new THREE.Color();
  const group = new THREE.Group();
  [conifer, shrubs].forEach((geometry, index) => {
    const trees = items[index];
    const mesh = new THREE.InstancedMesh(geometry, material, trees.length);
    geometry.setAttribute('burnAt', new THREE.InstancedBufferAttribute(Float32Array.from(trees.map((t) => t.burn)), 1));
    trees.forEach((t, j) => {
      matrix.position.set(t.x, t.h, t.z);
      matrix.rotation.set(0, t.rot, 0);
      matrix.scale.set(t.s, t.s * t.tall, t.s);
      matrix.updateMatrix();
      mesh.setMatrixAt(j, matrix.matrix);
      const v = t.color;
      rgb.setRGB(.176 + v * .105 + index * .038, .209 + v * .095 + index * .022, .116 + v * .055);
      mesh.setColorAt(j, rgb);
    });
    group.add(mesh);
  });
  world.add(group);
  return group;
}

export function createTracks(world) {
  const group = new THREE.Group();
  for (const unit of drones) {
    const points = Array.from({ length: 101 }, (_, i) => {
      const p = aircraftPose(unit, i / 100 * Math.PI * 2 / .085 * replayRate);
      return new THREE.Vector3(p.x, p.y, p.z);
    });
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: '#fff9ec', transparent: true, opacity: .56, depthWrite: false }));
    line.userData.id = unit.id;
    group.add(line);
  }
  world.add(group);
  return group;
}

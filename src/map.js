import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { clamp, drones, fmt, landmarks, resources, resourceStatusLabels } from './data.js';
import { resourceStatus, state, telemetry } from './state.js';
import { dropById, dropProgress, lineProgress, resourceActive } from './operations.js';
import { createFlames, dropFallTime } from './effects.js';
import { missionTarget } from './missions.js';
import { createTerrain, groundInfo, height, lakeEdge, lakeLevel, pathNodes } from './terrain.js';
import { villages } from './roads.js';
import { createEntities, createFireGraphics, createInfrastructure, createTracks, createVegetation, createWind, place } from './objects.js';

const overviewEye = new THREE.Vector3(5, 71, 62);
const overviewCenter = new THREE.Vector3(-9, 13, 0);
const worldPoint = new THREE.Vector3();
const desiredEye = new THREE.Vector3();
const desiredCenter = new THREE.Vector3();
const startEye = new THREE.Vector3();
const startCenter = new THREE.Vector3();
const names = [...drones, ...resources];
const landmarksForResources = [
  { name: '集结点 · 峡谷溪路', at: [-40, 34], mark: '集' },
  { name: '直升机基地 · 峡谷溪', at: [-41, 1], mark: '机' },
  { name: '取水点 · 银木水库', at: [-17, -73], mark: '水' },
];

export function setupMap(host, callbacks) {
  const renderer = new THREE.WebGLRenderer({ alpha: false, powerPreference: 'low-power' });
  renderer.setClearColor('#aeb9b7');
  renderer.domElement.setAttribute('aria-label', '岭景山火交互地形图');
  renderer.domElement.className = 'webgl-map';
  host.prepend(renderer.domElement);
  const labelLayer = host.querySelector('#labels');
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#aeb9b7', 100, 250);
  const hemi = new THREE.HemisphereLight('#fff4da', '#79735f', 2.05);
  const sun = new THREE.DirectionalLight('#fff1d4', 1.7);
  sun.position.set(-62, 90, 49);
  scene.add(hemi, sun);
  const world = new THREE.Group();
  scene.add(world);
  const terrain = createTerrain(world);
  const vegetation = createVegetation(world, terrain.uniforms);
  const infrastructure = createInfrastructure(world);
  const fire = createFireGraphics(world);
  const flames = createFlames(world, terrain.uniforms);
  const wind = createWind(world);
  const entities = createEntities(world);
  const tracks = createTracks(world);
  const persp = new THREE.PerspectiveCamera(43, 1, .09, 570);
  const plan = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 460);
  const sensor = new THREE.PerspectiveCamera(50, 1, .15, 500);
  let w = 1, h = 1, flight = null, active = '3D', initialPlanZoom = 1, chaseAngle = 0, chaseZoom = 1;
  let chaseTransition = null, planFollow = null, operationsHour = null;
  persp.position.copy(overviewEye);
  const orbit = new OrbitControls(persp, renderer.domElement);
  orbit.target.copy(overviewCenter);
  orbit.enableDamping = true;
  orbit.dampingFactor = .09;
  orbit.minDistance = 3.8;
  orbit.maxDistance = 245;
  orbit.maxPolarAngle = Math.PI * .484;
  orbit.update();
  plan.position.set(1, 160, -11.999);
  const pan = new MapControls(plan, renderer.domElement);
  pan.target.set(1, 0, -12);
  pan.enableRotate = false;
  pan.minZoom = .42;
  pan.maxZoom = 14;
  pan.zoomToCursor = true;
  pan.enabled = false;
  pan.update();
  orbit.addEventListener('change', callbacks.requestFrame);
  pan.addEventListener('change', callbacks.requestFrame);

  const compass = host.querySelector('#compass svg');
  const scale = host.querySelector('#map-scale');
  let scaleDistance = null;
  const zoomLabel = host.querySelector('#map-zoom');
  const labelList = [];
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let pointer = null;
  let pointerAt = 0;
  let dragged = false;
  let down = null;

  function label(html, cls, at, obj) {
    const element = document.createElement(obj ? 'button' : 'div');
    if (obj) {
      element.type = 'button';
      element.addEventListener('click', () => callbacks.select(obj));
      element.setAttribute('aria-label', `在地图上选择 ${obj.id}`);
    }
    element.className = `map-label ${cls}`;
    element.innerHTML = html;
    labelLayer.append(element);
    labelList.push({ element, at, obj, cls });
    return element;
  }
  for (const location of landmarks) label(`${location.peak ? '<i>▲</i> ' : ''}${location.name}${location.note ? `<small>${location.note}</small>` : ''}`, 'landmark', location.at);
  for (const village of villages) {
    const marker = document.createElement('button');
    marker.type = 'button';
    marker.className = 'map-label village';
    marker.textContent = village.name;
    marker.title = `查看${village.name}公路`;
    marker.addEventListener('click', () => callbacks.focusVillage(village));
    labelLayer.append(marker);
    labelList.push({ element: marker, at: village.at, cls: 'village' });
  }
  for (const location of landmarksForResources) label(`<b>${location.mark}</b>${location.name}`, 'resource-place', location.at);
  for (const [i, node] of pathNodes.entries()) label(`<i></i><span>${node.name}${node.note ? `<small>${node.note}</small>` : ''}</span>`, i ? 'spread-point' : 'spread-point ignition', node.at);
  for (const item of names) label(`<i></i><b>${item.id}</b><span></span>`, 'unit-tag', item.at, item);
  const grid = host.querySelector('#map-grid');
  const viewfinder = host.querySelector('#sensor-picture');
  const longitude = Array.from({ length: 13 }, (_, i) => {
    const value = 60 + 3 - i;
    return `<div class="meridian"><b>西经 ${value >= 60 ? '118' : '117'}°${String(value % 60).padStart(2, '0')}′</b></div>`;
  }).join('');
  const latitude = Array.from({ length: 9 }, (_, i) => `<div class="parallel"><b>北纬 34°${24 - i}′</b></div>`).join('');
  grid.innerHTML = longitude + latitude;
  const meridians = [...grid.querySelectorAll('.meridian')], parallels = [...grid.querySelectorAll('.parallel')];

  function resize() {
    const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight);
    const density = Math.min(window.devicePixelRatio, 1.25, Math.sqrt(1_350_000 / (width * height)));
    if (w === width && h === height && renderer.getPixelRatio() === density) return;
    w = width;
    h = height;
    renderer.setDrawingBufferSize(w, h, density);
    persp.aspect = w / h;
    persp.updateProjectionMatrix();
    plan.left = -51 * w / h;
    plan.right = -plan.left;
    plan.top = 51;
    plan.bottom = -51;
    plan.updateProjectionMatrix();
    callbacks.requestFrame();
  }
  new ResizeObserver(resize).observe(host);
  resize();

  function updateView(view) {
    if (view === active) return;
    if (view === '2D') {
      const range = persp.position.distanceTo(orbit.target);
      plan.zoom = clamp(1.23 * overviewEye.distanceTo(overviewCenter) / range, .53, 7.4);
      initialPlanZoom = plan.zoom;
      pan.target.set(orbit.target.x, 0, orbit.target.z);
      plan.position.set(pan.target.x, 160, pan.target.z + .001);
      plan.updateProjectionMatrix();
      pan.update();
      flight = null;
    } else if (state.camera === 'overview') {
      const center = new THREE.Vector3(pan.target.x, height(pan.target.x, pan.target.z) * .65, pan.target.z);
      const offset = overviewEye.clone().sub(overviewCenter).multiplyScalar(clamp(1.23 / plan.zoom, .17, 2.1));
      orbit.target.copy(center);
      persp.position.copy(center).add(offset);
      orbit.update();
    }
    active = view;
    orbit.enabled = view === '3D' && state.camera === 'overview' && state.feed !== 'full';
    pan.enabled = view === '2D' && state.feed !== 'full';
  }

  function moveTo(eye, center, duration = 1.2) {
    flight = {
      time: performance.now(), duration: duration * 1000,
      from: persp.position.clone(), target: orbit.target.clone(),
      eye, center,
    };
  }

  function reset() {
    chaseTransition = null;
    chaseAngle = 0;
    chaseZoom = 1;
    if (state.view === '3D') moveTo(overviewEye, overviewCenter);
    else {
      plan.zoom = initialPlanZoom;
      pan.target.set(0, 0, -10);
      plan.position.set(0, 160, -9.999);
      plan.updateProjectionMatrix();
      pan.update();
    }
  }

  function focus(at, near = false) {
    const [x, z] = at;
    if (state.view === '2D') {
      pan.target.set(x, 0, z);
      plan.position.set(x, 160, z + .001);
      if (near) {
        plan.zoom = Math.max(plan.zoom, 3.2);
        plan.updateProjectionMatrix();
      }
      pan.update();
    } else {
      const y = height(x, z);
      const center = new THREE.Vector3(x, y + 1.2, z);
      const distance = near ? .24 : .43;
      moveTo(overviewEye.clone().sub(overviewCenter).multiplyScalar(distance).add(center), center, 1.05);
    }
  }

  function mode() {
    chaseAngle = 0;
    chaseZoom = 1;
    planFollow = null;
    if (state.camera === 'overview') { chaseTransition = null; return; }
    flight = null;
    chaseTransition = { time: performance.now(), from: persp.position.clone(), target: orbit.target.clone() };
  }

  function showUnit(unit) {
    if (unit.kind === 'drone') return state.workspace === 'Drones';
    if (!resourceActive(unit, state.hour)) return false;
    return state.workspace === 'Resources' || (state.workspace === 'Incident' && state.layers.suppression.on
      && (unit.kind !== 'air' || resourceStatus(unit) === 'dropping'));
  }

  function projection(x, y, z, camera) {
    worldPoint.set(x, y, z).project(camera);
    return { x: (worldPoint.x + 1) * w / 2, y: (1 - worldPoint.y) * h / 2, valid: worldPoint.z > -1 && worldPoint.z < 1 && Math.abs(worldPoint.x) < 1.10 && Math.abs(worldPoint.y) < 1.08 };
  }

  function syncLabels(camera, isPlan, lift) {
    const picture = state.feed === 'pip' ? viewfinder.getBoundingClientRect() : null;
    const bounds = picture ? host.getBoundingClientRect() : null;
    for (const item of labelList) {
      const { element, cls, at, obj } = item;
      let visible = state.feed !== 'full';
      let p;
      if (obj) {
        visible &&= showUnit(obj) && (isPlan || state.camera !== 'cockpit' || state.selected !== obj);
        const model = entities.get(obj.id);
        p = { x: model.position.x, y: model.position.y + (isPlan ? .6 : 1.5), z: model.position.z };
        if (visible) {
          const selected = state.selected === obj;
          element.classList.toggle('selected', selected);
          element.classList.toggle('air', obj.kind === 'air');
          element.classList.toggle('ground', obj.kind === 'engine');
          element.classList.toggle('crew', obj.kind === 'crew');
          element.lastElementChild.textContent = obj.kind === 'drone' ? `${fmt.format(telemetry(obj).alt)} 英尺` : resourceStatusLabels[resourceStatus(obj)];
        }
      } else {
        const [x, z] = at;
        p = { x, z, y: (lakeEdge(x, z) < 0 ? lakeLevel : height(x, z)) + .75 };
        if (cls.includes('spread-point')) {
          visible &&= state.layers.spread.on && state.hour >= pathNodes.find((node) => node.at === at).time;
        } else if (cls === 'resource-place') visible &&= state.workspace === 'Resources';
      }
      const pixel = visible ? projection(p.x, p.y * lift, p.z, camera) : null;
      const behindFeed = picture && pixel && pixel.y < picture.bottom - bounds.top + 30
        && pixel.x > picture.left - bounds.left - 96;
      element.hidden = !pixel?.valid || behindFeed;
      if (!element.hidden) element.style.transform = `translate3d(${pixel.x.toFixed(1)}px,${pixel.y.toFixed(1)}px,0)`;
    }
    grid.hidden = !isPlan || state.feed === 'full';
    if (!grid.hidden) {
      meridians.forEach((element, i) => { element.style.left = `${projection((i - 6) * 14.7 - 1, 0, 0, camera).x}px`; });
      parallels.forEach((element, i) => { element.style.top = `${projection(0, 0, (i - 5) * 16.7, camera).y}px`; });
    }
  }

  function pick(camera, lift) {
    if (!pointer || dragged || state.feed === 'full' || state.workspace !== 'Incident') return;
    if (performance.now() - pointerAt < 85) return;
    pointerAt = performance.now();
    ndc.set(pointer.x / w * 2 - 1, 1 - pointer.y / h * 2);
    ray.setFromCamera(ndc, camera);
    const point = new THREE.Vector3();
    const elevation = (x, z) => Math.max(height(x, z), lakeEdge(x, z) < 0 ? lakeLevel : -Infinity) * lift;
    let last = 0;
    for (let distance = 1; distance < 345; distance += 2.1) {
      ray.ray.at(distance, point);
      if (point.y <= elevation(point.x, point.z)) {
        let a = last, b = distance;
        for (let i = 0; i < 7; i++) {
          const m = (a + b) / 2;
          ray.ray.at(m, point);
          if (point.y <= elevation(point.x, point.z)) b = m;
          else a = m;
        }
        if (Math.abs(point.x) < 181 && point.z > -220 && point.z < 115) callbacks.hover({ ...groundInfo(point.x, point.z, state.hour), px: pointer.x, py: pointer.y });
        else callbacks.hover(null);
        return;
      }
      last = distance;
    }
    callbacks.hover(null);
  }

  const canvas = renderer.domElement;
  canvas.addEventListener('pointerdown', (event) => {
    down = event.clientX;
    dragged = true;
    callbacks.hover(null);
    callbacks.requestFrame();
  });
  function endDrag() {
    if (!dragged) return;
    dragged = false;
    down = null;
    pointerAt = -Infinity;
    callbacks.requestFrame();
  }
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointermove', (event) => {
    callbacks.requestFrame();
    if (down !== null && state.view === '3D' && state.camera !== 'overview') {
      chaseAngle -= event.movementX * .005;
      return;
    }
    const rect = host.getBoundingClientRect();
    pointerAt = -Infinity;
    pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  });
  canvas.addEventListener('pointerleave', () => { pointer = null; callbacks.hover(null); callbacks.requestFrame(); });
  canvas.addEventListener('wheel', (event) => {
    if (state.camera === 'overview' || state.view === '2D') return;
    event.preventDefault();
    chaseZoom = clamp(chaseZoom * Math.exp(event.deltaY * .0016), .44, 2.9);
    callbacks.requestFrame();
  }, { passive: false });

  function setSensorView(enabled) {
    const isPlan = !enabled && state.view === '2D';
    const l = state.layers;
    const therm = enabled && state.sensor === 'IR';
    terrain.uniforms.uThermal.value = therm ? state.palette === 'Ironbow' ? 1 : 2 : 0;
    terrain.uniforms.uPlan.value = isPlan ? 1 : 0;
    terrain.lake.visible = !therm && !isPlan;
    vegetation.visible = !isPlan;
    infrastructure.roads.visible = !therm;
    infrastructure.trails.visible = !enabled && l.roads.on;
    infrastructure.structures.visible = !therm && !isPlan;
    infrastructure.detail.visible = !enabled && (isPlan || l.structures.on);
    infrastructure.boundary.visible = !enabled && l.boundary.on;
    fire.suppression.visible = !therm && l.suppression.on;
    flames.visible = !isPlan && !therm && l.spread.on;
    fire.route.visible = !enabled && l.spread.on;
    fire.arrows.visible = !enabled && l.spread.on && !isPlan;
    wind.visible = !enabled && l.wind.on;
    tracks.visible = !enabled && state.workspace === 'Drones' && !isPlan;
    for (const unit of names) {
      const mesh = entities.get(unit.id);
      mesh.visible = !therm && !isPlan && showUnit(unit)
        && !(state.selected === unit && (enabled || state.camera === 'cockpit'));
    }
  }

  function render(now) {
    updateView(state.view);
    const isPlan = state.view === '2D';
    const cam = isPlan ? plan : persp;
    const l = state.layers;
    const lift = l.terrain.on ? .16 + .84 * l.terrain.opacity / 100 : .025;
    world.scale.y = lift;
    const u = terrain.uniforms;
    u.uHour.value = state.hour;
    u.uClock.value = state.seconds;
    u.uScar.value = l.scar.on ? l.scar.opacity / 100 : 0;
    u.uSpread.value = l.spread.on ? l.spread.opacity / 100 : 0;
    u.uProbability.value = l.probability.on ? l.probability.opacity / 100 : 0;
    u.uAerial.value = l.aerial.on ? l.aerial.opacity / 100 : 0;
    wind.material.uniforms.clock.value = state.seconds;
    wind.material.uniforms.opacity.value = l.wind.opacity / 100;
    if (operationsHour !== state.hour) {
      operationsHour = state.hour;
      for (const { line, meshes } of fire.lines) {
        for (const mesh of meshes) {
          const count = Math.floor(mesh.geometry.index.count / 6 * lineProgress(line, state.hour)) * 6;
          mesh.visible = count > 0;
          mesh.geometry.setDrawRange(0, count);
        }
      }
      for (const { drop, strip, mist } of fire.drops) {
        const progress = dropProgress(drop, state.hour - dropFallTime);
        const age = Math.max(0, state.hour - drop.finish);
        strip.material.opacity = .78 * (1 - clamp(age / (drop.substance === 'water' ? 9 : 72)) * (drop.substance === 'water' ? 1 : .8));
        strip.visible = progress > 0 && strip.material.opacity > 0;
        strip.geometry.setDrawRange(0, Math.floor(strip.geometry.index.count / 6 * progress) * 6);
        mist.update(state.hour);
      }
      for (const unit of names) {
        const mesh = entities.get(unit.id);
        const p = place(unit, state.hour);
        mesh.position.set(p.x, p.y, p.z);
        mesh.rotation.y = p.yaw;
        const { blades, walkers } = mesh.userData;
        if (blades) blades.rotation.y = state.seconds * 25;
        walkers?.forEach(([left, right], i) => {
          const swing = p.walking ? Math.sin(state.seconds * 11 + i * 1.4) * .46 : 0;
          left.rotation.x = swing;
          right.rotation.x = -swing;
        });
      }
    }
    for (const line of fire.route.children) line.visible = line.userData.time <= state.hour;
    for (const arrow of fire.arrows.children) arrow.visible = arrow.userData.time <= state.hour;
    const trailEnd = Math.floor(state.hour * 8);
    for (const track of tracks.children) {
      const start = Math.max(0, trailEnd - 64);
      track.geometry.setDrawRange(start, trailEnd - start + 1);
      track.material.opacity = !state.selected || state.selected.id === track.userData.id ? .71 : .16;
    }
    const following = state.selected && state.camera !== 'overview';
    orbit.enabled = !isPlan && !following && state.feed !== 'full';
    pan.enabled = isPlan && state.feed !== 'full';
    if (isPlan && following) {
      const { position } = entities.get(state.selected.id);
      if (!planFollow) {
        pan.target.set(position.x, 0, position.z);
        plan.position.set(position.x, 160, position.z + .001);
      } else {
        const dx = position.x - planFollow.x, dz = position.z - planFollow.z;
        pan.target.x += dx;
        pan.target.z += dz;
        plan.position.x += dx;
        plan.position.z += dz;
      }
      planFollow = { x: position.x, z: position.z };
    } else {
      planFollow = null;
    }
    if (!isPlan && following) {
      const { position, rotation } = entities.get(state.selected.id);
      const { id, kind } = state.selected;
      const cockpit = state.camera === 'cockpit';
      const drop = dropById.get(id);
      const dropping = drop && state.hour >= drop.start && state.hour < drop.finish + dropFallTime;
      const angle = rotation.y + chaseAngle + (!cockpit && dropping ? .53 : 0);
      const s = Math.sin(angle), c = Math.cos(angle);
      const distance = cockpit ? -1.62 : kind === 'air' ? 17 : kind === 'drone' ? 10 : kind === 'crew' ? 6 : 4.6;
      const rise = cockpit ? .56 : kind === 'air' ? 8 : kind === 'drone' ? 5.6 : kind === 'crew' ? 3.3 : 1.6;
      const lead = cockpit ? 22 : kind === 'air' ? 5 : kind === 'drone' ? 2.1 : 1.1;
      const eyeX = position.x + s * distance * chaseZoom, eyeZ = position.z + c * distance * chaseZoom;
      const ground = height(eyeX, eyeZ) * lift;
      desiredEye.set(eyeX, Math.max(ground + .65, position.y * lift + rise * chaseZoom), eyeZ);
      desiredCenter.set(position.x - s * lead, position.y * lift + (kind === 'drone' ? -.55 : dropping && !cockpit ? -drop.altitude * .39 : .10), position.z - c * lead);
      if (chaseTransition) {
        const t = clamp((now - chaseTransition.time) / 680);
        const eased = t * t * (3 - 2 * t);
        persp.position.copy(chaseTransition.from).lerp(desiredEye, eased);
        orbit.target.copy(chaseTransition.target).lerp(desiredCenter, eased);
        if (t === 1) chaseTransition = null;
      } else {
        persp.position.copy(desiredEye);
        orbit.target.copy(desiredCenter);
      }
      persp.lookAt(orbit.target);
    } else if (!isPlan && flight) {
      const t = clamp((now - flight.time) / flight.duration);
      const tween = t * t * (3 - 2 * t);
      startEye.copy(flight.from).lerp(flight.eye, tween);
      startCenter.copy(flight.target).lerp(flight.center, tween);
      persp.position.copy(startEye);
      orbit.target.copy(startCenter);
      if (t === 1) flight = null;
    }
    if (isPlan) pan.update();
    else if (!following) orbit.update();

    setSensorView(false);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, w, h);
    if (state.feed !== 'full') renderer.render(scene, cam);

    if (state.feed !== 'closed' && state.selected?.kind === 'drone') {
      const frame = viewfinder.getBoundingClientRect();
      const bounds = host.getBoundingClientRect();
      if (frame.width > 1 && frame.height > 1) {
        const unit = state.selected;
        const { position } = entities.get(unit.id);
        const { x, z } = missionTarget(unit, state.hour);
        sensor.position.set(position.x, position.y * lift, position.z);
        sensor.lookAt(x, height(x, z) * lift, z);
        sensor.aspect = frame.width / frame.height;
        sensor.fov = unit.fov / state.zoom;
        sensor.updateProjectionMatrix();
        setSensorView(true);
        renderer.setViewport(frame.left - bounds.left, bounds.bottom - frame.bottom, frame.width, frame.height);
        renderer.setScissor(frame.left - bounds.left, bounds.bottom - frame.bottom, frame.width, frame.height);
        renderer.setScissorTest(true);
        renderer.render(scene, sensor);
        renderer.setScissorTest(false);
        setSensorView(false);
      }
    }

    syncLabels(cam, isPlan, lift);
    const bearing = isPlan ? 0 : Math.atan2(persp.position.x - orbit.target.x, persp.position.z - orbit.target.z) * 180 / Math.PI;
    compass.style.transform = `rotate(${bearing.toFixed(1)}deg)`;
    const zoom = isPlan ? plan.zoom * 1.8 : overviewEye.distanceTo(overviewCenter) * 2.5 / persp.position.distanceTo(orbit.target);
    zoomLabel.textContent = `${zoom.toFixed(1)}×`;
    const distance = zoom > 18 ? 100 : zoom > 6 ? 250 : zoom > 2.3 ? 500 : 1000;
    if (distance !== scaleDistance) {
      scaleDistance = distance;
      scale.innerHTML = `<span>0</span><span>${distance / 2}</span><span>${distance === 1000 ? '1 千米' : distance + ' 米'}</span><i></i>`;
    }
    pick(cam, lift);
    return Boolean(!isPlan && (flight || chaseTransition));
  }

  function zoomBy(factor) {
    if (state.view === '2D') {
      plan.zoom = clamp(plan.zoom * factor, pan.minZoom, pan.maxZoom);
      plan.updateProjectionMatrix();
    } else if (state.camera !== 'overview') {
      chaseZoom = clamp(chaseZoom / factor, .44, 2.9);
    } else {
      const delta = persp.position.clone().sub(orbit.target);
      delta.setLength(clamp(delta.length() / factor, orbit.minDistance, orbit.maxDistance));
      persp.position.copy(orbit.target).add(delta);
    }
  }

  return { render, reset, focus, mode, zoomBy };
}

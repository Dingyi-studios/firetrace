import assert from 'node:assert/strict';
import test from 'node:test';
import { Group } from 'three';
import { drones, hours, resources } from '../src/data.js';
import { fireTarget } from '../src/fire-activity.js';
import { createFireGraphics, place } from '../src/objects.js';
import { airDrops, replayRate, resourceActive } from '../src/operations.js';
import { airOperation, aircraftRate, dropOccurrences } from '../src/air-operations.js';
import { roadCurve, villages } from '../src/roads.js';
import { state, tick } from '../src/state.js';
import { height } from '../src/terrain.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const turn = (a, b) => Math.abs(Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw)));
const step = .05;

for (const unit of drones) {
  test(`${unit.id} flies a continuous patrol without sudden reversals`, () => {
    let previous = place(unit, 0);
    const closest = villages.map(() => Infinity);
    for (let sample = 1; sample <= hours / step; sample++) {
      const pose = place(unit, sample * step);
      const speed = distance(previous, pose) / step;
      assert.ok(Number.isFinite(pose.y) && speed < (unit.role === 'village' ? 6 : 4), `${unit.id}: speed ${speed}`);
      assert.ok(turn(previous, pose) < 3 * Math.PI / 180, `${unit.id}: sudden heading change`);
      if (unit.role === 'village') {
        assert.ok(speed > 4, 'Village transit must keep moving at cruise speed');
        villages.forEach(({ at: [x, z] }, index) => { closest[index] = Math.min(closest[index], distance(pose, { x, z })); });
      }
      previous = pose;
    }
    if (unit.role === 'village') assert.ok(closest.every((value) => value < .5), 'Patrol must visit all four villages');
  });
}

test('fire surveillance targets keep a continuous velocity across hourly updates', () => {
  for (const role of ['overview', 'head', 'flank', 'thermal']) {
    for (let hour = 1; hour < hours; hour++) {
      const before = fireTarget(role, hour - .001), at = fireTarget(role, hour), after = fireTarget(role, hour + .001);
      const velocityChange = Math.hypot((after.x - 2 * at.x + before.x) / .001,
        (after.z - 2 * at.z + before.z) / .001);
      assert.ok(velocityChange < .01, `${role} target jerks at ${hour}`);
    }
  }
});

for (const unit of resources.filter(({ kind }) => kind === 'air')) {
  test(`${unit.id} keeps its nose forward and balances speed across flight phases`, () => {
    let minimum = Infinity, maximum = 0;
    const airStep = step / aircraftRate;
    for (let sample = 1; sample < hours / airStep; sample++) {
      const hour = sample * airStep;
      if (!resourceActive(unit, hour)) continue;
      const pose = place(unit, hour), previous = place(unit, hour - airStep);
      const before = place(unit, hour - .0001), ahead = place(unit, hour + .0001);
      const moving = distance(before, ahead) > .000001;
      if (moving) {
        const alignment = (-Math.sin(pose.yaw) * (ahead.x - before.x) - Math.cos(pose.yaw) * (ahead.z - before.z)) / distance(before, ahead);
        assert.ok(alignment > .999, `${unit.id} is flying sideways at ${hour}`);
      }
      assert.ok(turn(previous, pose) < 3 * Math.PI / 180, `${unit.id} turns abruptly at ${hour}`);
      const operation = airOperation(unit, hour);
      if (operation.phase === 'refilling' || airOperation(unit, hour - airStep).phase === 'refilling') continue;
      const speed = distance(previous, pose) / airStep;
      minimum = Math.min(minimum, speed);
      maximum = Math.max(maximum, speed);
    }
    assert.ok(maximum / minimum < (unit.id === 'AA-52' ? 1.4 : 1.02), `${unit.id}: cruise speed varies from ${minimum} to ${maximum}`);
    assert.ok(minimum * replayRate > .8, 'Flight must retain its real playback speed');
  });
}

test('aircraft remain aligned with the water and retardant release animations', () => {
  for (const drop of airDrops) {
    const unit = resources.find(({ id }) => id === drop.id), route = roadCurve(drop.path);
    for (let index = 0; index <= 20; index++) {
      const progress = index / 20, hour = drop.start + (drop.finish - drop.start) * progress;
      const pose = place(unit, hour), release = route.getPointAt(progress);
      assert.ok(distance(pose, { x: release.x, z: release.y }) < .00001);
      assert.ok(Math.abs(pose.y - height(pose.x, pose.z) - drop.altitude) < .00001);
    }
  }
});

test('water and retardant effects initialize and render their timeline samples', () => {
  const world = new Group();
  try {
    const { drops } = createFireGraphics(world);
    for (const { drop, mist } of drops) {
      mist.update((drop.start + drop.finish) / 2);
      assert.ok(mist.mesh.visible);
      assert.ok([...mist.mesh.geometry.attributes.position.array].every(Number.isFinite));
      assert.ok(mist.mesh.geometry.attributes.opacity.array.some((value) => value > 0));
      mist.update(drop.finish + 10);
      assert.equal(mist.mesh.visible, false);
    }
  } finally {
    world.traverse((object) => {
      object.geometry?.dispose();
      object.material?.dispose();
    });
  }
});

test('seeking backward reproduces flight positions and pausing freezes replay time', () => {
  const units = [...drones, ...resources.filter(({ kind }) => kind === 'air')];
  const expected = units.map((unit) => place(unit, 28.5));
  for (const hour of [90, 3, 62, 0, 49]) units.forEach((unit) => place(unit, hour));
  assert.deepEqual(units.map((unit) => place(unit, 28.5)), expected);
  const original = { hour: state.hour, playing: state.playing };
  try {
    state.hour = 28.5;
    state.playing = false;
    tick(15);
    assert.equal(state.hour, 28.5);
    assert.deepEqual(units.map((unit) => place(unit, state.hour)), expected);
  } finally { Object.assign(state, original); }
});

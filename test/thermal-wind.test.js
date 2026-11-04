import test from 'node:test';
import assert from 'node:assert/strict';
import { Group } from 'three';
import { ThermalTracker, terrainVisible } from '../src/thermal-tracker.js';
import { windAnimating, windClockAt, windLineCount } from '../src/ambient.js';
import { createWind } from '../src/objects.js';

const peak = (x) => Math.max(0, 14 - Math.abs(x - 10) * 5);
const spot = (id, x, temperature = 900) => ({ id, x, z: 0, name: '测试火点', kind: 'front', temperature });
function session(tracker, options = {}) {
 const input = { now: 0, hour: 40, context: 'FT-02', limit: 1, candidates: () => [spot('a', 0)],
  visible: () => true, temperature: () => 900, ...options };
 return { input, at(now, changes = {}) { Object.assign(input, changes, { now }); return tracker.update(input); } };
}

test('a terrain ridge blocks a rear hotspot while an elevated line of sight stays visible', () => {
 assert.equal(terrainVisible({ x: 0, y: 10, z: 0 }, { x: 20, y: .18, z: 0 }, 1, peak), false);
 assert.equal(terrainVisible({ x: 0, y: 40, z: 0 }, { x: 20, y: .18, z: 0 }, 1, peak), true);
 assert.equal(terrainVisible({ x: 0, y: 10, z: 0 }, { x: 20, y: .18, z: 0 }, 1, () => 0), true);
 assert.equal(terrainVisible({ x: 0, y: 1.6, z: 0 }, { x: 20, y: .18 * .16, z: 0 }, .16, peak), false);
});

test('a narrow ridge between widely separated endpoints still occludes a hotspot', () => {
 const narrow = x => Math.abs(x - 10.1) < .14 ? 15 : 0;
 assert.equal(terrainVisible({ x: 0, y: 10, z: 0 }, { x: 20, y: .18, z: 0 }, 1, narrow), false);
});

test('thermal acquisition requires a stable observation and hidden locks disappear immediately', () => {
 const tracker = new ThermalTracker(), run = session(tracker);
 assert.equal(run.at(0).length, 0);assert.equal(run.at(300).length, 0);assert.equal(run.at(600).length, 0);
 assert.equal(run.at(900).length, 1);
 assert.equal(run.at(930, { visible: () => false }).length, 0);
});

test('minor heat fluctuations cannot make two competing hotspots flicker back and forth', () => {
 const tracker = new ThermalTracker(), run = session(tracker);
 for (let t = 0; t <= 1200; t += 100) run.at(t);
 const id = tracker.tracks[0].id;
 for (let t = 1300; t <= 7000; t += 100) {
  const rows = run.at(t, { candidates: () => [spot('a', 0, 900), spot('b', 10, t % 200 ? 950 : 970)] });
  assert.equal(rows[0].id, id);assert.equal(rows[0].sourceId, 'a');
 }
});

test('a much hotter target must persist before a deliberate switch', () => {
 const tracker = new ThermalTracker(), run = session(tracker);
 for (let t = 0; t <= 2000; t += 100) run.at(t);
 const hotter = () => [spot('a', 0), spot('b', 10, 1150)];
 assert.equal(run.at(2100, { candidates: hotter })[0].sourceId, 'a');
 assert.equal(run.at(2700)[0].sourceId, 'a');
 for (let t = 2800; t <= 4200; t += 100) run.at(t);
 assert.equal(tracker.tracks[0].sourceId, 'b');
});

test('tracking moves gradually in ground space and never interpolates a marker behind terrain', () => {
 const tracker = new ThermalTracker(), run = session(tracker);
 for (let t = 0; t <= 1200; t += 100) run.at(t);
 const before = tracker.tracks[0].x;
 run.at(1500, { candidates: () => [spot('a', 2)] });
 assert.ok(tracker.tracks[0].x > before && tracker.tracks[0].x - before <= .3);
 for (let t = 1600; t < 5000; t += 100) {
  const rows = run.at(t, { visible: p => p.x < .5 || p.x > 1.5 });
  assert.ok(rows.every(p => p.x < .5 || p.x > 1.5));
 }
});

test('large scrubs and changes of camera discard stale tracks rather than dragging them across the scene', () => {
 const tracker = new ThermalTracker(), run = session(tracker);
 for (let t = 0; t <= 1200; t += 100) run.at(t);
 assert.equal(run.at(1230, { hour: 70 }).length, 0);
 for (let t = 1300; t <= 2400; t += 100) run.at(t);
 assert.equal(run.at(2430, { context: 'FT-07' }).length, 0);
});

test('wind density grows by half and uses a fixed wall-clock phase equivalent to 16x playback', () => {
 assert.equal(windLineCount, 160 * 1.5);
 assert.equal(windClockAt(11000) - windClockAt(10000), 4);
 assert.equal(windClockAt(250000), windClockAt(0));
 for (const speed of [.5, 1, 16]) for (const playing of [false, true]) {
  const state = { speed, playing, hour: 20, feed: 'closed', layers: { wind: { on: true, opacity: 70 } } };
  assert.equal(windAnimating(state), true);
 }
 assert.equal(windAnimating({ feed: 'full', layers: { wind: { on: true, opacity: 70 } } }), false);
 assert.equal(windAnimating({ feed: 'closed', layers: { wind: { on: false, opacity: 70 } } }), false);
 const group = new Group(), wind = createWind(group);
 try { assert.equal(wind.geometry.index.count, 240 * 21 * 6); }
 finally { wind.geometry.dispose();wind.material.dispose(); }
});

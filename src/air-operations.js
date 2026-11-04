import { clamp, containment, hours, resources } from './data.js';
import { flightLeg } from './flight-route.js';
import { roadCurve } from './roads.js';

export const aircraftRate = 4;
export const airDispatch = { 'AA-52': 10, 'T-910': 17, 'H-743': 21, 'T-131': 29, 'H-531': 39, 'T-162': 47 };
export const airDrops = [
  { id: 'H-743', substance: 'water', start: 27.5, runHours: 4, path: [[10, -10], [13, -8], [16, -5], [18, -1]], width: 1.75, altitude: 5.4 },
  { id: 'T-131', substance: 'retardant', start: 36, runHours: 6, path: [[-5, 3], [1, 0], [9, -5], [16, -10], [24, -13]], width: 2.3, altitude: 8.6 },
  { id: 'H-531', substance: 'water', start: 49, runHours: 4, path: [[18, -18], [20, -21], [23, -24], [24, -25]], width: 1.4, altitude: 5.1 },
  { id: 'T-910', substance: 'retardant', start: 24, runHours: 4.4, path: [[-5, 12], [2, 7], [9, 1], [15, -4]], width: 3, altitude: 9.2 },
  { id: 'T-162', substance: 'retardant', start: 53, runHours: 4, path: [[8, -21], [14, -26], [22, -31], [28, -35]], width: 2.2, altitude: 8.1 },
].map((drop) => ({ ...drop, finish: drop.start + drop.runHours / aircraftRate,
  quantity: resources.find(({ id }) => id === drop.id).capacity }));
export const dropById = new Map(airDrops.map((drop) => [drop.id, drop]));

const missions = new Map(airDrops.map((drop) => {
  const run = roadCurve(drop.path);
  const point = (t) => { const p = run.getPointAt(t); return { x: p.x, z: p.y }; };
  const heading = (t) => { const d = run.getTangentAt(t); return Math.atan2(d.y, d.x); };
  const first = point(0), last = point(1), water = drop.substance === 'water';
  const supply = water ? { x: -17, z: -73 } : { x: -68, z: 62 };
  const bearing = Math.atan2((first.x + last.x) / 2 - supply.x, supply.z - (first.z + last.z) / 2);
  const radius = water ? 8 : 14;
  const outbound = flightLeg(last, supply, heading(1), bearing, radius);
  const inbound = flightLeg(supply, first, bearing, heading(0), radius);
  const speed = run.getLength() / drop.runHours;
  const outboundHours = outbound.length / speed, inboundHours = inbound.length / speed, refillHours = water ? 2.2 : 3.2;
  return [drop.id, { drop, run, outbound, inbound, speed, supply, bearing, outboundHours, inboundHours, refillHours,
    duration: (drop.runHours + outboundHours + refillHours + inboundHours) / aircraftRate }];
}));

export function dropWindowAt(drop, hour) {
  const mission = missions.get(drop.id);
  const index = Math.min(Math.floor((hour - drop.start) / mission.duration),
    Math.ceil((containment - drop.start) / mission.duration) - 1);
  if (index < 0) return null;
  const start = drop.start + index * mission.duration;
  return { ...drop, start, finish: start + drop.runHours / aircraftRate, index };
}

export const dropOccurrences = (drop) => {
  const occurrences = [];
  const { duration } = missions.get(drop.id);
  for (let index = 0; drop.start + index * duration < Math.min(hours, containment); index++) {
    const start = drop.start + index * duration;
    occurrences.push({ ...drop, start, finish: start + drop.runHours / aircraftRate, index });
  }
  return occurrences;
};

export function airOperation(unit, hour) {
  const mission = missions.get(unit.id);
  if (!mission) return { status: 'supervising', count: 0, load: 0 };
  const { drop, run, speed, supply, bearing, outbound, inbound, outboundHours, refillHours } = mission;
  const period = mission.duration * aircraftRate;
  const clock = (((hour - drop.start) * aircraftRate) % period + period) % period;
  const window = dropWindowAt(drop, hour);
  const count = window ? window.index + (hour >= Math.min(window.finish, containment) ? 1 : 0) : 0;
  let point, phase, progress, heading = bearing;
  if (clock < drop.runHours) {
    phase = 'dropping'; progress = clock / drop.runHours;
    const p = run.getPointAt(progress); point = { x: p.x, z: p.y };
  } else if (clock < drop.runHours + outboundHours) {
    phase = 'outbound'; progress = (clock - drop.runHours) / outboundHours;
    point = outbound.pointAt(progress * outbound.length);
  } else if (clock < drop.runHours + outboundHours + refillHours) {
    phase = 'refilling'; progress = (clock - drop.runHours - outboundHours) / refillHours;
    point = supply;
  } else {
    phase = 'inbound'; progress = (clock - drop.runHours - outboundHours - refillHours) / mission.inboundHours;
    point = inbound.pointAt(progress * inbound.length);
  }
  const beforeFirst = hour < drop.start;
  const status = hour >= containment ? 'returning' : beforeFirst || phase === 'inbound' ? 'to-drop'
    : phase === 'dropping' ? 'dropping' : phase === 'refilling' ? drop.substance === 'water' ? 'taking-water' : 'reloading' : drop.substance === 'water' ? 'to-water' : 'reload';
  const releasedProgress = hour >= containment && window ? clamp((containment - window.start) / (window.finish - window.start)) : progress;
  const fraction = beforeFirst || phase === 'inbound' ? 1 : phase === 'dropping' ? 1 - releasedProgress : phase === 'refilling' ? progress : 0;
  return { ...point, phase, progress, heading, status, count, load: Math.round(drop.quantity * clamp(fraction)),
    speed, supply, drop, duration: mission.duration, window };
}

export function releasedTotal(drop, hour) {
  return dropOccurrences(drop).reduce((sum, window) => sum + drop.quantity * clamp((Math.min(hour, containment) - window.start) / (window.finish - window.start)), 0);
}

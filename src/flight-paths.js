import { EllipseCurve } from 'three';
import { resources } from './data.js';
import { airDrops } from './operations.js';
import { roadCurve } from './roads.js';
import { height } from './terrain.js';
import { flightLeg } from './flight-route.js';

const wrap = (distance, length) => ((distance % length) + length) % length;
const prepare = (curve) => {
  curve.arcLengthDivisions = 1800;
  curve.updateArcLengths();
  return curve;
};

const flights = new Map(resources.filter(({ kind }) => kind === 'air').map((unit) => {
  const drop = airDrops.find(({ id }) => id === unit.id);
  if (!drop) {
    const orbit = prepare(new EllipseCurve(...unit.at, 22, 18));
    return [unit.id, { orbit, length: orbit.getLength(), speed: unit.speed / 40, offset: unit.index * 2.17 }];
  }
  const run = roadCurve(drop.path);
  const point = (t) => { const p = run.getPointAt(t); return { x: p.x, z: p.y }; };
  const heading = (t) => { const d = run.getTangentAt(t); return Math.atan2(d.y, d.x); };
  const first = point(0), last = point(1);
  const rotor = unit.id.startsWith('H-');
  const supply = rotor ? { x: -17, z: -73 } : { x: -68, z: 62 };
  const supplyHeading = Math.atan2((first.x + last.x) / 2 - supply.x, supply.z - (first.z + last.z) / 2);
  const radius = rotor ? 8 : 14;
  const outbound = flightLeg(last, supply, heading(1), supplyHeading, radius);
  const inbound = flightLeg(supply, first, supplyHeading, heading(0), radius);
  const runLength = run.getLength(), refillLength = outbound.length + inbound.length;
  return [unit.id, { drop, run, outbound, inbound, runLength, refillLength,
    length: runLength + refillLength, speed: runLength / (drop.finish - drop.start) }];
}));

function flightPoint(unit, hour) {
  const flight = flights.get(unit.id);
  if (!flight.drop) {
    const point = flight.orbit.getPointAt(wrap(hour * flight.speed + flight.offset * 20, flight.length) / flight.length);
    return { x: point.x, z: point.y };
  }
  const distance = wrap((hour - flight.drop.start) * flight.speed, flight.length);
  if (distance <= flight.runLength) {
    const point = flight.run.getPointAt(distance / flight.runLength);
    return { x: point.x, z: point.y };
  }
  const transit = distance - flight.runLength;
  return transit <= flight.outbound.length ? flight.outbound.pointAt(transit)
    : flight.inbound.pointAt(transit - flight.outbound.length);
}

export function aircraftPose(unit, hour) {
  const point = flightPoint(unit, hour);
  const before = flightPoint(unit, hour - .002), ahead = flightPoint(unit, hour + .002);
  const yaw = Math.atan2(before.x - ahead.x, before.z - ahead.z);
  const drop = flights.get(unit.id).drop;
  // Match the release strip during the run and transition smoothly to cruise height.
  const transitAge = drop ? Math.max(0, drop.start - hour, hour - drop.finish) : Infinity;
  const climb = Math.min(1, transitAge / 4);
  const altitude = drop ? drop.altitude + (2.4 + unit.alt / 275 - drop.altitude) * climb * climb * (3 - 2 * climb)
    : 2.4 + unit.alt / 275;
  return { x: point.x, z: point.z, y: height(point.x, point.z) + altitude, yaw };
}

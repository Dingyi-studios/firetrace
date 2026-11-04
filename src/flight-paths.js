import { EllipseCurve } from 'three';
import { airOperation, aircraftRate } from './air-operations.js';
import { fireTarget } from './fire-activity.js';
import { height, lakeEdge, lakeLevel, mix, smooth } from './terrain.js';

const commandOrbit = new EllipseCurve(0, 0, 36, 27);
commandOrbit.arcLengthDivisions = 1200;
const commandLength = commandOrbit.getLength();

export function aircraftPose(unit, hour) {
  const operation = airOperation(unit, hour);
  if (!operation.drop) {
    const position = (time) => {
      const center = fireTarget('overview', time);
      const p = commandOrbit.getPointAt(((time * aircraftRate * unit.speed / 40) % commandLength + commandLength) % commandLength / commandLength);
      return { x: center.x + p.x, z: center.z + p.y };
    };
    const p = position(hour), a = position(hour - .0005), b = position(hour + .0005);
    return { ...p, y: height(p.x, p.z) + 2.4 + unit.alt / 275, yaw: Math.atan2(a.x - b.x, a.z - b.z) };
  }
  const { x, z, phase, progress, drop, supply } = operation;
  const before = airOperation(unit, hour - .0005), ahead = airOperation(unit, hour + .0005);
  const moving = Math.hypot(before.x - ahead.x, before.z - ahead.z) > .000001;
  const yaw = moving ? Math.atan2(before.x - ahead.x, before.z - ahead.z)
    : Math.atan2(-Math.cos(operation.heading), -Math.sin(operation.heading));
  const cruise = Math.max(drop.altitude + 3, 2.4 + unit.alt / 275);
  const supplyFloor = lakeEdge(supply.x, supply.z) < 0 ? lakeLevel : height(supply.x, supply.z);
  const supplyY = supplyFloor + (drop.substance === 'water' ? 1 : .45);
  let y = height(x, z) + drop.altitude;
  if (phase === 'outbound') {
    y = height(x, z) + mix(drop.altitude, cruise, smooth(0, .12, progress));
    y = mix(y, supplyY, smooth(.87, 1, progress));
  } else if (phase === 'refilling') y = supplyY;
  else if (phase === 'inbound') {
    y = mix(supplyY, height(x, z) + cruise, smooth(0, .13, progress));
    y = mix(y, height(x, z) + drop.altitude, smooth(.88, 1, progress));
  }
  return { x, z, y: Math.max(y, height(x, z) + .3), yaw };
}

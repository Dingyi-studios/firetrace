import { containment, events, hours } from './data.js';
import { firePatrolCenter, fireTarget } from './fire-activity.js';
import { flightLeg } from './flight-route.js';
import { villages } from './roads.js';
import { fireAt, height, mix, smooth } from './terrain.js';
import { denseTarget, heatAt, hotspotsAt } from './thermal.js';

const villagePoints = villages.map(({ at: [x, z] }) => ({ x, z }));
const villageHeadings = villagePoints.map((point, index) => {
  const previous = villagePoints[(index + villages.length - 1) % villages.length];
  const next = villagePoints[(index + 1) % villages.length];
  const incoming = Math.hypot(point.x - previous.x, point.z - previous.z);
  const outgoing = Math.hypot(next.x - point.x, next.z - point.z);
  return Math.atan2((point.z - previous.z) / incoming + (next.z - point.z) / outgoing,
    (point.x - previous.x) / incoming + (next.x - point.x) / outgoing);
});
const villageLegs = villagePoints.map((point, index) => flightLeg(point, villagePoints[(index + 1) % villages.length],
  villageHeadings[index], villageHeadings[(index + 1) % villages.length], 9));
const villageTourLength = villageLegs.reduce((total, leg) => total + leg.length, 0);
const villageSpeed = 4.6;
function villagePosition(unit, hour) {
  const offset = unit.index === 5 ? villageLegs[0].length + villageLegs[1].length : 0;
  let distance = ((hour * villageSpeed + offset) % villageTourLength + villageTourLength) % villageTourLength;
  for (const [index, leg] of villageLegs.entries()) {
    if (distance <= leg.length) return { ...leg.pointAt(distance), index, progress: distance / leg.length };
    distance -= leg.length;
  }
}

export function missionTarget(unit, hour) {
  if (unit.role === 'forest-west' || unit.role === 'forest-north') return denseTarget(unit.role === 'forest-west' ? 0 : 1, hour);
  if (unit.role === 'global') return { x: 4, z: -10, name: '实时火场全景', status: '高空监视' };
  if (unit.role !== 'village') {
    const point = fireTarget(unit.role, hour);
    if (hour < events[0].time) return { ...point, name: '巡查区域', status: '巡查中' };
    if (hour >= containment) return { ...point, name: '火场复查', status: '复查中' };
    return { ...point, name: '活动火线', status: '追踪火线' };
  }
  const { index, progress } = villagePosition(unit, hour);
  const village = villages[index % villages.length], next = villages[(index + 1) % villages.length];
  const transit = smooth(.2, .8, progress);
  return {
    x: mix(village.at[0], next.at[0], transit),
    z: mix(village.at[1], next.at[1], transit),
    name: transit === 1 ? next.name : transit > 0 ? `${village.name} → ${next.name}` : village.name,
    status: transit > 0 && transit < 1 ? '转场中' : '村落巡查',
  };
}

function patrolPosition(unit, hour) {
  if (unit.role === 'village') {
    const { x, z } = villagePosition(unit, hour);
    return { x, z };
  }
  const specialized = unit.role.startsWith('forest') || unit.role === 'global';
  const center = specialized ? missionTarget(unit, hour) : firePatrolCenter(unit.role, hour);
  const phase = hour * (unit.role === 'global' ? .045 : .18) + unit.index * 2.17;
  const radius = unit.role === 'global' ? 19 : 12 + Math.min(4, unit.index) * .6;
  return { x: center.x + Math.sin(phase) * radius, z: center.z + Math.cos(phase) * radius * .85 };
}

export function dronePose(unit, hour) {
  const point = patrolPosition(unit, hour);
  const before = patrolPosition(unit, Math.max(0, hour - .002)), ahead = patrolPosition(unit, Math.min(hours, hour + .002));
  const yaw = Math.atan2(before.x - ahead.x, before.z - ahead.z);
  const target = missionTarget(unit, hour);
  const y = Math.max(height(point.x, point.z), height(target.x, target.z)) + (unit.role === 'global' ? 105 : 2.8 + unit.alt / 275);
  return { ...point, y, yaw };
}

export function missionTemperature(unit, hour) {
  if (unit.role === 'village' || hour < events[0].time || hour >= containment) return 32;
  const { x, z } = missionTarget(unit, hour);
  if (unit.role === 'global') return Math.max(32, ...hotspotsAt(hour).map(({ temperature }) => temperature));
  return heatAt(x, z, hour).temperature;
}

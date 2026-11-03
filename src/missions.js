import { containment, events } from './data.js';
import { fireTarget } from './fire-activity.js';
import { toReplaySeconds } from './operations.js';
import { villages } from './roads.js';
import { fireAt, height, mix, smooth } from './terrain.js';

const patrolHours = 8;

export function missionTarget(unit, hour) {
  if (unit.role !== 'village') {
    const point = fireTarget(unit.role, hour);
    if (hour < events[0].time) return { ...point, name: '巡查区域', status: '巡查中' };
    if (hour >= containment) return { ...point, name: '火场复查', status: '复查中' };
    return { ...point, name: '活动火线', status: '追踪火线' };
  }
  const lap = Math.max(0, hour) / patrolHours + (unit.index === 5 ? 2.5 : 0);
  const index = Math.floor(lap);
  const village = villages[index % villages.length], next = villages[(index + 1) % villages.length];
  const transit = smooth(.62, 1, lap - index);
  return {
    x: mix(village.at[0], next.at[0], transit),
    z: mix(village.at[1], next.at[1], transit),
    name: transit > 0 ? `${village.name} → ${next.name}` : village.name,
    status: transit > 0 ? '转场中' : '村落巡查',
  };
}

function patrolPosition(unit, hour) {
  const target = missionTarget(unit, hour);
  const phase = toReplaySeconds(hour) * (unit.role === 'village' ? .22 : .11) + unit.index * 2.17;
  const radius = unit.role === 'thermal' ? 4.4 : unit.role === 'village' ? 6.7 : 5 + unit.index * .7;
  return { x: target.x + Math.sin(phase) * radius, z: target.z + Math.cos(phase) * radius * .75 };
}

export function dronePose(unit, hour) {
  const point = patrolPosition(unit, hour);
  const ahead = patrolPosition(unit, hour + .035);
  const yaw = Math.atan2(point.x - ahead.x, point.z - ahead.z);
  const target = missionTarget(unit, hour);
  const y = Math.max(height(point.x, point.z), height(target.x, target.z)) + 2.8 + unit.alt / 275;
  return { ...point, y, yaw };
}

export function missionTemperature(unit, hour) {
  if (unit.role === 'village' || hour < events[0].time || hour >= containment) return 32;
  const { x, z } = missionTarget(unit, hour);
  const { arrival } = fireAt(x, z);
  return Math.round(220 + 760 * Math.exp(-Math.abs(hour - arrival) / 6));
}

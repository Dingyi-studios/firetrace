import { detections, drones, events, hours, initialTime, layers } from './data.js';
import { dronePose, missionTarget, missionTemperature } from './missions.js';
import { defenses, deployments, dismountHours, dropById, dropProgress, replayRate, resourceActive, toReplaySeconds } from './operations.js';

export const state = {
  workspace: 'Incident', tab: 'Layers', view: '3D', selected: null, camera: 'overview',
  hour: initialTime, playing: false, speed: 1, selectedEvent: 2,
  get seconds() { return toReplaySeconds(this.hour); },
  layers: Object.fromEntries(layers.map((layer) => [layer.id, { ...layer }])),
  feed: 'closed', sensor: 'EO', palette: 'Ironbow', zoom: 1,
  recordingSince: 0, hover: null, menu: null,
};

export function resourceStatus(unit) {
  if (!resourceActive(unit, state.hour)) return 'standby';
  const drop = dropById.get(unit.id);
  if (drop && state.hour >= drop.start) return state.hour < drop.finish ? 'dropping' : 'reload';
  const deployment = deployments.find(({ truck }) => truck === unit.id);
  if (deployment) {
    if (state.hour < deployment.arrival) return 'enroute';
    if (unit.id === 'E-45' && state.hour >= deployment.arrival + 2) return 'patrol';
    return 'staged';
  }
  const arrival = deployments.find(({ crew }) => crew === unit.id)?.arrival;
  if (arrival !== undefined && state.hour < arrival + dismountHours) return 'dismounting';
  const lines = defenses.filter(({ id }) => id === unit.id);
  if (lines.some(({ start, finish }) => state.hour >= start && state.hour < finish)) return 'building';
  if (lines.some(({ start }) => state.hour < start)) return 'deploying';
  return unit.status === 'building' ? 'mop-up' : unit.status;
}

export function loadRemaining(unit) {
  if (unit.id === 'T-162') return 0;
  const drop = dropById.get(unit.id);
  return drop ? Math.round(unit.capacity * (1 - dropProgress(drop, state.hour))) : unit.capacity;
}

export function telemetry(drone, seconds = state.seconds) {
  const t = seconds * .31 + drone.index * 1.7;
  const missionSeconds = Math.max(0, seconds - toReplaySeconds(events[0].time));
  const hour = seconds * replayRate;
  const { yaw } = dronePose(drone, hour);
  const heading = (Math.round(-yaw * 180 / Math.PI) + 360) % 360;
  return {
    alt: Math.round((drone.alt + Math.sin(t) * 95) / 10) * 10,
    speed: Math.round(drone.speed + Math.sin(t * .68) * 2),
    heading,
    battery: Math.max(5, drone.battery - Math.floor(missionSeconds / 37)),
    link: drone.link + Math.round(Math.sin(t * 1.13) * 2),
    flight: drone.flight === null ? null : drone.flight + Math.floor(missionSeconds),
    temp: missionTemperature(drone, hour),
  };
}

export function currentDetections() {
  return detections.filter(({ hour }) => state.hour >= hour).map((item) => {
    const { x, z } = missionTarget(drones.find(({ id }) => id === item.id), item.hour);
    return { ...item, at: [x, z] };
  }).reverse();
}

export function tick(dt) {
  if (!state.playing) return;
  state.hour = Math.min(hours, state.hour + dt * replayRate * state.speed);
  if (state.hour >= hours) state.playing = false;
}

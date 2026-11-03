import { clamp, dropped, hours, resources, sampleSeries } from './data.js';

export const replayRate = .84;
export const toReplaySeconds = (hour) => hour / replayRate;

export const deployments = [
  { truck: 'E-31', crew: 'R-31', travelSpeed: 32, entry: 4, arrival: 10, connector: [.94, 0], road: [.21, .205], turnout: [-35, 36] },
  { truck: 'E-32', crew: 'R-32', travelSpeed: 30, entry: 14, arrival: 22, road: [.02, .50], turnout: [-37, 6] },
  { truck: 'E-45', crew: 'R-45', travelSpeed: 34, entry: 29, arrival: 38, road: [.92, .71], turnout: [-52, -37] },
];

export const dismountHours = 1.2;

export const defenses = [
  { id: 'C-7', start: 6, finish: 24, approach: [[-21, 40], [-9, 40], [4, 38]], path: [[4, 38], [12, 34], [18, 27], [23, 20], [29, 13]], chains: 196 },
  { id: 'C-7', start: 28, finish: 48, approach: [[29, 13], [32, 11], [34, 7]], path: [[34, 7], [37, 1], [39, -6], [40, -13], [43, -19]], chains: 156 },
  { id: 'C-14', start: 8, finish: 36, approach: [[-39, 27], [-34, 27], [-30, 24]], path: [[-30, 24], [-28, 14], [-26, 5], [-23, -4], [-17, -12], [-12, -19]], chains: 321 },
  { id: 'DZ-4', start: 25, finish: 58, approach: [[54, -8], [49, -15], [46, -23]], path: [[46, -23], [46, -32], [44, -41], [40, -49], [34, -54], [26, -56]], chains: 438 },
  { id: 'R-31', start: 14, finish: 30, approach: [[-35, 36], [-29, 37], [-25, 35]], path: [[-25, 35], [-20, 38], [-13, 40], [-7, 41], [2, 40]], chains: 120 },
  { id: 'R-32', start: 27, finish: 47, approach: [[-37, 6], [-30, 5], [-25, 1]], path: [[-25, 1], [-23, -7], [-18, -15], [-12, -23], [-4, -30]], chains: 145 },
  { id: 'R-45', start: 44, finish: 64, approach: [[-52, -37], [-40, -35], [-26, -33], [-12, -34]], path: [[-12, -34], [-3, -37], [3, -44], [13, -49], [23, -54]], chains: 180 },
];

export const airDrops = [
  { id: 'H-743', substance: 'water', start: 27.5, finish: 31.5, path: [[-5, -16], [0, -19], [7, -23], [13, -27]], width: 1.75, altitude: 5.4 },
  { id: 'T-131', substance: 'retardant', start: 36, finish: 42, path: [[-5, 3], [1, 0], [9, -5], [16, -10], [24, -13]], width: 2.3, altitude: 8.6 },
  { id: 'H-531', substance: 'water', start: 49, finish: 53, path: [[22, -29], [25, -33], [29, -38], [33, -42]], width: 1.4, altitude: 5.1 },
].map((drop) => ({ ...drop, quantity: resources.find((unit) => unit.id === drop.id).capacity }));

export const dropById = new Map(airDrops.map((drop) => [drop.id, drop]));
export const progressAt = (hour, start, finish) => clamp((hour - start) / (finish - start));
export const dropProgress = (drop, hour) => progressAt(hour, drop.start, drop.finish);
export const lineProgress = (line, hour) => progressAt(hour, line.start, line.finish);
export const completedLine = (id, hour) => defenses.reduce((sum, line) =>
  sum + (!id || id === line.id ? Math.round(line.chains * lineProgress(line, hour)) : 0), 0);
export const retardantTotal = (hour) => Math.round(sampleSeries(dropped, hour / hours))
  + airDrops.reduce((sum, drop) => sum + (drop.substance === 'retardant' ? Math.round(drop.quantity * dropProgress(drop, hour)) : 0), 0);
export const waterTotal = (hour) => airDrops.reduce((sum, drop) =>
  sum + (drop.substance === 'water' ? Math.round(drop.quantity * dropProgress(drop, hour)) : 0), 0);

export function resourceActive(unit, hour) {
  const deployment = deployments.find(({ truck, crew }) => truck === unit.id || crew === unit.id);
  if (deployment) return hour >= (deployment.truck === unit.id ? deployment.entry : deployment.arrival);
  const firstLine = defenses.find(({ id }) => id === unit.id);
  if (firstLine) return hour >= firstLine.start - 3;
  return hour >= (unit.kind === 'air' ? 2.5 : 8);
}

export function onboard(unit, hour) {
  const deployment = deployments.find(({ truck }) => truck === unit.id);
  return deployment && hour >= deployment.arrival ? 1 : unit.personnel;
}

export function personnelTotal(hour) {
  return resources.reduce((sum, unit) => {
    const inTransit = deployments.some(({ truck, arrival }) => truck === unit.id && hour < arrival);
    return sum + (resourceActive(unit, hour) && !inTransit ? onboard(unit, hour) : 0);
  }, 0);
}

export const defenseTimeline = [0, ...defenses.flatMap(({ start, finish }) => [start, finish]), hours].sort((a, b) => a - b);
export const personnelTimeline = [...new Set([0, 2.5, 8, ...defenses.map(({ start }) => start - 3), ...deployments.flatMap(({ entry, arrival }) => [entry, arrival]), hours])].sort((a, b) => a - b);
export const retardantTimeline = [...new Set([...dropped.map(([p]) => p * hours), ...airDrops.filter(({ substance }) => substance === 'retardant').flatMap(({ start, finish }) => [start, finish])])].sort((a, b) => a - b);

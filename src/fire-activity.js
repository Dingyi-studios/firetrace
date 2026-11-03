import { clamp, containment, events, hours, totalAcres } from './data.js';
import { fireAt, mix, smooth } from './terrain.js';

const cells = [];
for (let z = -65; z <= 45; z += .7) {
  for (let x = -42; x <= 53; x += .7) {
    const cell = fireAt(x, z);
    if (cell.edge <= 0) cells.push({ x, z, ...cell });
  }
}
cells.sort((a, b) => a.arrival - b.arrival);

const hourTicks = [...Array.from({ length: hours }, (_, i) => i), containment, hours];
let burned = 0;
export const area = hourTicks.map((hour) => {
  while (burned < cells.length && cells[burned].arrival <= hour) burned++;
  return [hour / hours, Math.round(totalAcres * burned / cells.length)];
});
export const spread = area.map(([t], index) => {
  if (t * hours >= containment) return [t, 0];
  const [before, lower] = area[Math.max(0, index - 1)];
  const [after, upper] = area[Math.min(area.length - 1, index + 1)];
  // One acre is ten square chains. Track the change in equivalent burn radius.
  const speed = (Math.sqrt(upper * 10 / Math.PI) - Math.sqrt(lower * 10 / Math.PI)) / ((after - before) * hours);
  return [t, speed];
});

const origin = { x: events[0].at[0], z: events[0].at[1] };
const roles = ['overview', 'head', 'flank', 'thermal'];
const tracks = Object.fromEntries(roles.map((role) => [role, []]));
const sectorWeight = {
  overview: (cell) => 1 + .016 * Math.max(0, cell.along),
  head: (cell) => Math.exp((cell.along - 82) / 15),
  flank: (cell) => Math.exp(cell.across / 10),
  thermal: (cell) => Math.exp(-cell.across / 14),
};

for (let hour = 0; hour <= hours; hour++) {
  const active = cells.filter(({ arrival }) => Math.abs(arrival - hour) < 3.5);
  for (const role of roles) {
    const track = tracks[role];
    if (!active.length || hour === 0 || hour > containment) {
      track.push(track.at(-1) ?? origin);
      continue;
    }
    let x = 0, z = 0, weight = 0;
    for (const cell of active) {
      const w = (1 - Math.abs(cell.arrival - hour) / 3.5) * sectorWeight[role](cell);
      x += cell.x * w;
      z += cell.z * w;
      weight += w;
    }
    const center = { x: x / weight, z: z / weight };
    // Focus on a burning patch near the weighted center, rather than empty ground between fronts.
    const score = (cell) => (cell.x - center.x) ** 2 + (cell.z - center.z) ** 2
      + 2 * (cell.arrival - hour) ** 2;
    track.push(active.reduce((best, cell) => score(cell) < score(best) ? cell : best));
  }
}

export function fireTarget(role, hour) {
  const track = tracks[role];
  const time = clamp(hour, 0, hours);
  const i = Math.min(hours - 1, Math.floor(time));
  const a = track[i], b = track[i + 1];
  const weight = smooth(0, 1, time - i);
  return { x: mix(a.x, b.x, weight), z: mix(a.z, b.z, weight) };
}

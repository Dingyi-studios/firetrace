import { clamp, containment, hours } from './data.js';
import { combustion, denseFires, denseFuel } from './combustion.js';
import { fireAt, forest, mix, smooth } from './terrain.js';

export function heatAt(x, z, hour) {
  return combustion(hour, fireAt(x, z), forest(x, z), denseFuel(x, z));
}

const candidates = [];
for (let z = -62; z < 43; z += 1.4) for (let x = -38; x < 55; x += 1.4) {
  const signal = fireAt(x, z);
  if (signal.edge < .1) candidates.push({ x, z, signal, fuel: forest(x, z), core: denseFuel(x, z) });
}
const frontFrames = Array.from({ length: hours + 1 }, (_, hour) => {
  const ranked = candidates.filter(({ signal }) => Math.abs(signal.arrival - hour) < 2.5)
    .map((point) => ({ ...point, score: combustion(hour, point.signal, point.fuel, point.core).front }))
    .sort((a, b) => b.score - a.score);
  const first = ranked[0];
  return [first, ranked.find((point) => first && Math.hypot(point.x - first.x, point.z - first.z) > 12) ?? first];
});

export function hotspotsAt(hour) {
  if (hour <= .45 || hour >= containment) return [];
  const i = Math.min(hours - 1, Math.floor(clamp(hour, 0, hours))), t = smooth(0, 1, hour - i);
  const fronts = [0, 1].flatMap((index) => {
    const a = frontFrames[i][index], b = frontFrames[i + 1][index] ?? a;
    if (!a || !b) return [];
    const x = mix(a.x, b.x, t), z = mix(a.z, b.z, t), heat = heatAt(x, z, hour);
    return heat.front > .12 ? [{ id: `front-${index}`, name: index ? '活跃火线' : '快速扩张火线', kind: 'front', x, z, ...heat }] : [];
  });
  const dense = denseFires.map((zone, index) => {
    const x = zone.x + Math.sin(hour * .17 + index) * .55;
    const z = zone.z + Math.cos(hour * .13 + index) * .55;
    return { ...zone, x, z, kind: 'dense', ...heatAt(x, z, hour) };
  }).filter(({ dense }) => dense > .22);
  return [...dense, ...fronts];
}

export function denseTarget(index, hour) {
  const zone = denseFires[index];
  return { x: zone.x + Math.sin(hour * .17 + index) * .55,
    z: zone.z + Math.cos(hour * .13 + index) * .55, name: zone.name,
    status: heatAt(zone.x, zone.z, hour).temperature > 450 ? '持续追踪' : '密林监视' };
}

const localFrames = new Map();
export function nearbyHotspot(target, hour, id) {
  if (hour <= .45 || hour >= containment) return null;
  const frame = Math.floor(hour * 4);
  const find = (tick) => {
    const key = `${id}:${tick}`;
    if (localFrames.has(key)) return localFrames.get(key);
    let best = null, score = 0;
    for (const point of candidates) {
      const distance = (point.x - target.x) ** 2 + (point.z - target.z) ** 2;
      if (distance > 14 ** 2) continue;
      const value = combustion(tick / 4, point.signal, point.fuel, point.core).intensity - distance * .0005;
      if (value > score) { score = value; best = point; }
    }
    if (localFrames.size >= 512) localFrames.clear();
    localFrames.set(key, best);
    return best;
  };
  const a = find(frame), b = find(frame + 1) ?? a;
  if (!a || !b) return null;
  const t = smooth(0, 1, hour * 4 - frame), x = mix(a.x, b.x, t), z = mix(a.z, b.z, t);
  const heat = heatAt(x, z, hour);
  return heat.temperature < 400 ? null : { id: 'local', kind: 'front', name: '局部高温火点', x, z, ...heat };
}

export function localThermalCandidates(target, hour) {
  if (hour <= .45 || hour >= containment) return [];
  const ranked = [];
  for (const point of candidates) {
    if ((point.x - target.x) ** 2 + (point.z - target.z) ** 2 > 16 ** 2) continue;
    const heat = combustion(hour, point.signal, point.fuel, point.core);
    if (heat.temperature >= 450) ranked.push({ id: `patch-${point.x.toFixed(1)}-${point.z.toFixed(1)}`,
      name: '局部高温火点', kind: 'front', x: point.x, z: point.z, ...heat });
  }
  ranked.sort((a, b) => b.temperature - a.temperature);
  const separated = [];
  for (const point of ranked) {
    if (separated.every((other) => Math.hypot(point.x - other.x, point.z - other.z) > 2.5)) separated.push(point);
    if (separated.length === 24) break;
  }
  return separated;
}

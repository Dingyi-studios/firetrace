import { height } from './terrain.js';

export function terrainVisible(eye, target, lift = 1, sampleHeight = height) {
  const dx = target.x - eye.x, dz = target.z - eye.z;
  const steps = Math.max(2, Math.ceil(Math.hypot(dx, dz) / .2));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const terrainY = sampleHeight(eye.x + dx * t, eye.z + dz * t) * lift;
    if (terrainY > eye.y + (target.y - eye.y) * t + .015 * lift) return false;
  }
  return true;
}

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export class ThermalTracker {
  constructor() { this.reset(); }

  reset() {
    this.tracks = [];
    this.pending = new Map();
    this.nextDetection = 0;
    this.lastTime = null;
    this.lastHour = null;
    this.context = null;
    this.sequence = 0;
  }

  update({ now, hour, context, limit, candidates, visible, temperature }) {
    if (context !== this.context || (this.lastHour !== null && Math.abs(hour - this.lastHour) > 1.5)) {
      this.reset(); this.context = context;
    }
    const dt = this.lastTime === null ? 0 : Math.min(.15, Math.max(0, now - this.lastTime) / 1000);
    this.lastTime = now;
    this.lastHour = hour;
    // Occlusion always wins over a lock or a fade: never retain a hidden marker.
    this.tracks = this.tracks.filter((track) => visible(track) && temperature(track) >= 380);

    if (now >= this.nextDetection) {
      this.nextDetection = now + 300;
      const detected = candidates().filter(visible).sort((a, b) => b.temperature - a.temperature);
      const ranked = [];
      for (const point of detected) if (ranked.every((other) => distance(point, other) > 3)) ranked.push(point);
      for (const track of this.tracks) {
        const match = ranked.find((point) => point.id === track.sourceId && distance(point, track) <= 4);
        if (match) { track.targetX = match.x; track.targetZ = match.z; }
      }
      for (const point of ranked) {
        if (this.tracks.some((track) => distance(point, track) < 3)) continue;
        const weakest = this.tracks.reduce((best, track) => !best || track.temperature < best.temperature ? track : best, null);
        const same = this.tracks.find((track) => track.sourceId === point.id && distance(point, track) > 4);
        const replacement = same ?? weakest;
        const room = this.tracks.length < limit;
        const stronger = replacement && point.temperature > replacement.temperature + Math.max(100, replacement.temperature * .12);
        const relocated = same && point.temperature >= same.temperature * .9;
        if (!room && (!(stronger || relocated) || now - replacement.lockedAt < 1600)) continue;
        let pending = this.pending.get(point.id);
        if (!pending || distance(point, pending) > 3) pending = { ...point, since: now };
        Object.assign(pending, point, { seenAt: now });
        this.pending.set(point.id, pending);
        if (now - pending.since < (room ? 650 : 1200)) continue;
        if (!room) this.tracks = this.tracks.filter((track) => track !== replacement);
        this.tracks.push({ ...point, id: `lock-${this.sequence++}`, sourceId: point.id,
          targetX: point.x, targetZ: point.z, lockedAt: now });
        this.pending.delete(point.id);
      }
      for (const [id, point] of this.pending) {
        if (now - point.seenAt > 400 || this.tracks.some((track) => distance(point, track) < 3)) this.pending.delete(id);
      }
    }

    for (const track of this.tracks) {
      const dx = track.targetX - track.x, dz = track.targetZ - track.z, length = Math.hypot(dx, dz);
      const amount = length ? Math.min(1 - Math.exp(-dt / .95), 2 * dt / length) : 0;
      track.x += dx * amount; track.z += dz * amount;
      const actual = temperature(track);
      const change = (actual - track.temperature) * (1 - Math.exp(-dt / 1.3));
      track.temperature += Math.max(-120 * dt, Math.min(120 * dt, change));
    }
    this.tracks = this.tracks.filter(visible).slice(0, limit);
    return this.tracks;
  }

  needsFrames(now) {
    return this.pending.size > 0 || this.tracks.some((track) =>
      Math.hypot(track.targetX - track.x, track.targetZ - track.z) > .025 || now - track.lockedAt < 1100);
  }
}

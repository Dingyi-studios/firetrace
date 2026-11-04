const tau = Math.PI * 2;
const positiveAngle = (angle) => ((angle % tau) + tau) % tau;

// Join two oriented positions with tangent circles and their common tangent.
// Sampling by distance gives a fixed cruise speed and a bounded turning radius.
export function flightLeg(from, to, fromHeading, toHeading, radius) {
  const candidates = [-1, 1].map((turn) => {
    const center = (point, heading) => ({ x: point.x - Math.sin(heading) * turn * radius,
      z: point.z + Math.cos(heading) * turn * radius });
    const first = center(from, fromHeading), last = center(to, toHeading);
    const heading = Math.atan2(last.z - first.z, last.x - first.x);
    const entry = positiveAngle(turn * (heading - fromHeading)) * radius;
    const straight = Math.hypot(last.x - first.x, last.z - first.z);
    const exit = positiveAngle(turn * (toHeading - heading)) * radius;
    const arc = (origin, bearing) => ({ x: origin.x + Math.sin(bearing) * turn * radius,
      z: origin.z - Math.cos(bearing) * turn * radius });
    const tangent = arc(first, heading);
    return { length: entry + straight + exit, pointAt(distance) {
      if (distance < entry) return arc(first, fromHeading + turn * distance / radius);
      if (distance < entry + straight) return { x: tangent.x + Math.cos(heading) * (distance - entry),
        z: tangent.z + Math.sin(heading) * (distance - entry) };
      return arc(last, heading + turn * (distance - entry - straight) / radius);
    } };
  });
  return candidates.reduce((best, candidate) => candidate.length < best.length ? candidate : best);
}

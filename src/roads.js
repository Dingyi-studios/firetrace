import { SplineCurve, Vector2 } from 'three';

export const roadCurve = (points) => new SplineCurve(points.map(([x, z]) => new Vector2(x, z)));

export const roadPath = roadCurve([
  [-69, 78], [-61, 57], [-43, 46], [-37, 36], [-44, 28], [-50, 22], [-47, 13], [-39, 6],
  [-40, -6], [-51, -18], [-55, -37], [-44, -51], [-33, -66], [-26, -83], [-19, -96],
]);

const southJunction = roadPath.getPoint(.21);
export const oakRoad = roadCurve([[southJunction.x, southJunction.y], [-29, 36], [-15, 43], [3, 47],
  [21, 40], [38, 34], [54, 27], [62, 17], [67, 8]]);
export const pavedRoads = [{ curve: roadPath, width: 1.84 }, { curve: oakRoad, width: 1.48 }];

export const villages = [
  { name: '南溪村', curve: roadPath, t: .155, houses: 11 },
  { name: '峡谷溪村', curve: roadPath, t: .444, houses: 13 },
  { name: '北岭村', curve: roadPath, t: .692, houses: 10 },
  { name: '橡树坪村', curve: oakRoad, t: .742, houses: 12 },
].map((village) => ({ ...village, at: village.curve.getPoint(village.t).toArray() }));

export function roadPoint(curve, t, lateral = 0) {
  const point = curve.getPoint(t);
  if (!lateral) return point;
  const tangent = curve.getTangent(t);
  point.x -= tangent.y * lateral;
  point.y += tangent.x * lateral;
  return point;
}

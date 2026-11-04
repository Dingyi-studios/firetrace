import { clamp, containment, events } from './data.js';

export const denseFires = [
  { id: 'forest-west', name: '西坡密林大火', x: -15, z: 7, radius: 5.2 },
  { id: 'forest-north', name: '北坡密林大火', x: 19, z: -30, radius: 5.8 },
];
export const denseFuel = (x, z) => Math.max(...denseFires.map((zone) =>
  Math.exp(-((x - zone.x) ** 2 + (z - zone.z) ** 2) / (zone.radius ** 2 * .65))));
const smooth = (a, b, value) => { const t = clamp((value - a) / (b - a)); return t * t * (3 - 2 * t); };

export function combustion(hour, signal, fuel, core) {
  const age = hour - signal.arrival;
  const burning = (1 - smooth(89, containment, hour)) * (hour >= events[0].time ? 1 : 0);
  const inside = 1 - smooth(-.3, .85, signal.edge);
  const front = Math.exp(-Math.abs(age) * .67) * inside;
  const perimeter = Math.exp(-Math.abs(signal.edge) * 1.26) * smooth(-.7, .65, age) * (.66 - .57 * smooth(4, 30, age));
  const residual = smooth(1.5, 4, age) * Math.exp(-Math.max(0, age - 4) / 24) * inside * (.035 + .12 * smooth(.48, .73, fuel));
  const dense = core * inside * smooth(.2, 3, age) * (.88 + fuel * .25);
  const spot = Math.exp(-(signal.spot ** 2) * .95) * smooth(13.2, 14, hour) * (1 - smooth(16, 23, hour));
  const intensity = (Math.max(front * (.38 + .62 * signal.rate), perimeter, dense) + residual) * burning + spot;
  return { intensity, temperature: Math.round(32 + 1140 * clamp(intensity / 1.2)), front: front * signal.rate * burning, dense: dense * burning };
}

export const combustionGLSL = `
  float fireIntensity(float hour,float edge,float arrival,float spotDistance,float rate,float fuel,float core){
    float burning=(1.0-smoothstep(89.0,${containment.toFixed(4)},hour))*step(${events[0].time.toFixed(4)},hour);
    float age=hour-arrival;
    float inside=1.0-smoothstep(-.3,.85,edge);
    float front=exp(-abs(age)*.67)*inside*(.38+.62*rate);
    float perimeter=exp(-abs(edge)*1.26)*smoothstep(-.7,.65,age)*mix(.66,.09,smoothstep(4.0,30.0,age));
    float residual=smoothstep(1.5,4.0,age)*exp(-max(0.0,age-4.0)/24.0)*inside*(.035+.12*smoothstep(.48,.73,fuel));
    float dense=core*inside*smoothstep(.2,3.0,age)*(.88+fuel*.25);
    float spot=exp(-spotDistance*spotDistance*.95)*smoothstep(13.2,14.0,hour)*(1.0-smoothstep(16.0,23.0,hour));
    return (max(max(front,perimeter),dense)+residual)*burning+spot;
  }
`;

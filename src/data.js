export const start = Date.UTC(2024, 7, 14, 14);
export const hours = 94;
export const initialTime = 26;
export const containment = 93 + 20 / 60;
export const fmt = new Intl.NumberFormat('zh-CN');
export const incidentName = '岭景山火';
export const incidentLocation = '加州圣盖博山脉';
export const tabLabels = { Layers: '图层', Analysis: '分析', Evidence: '证据', Notes: '备注' };
export const paletteLabels = { Ironbow: '铁虹', 'White hot': '白热' };
export const substanceLabels = { retardant: '阻燃剂', water: '水' };
export const resourceStatusLabels = {
  inbound: '飞往火场', final: '进入投放航线', dropping: '投放中', reload: '返航补给',
  'to-drop': '待投放', supervising: '空中协调中', protecting: '建筑防护中',
  enroute: '增援途中', staged: '已抵达集结点', building: '开辟防火线', dismounting: '下车集结', deploying: '步行前往火线', standby: '待出动',
  patrol: '巡逻中', 'supply-e31': '前往支援 E-31', 'mop-up': '固守与清理余火',
};
export const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
export const clock = (hour, date = true) => {
  const stamp = new Date(start + Math.round(hour * 60) * 60_000);
  const time = stamp.toISOString().slice(11, 16);
  return date ? `${stamp.getUTCMonth() + 1}月${stamp.getUTCDate()}日 ${time}` : time;
};
export const elapsed = (seconds) => [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, Math.floor(seconds) % 60].map((n, i) => i ? String(n).padStart(2, '0') : n).join(':');

export const events = [
  { name: '起火（估计）', time: 26 / 60, icon: '●', color: '#a83127', at: [-13, 26] },
  { name: '火势迅速扩大', time: 2 + 50 / 60, icon: '♨', color: '#cb552e', at: [-4, 16] },
  { name: '疑似飞火', time: 13.2, icon: '▲', color: '#ab7445', at: [18, 8] },
  { name: '火势越过山脊', time: 27.8, icon: '⧗', color: '#696b5d', at: [30, -31] },
  { name: '火势受控（估计）', time: containment, icon: '■', color: '#6e8790', at: [36, -47] },
];

export const landmarks = [
  { name: '松岭', note: '2,430 米', at: [-63, -19], peak: true },
  { name: '银木水库', note: '', at: [4, -76] },
  { name: '台地峰', note: '1,892 米', at: [60, -27], peak: true },
  { name: '峡谷溪', note: '', at: [-44, 6] },
  { name: '橡树坪', note: '1,120 米', at: [54, 27], peak: true },
];
export const pathNodes = [
  { name: '起火', note: clock(events[0].time), time: events[0].time, at: events[0].at },
  { name: clock(4), time: 4, at: [5, 9] },
  { name: clock(10), time: 10, at: [14, -7] },
  { name: clock(16), time: 16, at: [23, -23] },
  { name: clock(22), time: 22, at: [29, -36] },
];
export const layers = [
  ['terrain', '三维地形', true, 100],
  ['aerial', '航空影像', true, 100],
  ['scar', '烧毁迹地', true, 90],
  ['spread', '模拟火势蔓延', true, 100],
  ['probability', '起火概率', true, 80],
  ['wind', '风向与风速', false, 70],
  ['suppression', '灭火投放与防火线', true],
  ['structures', '建筑物', false],
  ['roads', '道路与步道', false],
  ['boundary', '行政边界', false],
].map(([id, name, on, opacity]) => ({ id, name, on, opacity }));

export const overview = [
  ['事件名称', incidentName],
  ['事件编号', 'CA-LAC-2024-0176'],
  ['地点', incidentLocation],
  ['起火时间（估计）', `2024年${clock(events[0].time)}`],
  ['结束时间', `2024年${clock(containment)}`],
  ['过火面积', '12,480 英亩'],
  ['初步起因', '调查中'],
  ['分析状态', '进行中', true],
];

const airframeLabels = { vtol: '垂直起降固定翼', heavy: '重载四旋翼', quad: '四旋翼', wing: '固定翼' };

export const drones = [
  ['FT-01', '红隼', 'vtol', '火场边界测绘', '测绘中', '沿当前火线飞行，每圈更新火场边界', '可见光／红外 · 30 倍变焦', 2080, 56, 63, 77, -73, 3004, [7, -2], [12, -7], -68, 42],
  ['FT-02', '鹞鹰', 'heavy', '火头监视', '盘旋 · 活跃火线', '在火头最活跃的区域上空盘旋', '测温红外', 700, 22, 245, 73, -72, 1411, [21, -17], [15, -10], -45, 48],
  ['FT-03', '雨燕', 'quad', '侧翼及飞火监视', '盘旋 · 飞火点', '监视火场侧翼，并在下一处活跃飞火点上空盘旋', '可见光／红外', 640, 18, 145, 77, -72, 1173, [28, 3], [18, 8], -50, 47],
  ['FT-04', '鱼鹰', 'quad', '建筑防护', '巡逻中', '巡查橡树坪和东岔溪一带的建筑', '可见光／红外 · 探照灯', 1260, 20, 211, 83, -68, 2495, [48, 19], [54, 27], -37, 50],
  ['FT-05', '秃鹰', 'wing', '热点巡查', '巡查中', '沿平行航线扫描烧毁区域', '垂直向下红外测绘', 1860, 46, 39, 69, -65, 1497, [-4, 1], [-3, 4], -88, 49],
  ['FT-06', '鹪鹩', 'quad', '通信中继', '中继中', '为峡谷溪作业队提供通信中继', '可见光 · 无线自组网', 790, 65, 95, 69, -63, null, [-35, 23], [-12, 12], -29, 52],
].map(([id, name, airframe, mission, status, task, sensor, alt, speed, heading, battery, link, flight, at, target, pitch, fov], index) =>
  ({ id, name, type: airframeLabels[airframe], fixedWing: airframe === 'vtol' || airframe === 'wing', mission, status, task, sensor, alt, speed, heading, battery, link, flight, at, target, pitch, fov, index, kind: 'drone' }));

export const resources = [
  ['T-910', 'DC-10 超大型灭火飞机', 'air', 'inbound', '加州林业与消防局（专用）', '进入投放航线 · 引导机领航', 300, 1640, 160, 9400, 0, '', [6, -67]],
  ['T-131', 'C-130Q 灭火飞机', 'air', 'final', '加州林业与消防局', '进入投放航线 · 准备投放', 210, 980, 89, 4000, 0, 'C', [-3, -2]],
  ['T-162', 'RJ85 灭火飞机', 'air', 'reload', '美国林务局（合同）', '返航补给', 290, 1640, 314, 3000, 0, '', [23, -59]],
  ['H-743', 'S-64 重型直升机', 'air', 'to-drop', '加州林业与消防局', '洒水灭火 · 银木水库', 95, 820, 132, 2650, 0, '', [5, -49]],
  ['H-531', '贝尔 205 · 吊桶', 'air', 'to-drop', '美国林务局', '洒水灭火 · 峡谷溪', 82, 540, 214, 324, 0, '', [-15, -55]],
  ['AA-52', '空中国王 200 · 空中指挥', 'air', 'supervising', '美国林务局', '协调空中灭火行动', 175, 3100, 125, 0, 2, '', [44, -62]],
  ['E-31', '三级消防车', 'engine', 'protecting', '加州林业与消防局', '运送首批增援队 · 橡树坪村至南侧火场', 0, 0, 78, 0, 4, 'Z', [54, 27]],
  ['E-32', '三级消防车', 'engine', 'protecting', '加州林业与消防局', '运送第二批增援队 · 南溪村至西侧火场', 0, 0, 42, 0, 5, 'Z', [39, 10]],
  ['E-45', '一级消防车', 'engine', 'patrol', '洛杉矶县消防局', '经北岭村运送第三批增援队 · 到达后巡逻', 8, 0, 194, 0, 4, 'A', [-42, 17]],
  ['WT-12', '供水车', 'engine', 'supply-e31', '加州林业与消防局', '为 E-31 供水', 14, 0, 42, 2500, 0, 'Z', [-38, 34]],
  ['C-7', '第 7 野火突击队', 'crew', 'mop-up', '美国林务局跨部门野火突击队', '固守与清理余火', 0, 0, 74, 352, 20, 'Z', [25, -6]],
  ['C-14', '第 14 地面消防队', 'crew', 'mop-up', '加州林业与消防局', '固守与清理余火', 0, 0, 45, 321, 17, 'A', [-12, -25]],
  ['DZ-4', 'D6 推土机', 'crew', 'mop-up', '加州林业与消防局', '固守与清理余火', 1, 0, 19, 438, 0, 'C', [39, -41]],
  ['R-31', '首批增援队', 'crew', 'building', '加州林业与消防局', '由 E-31 运送 · 南侧防火线', 2, 0, 70, 120, 3, 'A', [-35, 36]],
  ['R-32', '第二批增援队', 'crew', 'building', '加州林业与消防局', '由 E-32 运送 · 西侧防火线', 2, 0, 50, 145, 4, 'C', [-37, 6]],
  ['R-45', '第三批增援队', 'crew', 'building', '洛杉矶县消防局', '由 E-45 运送 · 北侧防火线', 2, 0, 55, 180, 3, 'Z', [-52, -37]],
].map(([id, name, kind, status, agency, task, speed, alt, heading, capacity, personnel, division, at], index) =>
  ({ id, name, kind, status, agency, task, speed, alt, heading, capacity, personnel, division, at, index }));

export const detections = [
  { id: 'FT-01', temp: 963, at: [11, -4], hour: 7 },
  { id: 'FT-02', temp: 983, at: [15, -10], hour: 12 },
  { id: 'FT-01', temp: 980, at: [13, -4], hour: 19 },
  { id: 'FT-01', temp: 655, at: [18, 8], hour: 30 },
];

export function sampleSeries(points, x) {
  const next = points.findIndex(([at]) => at >= x);
  if (next === -1) return points.at(-1)[1];
  if (!next) return points[0][1];
  const [left, a] = points[next - 1];
  const [right, b] = points[next];
  return a + (b - a) * ((x - left) / (right - left));
}

export const area = [[0, 0], [.05, 180], [.11, 2350], [.19, 4200], [.27, 7020], [.37, 8250], [.48, 8650], [.64, 10800], [.77, 11500], [.88, 12300], [1, 12480]];
export const spread = [[0, 0], [.07, 0], [.077, 32], [.1, 28], [.14, 12], [.19, 7], [.23, 8], [.29, 34], [.32, 23], [.36, 12], [.41, 6], [.46, 9], [.53, 31], [.58, 10], [.65, 6], [.7, 7], [.75, 26], [.77, 18], [.785, 23], [.81, 12], [.87, 5], [.91, 8], [.95, 4], [1, 0]];
export const profile = [[0, 1140], [.05, 1220], [.09, 1110], [.13, 1180], [.18, 1070], [.23, 1270], [.27, 1190], [.32, 1410], [.36, 1370], [.42, 1570], [.46, 1770], [.51, 1660], [.57, 1630], [.62, 1540], [.66, 1720], [.71, 1740], [.76, 1800], [.8, 1750], [.85, 1870], [.9, 1820], [.95, 1950], [1, 2070]];
export const dropped = [[0, 0], [.12, 0], [.16, 38000], [.29, 45000], [.37, 98000], [.48, 123000], [.53, 144000], [.6, 145000], [.64, 210000], [.7, 222000], [.73, 219000], [.81, 271000], [.85, 304000], [1, 312000]];

export const compass = (degrees) => ['北', '北东北', '东北', '东东北', '东', '东东南', '东南', '南东南', '南', '南西南', '西南', '西西南', '西', '西西北', '西北', '北西北'][Math.round(degrees / 22.5) % 16];
export function coordinates(x, z) {
  const lat = 19 - z * .060;
  const lon = 56.7 - x * .068;
  return `北纬 34°${lat.toFixed(2)}′ · 西经 117°${lon.toFixed(2)}′`;
}

export function weather(hour, ground = null) {
  const end = hour >= containment;
  const night = Math.cos((hour - 26) / 24 * Math.PI * 2) * .5 + .5;
  const wind = end ? 15 : Math.round(9 + 7 * night + Math.sin(hour / 4) * 1.5);
  const degrees = end ? 253 : Math.round(266 + 8 * night);
  return [
    ['wind', '风速', `${wind} 英里/时`, `${compass(degrees)} (${degrees}°)`],
    ['thermometer', '气温', `${end ? 21 : Math.round(17 + 17 * night - (ground ? Math.max(0, ground.elev - 1168) / 550 : 0))} ℃`],
    ['droplet', '相对湿度', `${end ? 51 : Math.round(47 - 36 * night)}%`],
    ['leaf', '可燃物湿度', `${end ? 8 : Math.round(8 - 5 * night)}%`],
    ['flame', '能量释放分量', end ? '58' : String(Math.round(82 + 2 * night))],
    ['flame', '火焰长度', end ? '已熄灭' : hour < events[0].time ? '—' : night > .55 ? '12–19 英尺' : '5–8 英尺'],
  ];
}

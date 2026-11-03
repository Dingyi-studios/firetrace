import { area, fmt, hours, profile, sampleSeries, spread } from './data.js';
import { state, telemetry } from './state.js';
import { completedLine, defenseTimeline, personnelTimeline, personnelTotal, retardantTimeline, retardantTotal } from './operations.js';
import { icon } from './icons.js';

function chart({ title, points, max, min = 0, color, fill = color, live = false, ticks, extras = [], value, index, lineOnly = false }) {
  const t = live ? 1 : state.hour / hours;
  const left = 49, width = 338, top = 6, bottom = 78, height = bottom - top;
  const x = (p) => left + p * width;
  const y = (n) => bottom - (n - min) / (max - min) * height;
  const line = (series) => series.map(([p, n], i) => `${i ? 'L' : 'M'}${x(p).toFixed(2)},${y(n).toFixed(2)}`).join(' ');
  const full = line(points);
  const area = `${full} L${left + width},${bottom} L${x(points[0][0])},${bottom} Z`;
  const current = sampleSeries(points, t);
  const labels = ticks ?? (live ? ['−60 秒', '', '', '', '现在'] : ['8月14日', '8月15日', '8月16日', '8月17日', '8月18日']);
  const levels = Array.from({ length: max === 15000 ? 4 : 3 }, (_, i) => i);
  const lines = levels.map((_, i) => {
    const level = min + (max - min) * (1 - i / (levels.length - 1));
    return `<path d="M${left},${y(level)}h${width}" class="chart-grid"/><text x="41" y="${y(level) + 3}" text-anchor="end">${fmt.format(Math.round(level))}</text>`;
  }).join('');
  const tickLabels = labels.map((label, i) => `<text x="${x(i / (labels.length - 1))}" y="94" text-anchor="${i === labels.length - 1 ? 'end' : i === 0 ? 'start' : 'middle'}">${label}</text>`).join('');
  return `<div class="chart" data-chart="${index}">
    <header>${title}<span>${value ?? icon('more')}</span></header>
    <svg viewBox="0 0 398 98" preserveAspectRatio="none" role="img" aria-label="${title}">
      <defs>
        <linearGradient id="fill-${index}" x2="0" y2="1">
          <stop stop-color="${fill}" stop-opacity=".49"/><stop offset="1" stop-color="${fill}" stop-opacity=".17"/>
        </linearGradient>
        <clipPath id="past-${index}"><rect x="${left}" y="0" width="${width * t + .8}" height="${bottom + 1}"/></clipPath>
      </defs>
      ${lines}<path class="chart-axis" d="M${left},${top}V${bottom}H${left + width}"/>
      ${lineOnly ? '' : `<path d="${area}" fill="${fill}" opacity=".12"/>`}
      <path d="${full}" stroke="${color}" stroke-opacity=".27" stroke-dasharray="2.5 2.4" fill="none"/>
      ${extras.map((series) => `<path d="${line(series)}" stroke="#777764" stroke-opacity=".34" fill="none"/>`).join('')}
      <g clip-path="url(#past-${index})">
        ${lineOnly ? '' : `<path d="${area}" fill="url(#fill-${index})"/>`}
        <path d="${full}" stroke="${color}" stroke-width="1.4" fill="none"/>
      </g>
      ${live ? '' : `<path d="M${x(t)},${top}V${bottom}" stroke="#3d3c32" stroke-width=".9"/>
        <circle cx="${x(t)}" cy="${top}" r="3.2" class="chart-point"/><circle cx="${x(t)}" cy="${bottom}" r="3.2" class="chart-point"/>`}
      <circle cx="${x(t)}" cy="${y(current)}" r="${live ? 2.9 : 3.6}" fill="${live || index === 2 && state.workspace === 'Incident' ? '#ba4b37' : '#e7e1d1'}" stroke="${color}"/>
      ${tickLabels}
    </svg>
  </div>`;
}

export function renderCharts(drones) {
  let list;
  if (state.workspace === 'Incident') {
    list = [
      { title: '过火面积（英亩）', points: area, max: 15000, color: '#b36d4c', fill: '#cc8159' },
      { title: '蔓延速度（链/时）', points: spread, max: 40, color: '#ad4e41', fill: '#bb7767' },
      { title: '所选路径高程剖面', points: profile, max: 2100, min: 900, color: '#555945', fill: '#707d50', ticks: ['0', '5', '10', '15 千米'] },
    ];
  } else if (state.workspace === 'Resources') {
    const totals = retardantTimeline.map((hour) => [hour / hours, retardantTotal(hour)]);
    const lineBuilt = defenseTimeline.map((hour) => [hour / hours, completedLine(null, hour)]);
    const personnel = personnelTimeline.flatMap((hour) => [
      [hour / hours, personnelTotal(hour - .001)],
      [hour / hours, personnelTotal(hour)],
    ]);
    list = [
      { title: '累计阻燃剂投放（加仑）', points: totals, max: 500000, color: '#aa423d', fill: '#b1514b' },
      { title: '已建防火线（链）', points: lineBuilt, max: 2000, color: '#454638', fill: '#757660' },
      { title: '投入人数', points: personnel, max: 100, color: '#505844', fill: '#637747' },
    ];
  } else {
    const drone = state.selected ?? drones[0];
    const reading = telemetry(drone);
    const trend = (unit, field) => Array.from({ length: 31 }, (_, i) => {
      const t = state.seconds - 60 + i * 2;
      return [i / 30, telemetry(unit, t)[field]];
    }).filter(([p]) => state.seconds - 60 + 60 * p >= 0 || p === 1);
    list = [
      { title: '离地高度（英尺）', points: trend(drone, 'alt'), max: 2400, color: '#b85543', value: `${drone.id} · ${fmt.format(reading.alt)} 英尺`, extras: drones.filter((d) => d !== drone).map((d) => trend(d, 'alt')) },
      { title: '画面最高温度（℃）', points: trend(drone, 'temp'), max: 1000, color: '#ae4437', value: `${reading.temp} ℃` },
      { title: '电量（%）', points: trend(drone, 'battery'), max: 100, color: '#a75a45', value: `${drone.id} · ${reading.battery}%` },
    ].map((item) => ({ ...item, live: true }));
  }
  return list.map((item, index) => chart({ ...item, index })).join('');
}

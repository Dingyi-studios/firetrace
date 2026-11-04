import { clock, clamp, containment, compass, coordinates, elapsed, events, fmt, incidentName, layers, overview, paletteLabels, resourceStatusLabels, substanceLabels, tabLabels, weather } from './data.js';
import { currentDetections, loadRemaining, resourceStatus, state, telemetry } from './state.js';
import { icon, unitIcon } from './icons.js';
import { place } from './objects.js';
import { missionTarget } from './missions.js';
import { height } from './terrain.js';
import { airDrops, airOperation, dropOccurrences, completedLine, defenses, deployments, dismountHours, dropById, onboard, personnelTotal, resourceActive, retardantTotal, waterTotal } from './operations.js';

const live = () => `<span class="live"><i></i> ${state.playing ? '回放中' : '已暂停'}</span>`;
const controls = (entries) => entries.map(([label, command, value, active]) =>
  `<button data-cmd="${command}" data-value="${value}" class="${active ? 'active' : ''}">${label}</button>`).join('');
const detail = (rows) => `<dl class="details">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
const panelTitle = (name, extra = '') => `<h2 class="panel-title">${name}<span>${extra}</span></h2>`;
const stats = (values) => `<div class="stats">${values.map(([label, value, unit]) => `<div><small>${label}</small><strong>${value}</strong><small>${unit ?? ''}</small></div>`).join('')}</div>`;
const statusClass = (status) => ['final', 'dropping'].includes(status) ? 'red' : ['to-drop', 'reload', 'inbound', 'enroute', 'standby'].includes(status) ? 'amber' : 'green';
const position = (unit) => {
  const { x, z } = place(unit, state.hour);
  return coordinates(x, z);
};
function resourceReadout(unit, status) {
  const pose = place(unit, state.hour);
  const heading = (Math.round(-pose.yaw * 180 / Math.PI) + 360) % 360;
  const headingText = `${String(heading).padStart(3, '0')}°`;
  let speed = unit.speed;
  if (['standby', 'staged', 'taking-water', 'reloading'].includes(status)) speed = 0;
  else if (status === 'enroute') speed = deployments.find(({ truck }) => truck === unit.id).travelSpeed;
  else if (unit.kind === 'crew') speed = pose.walking ? unit.speed || 2 : 0;
  return { speed, headingText, direction: compass(heading), position: coordinates(pose.x, pose.z) };
}

export function incidentPanel() {
  const layerRows = layers.map(({ id, name }) => {
    const layer = state.layers[id];
    return `<div class="layer-row ${layer.on ? '' : 'off'}">
      <input type="checkbox" data-layer="${id}" aria-label="${name}" ${layer.on ? 'checked' : ''}>
      <span class="swatch ${id}" aria-hidden="true"></span><span class="layer-name">${name}</span>
      ${layer.opacity === undefined ? '' : `<label class="opacity"><input type="range" min="0" max="100" value="${layer.opacity}" data-opacity="${id}" aria-label="${name}不透明度"><output>${layer.opacity}%</output></label>`}
    </div>`;
  }).join('');
  const tabs = Object.entries(tabLabels);
  const body = state.tab === 'Layers' ? layerRows
    : state.tab === 'Analysis' ? `<div class="reference-note">火势演变 · ${incidentName}<br><small>使用地图下方的时间轴回放火情，并查看联动图表。</small></div>`
      : `<div class="reference-note">演示中暂无${tabLabels[state.tab]}。</div>`;
  return `<section class="panel layer-panel">
    <nav class="side-tabs" aria-label="事件面板">${tabs.map(([tab, label]) => `<button data-cmd="tab" data-value="${tab}" class="${state.tab === tab ? 'selected' : ''}">${label}</button>`).join('')}</nav>
    <div class="layer-list">${body}</div>
  </section>
  <section class="panel">
    ${panelTitle('事件概览', '<button disabled title="演示入口">编辑</button>')}
    ${detail(overview.map(([k, v, status]) => [k, status ? `<span class="status-dot"></span> ${v}` : v]))}
  </section>
  <section class="panel">
    ${panelTitle('气象与火行为', '<small id="weather-context"></small>' + icon('more'))}
    <div id="weather-content"></div>
  </section>`;
}

export function weatherPanel() {
  return weather(state.hour, state.hover).map(([symbol, label, value, sub]) =>
    `<div>${icon(symbol)}<span><small>${label}</small><strong>${value}</strong>${sub ? `<em>${sub}</em>` : ''}</span></div>`).join('');
}

export function dronePanel(drones) {
  const list = drones.map((unit) => {
    const data = telemetry(unit);
    const { status } = missionTarget(unit, state.hour);
    return `<button class="unit-row drone-row ${state.selected === unit ? 'selected' : ''}" data-cmd="select" data-value="${unit.id}">
      <span class="unit-icon">${icon(unitIcon(unit))}</span>
      <span class="unit-name"><span><b>${unit.id}</b> ${unit.name}</span><small>${unit.mission}</small></span>
      <span class="unit-state"><b>${status}</b><small>${fmt.format(data.alt)} 英尺</small></span>
      <span class="unit-number"><i class="battery-bar"><i style="width:${data.battery}%"></i></i><small>${data.battery}%</small></span>
    </button>`;
  }).join('');
  const d = state.selected;
  const data = d ? telemetry(d) : null;
  const target = d ? missionTarget(d, state.hour) : null;
  const info = d ? `<section class="panel unit-detail">
    ${panelTitle(`${d.id} <em>${d.name}</em>`, `<span class="green-tag">${target.status}</span>`)}
    ${stats([['高度', fmt.format(data.alt), '英尺（离地）'], ['地速', data.speed, '节'], ['航向', `${String(data.heading).padStart(3, '0')}°`, compass(data.heading)], ['电量', `${data.battery}%`, `~${Math.round(data.battery * .88)} 分钟续航`], ['信号强度', data.link, '分贝毫瓦'], ['飞行时长', data.flight === null ? '循环' : elapsed(data.flight), '']])}
    ${detail([['机型', d.type], ['任务类型', d.mission], ['当前目标', target.name], ['传感器', d.sensor], ['位置', position(d)], ['倍率', `${state.zoom.toFixed(1)}×`]])}
    <div class="panel-actions">${controls([
      [icon('diagonal') + (state.feed === 'full' ? '返回画中画' : '展开相机画面'), 'feed', state.feed === 'full' ? 'pip' : 'full', true],
      ['热成像', 'thermal', '', state.sensor === 'IR'],
      [state.camera === 'overview' ? '跟随无人机' : '全局视角', 'camera', state.camera === 'overview' ? 'chase' : 'overview'],
    ])}</div>
  </section>` : `<section class="panel"><h2 class="panel-title">机队概览</h2>
    ${stats([['在空架数', `${drones.length} / ${drones.length}`], ['平均电量', Math.round(drones.reduce((total, d) => total + telemetry(d).battery, 0) / drones.length) + '%'], ['发现热点', currentDetections().length], ['最弱信号', Math.min(...drones.map((d) => telemetry(d).link)), '分贝毫瓦']])}
    <p class="operations">${icon('drone')}<span>四架追踪火线，两架轮巡村落，两架持续监视密林大火，一架从高空观察整个火场。</span></p>
  </section>`;
  return `<section class="panel">
    ${panelTitle(`无人机队 <em>· ${drones.length} 架在空</em>`, live())}
    <div class="unit-list">${list}</div>
  </section>${info}`;
}

export function resourcePanel(units) {
  const groups = [['air', '航空器'], ['engine', '消防车与供水车'], ['crew', '地面消防队与推土机']];
  const active = units.filter((unit) => resourceActive(unit, state.hour));
  const list = groups.map(([kind, title]) => {
    const group = active.filter((unit) => unit.kind === kind);
    if (!group.length) return '';
    return `<h3>${title}</h3>${group.map((unit) => {
      const status = resourceStatus(unit);
      const amount = unit.kind === 'crew' ? `${completedLine(unit.id, state.hour)} 链` : unit.capacity ? `${fmt.format(loadRemaining(unit))} 加仑` : `${onboard(unit, state.hour)} 人`;
      return `<button class="unit-row resource-row ${state.selected === unit ? 'selected' : ''}" data-cmd="select" data-value="${unit.id}">
        <span class="unit-icon">${icon(unitIcon(unit))}</span>
        <span class="unit-name"><span><b>${unit.id}</b> ${unit.name}</span><small class="${statusClass(status)}"><i></i> ${unit.kind === 'crew' && unit.personnel ? `${unit.personnel} · ` : ''}${resourceStatusLabels[status]}</small></span>
        <span class="unit-number">${amount}</span>
      </button>`;
    }).join('')}`;
  }).join('') || '<p class="operations">消防单位尚未出动。</p>';
  const r = state.selected;
  const flying = r?.kind === 'air';
  const status = r ? resourceStatus(r) : '';
  const drop = dropById.get(r?.id);
  const motion = r ? resourceReadout(r, status) : null;
  const inAir = active.filter(({ kind }) => kind === 'air').length;
  const readouts = !r ? [] : flying
    ? [['空速', motion.speed, '节'], ['高度', fmt.format(r.alt), '英尺（离地）'], ['航向', motion.headingText, motion.direction]]
    : [['速度', motion.speed, '英里/时'], ['人数', onboard(r, state.hour), '人'], ['作业分区', r.division, '指挥体系']];
  const info = !r ? `<section class="panel">${panelTitle('作业说明', inAir ? '<small>● 空中作业已出动</small>' : '<small>等待出动</small>')}
      <p class="operations">${icon('plane')}<span>选择任一单位即可跟随。播放或拖动时间轴查看车辆增援。点击绿色菱形可直接跳到队员下车。</span></p></section>`
    : `<section class="panel unit-detail">${panelTitle(`${r.id} <em>${r.name}</em>`, `<small class="resource-state ${statusClass(status)}">● ${resourceStatusLabels[status]}</small>`)}
        ${stats(readouts)}
        ${r.capacity && flying ? `<div class="payload"><small>载荷 · ${r.id.startsWith('H') ? substanceLabels.water : substanceLabels.retardant}</small><b>${fmt.format(loadRemaining(r))} / ${fmt.format(r.capacity)} 加仑</b><i><i style="width:${100 * loadRemaining(r) / r.capacity}%"></i></i></div>` : ''}
        ${detail([['所属机构', r.agency], ['当前任务', drop && state.hour >= drop.start ? resourceStatusLabels[status] : r.task],
          ...(flying ? [['投放次数', `${airOperation(r, state.hour).count} 次（本次回放）`]] : []),
          ...(r.kind === 'crew' ? [['已建防火线', `${fmt.format(completedLine(r.id, state.hour))} / ${fmt.format(r.capacity)} 链`]] : []),
          ['位置', motion.position]])}
        <div class="panel-actions grouped">${controls([
          [flying ? '追踪视角' : r.kind === 'crew' ? '跟随' : '随车视角', 'camera', 'chase', state.camera === 'chase'],
          ...(flying ? [['驾驶舱', 'camera', 'cockpit', state.camera === 'cockpit']] : []),
          ['全局视角', 'camera', 'overview', state.camera === 'overview'],
        ])}</div>
        ${drop ? `<div class="panel-actions">${controls([[drop.substance === 'water' ? '回放洒水' : '回放阻燃剂投放', 'replay-drop', '', true]])}</div>` : ''}
      </section>`;
  return `<section class="panel resource-panel">
    ${panelTitle(`消防资源 <em>· ${active.length}/${units.length} 个已出动</em>`, live())}
    <div class="resource-totals"><div><strong>${inAir}<small>/6</small></strong><small>航空器在空</small></div><div><strong>${(retardantTotal(state.hour) / 10000).toFixed(1)} 万</strong><small>加仑阻燃剂</small></div><div><strong>${fmt.format(completedLine(null, state.hour))}</strong><small>防火线（链）</small></div><div><strong>${personnelTotal(state.hour)}</strong><small>现场人数</small></div></div>
    <div class="unit-list">${list}</div>
  </section>${info}`;
}

export function contextPanel() {
  if (state.workspace === 'Incident') {
    return `<header>关键事件 <button disabled title="演示入口">＋ 添加</button></header><div class="context-list">
      ${events.map((event, i) => `<button class="context-row event-row ${i === state.selectedEvent ? 'selected' : ''}" data-cmd="event" data-value="${i}"><i style="color:${event.color}">${event.icon}</i><b>${event.name}</b><time>${clock(event.time)}</time></button>`).join('')}
    </div>`;
  }
  if (state.workspace === 'Drones') {
    const list = currentDetections();
    return `<header>热点记录 <span class="badge">${list.length}</span></header><div class="context-list">
      ${list.map((d) => `<button class="context-row log-row" data-cmd="detection" data-value="${d.id}"><i class="hot-dot"></i><span><b>热点 · ${d.temp} ℃</b><small>${d.id} · ${coordinates(...d.at)}</small></span><time>${clock(d.hour, false)}</time></button>`).join('') || '<p class="context-empty">本次回放暂无热点记录</p>'}
    </div>`;
  }
  const list = [
    ...airDrops.flatMap(dropOccurrences).filter(({ start }) => state.hour >= start).map((drop) => {
      const done = state.hour >= Math.min(drop.finish, containment);
      return { id: drop.id, hour: done ? Math.min(drop.finish, containment) : drop.start, css: drop.substance,
        text: drop.substance === 'water' ? (done ? '洒水完成' : '洒水中') : (done ? '阻燃剂投放完成' : '阻燃剂投放中'),
        note: `${fmt.format(Math.round(drop.quantity * clamp((Math.min(state.hour, containment) - drop.start) / (drop.finish - drop.start))))} 加仑${drop.substance === 'water' ? ` · 累计洒水 ${fmt.format(waterTotal(state.hour))} 加仑` : ''}` };
    }),
    ...deployments.flatMap(({ truck, crew, arrival, entry }) => {
      const line = defenses.find(({ id }) => id === crew);
      const walk = Math.max(arrival + dismountHours, line.start - 3);
      return [
        { id: truck, hour: entry, text: '增援出发', note: `运送 ${crew} 前往火场` },
        { id: crew, hour: arrival, text: '下车集结', note: `${truck} 抵达路边集结点` },
        { id: crew, hour: walk, text: '步行前往火线', note: '沿山地路线前往作业点' },
        { id: crew, hour: line.start, text: '开辟防火线', note: '沿火场边缘推进施工' },
      ].filter(({ hour }) => state.hour >= hour).map((item) => ({ ...item, css: 'crew' }));
    }),
  ].sort((a, b) => b.hour - a.hour);
  return `<header>灭火作业日志 <span class="badge">${list.length}</span></header><div class="context-list">
    ${list.map((item) => `<button class="context-row log-row" data-cmd="select" data-value="${item.id}" title="${item.id} · ${item.text} · ${item.note}"><i class="drop-dot ${item.css}"></i><span><b>${item.id} · ${item.text}</b><small>${item.note}</small></span><time>${clock(item.hour, false)}</time></button>`).join('') || '<p class="context-empty">暂无已开始的投放或增援</p>'}
  </div>`;

}

export function cameraOverlay() {
  const d = state.selected;
  if (!d || d.kind !== 'drone') return '';
  const read = telemetry(d);
  const target = missionTarget(d, state.hour);
  const pose = place(d, state.hour);
  const dx = target.x - pose.x, dz = target.z - pose.z;
  const gimbal = (Math.round(Math.atan2(dx, -dz) * 180 / Math.PI) + 360) % 360;
  const elevation = height(target.x, target.z);
  const pitch = Math.round(Math.atan2(elevation - pose.y, Math.hypot(dx, dz)) * 180 / Math.PI);
  const range = Math.round(Math.hypot(dx, pose.y - elevation, dz) * 100);
  const heading = String(read.heading).padStart(3, '0');
  const mode = state.sensor === 'IR' ? `红外 · ${paletteLabels[state.palette]}` : '可见光';
  const fov = Math.round(d.fov / state.zoom);
  return `<div class="hud-corners"></div><div class="hud-tl"><b><i></i> 录像 ${elapsed(Math.max(0, state.seconds - state.recordingSince))}</b><b>${d.id} ${d.name}</b><span>${mode}</span></div>
    <div class="hud-tr"><b>${clock(state.hour)} 太平洋夏令时</b><span>${target.name}</span></div>
    <div class="hud-heading"><span>${(gimbal + 340) % 360}</span><span>${(gimbal + 20) % 360}</span><i></i><b>▲<br>${gimbal}°</b></div>
    <div class="crosshair"><i></i><i></i></div>
    <div id="hot-targets"></div>
    <div class="hud-gimbal"><small>云台</small><span>${pitch}° ▸</span></div>
    <div class="hud-bl"><b>高度 ${fmt.format(read.alt)} 英尺（离地）</b><b>地速 ${read.speed} 节</b><b>航向 ${heading}°</b></div>
    <div class="hud-bm"><b>目标坐标 ${coordinates(target.x, target.z)}</b><span>距离 ${fmt.format(range)} 米 · 高程 ${fmt.format(Math.round(825 + 42 * elevation))} 米 · ${read.temp} ℃</span></div>
    <div class="hud-br"><b>电量 ${read.battery}%</b><b>信号 ${read.link} 分贝毫瓦</b><b>倍率 ${state.zoom.toFixed(1)}× · ${fov}° 视场</b></div>`;
}

export function followOverlay() {
  const r = state.selected;
  if (!r || r.kind === 'drone' || state.camera === 'overview' || state.view === '2D') return '';
  const air = r.kind === 'air';
  const status = resourceStatus(r);
  const motion = resourceReadout(r, status);
  return `<div class="follow-header"><b>${r.id}</b> ${r.name} <span class="${statusClass(status)}">● ${resourceStatusLabels[status]}</span></div>
    <div class="follow-inner">
      ${stats([[air ? '指示空速' : '速度', motion.speed, air ? '节' : '英里/时'], ['高度', fmt.format(r.alt), '英尺（离地）'], ['航向', motion.headingText, motion.direction]])}
      ${air && r.capacity ? `<div class="payload"><small>${r.id.startsWith('H-') ? substanceLabels.water : substanceLabels.retardant}</small><i><i style="width:${100 * loadRemaining(r) / r.capacity}%"></i></i><b>${fmt.format(loadRemaining(r))} 加仑</b></div>` : ''}
      <div class="panel-actions grouped">${controls([['追踪视角', 'camera', 'chase', state.camera === 'chase'], ...(air ? [['驾驶舱', 'camera', 'cockpit', state.camera === 'cockpit']] : [])])}</div>
      <button data-cmd="camera" data-value="overview" aria-label="退出跟随视角">${icon('close')}</button>
    </div><small class="follow-hint">拖动可上下左右环视 · 滚轮调整镜头${air ? ' · 按 C 键切换视角' : ''}</small>`;
}

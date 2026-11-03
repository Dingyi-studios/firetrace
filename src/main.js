import './styles.css';
import { clock, clamp, compass, coordinates, drones, events, fmt, hours, incidentLocation, incidentName, paletteLabels, resources, tabLabels } from './data.js';
import { state, tick } from './state.js';
import { caret, icon, logo } from './icons.js';
import { renderCharts } from './charts.js';
import { cameraOverlay, contextPanel, dronePanel, followOverlay, incidentPanel, resourcePanel, weatherPanel } from './panels.js';
import { setupMap } from './map.js';
import { deployments, dropById } from './operations.js';

const $ = (selector) => document.querySelector(selector);
const units = new Map([...drones, ...resources].map((unit) => [unit.id, unit]));
const button = (command, label, value = '', aria = '') => `<button data-cmd="${command}" data-value="${value}" ${aria ? `aria-label="${aria}" title="${aria}"` : ''}>${label}</button>`;
const topButton = (key, label, symbol, count) => button('workspace', icon(symbol) + label + (count ? ` <span class="badge">${count}</span>` : ''), key);
const menuButton = (key, label, symbol, tooltip = '') => button('menu', icon(symbol) + label + (label ? caret : ''), key, tooltip);
const pointer = '<svg viewBox="0 0 36 36" aria-hidden="true"><path d="M18 4 26 27l-8-5-8 5z" fill="#fffbed"/><path d="M18 4v18l-8 5z" fill="#c3c1ae"/></svg>';

$('#app').innerHTML = `
  <header class="topbar">
    <div class="brand">${logo}<h1>火迹</h1></div><div class="subtitle">野火取证分析</div>
    <div class="top-incident">${menuButton('Incident selector', incidentName, '')}</div>
    <span class="top-location">${incidentLocation}</span>
    <span class="top-date">${icon('calendar')}2024年8月14日—18日</span>
    <nav class="workspaces" aria-label="工作区">${topButton('Incident', '事件', 'map')}${topButton('Drones', '无人机', 'drone', 6)}${topButton('Resources', '消防资源', 'truck', 6)}</nav>
    <nav class="tools" aria-label="工具">${menuButton('View', '视图', 'calendar')}${menuButton('Analysis', '分析', 'chart')}${menuButton('Share', '分享', 'share')}</nav>
    <div class="top-settings">${menuButton('Settings', '', 'settings', '设置')}${button('collapse', '−', '', '展开或收起侧栏')}</div>
    <div id="top-menu" class="dropdown" hidden></div>
  </header>
  <main class="workbench">
    <section id="map" aria-label="${incidentName}地图">
      <div id="map-grid" hidden></div><div id="labels"></div>
      <div id="compass"><span>北</span>${pointer}</div>
      <div id="map-tooltip" role="status" hidden></div>
      <div id="sensor" hidden>
        <div id="sensor-picture"><div id="camera-hud"></div></div>
        <div id="sensor-toolbar"></div>
      </div>
      <div id="follow" hidden></div>
      <div id="map-actions">
        <div id="map-scale"></div>
        <div class="map-mode">${button('view', '二维', '2D')}${button('view', '三维', '3D')}</div>
        <div class="zoom-wrap">${button('menu', '<span id="map-zoom">2.5×</span>' + caret, 'Map zoom', '地图缩放')}<div id="zoom-menu" class="dropdown" hidden></div></div>
        ${button('fullscreen', icon('expand'), '', '全屏地图')}
      </div>
      <div id="map-error" hidden></div>
    </section>
    <aside id="sidebar" aria-label="工作区详情"></aside>
    <section id="bottom" aria-label="时间轴与图表">
      <div class="temporal">
        <div class="timeline">
          <header><h2>时间轴</h2><span>${clock(0)} 至 ${clock(hours)}</span></header>
          <div class="transport">
            ${button('play', icon('play'), '', '播放时间轴')}${button('pause', icon('pause'), '', '暂停时间轴')}${button('next', icon('next'), '', '下一个关键事件')}
            <select id="speed" aria-label="播放速度">${[.5, 1, 2, 4, 8, 16].map((n) => `<option value="${n}" ${n === 1 ? 'selected' : ''}>${n}×</option>`).join('')}</select>
          </div>
          <div class="scrubber">
            <div class="time-rule"></div><div id="time-bubble"></div>
            <input id="incident-time" type="range" min="0" max="${hours}" step="0.01666666667" aria-label="事件时间轴">
            ${events.map((event, index) => `<button class="event-mark" style="--pos:${100 * event.time / hours}%;--event-color:${event.color}" data-cmd="event" data-value="${index}" aria-label="${event.name}" title="${event.name}">${event.icon}</button>`).join('')}
            ${deployments.map(({ crew, arrival }, i) => `<button hidden class="event-mark deployment-mark" style="--pos:${100 * arrival / hours}%;--event-color:#607745" data-cmd="deployment" data-value="${crew}" aria-label="第 ${i + 1} 批增援抵达" title="第 ${i + 1} 批增援抵达 · ${clock(arrival)}">◆</button>`).join('')}
            <div class="time-ticks">${Array.from({ length: 16 }, (_, i) => {
              const time = 6 * i + 4;
              return `<div style="left:${Math.min(98, time / hours * 100)}%">${i === 0 || Math.floor((time + 14) / 24) !== Math.floor((time + 8) / 24) ? `<b>8月${14 + Math.floor((time + 14) / 24)}日</b>` : ''}<span>${clock(time, false)}</span></div>`;
            }).join('')}</div>
          </div>
        </div>
        <div id="charts"></div>
      </div>
      <aside id="context"></aside>
    </section>
  </main>`;

const sidebar = $('#sidebar'), mapEl = $('#map'), hud = $('#camera-hud'), tooltip = $('#map-tooltip');
let map = null, panelPointer = false, hoverDirty = true;
let frameId = null, lastFrame = null, lastRefresh = -Infinity, detailsDirty = false;
function requestFrame() {
  if (frameId === null && !document.hidden) frameId = requestAnimationFrame(animate);
}
try {
  map = setupMap(mapEl, { select, hover: showHover, focusVillage, requestFrame });
} catch (error) {
  console.error(error);
  $('#map-error').hidden = false;
  $('#map-error').textContent = '无法初始化三维地图。请使用已启用 WebGL 2 的浏览器打开火迹。';
}

function showHover(point) {
  if (state.hover === null && !point) return;
  state.hover = point;
  hoverDirty = true;
  tooltip.hidden = !point;
  if (!point) return;
  const age = Math.max(0, Math.floor(state.hour - point.arrival));
  tooltip.innerHTML = `<b>${fmt.format(point.elev)} 米</b> · 坡度 ${point.slope}° · 朝${compass(point.aspect)}
    <span><i></i>${point.burned ? `燃烧于 ${clock(point.arrival)} · ${age} 小时前` : point.inside ? '位于最终火场范围内' : '位于最终火场范围外'}</span>
    <span>${point.fuel}</span><small>${coordinates(point.x, point.z)}</small>`;
  tooltip.style.left = `${Math.min(point.px + 14, mapEl.clientWidth - tooltip.offsetWidth - 7)}px`;
  tooltip.style.top = `${Math.min(point.py + 14, mapEl.clientHeight - tooltip.offsetHeight - 35)}px`;
}

function renderSidebar() {
  const position = sidebar.scrollTop;
  sidebar.innerHTML = state.workspace === 'Incident' ? incidentPanel() : state.workspace === 'Drones' ? dronePanel(drones) : resourcePanel(resources);
  sidebar.scrollTop = position;
  renderWeather();
}
function renderWeather() {
  if (state.workspace !== 'Incident') return;
  $('#weather-content').innerHTML = weatherPanel();
  $('#weather-context').textContent = state.hover ? '（光标处）' : '（火线处）';
  hoverDirty = false;
}
function renderHeader() {
  document.querySelectorAll('[data-cmd="workspace"]').forEach((element) => {
    const selected = element.dataset.value === state.workspace;
    element.classList.toggle('selected', selected);
    element.setAttribute('aria-pressed', selected);
  });
  document.querySelectorAll('[data-cmd="view"]').forEach((element) => {
    const selected = element.dataset.value === state.view;
    element.classList.toggle('selected', selected);
    element.setAttribute('aria-pressed', selected);
  });
  document.querySelectorAll('.deployment-mark').forEach((marker) => {
    marker.hidden = state.workspace !== 'Resources';
  });
}

function renderTime() {
  const p = 100 * state.hour / hours;
  const bubble = $('#time-bubble');
  bubble.textContent = clock(state.hour);
  bubble.style.left = `${clamp(p, 4, 96)}%`;
  $('#incident-time').value = state.hour;
  $('#incident-time').setAttribute('aria-valuetext', clock(state.hour));
  $('#incident-time').style.setProperty('--pos', `${p}%`);
  for (const action of ['play', 'pause']) $(`[data-cmd="${action}"]`).classList.toggle('selected', action === 'play' ? state.playing : !state.playing);
}
function renderContext() {
  const context = $('#context');
  const scroll = context.querySelector('.context-list')?.scrollTop ?? 0;
  context.innerHTML = contextPanel();
  context.querySelector('.context-list').scrollTop = scroll;
}
function renderFeed() {
  const element = $('#sensor');
  element.hidden = state.feed === 'closed';
  element.classList.toggle('full', state.feed === 'full');
  mapEl.classList.toggle('feed-full', state.feed === 'full');
  if (element.hidden) return;
  const unit = state.selected;
  $('#sensor-toolbar').innerHTML = `<span class="feed-id"><b>${unit.id}</b> ${unit.name}</span>
    <div class="sensors">${button('sensor', '可见光', 'EO')}${button('sensor', '红外', 'IR')}</div>
    ${state.sensor === 'IR' ? `<select id="palette" aria-label="热成像色板">${Object.entries(paletteLabels).map(([key, name]) => `<option value="${key}" ${state.palette === key ? 'selected' : ''}>${name}</option>`).join('')}</select>` : ''}
    <span class="toolbar-gap"></span>
    ${button('sensor-zoom', '−', '-1', '缩小相机画面')}<span>${state.zoom.toFixed(1)}×</span>${button('sensor-zoom', '＋', '1', '放大相机画面')}
    ${button('sensor-zoom', icon('target'), '0', '重置相机倍率')}
    ${button('feed', icon('diagonal'), state.feed === 'full' ? 'pip' : 'full', state.feed === 'full' ? '返回画中画' : '展开相机画面')}
    ${button('feed', icon('close'), 'closed', '关闭相机')}`;
  $(`#sensor-toolbar [data-value="${state.sensor}"]`).classList.add('selected');
  hud.innerHTML = cameraOverlay();
}
function renderFollow() {
  const follow = $('#follow');
  const html = followOverlay();
  follow.hidden = !html;
  follow.innerHTML = html;
}
function redraw() {
  renderHeader();
  renderSidebar();
  renderTime();
  renderContext();
  $('#charts').innerHTML = renderCharts(drones);
  renderFeed();
  renderFollow();
  requestFrame();
}

function setHour(hour, options = {}) {
  state.hour = clamp(hour, 0, hours);
  state.playing = false;
  const prior = events.findLastIndex((item) => item.time <= state.hour + .018);
  state.selectedEvent = options.event ?? prior;
  renderTime();
  detailsDirty = true;
  requestFrame();
  if (options.focus && state.workspace === 'Incident') map?.focus(events[options.event].at, options.event === 0);
}
function switchWorkspace(workspace) {
  if (workspace === state.workspace) return;
  state.workspace = workspace;
  state.selected = null;
  state.camera = 'overview';
  state.feed = 'closed';
  if (workspace === 'Incident') state.tab = 'Layers';
  showHover(null);
  if (state.view === '3D') map?.reset();
  sidebar.scrollTop = 0;
}
function select(unit) {
  if (!unit) return;
  switchWorkspace(unit.kind === 'drone' ? 'Drones' : 'Resources');
  state.selected = unit;
  if (unit.kind === 'drone') {
    if (state.feed === 'closed') state.feed = 'pip';
    state.recordingSince = state.seconds;
  }
  state.camera = 'chase';
  map?.mode();
  redraw();
}
function focusVillage(village) {
  state.camera = 'overview';
  state.feed = 'closed';
  map?.mode();
  map?.focus(village.at, true);
  redraw();
}

function follow(value) {
  if (!state.selected) return;
  state.camera = value;
  if (value !== 'overview') state.view = '3D';
  map?.mode();
  if (value === 'overview') map?.reset();
}

const menuItems = {
  'Incident selector': () => `<div class="menu-heading">当前事件</div><div class="menu-item">✓ ${incidentName}<small>CA-LAC-2024-0176</small></div>`,
  View: () => button('view', '二维地形图', '2D') + button('view', '三维地形视图', '3D') + button('reset-view', '重置地图视角') + button('fullscreen', '全屏地图'),
  Analysis: () => Object.entries(tabLabels).map(([key, label]) => button('tab', key === 'Analysis' ? '火势演变' : label, key)).join(''),
  Share: () => '<div class="menu-item">分享<span class="muted">演示入口</span><small>本地回放</small></div>',
  Settings: () => `<div class="menu-heading">火迹 · 回放模式</div><div class="menu-item">模拟火情<small>地形由程序生成，读数仅供演示。</small></div>${button('restart', '重置演示')}`,
  'Map zoom': () => button('map-zoom', '放大地图', '1.25') + button('map-zoom', '缩小地图', '.8') + button('reset-view', '重置地图视角'),
};
function closeMenu() {
  state.menu = null;
  $('#top-menu').hidden = true;
  $('#zoom-menu').hidden = true;
}
function openMenu(name, element) {
  if (state.menu === name) return closeMenu();
  closeMenu();
  state.menu = name;
  const isZoom = name === 'Map zoom';
  const popup = $(isZoom ? '#zoom-menu' : '#top-menu');
  popup.innerHTML = menuItems[name]();
  popup.hidden = false;
  if (!isZoom) popup.style.left = `${Math.min(element.getBoundingClientRect().left, window.innerWidth - popup.offsetWidth - 8)}px`;
}

document.addEventListener('click', (event) => {
  const element = event.target.closest('[data-cmd]');
  if (!element) {
    if (!event.target.closest('.dropdown')) closeMenu();
    return;
  }
  const { cmd, value } = element.dataset;
  if (cmd === 'menu') return openMenu(value, element);
  closeMenu();
  requestFrame();
  switch (cmd) {
    case 'workspace': switchWorkspace(value); break;
    case 'select': case 'detection': select(units.get(value)); return;
    case 'tab': switchWorkspace('Incident'); state.tab = value; break;
    case 'view': state.view = value; map?.mode(); break;
    case 'camera': follow(value); break;
    case 'replay-drop': {
      const drop = dropById.get(state.selected?.id);
      if (!drop) return;
      setHour(drop.start - 1);
      state.playing = true;
      renderTime();
      return;
    }
    case 'feed': state.feed = value; break;
    case 'thermal': state.sensor = state.sensor === 'IR' ? 'EO' : 'IR'; if (state.feed === 'closed') state.feed = 'pip'; break;
    case 'sensor': state.sensor = value; break;
    case 'sensor-zoom': state.zoom = +value ? clamp(state.zoom + +value * .25, 1, 5) : 1; break;
    case 'map-zoom': map?.zoomBy(+value); return;
    case 'reset-view': state.camera = 'overview'; map?.reset(); break;
    case 'deployment': {
      const deployment = deployments.find(({ crew }) => crew === value);
      if (deployment) {
        setHour(deployment.arrival + .35);
        select(units.get(value));
      }
      return;
    }
    case 'event': {
      const index = +value;
      setHour(events[index].time, { event: index, focus: true });
      return;
    }
    case 'play':
      if (state.hour >= hours) setHour(0);
      state.playing = true;
      lastFrame = null;
      detailsDirty = true;
      renderTime();
      return;
    case 'pause':
      state.playing = false;
      detailsDirty = true;
      renderTime();
      return;
    case 'next': {
      const index = events.findIndex((item) => item.time > state.hour + .02);
      const i = index === -1 ? 0 : index;
      setHour(events[i].time, { event: i, focus: state.workspace === 'Incident' });
      return;
    }
    case 'fullscreen': {
      if (document.fullscreenElement) document.exitFullscreen?.();
      else mapEl.requestFullscreen?.();
      return;
    }
    case 'collapse': $('.workbench').classList.toggle('sidebar-collapsed'); return;
    case 'restart': window.location.reload(); return;
    default: return;
  }
  redraw();
});

document.addEventListener('input', (event) => {
  const element = event.target;
  if (element.id === 'incident-time') setHour(+element.value);
  if (element.dataset.opacity) {
    state.layers[element.dataset.opacity].opacity = +element.value;
    element.nextElementSibling.value = `${element.value}%`;
    requestFrame();
  }
});
document.addEventListener('change', (event) => {
  const element = event.target;
  if (element.id === 'speed') state.speed = +element.value;
  if (element.id === 'palette') {
    state.palette = element.value;
    hud.innerHTML = cameraOverlay();
    requestFrame();
  }
  if (element.dataset.layer) {
    state.layers[element.dataset.layer].on = element.checked;
    element.closest('.layer-row').classList.toggle('off', !element.checked);
    requestFrame();
  }
});
sidebar.addEventListener('pointerdown', () => { panelPointer = true; });
window.addEventListener('pointerup', () => { panelPointer = false; });
window.addEventListener('pointercancel', () => { panelPointer = false; });

$('#charts').addEventListener('click', (event) => {
  if (state.workspace === 'Drones' || !event.target.closest('.chart svg')) return;
  const bounds = event.target.closest('.chart svg').getBoundingClientRect();
  const p = ((event.clientX - bounds.left) / bounds.width * 398 - 49) / 338;
  setHour(p * hours);
});
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (state.menu) closeMenu();
    else if (state.feed !== 'closed') { state.feed = state.feed === 'full' ? 'pip' : 'closed'; renderFeed(); requestFrame(); }
    else if (state.camera !== 'overview') { follow('overview'); redraw(); }
  }
  if (event.target.closest('button, input, select, textarea')) return;
  if (event.code === 'Space') {
    event.preventDefault();
    if (!state.playing && state.hour >= hours) setHour(0);
    state.playing = !state.playing;
    lastFrame = null;
    detailsDirty = true;
    renderTime();
    requestFrame();
  }
  if (event.key.toLowerCase() === 'c' && state.selected?.kind === 'air') {
    follow(state.camera === 'chase' ? 'cockpit' : 'chase');
    redraw();
  }
});

document.addEventListener('visibilitychange', () => {
  lastFrame = null;
  if (document.hidden && frameId !== null) {
    cancelAnimationFrame(frameId);
    frameId = null;
  } else {
    requestFrame();
  }
});

function animate(now) {
  frameId = null;
  const wasPlaying = state.playing;
  if (wasPlaying && lastFrame !== null && now - lastFrame < 30) {
    requestFrame();
    return;
  }
  tick(lastFrame === null ? 0 : Math.min(.15, (now - lastFrame) / 1000));
  lastFrame = now;
  if (wasPlaying) {
    state.selectedEvent = events.findLastIndex((event) => event.time <= state.hour);
    renderTime();
  }
  const cameraMoving = map?.render(now);
  if (detailsDirty || (wasPlaying && (!state.playing || now - lastRefresh >= 300))) {
    lastRefresh = now;
    detailsDirty = false;
    if (state.workspace !== 'Incident' && !panelPointer && !sidebar.contains(document.activeElement)) renderSidebar();
    $('#charts').innerHTML = renderCharts(drones);
    renderContext();
    if (state.feed !== 'closed') hud.innerHTML = cameraOverlay();
    if (state.camera !== 'overview') renderFollow();
    renderWeather();
  } else if (hoverDirty) {
    renderWeather();
  }
  if (state.playing || cameraMoving) requestFrame();
}
redraw();

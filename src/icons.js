const paths = {
  map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15"/>',
  drone: '<path d="M9 9l6 6m0-6-6 6"/><circle cx="6.5" cy="6.5" r="3"/><circle cx="17.5" cy="6.5" r="3"/><circle cx="6.5" cy="17.5" r="3"/><circle cx="17.5" cy="17.5" r="3"/>',
  plane: '<path d="M12 2v17m0-12 8 6v2l-8-3-8 3v-2l8-6m-4 14 4-2 4 2"/>',
  helicopter: '<path d="M3 5h18m-9 0v4m-6 8h12M7 14H4l-1-5h2l2 3m0 2V9h8c4 0 5 3 5 5H7Zm2 0v3m6-3v3"/>',
  truck: '<path d="M2 5h12v12H2zm12 4h4l4 4v4h-8"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  crew: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v3"/>',
  dozer: '<rect x="3" y="15" width="13" height="5" rx="2"/><path d="M6 15V8h6l3 7m1 1 4 1v-5m0 5v3"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4m8-4v4m-8 8h2m4 0h2"/>',
  chart: '<path d="M3 21h18M7 17v-5m5 5V5m5 12V8"/>',
  share: '<circle cx="6" cy="12" r="2.4"/><circle cx="18" cy="5" r="2.4"/><circle cx="18" cy="19" r="2.4"/><path d="m8 11 8-5m-8 7 8 5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="m9 3-1 3-3 1-2 3 2 2v3l2 3 3-1 2 3 3-1 1-3 3-1 2-3-2-2V7l-2-3-3 1-2-2z"/>',
  wind: '<path d="M2 8h12c5 0 5-6 1-6-2 0-3 1-3 2M2 12h18c3 0 3 4 0 4m-18 0h9c4 0 4 5 0 5-1 0-2-1-2-2"/>',
  thermometer: '<path d="M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0Zm2-5v8"/>',
  droplet: '<path fill="currentColor" d="M12 2c3 5 7 9 7 13a7 7 0 1 1-14 0c0-4 4-8 7-13Z"/>',
  leaf: '<path fill="currentColor" d="M3 20C0 10 7 4 21 3c-1 12-7 19-16 17l10-11-12 11Z"/>',
  flame: '<path fill="currentColor" d="M12 2c2 4 5 5 5 9 1-1 2-2 2-3 5 8-1 14-7 14S1 16 5 9c1 2 2 3 3 3-1-4 2-6 4-10Z"/><path stroke="none" fill="#e7ad66" d="M12 12c4 4 3 8 0 8s-4-4 0-8Z"/>',
  expand: '<path d="M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5"/>',
  diagonal: '<path d="m4 20 6-6m4-4 6-6M4 14v6h6m4-16h6v6"/>',
  target: '<circle cx="12" cy="12" r="4"/><path d="M4 8V4h4m8 0h4v4m0 8v4h-4m-8 0H4v-4"/>',
  play: '<path fill="currentColor" stroke="none" d="m7 4 13 8-13 8z"/>',
  pause: '<path stroke-width="3" d="M9 5v14m6-14v14"/>',
  next: '<path fill="currentColor" stroke="none" d="m5 5 11 7-11 7z"/><path stroke-width="2" d="M18 5v14"/>',
  close: '<path d="m6 6 12 12m0-12L6 18"/>',
  more: '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
};
export const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? ''}</svg>`;
export const unitIcon = (unit) => unit.kind === 'drone' ? (unit.fixedWing ? 'plane' : 'drone')
  : unit.kind === 'air' ? (unit.id.startsWith('H-') ? 'helicopter' : 'plane') : unit.kind === 'engine' ? 'truck' : unit.id === 'DZ-4' ? 'dozer' : 'crew';
export const caret = icon('chevron', 'caret');
export const logo = '<svg class="firetrace-mark" viewBox="0 0 42 24" aria-hidden="true"><path fill="#6c5a3c" d="M1 21 13 7l8 9L27 3l14 18Z"/><path fill="#ba6e42" d="m9 21 9-10 5 4 4-12 14 18Z"/><path fill="#d7a27b" d="m27 3 6 8-7-3-5 7Z"/><path fill="#8f4d2c" d="m17 21 7-5 3 5Z"/></svg>';

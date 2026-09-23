import { esc } from '../shared/html.js';

const icons = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  list: '<rect x="4" y="5" width="16" height="4" rx="1"/><rect x="4" y="15" width="16" height="4" rx="1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  users:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L9 17l-4 1 1-4Z"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  spark: '<path d="m12 3 1.9 6.1L20 11l-6.1 1.9L12 19l-1.9-6.1L4 11l6.1-1.9Z"/>',
  brief:
    '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>',
  bookmark: '<path d="M6 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17l-6-4-6 4Z"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  team: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  chart: '<path d="M3 3v18h18M7 16l4-5 3 3 5-7"/>',
};
export const I = (name, size = 18) =>
  /* HTML */ `<svg
    width="${size}"
    height="${size}"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    ${icons[name] || icons.grid}
  </svg>`;
export const brand = () =>
  /* HTML */ `<a href="#/" class="brand"><span class="brand-mark">a</span><span>AI Sana</span></a>`;
// label and extra accept trusted HTML from application templates only.
export const btn = (label, action, kind = 'primary', extra = '') =>
  /* HTML */ `<button class="btn ${esc(kind)}" data-action="${esc(action)}" ${extra}>
    ${label}
  </button>`;
// The label accepts trusted HTML so callers can include icons. Escape external text first.
export const badge = (label, kind = 'soft') =>
  /* HTML */ `<span class="badge ${esc(kind)}">${label}</span>`;
export const stat = (value, title, icon) =>
  /* HTML */ `<div class="card stat">
    <span>${esc(title)}</span><span class="stat-ic">${I(icon)}</span><strong>${esc(value)}</strong>
  </div>`;
export const tags = (values) =>
  /* HTML */ `<div class="tags">
    ${values.map((value) => /* HTML */ `<span class="tag">${esc(value)}</span>`).join('')}
  </div>`;
export const progress = (value) =>
  /* HTML */ `<div class="progress">
    <span style="width:${Math.min(100, Math.max(0, Number(value) || 0))}%"></span>
  </div>`;

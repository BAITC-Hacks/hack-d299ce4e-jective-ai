import { layout } from '../components/layout.js';
import { esc } from '../shared/html.js';
import { profileFields, socialFields, safeSocialUrl } from '../features/profiles/service.js';

const paths = {
  linkedin:
    '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 10v7m0-10v.1M11 17v-7m0 3a3 3 0 0 1 6 0v4"/>',
  instagram:
    '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17 7h.01"/>',
  github:
    '<path d="M9 19c-4 1-4-2-6-2m12 5v-4a4 4 0 0 0-1-3c3 0 6-1 6-5a4 4 0 0 0-1-3 4 4 0 0 0 0-4s-1 0-4 2a13 13 0 0 0-6 0C6 3 5 3 5 3a4 4 0 0 0 0 4 4 4 0 0 0-1 3c0 4 3 5 6 5a4 4 0 0 0-1 3v4"/>',
  telegram: '<path d="m3 10 18-7-4 18-6-6-4 3 1-6 9-6-11 7Z"/>',
  website:
    '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
};
export const socialIcon = (key) =>
  `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[key] || paths.website}</svg>`;
export function profileAvatar(profile, small = false) {
  const initials = (profile?.full_name || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => Array.from(s)[0])
    .join('');
  return `<span class="profile-avatar ${small ? 'compact' : ''}">${profile?.avatar_url ? `<img src="${esc(profile.avatar_url)}" alt="Аватар ${esc(profile.full_name)}" loading="lazy"/>` : esc(initials)}</span>`;
}
function form(profile, data) {
  const draft = data.draft || profile;
  return `<section class="card profile-settings"><h2>Настройки профиля</h2><p class="hint">Эти сведения и фото видны зарегистрированным участникам. Email виден только вам.</p><div class="profile-photo-actions"><label class="btn ghost attachment-picker">${profile.avatar_path ? 'Заменить фото' : 'Загрузить фото'}<input id="profile-avatar" type="file" accept="image/jpeg,image/png,image/webp" ${data.busy ? 'disabled' : ''}/></label>${profile.avatar_path ? `<button class="btn ghost" data-action="profile-remove-avatar" ${data.busy ? 'disabled' : ''}>Удалить фото</button>` : ''}</div><p class="hint">JPG, PNG, WebP до 5 МБ. Фото обрезается по центру до квадрата.</p><form id="profile-form"><fieldset ${data.busy ? 'disabled' : ''}><div class="profile-form-grid">${Object.entries(
    profileFields,
  )
    .map(
      ([key, [label, max]]) =>
        `<div class="field ${['bio', 'skills'].includes(key) ? 'full' : ''}"><label for="profile-${key}">${label}</label>${key === 'bio' ? `<textarea class="textarea" id="profile-${key}" name="${key}" maxlength="${max}" rows="5">${esc(draft[key] || '')}</textarea>` : `<input class="input" id="profile-${key}" name="${key}" maxlength="${max}" value="${esc(draft[key] || '')}" ${key === 'full_name' ? 'required autocomplete="name"' : ''}/>`}</div>`,
    )
    .join('')}</div><h3>Ссылки</h3><div class="profile-form-grid">${Object.entries(socialFields)
    .map(
      ([key, [label, host]]) =>
        `<div class="field"><label class="social-label" for="profile-${key}">${socialIcon(key)}${label}</label><input class="input" id="profile-${key}" name="${key}" type="url" maxlength="500" placeholder="https://${host || 'example.com'}/" value="${esc(draft.social_links?.[key] || '')}"/></div>`,
    )
    .join(
      '',
    )}</div><div class="actions"><button class="btn primary" type="submit">${data.busy ? 'Сохранение…' : 'Сохранить изменения'}</button><button class="btn ghost" type="button" data-action="profile-cancel">Отмена</button></div></fieldset></form></section>`;
}
export function profilePage(state) {
  const data = state.profilePage || {};
  const profile = data.profile;
  const own = profile?.id === state.auth.user?.id;
  const status = `${data.error ? `<p class="profile-message" role="alert">${esc(data.error)} ${data.status === 'error' ? '<button class="text-btn" data-action="profile-retry">Повторить</button>' : ''}</p>` : ''}${data.notice ? `<p class="profile-message" role="status">${esc(data.notice)}</p>` : ''}`;
  let content = `<div class="profile-toolbar"><h1 class="page-title">${own ? 'Мой профиль' : 'Профиль участника'}</h1><a class="btn ghost" href="#/members">Все участники</a></div>${status}`;
  if (data.status === 'loading' || !data.status)
    content += '<p role="status">Загружаем профиль…</p>';
  else if (profile) {
    content += `<section class="card profile-hero"><div class="profile-cover"></div><div class="profile-intro">${profileAvatar(profile)}<div class="profile-identity"><span class="badge soft">${profile.role === 'business' ? 'Бизнес' : 'Студент'}</span><h2>${esc(profile.full_name)}</h2><p>${esc(profile.headline || 'Участник AI Sana')}</p><p class="hint">${[profile.organization, profile.location].filter(Boolean).map(esc).join(' · ')}</p></div>${own ? '<button class="btn ghost" data-action="profile-edit">Редактировать профиль</button>' : ''}</div><div class="profile-socials">${Object.entries(
      socialFields,
    )
      .map(([key, [label]]) => {
        const url = safeSocialUrl(profile.social_links?.[key], key);
        return url
          ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" class="profile-social">${socialIcon(key)}${label}</a>`
          : '';
      })
      .join(
        '',
      )}<button class="text-btn" data-action="profile-share">Скопировать ссылку</button></div></section><div class="profile-content-grid"><section class="card profile-about"><h3>О себе</h3><p>${esc(profile.bio || (own ? 'Расскажите о себе, своём опыте и целях — так участникам будет проще познакомиться с вами.' : 'Пользователь пока не добавил информацию о себе.'))}</p></section><section class="card profile-about"><h3>Навыки и интересы</h3><div class="tags">${
      profile.skills
        ? profile.skills
            .split(',')
            .filter((s) => s.trim())
            .map((s) => `<span class="tag">${esc(s.trim())}</span>`)
            .join('')
        : '<p class="hint">Пока не указаны</p>'
    }</div>${own ? `<p class="hint">Email (только для вас)<br>${esc(state.auth.user.email || '')}</p>` : ''}</section></div>${own && data.editing ? form(profile, data) : ''}`;
  }
  return layout(content, 'profile', state.auth.profile?.role, state.auth);
}
export function membersPage(state) {
  const data = state.profilePage || {};
  return layout(
    `<div class="profile-toolbar"><h1 class="page-title">Участники</h1><a class="btn ghost" href="#/profile">Мой профиль</a></div><p class="sub">Знакомьтесь с предпринимателями и студентами платформы.</p><form id="members-search" class="profile-search"><label class="sr-only" for="members-query">Имя участника</label><input id="members-query" class="input" name="query" placeholder="Поиск по имени" maxlength="100" value="${esc(data.query || '')}"/><button class="btn primary">Найти</button></form>${data.error ? `<p role="alert">${esc(data.error)} <button class="text-btn" data-action="profile-retry">Повторить</button></p>` : ''}${data.status === 'loading' ? '<p role="status">Загружаем участников…</p>' : `<div class="members-grid">${(data.members || []).map((p) => `<a class="card member-card" href="#/profile?user=${esc(p.id)}">${profileAvatar(p, true)}<h2>${esc(p.full_name)}</h2><span class="badge soft">${p.role === 'business' ? 'Бизнес' : 'Студент'}</span><p>${esc(p.headline || p.organization || 'Участник AI Sana')}</p><span class="hint">${esc(p.location || '')}</span></a>`).join('')}</div>${!data.error && !data.members?.length ? '<p>Участники не найдены. Попробуйте другое имя.</p>' : ''}`}<div class="actions">${data.page > 0 ? '<button class="btn ghost" data-action="members-prev">Назад</button>' : ''}${data.members?.length === 24 ? '<button class="btn ghost" data-action="members-next">Далее</button>' : ''}</div>`,
    'members',
    state.auth.profile?.role,
    state.auth,
  );
}

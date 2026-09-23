import { btn } from '../components/ui.js';
import { layout } from '../components/layout.js';
import { esc } from '../shared/html.js';

export function simple(state) {
  const profile = state.auth?.status === 'authenticated' ? state.auth.profile : null;
  const studentRole = (profile?.role || state.role) === 'student';
  return layout(
    /* HTML */ `<h1 class="page-title">Профиль</h1>
      ${
        profile
          ? /* HTML */ `<div class="card form-card">
              <h2>${esc(profile.full_name)}</h2>
              <dl class="profile-details">
                <div>
                  <dt>Email</dt>
                  <dd>${esc(state.auth.user?.email || '')}</dd>
                </div>
                <div>
                  <dt>Роль</dt>
                  <dd>${studentRole ? 'Студент' : 'Бизнес'}</dd>
                </div>
              </dl>
              <div class="actions">
                ${btn('Выйти', 'logout', 'ghost', state.auth.busy ? 'disabled' : '')}
              </div>
            </div>`
          : '<div class="card form-card"><p class="sub">Войдите, чтобы открыть свой профиль.</p><button class="btn primary" data-route="login">Войти</button></div>'
      }`,
    'profile',
    studentRole ? 'student' : 'business',
    state.auth,
  );
}

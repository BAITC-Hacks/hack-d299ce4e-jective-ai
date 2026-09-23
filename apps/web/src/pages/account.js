import { tags } from '../components/ui.js';
import { layout, pageTitle } from '../components/layout.js';
import { esc } from '../shared/html.js';

export function simple(state, r) {
  const profile = state.auth?.status === 'authenticated' ? state.auth.profile : null;
  const studentRole = (profile?.role || state.role) === 'student';
  return layout(
    /* HTML */ `<h1 class="page-title">${pageTitle(r)}</h1>
      ${
        r === 'team'
          ? /* HTML */ `<div class="card form-card">
              <h2>Data Wizards</h2>
              <p class="sub">Демонстрационная команда · 4 участника</p>
              <div class="team-avatars" style="margin-top:20px">
                <span class="avatar">АМ</span><span class="avatar">ДК</span
                ><span class="avatar">ЕС</span><span class="avatar">+1</span>
              </div>
              ${tags(['Python', 'ML', 'Analytics'])}
            </div>`
          : profile
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
              </div>`
            : '<div class="card form-card"><p class="sub">Войдите, чтобы открыть свой профиль.</p><button class="btn primary" data-route="login">Войти</button></div>'
      }`,
    r,
    studentRole ? 'student' : 'business',
    state.auth,
  );
}

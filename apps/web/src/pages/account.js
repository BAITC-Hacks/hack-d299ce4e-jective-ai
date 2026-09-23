import { tags } from '../components/ui.js';
import { layout, pageTitle } from '../components/layout.js';

export function simple(state, r) {
  let studentRole = r === 'team' || state.role === 'student';
  return layout(
    /* HTML */ `<h1 class="page-title">${pageTitle(r)}</h1>
      ${
        r === 'team'
          ? /* HTML */ `<div class="card form-card">
              <h2>Data Wizards</h2>
              <p class="sub">Студенческая команда · 4 участника</p>
              <div class="team-avatars" style="margin-top:20px">
                <span class="avatar">АМ</span><span class="avatar">ДК</span
                ><span class="avatar">ЕС</span><span class="avatar">+1</span>
              </div>
              ${tags(['Python', 'ML', 'Analytics'])}
            </div>`
          : /* HTML */ `<div class="card form-card">
              <h2>${studentRole ? 'Data Wizards' : 'Алия М.'}</h2>
              <p class="sub">
                Демонстрационный профиль
                ${studentRole ? 'студенческой команды' : 'представителя бизнеса'}.
              </p>
            </div>`
      }`,
    r,
    studentRole ? 'student' : 'business',
  );
}

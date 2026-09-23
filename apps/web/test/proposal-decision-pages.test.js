import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialState } from '../src/app/initial-state.js';
import { proposals } from '../src/pages/proposals.js';
import { myProposals } from '../src/pages/student.js';

const userId = '11111111-1111-4111-8111-111111111111';
const firstId = '22222222-2222-4222-8222-222222222222';
const secondId = '33333333-3333-4333-8333-333333333333';
const proposal = (overrides = {}) => ({
  id: firstId,
  taskId: 47,
  taskTitle: 'Задача бизнеса',
  teamName: 'Команда студентов',
  idea: 'Идея решения',
  plan: 'План реализации',
  deadline: 'Три недели',
  prototypeUrl: 'https://example.com/prototype',
  createdAt: '2026-09-23T00:00:00Z',
  status: 'pending',
  decidedAt: null,
  ...overrides,
});
function stateWith(role = 'business', items = [proposal()]) {
  const state = createInitialState();
  state.auth = {
    ...state.auth,
    status: 'authenticated',
    user: { id: userId },
    profile: { id: userId, role, full_name: 'Пользователь' },
  };
  state.proposals = { status: 'ready', items, error: '' };
  state.proposalDecision = { id: null, status: 'idle', error: '' };
  return state;
}
const articles = (html) =>
  [...html.matchAll(/<article\b[\s\S]*?<\/article>/g)].map(([article]) => article);
function button(html, action) {
  const value = new RegExp(`<button[^>]*data-action="${action}"[^>]*>`).exec(html)?.[0];
  assert.ok(value, action);
  return value;
}

test('persisted decision statuses are shown consistently to business and students', () => {
  for (const [status, label] of [
    ['pending', 'На рассмотрении'],
    ['accepted', 'Принят'],
    ['rejected', 'Отклонён'],
  ]) {
    const item = proposal({
      status,
      decidedAt: status === 'pending' ? null : '2026-09-24T09:15:00Z',
    });
    for (const [role, render] of [
      ['business', proposals],
      ['student', myProposals],
    ]) {
      const html = render(stateWith(role, [item]));
      assert.match(html, new RegExp(label));
      for (const text of [item.taskTitle, item.teamName, item.idea, item.plan, item.deadline])
        assert.ok(html.includes(text));
      assert.match(html, /href="https:\/\/example.com\/prototype"/);
      if (status !== 'pending')
        assert.match(html, /Решение обновлено:[\s\S]*datetime="2026-09-24T09:15:00Z"/);
      else assert.doesNotMatch(html, /Решение обновлено/);
    }
  }
});

test('business actions contain the exact proposal ID and allow changing a previous decision', () => {
  for (const status of ['pending', 'accepted', 'rejected']) {
    const html = proposals(stateWith('business', [proposal({ status })]));
    const accept = button(html, 'accept-proposal');
    const reject = button(html, 'reject-proposal');
    assert.ok(accept.includes(`data-proposal-id="${firstId}"`));
    assert.ok(reject.includes(`data-proposal-id="${firstId}"`));
    assert.equal(accept.includes('disabled'), status === 'accepted');
    assert.equal(reject.includes('disabled'), status === 'rejected');
    assert.doesNotMatch(html, /data-action="(?:choose|reject|reset-proposal|pending-proposal)"/);
  }
});

test('decision controls require a verified matching business identity and business page', () => {
  const variants = [
    (state) => {
      state.auth.profile.role = 'student';
    },
    (state) => {
      state.auth.status = 'anonymous';
    },
    (state) => {
      state.auth.status = 'initializing';
    },
    (state) => {
      state.auth.status = 'error';
    },
    (state) => {
      state.auth.user = null;
    },
    (state) => {
      state.auth.user = {};
    },
    (state) => {
      state.auth.profile = null;
    },
    (state) => {
      state.auth.profile.id = secondId;
    },
    (state) => {
      state.auth.profile.role = 'admin';
    },
  ];
  for (const mutate of variants) {
    const state = stateWith();
    mutate(state);
    const html = proposals(state);
    assert.doesNotMatch(html, /data-action="(?:accept-proposal|reject-proposal)"/);
    assert.match(html, /На рассмотрении/);
    assert.match(html, /План реализации/);
  }
  assert.doesNotMatch(
    myProposals(stateWith('student')),
    /data-action="(?:accept-proposal|reject-proposal)"/,
  );
  assert.doesNotMatch(
    myProposals(stateWith('business')),
    /data-action="(?:accept-proposal|reject-proposal)"/,
  );
});

test('while saving all decision buttons are disabled and only the matching card shows progress', () => {
  const state = stateWith('business', [
    proposal(),
    proposal({ id: secondId, taskId: 91, taskTitle: 'Другая задача' }),
  ]);
  state.proposalDecision = { id: firstId, status: 'saving', error: '' };
  const html = proposals(state);
  const [first, second] = articles(html);
  assert.match(first, /aria-busy="true"/);
  assert.match(first, /role="status">Сохраняем решение/);
  assert.doesNotMatch(second, /aria-busy="true"|Сохраняем решение/);
  for (const article of [first, second]) {
    assert.match(button(article, 'accept-proposal'), /disabled/);
    assert.match(button(article, 'reject-proposal'), /disabled/);
    assert.match(article, /Идея решения/);
    assert.match(article, /План реализации/);
    assert.match(article, /Три недели/);
  }
  assert.match(button(second, 'accept-proposal'), new RegExp(`data-proposal-id="${secondId}"`));
  assert.match(second, /href="#\/detail\?id=91"/);
});

test('decision error is escaped and scoped to its proposal without changing other statuses', () => {
  const state = stateWith('business', [
    proposal({ status: 'accepted' }),
    proposal({ id: secondId, status: 'rejected' }),
  ]);
  state.proposalDecision = {
    id: secondId,
    status: 'error',
    error: '<script>Ошибка сохранения</script>',
  };
  const [first, second] = articles(proposals(state));
  assert.doesNotMatch(first, /role="alert"|Ошибка сохранения/);
  assert.match(first, /Принят/);
  assert.match(second, /Отклонён/);
  assert.match(second, /role="alert">&lt;script&gt;Ошибка сохранения&lt;\/script&gt;/);
  assert.doesNotMatch(second, /<script>/);
  assert.doesNotMatch(button(second, 'accept-proposal'), /disabled/);
  assert.match(button(second, 'reject-proposal'), /disabled/);
});

test('optional decision timestamps and untrusted display values cannot inject markup', () => {
  for (const decidedAt of [null, undefined, '<img src=x onerror=alert(1)>']) {
    const html = proposals(stateWith('business', [proposal({ status: 'accepted', decidedAt })]));
    assert.match(html, /Принят/);
    assert.doesNotMatch(html, /Решение обновлено|<img src=x/);
  }
  const html = proposals(
    stateWith('business', [
      proposal({
        teamName: '<script>team</script>',
        id: '"><img src=x>',
        status: '<script>status</script>',
      }),
    ]),
  );
  assert.match(html, /&lt;script&gt;team&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>|<img src=x/);
  assert.match(html, /Статус недоступен/);
});

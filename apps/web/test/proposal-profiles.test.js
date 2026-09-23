import test from 'node:test';
import assert from 'node:assert/strict';
import { navItems, layout } from '../src/components/layout.js';
import { proposalCards } from '../src/components/proposal-list.js';
import { createProposalsService } from '../src/features/proposals/service.js';
import { createProposalsController } from '../src/features/proposals/controller.js';
import { createStore } from '../src/app/store.js';
import { createInitialState } from '../src/app/initial-state.js';
import { proposalCard } from '../src/components/proposal-card.js';

test('profile is accessible from the footer account, without profile or members navigation tabs', () => {
  for (const role of ['business', 'student']) {
    assert.ok(navItems(role).every(([route]) => !['profile', 'members'].includes(route)));
  }
  assert.match(
    layout('content', 'dashboard'),
    /class="account account-profile"\s+data-route="profile"/,
  );
});
test('proposal cards link each side to the actual counterpart and escape submitted text', () => {
  const item = {
    id: 'proposal',
    student_id: 'student-id',
    task_id: 10000,
    task: { title: 'Task', owner_id: 'business-id' },
    student: { full_name: '<script>student</script>' },
    team: 'Team',
    idea: '<img src=x>',
    plan: 'Plan',
    deadline: 'Week',
    link: 'javascript:alert(1)',
    status: 'pending',
  };
  const state = { proposalsData: { status: 'ready', items: [item] } };
  const business = proposalCards(state, true),
    student = proposalCards(state);
  assert.match(business, /#\/profile\?user=student-id/);
  assert.match(student, /#\/profile\?user=business-id/);
  assert.match(business, /&lt;script&gt;/);
  assert.doesNotMatch(business, /<script>|<img src=x>|href="javascript:/);
  assert.match(business, /data-action="proposal-select"/);
  assert.doesNotMatch(student, /data-action="proposal-select"/);
});
test('sending a proposal persists the selected task and authenticated student, never a forged owner or status', async () => {
  let inserted;
  const service = createProposalsService({
    from: (name) => {
      assert.equal(name, 'task_proposals');
      return {
        insert: (row) => {
          inserted = row;
          return { select: () => ({ single: async () => ({ data: { id: 'new' } }) }) };
        },
      };
    },
  });
  await service.send('student', 10004, {
    team: 'Team',
    idea: 'Idea',
    plan: 'Plan',
    deadline: 'Week',
    owner_id: 'fake',
    student_id: 'fake',
    status: 'selected',
  });
  assert.equal(inserted.task_id, 10004);
  assert.equal(inserted.student_id, 'student');
  assert.equal(inserted.owner_id, undefined);
  assert.equal(inserted.status, undefined);
  await assert.rejects(service.send('student', 2, {}));
  await assert.rejects(
    service.send('student', 10004, {
      team: 'Team',
      idea: 'Idea',
      plan: 'Plan',
      deadline: 'Week',
      link: 'javascript:alert(1)',
    }),
  );
});
test('old account responses cannot populate another user’s proposals', async (t) => {
  const previous = globalThis.window;
  globalThis.window = { location: { hash: '#/my-proposals' } };
  t.after(() => {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  });
  const auth = (id) => ({
    status: 'authenticated',
    user: { id },
    profile: { id, role: 'student' },
  });
  const store = createStore({ ...createInitialState(), auth: auth('student-a') });
  const pending = [];
  const controller = createProposalsController({
    store,
    router: { render() {} },
    repository: { list: () => new Promise((resolve) => pending.push(resolve)) },
  });
  const first = controller.load();
  await Promise.resolve();
  store.update((s) => ({ ...s, auth: auth('student-b') }));
  const second = controller.load();
  await Promise.resolve();
  pending[1]([{ id: 'b' }]);
  await second;
  pending[0]([{ id: 'a' }]);
  await first;
  assert.deepEqual(store.getState().proposals.items, [{ id: 'b' }]);
  controller.dispose();
});

test('canonical API proposal cards retain safe student profile navigation without exposing arbitrary link targets', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const item = {
    id,
    taskId: 47,
    taskTitle: 'Задача',
    teamName: 'Команда',
    idea: 'Идея',
    plan: 'План',
    deadline: 'Неделя',
    prototypeUrl: null,
    status: 'pending',
    decidedAt: null,
    createdAt: '2026-09-23T12:00:00Z',
    counterpartId: id,
  };
  assert.match(
    proposalCard(item, { canDecide: true }),
    new RegExp(`href="#/profile\\?user=${id}">Профиль студента`),
  );
  assert.doesNotMatch(
    proposalCard({ ...item, counterpartId: '"><script>bad</script>' }, { canDecide: true }),
    /href="#\/profile|<script>/,
  );
});

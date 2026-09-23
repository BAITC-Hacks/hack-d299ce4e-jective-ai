import assert from 'node:assert/strict';
import test from 'node:test';
import { proposals } from '../src/pages/proposals.js';
import { myProposals, student } from '../src/pages/student.js';
import { navItems } from '../src/components/layout.js';
import { createInitialState } from '../src/app/initial-state.js';

const sampleProposal = (values = {}) => ({
  id: '550e8400-e29b-41d4-a716-446655440001',
  taskId: 47,
  taskTitle: 'Прогноз спроса для малого бизнеса',
  teamName: 'Наша команда',
  idea: 'Исследовать сезонные изменения',
  plan: 'Получить данные\nПодготовить отчёт',
  deadline: 'До конца следующего месяца',
  prototypeUrl: 'https://example.com/prototype?project=47&view=demo',
  createdAt: '2026-09-23T10:30:00.000Z',
  status: 'pending',
  decidedAt: null,
  ...values,
});
function stateWith(items = [], status = 'ready', error = '') {
  return { ...createInitialState(), proposals: { items, status, error } };
}

test('both proposal pages have real loading, empty, retry and refresh states without demo cards', () => {
  for (const render of [proposals, myProposals]) {
    for (const status of ['idle', 'loading']) {
      const html = render(stateWith([], status));
      assert.match(html, /role="status">Загружаем отклики/);
      assert.match(html, /data-action="refresh-proposals"/);
    }
    const empty = render(stateWith());
    assert.match(empty, /пока нет откликов|пока не отправили/);
    assert.doesNotMatch(
      empty,
      /Data Wizards|Insight Lab|Демо|демонстрацион|6 откликов|choose|reject/,
    );
    const error = render(stateWith([], 'error', '<script>Ошибка</script>'));
    assert.match(error, /role="alert"/);
    assert.match(error, /data-action="retry-proposals"/);
    assert.match(error, /&lt;script&gt;Ошибка&lt;\/script&gt;/);
    assert.doesNotMatch(error, /<script>/);
  }
});

test('business and student proposal cards expose actual task association, date and all submitted fields', () => {
  const item = sampleProposal();
  for (const render of [proposals, myProposals]) {
    const html = render(stateWith([item]));
    for (const text of [item.taskTitle, item.teamName, item.idea, item.plan, item.deadline]) {
      assert.ok(html.includes(text), text);
    }
    assert.match(html, /href="#\/detail\?id=47"/);
    assert.match(html, /<time datetime="2026-09-23T10:30:00.000Z">/);
    assert.match(html, /href="https:\/\/example.com\/prototype\?project=47&amp;view=demo"/);
    assert.match(html, /target="_blank" rel="noopener noreferrer"/);
    assert.doesNotMatch(html, /data-action="choose"|data-action="reject"|Команда выбрана/);
  }
});

test('proposal text is escaped and unsafe prototype links never become clickable', () => {
  const malicious = '<img src=x onerror=alert(1)>';
  for (const render of [proposals, myProposals]) {
    const html = render(
      stateWith([
        sampleProposal({
          taskTitle: malicious,
          teamName: malicious,
          idea: malicious,
          plan: malicious,
          deadline: malicious,
        }),
      ]),
    );
    assert.doesNotMatch(html, /<img src=x/);
    assert.ok(html.split('&lt;img src=x onerror=alert(1)&gt;').length >= 6);
    for (const prototypeUrl of [
      'javascript:alert(1)',
      'data:text/html,<script>x</script>',
      'file:///secret',
      '//evil.example',
      'https://name:password@example.com/private',
      'not a url',
    ]) {
      const unsafe = render(stateWith([sampleProposal({ prototypeUrl })]));
      assert.doesNotMatch(unsafe, /target="_blank"|javascript:|name:password/);
      assert.match(unsafe, /Ссылка на прототип недоступна/);
    }
    assert.match(
      render(stateWith([sampleProposal({ prototypeUrl: null })])),
      /Прототип не приложен/,
    );
    assert.match(
      render(stateWith([sampleProposal({ prototypeUrl: 'http://example.com/prototype' })])),
      /href="http:\/\/example.com\/prototype"/,
    );
  }
});

test('multiple proposals retain their own task links and legacy demo state is ignored', () => {
  const state = stateWith([
    sampleProposal(),
    sampleProposal({ taskId: 91, taskTitle: 'Другая задача', teamName: 'Вторая команда' }),
  ]);
  state.proposalSent = true;
  state.proposedTaskId = 5;
  state.selected = true;
  for (const render of [proposals, myProposals]) {
    const html = render(state);
    assert.match(html, /href="#\/detail\?id=47"/);
    assert.match(html, /href="#\/detail\?id=91"/);
    assert.match(html, /Другая задача/);
    assert.doesNotMatch(html, /detail\?id=5|Демо|Data Wizards|Команда выбрана/);
  }
});

test('business navigation exposes proposals and student catalog remains independent', () => {
  assert.ok(
    navItems('business').some(([route, title]) => route === 'proposals' && title === 'Отклики'),
  );
  const state = stateWith([sampleProposal()]);
  state.catalog = {
    status: 'ready',
    error: '',
    items: [
      {
        id: 99,
        title: 'Новая опубликованная задача',
        description: 'Описание каталога',
        industry: '',
      },
    ],
  };
  const html = student(state);
  assert.match(html, /Новая опубликованная задача/);
  assert.match(html, /detail\?id=99/);
  assert.doesNotMatch(html, /Исследовать сезонные изменения/);
});

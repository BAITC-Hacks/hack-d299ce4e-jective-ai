import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateProposal,
  validateProposalList,
  validateProposalWrite,
  validateProposalDecision,
} from '../src/index.js';

const input = {
  taskId: 10,
  teamName: ' Команда ',
  idea: ' Идея ',
  plan: ' План ',
  deadline: ' Две недели ',
  prototypeUrl: 'https://example.com',
};

test('proposal contract preserves all form fields, trims text and normalizes safe links', () => {
  assert.deepEqual(validateProposalWrite(input), {
    taskId: 10,
    teamName: 'Команда',
    idea: 'Идея',
    plan: 'План',
    deadline: 'Две недели',
    prototypeUrl: 'https://example.com/',
  });
  assert.equal(validateProposalWrite({ ...input, prototypeUrl: null }).prototypeUrl, null);
  assert.equal(validateProposalWrite({ ...input, prototypeUrl: '' }).prototypeUrl, null);
  assert.equal(
    validateProposalWrite({ ...input, prototypeUrl: 'https://example.com/?email=a@b.co' })
      .prototypeUrl,
    'https://example.com/?email=a@b.co',
  );
});

test('proposal contract rejects forged identity, missing fields, excessive size and unsafe links', () => {
  const invalid = [
    null,
    [],
    { ...input, studentId: 'spoofed' },
    { ...input, id: 'spoofed' },
    { ...input, createdAt: 'spoofed' },
    { ...input, status: 'accepted' },
    { ...input, decidedAt: '2026-09-23T10:00:00Z' },
    { ...input, taskId: '10' },
    { ...input, taskId: 0 },
    { ...input, taskId: Number.MAX_SAFE_INTEGER + 1 },
    { ...input, taskId: 1.5 },
  ];
  for (const [field, max] of [
    ['teamName', 200],
    ['idea', 10_000],
    ['plan', 10_000],
    ['deadline', 200],
  ]) {
    invalid.push(
      { ...input, [field]: '' },
      { ...input, [field]: ' '.repeat(3) },
      { ...input, [field]: 'x'.repeat(max + 1) },
      { ...input, [field]: null },
    );
  }
  for (const prototypeUrl of [
    'javascript:alert(1)',
    'data:text/html,x',
    '/local',
    '//example.com',
    'https:example.com',
    'https://user:secret@example.com',
    'http://user@example.com',
    'https://exa mple.com',
    'https://example.com/\nsecret',
    'https://example.com/\\secret',
    'https://example.com/\u0000',
    'https://example.com/' + 'x'.repeat(2048),
  ])
    invalid.push({ ...input, prototypeUrl });
  for (const value of invalid) assert.throws(() => validateProposalWrite(value), TypeError);
});

test('private proposal DTO validates IDs, task title and timestamp and rejects arbitrary fields', () => {
  const dto = {
    ...input,
    id: '550e8400-e29b-41d4-a716-446655440000',
    taskTitle: 'Название',
    createdAt: '2026-09-23T10:00:00+00:00',
    status: 'pending',
    decidedAt: null,
  };
  assert.deepEqual(validateProposalList([dto]), [validateProposal(dto)]);
  for (const value of [
    { ...dto, id: '1' },
    { ...dto, taskTitle: '' },
    { ...dto, taskTitle: 'x'.repeat(201) },
    { ...dto, createdAt: 'yesterday' },
    { ...dto, createdAt: '2026-99-99T10:00:00Z' },
    { ...dto, student_id: dto.id },
    { ...dto, email: 'private@example.com' },
  ])
    assert.throws(() => validateProposal(value));
  assert.throws(() => validateProposalList({ data: [dto] }));
  for (const status of ['accepted', 'rejected'])
    assert.equal(validateProposal({ ...dto, status, decidedAt: dto.createdAt }).status, status);
  for (const value of [
    { ...dto, status: undefined },
    { ...dto, decidedAt: undefined },
    { ...dto, status: 'accepted' },
    { ...dto, status: 'rejected', decidedAt: 'yesterday' },
    { ...dto, decidedAt: dto.createdAt },
    { ...dto, status: 'unknown' },
  ])
    assert.throws(() => validateProposal(value));
});

test('decision writes only accept a terminal decision with an explicit expected current status', () => {
  for (const status of ['accepted', 'rejected'])
    for (const expectedStatus of ['pending', 'accepted', 'rejected'])
      assert.deepEqual(validateProposalDecision({ status, expectedStatus }), {
        status,
        expectedStatus,
      });
  for (const value of [
    null,
    [],
    {},
    { status: 'accepted' },
    { expectedStatus: 'pending' },
    { status: 'pending', expectedStatus: 'accepted' },
    { status: 'accepted', expectedStatus: 'unknown' },
    { status: 'accepted', expectedStatus: 'pending', decidedAt: '2026-09-23T10:00:00Z' },
    { status: 'accepted', expectedStatus: 'pending', studentId: 'spoofed' },
    { status: 'accepted', expectedStatus: 'pending', idea: 'overwrite' },
  ])
    assert.throws(() => validateProposalDecision(value));
});

test('proposal text limits match PostgreSQL Unicode code points and reject invalid text encoding', () => {
  assert.equal(
    validateProposalWrite({ ...input, teamName: '😀'.repeat(200) }).teamName,
    '😀'.repeat(200),
  );
  assert.throws(() => validateProposalWrite({ ...input, teamName: '😀'.repeat(201) }));
  assert.throws(() => validateProposalWrite({ ...input, idea: '\u0000' }));
  assert.throws(() => validateProposalWrite({ ...input, idea: '\ud800' }));
  assert.equal(
    validateProposalWrite({ ...input, teamName: '\n\t\u00a0Команда\ufeff' }).teamName,
    'Команда',
  );
});

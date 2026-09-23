import assert from 'node:assert/strict';
import test from 'node:test';
import { validateAuthUserResponse, validateProfile } from '../src/index.js';

const id = '11111111-1111-4111-8111-111111111111';
const profile = {
  id,
  full_name: 'Test User',
  role: 'student',
  created_at: '2026-09-23T00:00:00Z',
  updated_at: '2026-09-23T00:00:00Z',
};

test('auth DTOs copy only approved user/profile columns and normalize display names', () => {
  const input = {
    user: { id, email: 'user@example.com', password: 'secret' },
    profile: { ...profile, full_name: ' Test User ', private: 'secret' },
    token: 'secret',
  };
  assert.deepEqual(validateAuthUserResponse(input), {
    user: { id, email: 'user@example.com' },
    profile,
  });
  assert.notEqual(validateProfile(profile), profile);
});

test('profiles reject invalid IDs, empty/long names, unrecognized roles and invalid timestamps', () => {
  for (const bad of [
    null,
    {},
    { ...profile, id: 'invalid' },
    { ...profile, full_name: '' },
    { ...profile, full_name: 'x'.repeat(121) },
    { ...profile, role: 'admin' },
    { ...profile, created_at: 'invalid' },
    { ...profile, updated_at: null },
  ]) {
    assert.throws(() => validateProfile(bad), TypeError);
  }
});

test('auth responses reject a mismatching profile or absent verified identity', () => {
  for (const bad of [
    null,
    {},
    { user: { id, email: '' }, profile },
    { user: { id: '22222222-2222-4222-8222-222222222222', email: 'user@example.com' }, profile },
  ]) {
    assert.throws(() => validateAuthUserResponse(bad), TypeError);
  }
});

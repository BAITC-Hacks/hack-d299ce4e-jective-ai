import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateProfile,
  safeSocialUrl,
  createProfilesService,
} from '../src/features/profiles/service.js';
import { profilePage, membersPage } from '../src/pages/profile.js';
import { createProfilesController } from '../src/features/profiles/controller.js';
import { createStore } from '../src/app/store.js';
import { createInitialState } from '../src/app/initial-state.js';

const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const profile = {
  id: owner,
  full_name: 'Alice',
  role: 'business',
  social_links: {},
  avatar_path: '',
};
function state() {
  return {
    ...createInitialState(),
    auth: { status: 'authenticated', user: { id: owner, email: 'private@example.com' }, profile },
    profilePage: { status: 'ready', profile },
  };
}
test('profile input strips privileged fields and rejects unsafe or misleading social URLs', () => {
  const clean = validateProfile({
    full_name: ' Alice ',
    role: 'student',
    id: other,
    avatar_path: 'wrong',
    social_links: { github: 'https://github.com/alice' },
  });
  assert.equal(clean.full_name, 'Alice');
  assert.equal(clean.role, undefined);
  assert.equal(clean.id, undefined);
  assert.equal(clean.avatar_path, undefined);
  for (const url of [
    'javascript:alert(1)',
    'https://github.com.evil.test/a',
    'https://user:pass@github.com/a',
    'http://github.com/a',
  ]) {
    assert.equal(safeSocialUrl(url, 'github'), '');
    assert.throws(() => validateProfile({ full_name: 'Alice', social_links: { github: url } }));
  }
  assert.throws(() => validateProfile({ full_name: 'Alice', bio: 'x'.repeat(2001) }));
  assert.throws(() => validateProfile({ full_name: '  ' }));
});

test('other profiles show escaped information and links without owner settings or email', () => {
  const data = state();
  data.profilePage.profile = {
    ...profile,
    id: other,
    full_name: '<script>bad</script>',
    bio: '<img src=x>',
    social_links: { github: 'javascript:alert(1)', linkedin: 'https://linkedin.com/in/bob' },
  };
  data.profilePage.editing = true;
  const html = profilePage(data);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /https:\/\/linkedin.com\/in\/bob/);
  assert.doesNotMatch(html, /private@example.com|id="profile-form"|javascript:|<script>/);
  data.profilePage.members = [data.profilePage.profile];
  assert.match(membersPage(data), new RegExp(`#/profile\\?user=${other}`));
});

test('failed avatar metadata save removes the new upload and preserves the previous photo', async () => {
  const removed = [];
  const storage = {
    upload: async () => ({ data: {} }),
    remove: async (paths) => {
      removed.push(...paths);
      return {};
    },
  };
  const service = createProfilesService({
    storage: { from: () => storage },
    from: () => ({
      update: () => ({
        eq: () => ({ select: () => ({ single: async () => ({ error: new Error('failure') }) }) }),
      }),
    }),
  });
  await assert.rejects(service.avatar(owner, new Blob(['image']), `${owner}/previous.jpg`));
  assert.equal(removed.length, 1);
  assert.ok(removed[0].startsWith(`${owner}/`));
  assert.ok(!removed.includes(`${owner}/previous.jpg`));
});

test('late profile responses cannot replace a newly selected user', async (t) => {
  const previous = globalThis.window;
  globalThis.window = { location: { hash: `#/profile?user=${owner}` } };
  t.after(() => {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  });
  const pending = [];
  const store = createStore(state());
  const controller = createProfilesController({
    store,
    router: { render() {} },
    service: { get: (id) => new Promise((resolve) => pending.push({ id, resolve })) },
  });
  const first = controller.sync();
  globalThis.window.location.hash = `#/profile?user=${other}`;
  const second = controller.sync();
  pending[1].resolve({ ...profile, id: other });
  await second;
  pending[0].resolve(profile);
  await first;
  assert.equal(store.getState().profilePage.profile.id, other);
  controller.dispose();
});

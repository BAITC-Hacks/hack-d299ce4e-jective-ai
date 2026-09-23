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

test('optional avatar signing failure does not hide a loaded profile or fail the directory', async () => {
  const row = { ...profile, avatar_path: `${owner}/photo.jpg` };
  const query = {
    select() {
      return query;
    },
    eq() {
      return query;
    },
    order() {
      return query;
    },
    async maybeSingle() {
      return { data: row };
    },
    async range() {
      return { data: [row] };
    },
  };
  const service = createProfilesService({
    from: () => query,
    storage: {
      from: () => ({
        async createSignedUrl() {
          throw new Error('Temporary image service failure');
        },
      }),
    },
  });
  assert.deepEqual(await service.get(owner), { ...row, avatar_url: '' });
  assert.deepEqual(await service.list(), [{ ...row, avatar_url: '' }]);
});

test('an old photo cleanup failure cannot turn a committed avatar change into a failed save', async () => {
  let updated;
  const service = createProfilesService({
    storage: {
      from: () => ({
        async upload() {
          return { data: {} };
        },
        async remove() {
          throw new Error('Cleanup is offline');
        },
        async createSignedUrl() {
          return { data: { signedUrl: 'https://example.com/photo' } };
        },
      }),
    },
    from: () => ({
      update(values) {
        updated = values;
        return {
          eq: () => ({
            select: () => ({ single: async () => ({ data: { ...profile, ...values } }) }),
          }),
        };
      },
    }),
  });
  const result = await service.avatar(owner, new Blob(['image']), `${owner}/previous.jpg`);
  assert.equal(result.avatar_path, updated.avatar_path);
  assert.equal(result.avatar_url, 'https://example.com/photo');
});

test('profile reset scopes late reads and avatar preparation to the current authenticated account', async (t) => {
  const previous = globalThis.window;
  globalThis.window = { location: { hash: '#/profile' } };
  t.after(() => {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  });
  const store = createStore(state());
  let resolveImage;
  let writes = 0;
  let gets = 0;
  const controller = createProfilesController({
    store,
    router: { render() {} },
    service: {
      async avatar() {
        writes++;
        return profile;
      },
      async get() {
        gets++;
        return profile;
      },
    },
    prepare: () =>
      new Promise((resolve) => {
        resolveImage = resolve;
      }),
  });
  t.after(() => controller.dispose());
  await controller.sync();
  await controller.sync();
  assert.equal(gets, 1);
  const uploading = controller.upload(new Blob(['image']));
  store.update((s) => ({
    ...s,
    auth: { ...s.auth, user: { id: other }, profile: { ...profile, id: other } },
  }));
  controller.reset();
  resolveImage(new Blob(['ready']));
  await uploading;
  assert.equal(writes, 0);
  assert.equal(store.getState().profilePage.profile, null);
  assert.equal(store.getState().profilePage.busy, false);
  store.update((s) => ({ ...s, auth: state().auth }));
  await controller.sync();
  assert.equal(gets, 2);
});

test('unverified identities cannot load, edit or write a retained profile', async (t) => {
  const previous = globalThis.window;
  globalThis.window = { location: { hash: '#/profile' } };
  t.after(() => {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  });
  const data = state();
  data.auth.status = 'initializing';
  const store = createStore(data);
  let calls = 0;
  const controller = createProfilesController({
    store,
    router: { render() {} },
    service: {
      async get() {
        calls++;
      },
      async avatar() {
        calls++;
      },
    },
  });
  t.after(() => controller.dispose());
  await controller.sync();
  controller.actions['profile-edit']();
  await controller.actions['profile-remove-avatar']();
  assert.equal(calls, 0);
  assert.notEqual(store.getState().profilePage.editing, true);
});

test('full profile keeps logout available in the owner page for mobile without exposing it on another profile', () => {
  const own = profilePage(state());
  const content = own.match(/<div class="content">([\s\S]*)<\/main>/)?.[1];
  assert.match(content, /data-action="logout"/);
  const otherState = state();
  otherState.profilePage.profile = { ...profile, id: other };
  const otherContent = profilePage(otherState).match(/<div class="content">([\s\S]*)<\/main>/)?.[1];
  assert.doesNotMatch(otherContent, /data-action="logout"/);
});

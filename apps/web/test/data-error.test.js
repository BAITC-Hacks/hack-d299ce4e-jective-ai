import test from 'node:test';
import assert from 'node:assert/strict';
import { dataErrorMessage } from '../src/shared/data-error.js';

test('missing schema, expired session and denied permissions have distinct messages without provider details', () => {
  assert.match(dataErrorMessage({ code: 'PGRST205' }), /обновить базу данных/);
  assert.match(dataErrorMessage({ code: 'PGRST204' }), /обновить базу данных/);
  assert.match(dataErrorMessage({ code: '42501' }), /Нет доступа/);
  assert.match(dataErrorMessage({ code: 'PGRST301' }), /Сессия истекла/);
  assert.equal(
    dataErrorMessage({ message: 'secret provider details' }, 'Повторите позже.'),
    'Повторите позже.',
  );
});

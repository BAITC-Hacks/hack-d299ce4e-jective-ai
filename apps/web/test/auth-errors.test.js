import assert from 'node:assert/strict';
import test from 'node:test';
import { authErrorMessage } from '../src/features/auth/errors.js';
import { createHttpClient } from '../src/shared/api/client.js';

const unavailableMessage =
  'Сервер приложения недоступен. Проверьте, что сервер запущен, и повторите попытку.';

test('empty 502 proxy responses explain that the application server is unavailable', async () => {
  const client = createHttpClient({
    fetchImpl: async () => new Response(null, { status: 502 }),
  });
  await assert.rejects(client.get('/auth/me'), (error) => {
    assert.equal(error.code, 'INVALID_RESPONSE');
    assert.equal(error.status, 502);
    assert.equal(authErrorMessage(error), unavailableMessage);
    return true;
  });
});

test('unrecognized proxy and service failures use a safe actionable message', () => {
  for (const status of [502, 503, 504]) {
    for (const code of [undefined, 'INVALID_RESPONSE', 'INTERNAL_ERROR']) {
      assert.equal(
        authErrorMessage({ status, code, message: '<html>private server details</html>' }),
        unavailableMessage,
      );
    }
  }
});

test('known authentication errors take precedence over generic HTTP status handling', () => {
  const cases = [
    ['AUTH_NOT_CONFIGURED', 'Регистрация и вход временно недоступны.'],
    ['AUTH_UNAVAILABLE', 'Сервис входа временно недоступен. Повторите попытку.'],
    ['invalid_credentials', 'Неверный email или пароль.'],
    ['email_not_confirmed', 'Подтвердите email по ссылке из письма, затем войдите.'],
    ['PROFILE_NOT_FOUND', 'Не удалось найти профиль аккаунта. Обратитесь к администратору.'],
    ['UNAUTHORIZED', 'Сессия истекла. Войдите ещё раз.'],
  ];
  for (const [code, expected] of cases) {
    assert.equal(authErrorMessage({ code, status: 503 }), expected);
  }
});

test('rate limiting and transport failures retain their specific guidance', () => {
  assert.equal(
    authErrorMessage({ status: 429 }),
    'Слишком много попыток. Попробуйте немного позже.',
  );
  assert.equal(
    authErrorMessage({ name: 'AuthRetryableFetchError' }),
    'Не удалось связаться с сервером. Проверьте подключение и повторите попытку.',
  );
  assert.equal(
    authErrorMessage({ code: 'ABORTED' }),
    'Сервер не ответил вовремя. Повторите попытку.',
  );
});

test('unknown errors never expose raw response content', () => {
  for (const error of [undefined, null, new Error('private server details')]) {
    assert.equal(
      authErrorMessage(error),
      'Не удалось выполнить вход или регистрацию. Попробуйте ещё раз.',
    );
  }
});

const messages = {
  invalid_credentials: 'Неверный email или пароль.',
  email_not_confirmed: 'Подтвердите email по ссылке из письма, затем войдите.',
  user_already_exists: 'Не удалось зарегистрироваться. Попробуйте войти в существующий аккаунт.',
  email_exists: 'Не удалось зарегистрироваться. Попробуйте войти в существующий аккаунт.',
  weak_password: 'Пароль не соответствует требованиям. Выберите более сложный пароль.',
  over_email_send_rate_limit: 'Слишком много писем. Подождите немного и повторите попытку.',
  over_request_rate_limit: 'Слишком много попыток. Попробуйте немного позже.',
  signup_disabled: 'Регистрация новых пользователей временно отключена.',
  email_address_invalid: 'Проверьте правильность email.',
  email_address_not_authorized: 'Регистрация с этим email сейчас недоступна.',
  AUTH_NOT_CONFIGURED: 'Регистрация и вход временно недоступны.',
  AUTH_UNAVAILABLE: 'Сервис входа временно недоступен. Повторите попытку.',
  API_UNAVAILABLE:
    'Сервер приложения недоступен. Проверьте, что сервер запущен, и повторите попытку.',
  PROFILE_NOT_FOUND: 'Не удалось найти профиль аккаунта. Обратитесь к администратору.',
  UNAUTHORIZED: 'Сессия истекла. Войдите ещё раз.',
  NETWORK_ERROR: 'Не удалось связаться с сервером. Проверьте подключение и повторите попытку.',
  ABORTED: 'Сервер не ответил вовремя. Повторите попытку.',
};

export function authErrorMessage(error) {
  if (messages[error?.code]) return messages[error.code];
  if (error?.status === 429) return messages.over_request_rate_limit;
  if ([502, 503, 504].includes(error?.status)) return messages.API_UNAVAILABLE;
  if (error?.name === 'AuthRetryableFetchError') return messages.NETWORK_ERROR;
  return 'Не удалось выполнить вход или регистрацию. Попробуйте ещё раз.';
}

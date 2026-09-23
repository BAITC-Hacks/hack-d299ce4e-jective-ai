export function dataErrorMessage(error, fallback) {
  if (['PGRST205', 'PGRST204', '42P01', '42703', 'PGRST200'].includes(error?.code))
    return 'Настройка хранения ещё не завершена. Администратору необходимо обновить базу данных.';
  if (['PGRST301', 'PGRST303'].includes(error?.code))
    return 'Сессия истекла. Войдите в аккаунт ещё раз.';
  if (error?.code === '42501')
    return 'Нет доступа к этим данным. Проверьте вход в аккаунт; если ошибка повторяется, обратитесь к администратору.';
  return fallback;
}

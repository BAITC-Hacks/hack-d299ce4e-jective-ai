/** Initial session data for the interactive prototype; not authentication state. */
export function createInitialState() {
  return {
    ...{
      role: 'business',
      rating: 76,
      published: false,
      selected: false,
      proposalSent: false,
      saved: false,
      filters: { search: '', industry: '', direction: '', level: '', sort: 'rating' },
      description: '',
      answers: {},
      fields: {
        Контекст:
          'Компания работает в сфере финансовых технологий и обслуживает клиентов через мобильное приложение. Мы заметили рост оттока и хотим лучше понять его причины.',
        'Бизнес-потребность':
          'Выявить факторы ухода клиентов и заранее находить тех, кому может потребоваться дополнительная поддержка.',
        Пользователи: 'Команда аналитики и менеджеры по работе с клиентами.',
        'Доступные данные':
          'Обезличенная история активности, обращения в поддержку и данные о продуктах за последние 12 месяцев.',
        'Ожидаемый результат':
          'Аналитический отчёт, модель оценки риска оттока и наглядный dashboard с ключевыми факторами.',
        'Критерии успеха': 'Добавьте измеримые критерии успеха.',
        Ограничения: 'Работа только с обезличенными данными. Срок проекта — до 4 недель.',
        'Контакт и взаимодействие':
          'Еженедельные встречи с куратором компании и обратная связь в рабочем чате.',
      },
    },
    currentTaskId: 2,
    proposedTaskId: null,
    savedTaskIds: [],
    catalog: { items: [], status: 'idle', error: '' },
    auth: {
      configured: false,
      status: 'initializing',
      user: null,
      profile: null,
      error: '',
      notice: '',
      busy: false,
    },
  };
}

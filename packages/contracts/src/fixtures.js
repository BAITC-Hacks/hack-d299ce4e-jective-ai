import { validateTaskList } from './index.js';

/** Public demo data shared by the browser's demo adapter and API repository. */
export const demoTasks = Object.freeze(
  validateTaskList([
    {
      id: 1,
      title: 'Прогнозирование спроса',
      industry: 'Retail',
      direction: 'Machine Learning',
      score: 94,
      reply: 12,
      description: 'Помогите прогнозировать спрос на товары с учётом сезонности и истории продаж.',
      tags: ['Python', 'ML', 'Analytics'],
    },
    {
      id: 2,
      title: 'Анализ оттока клиентов',
      industry: 'FinTech',
      direction: 'Analytics',
      score: 82,
      reply: 6,
      description:
        'Исследуйте причины оттока и предложите подход к прогнозированию риска ухода клиентов.',
      tags: ['Python', 'ML', 'Data'],
    },
    {
      id: 3,
      title: 'AI-помощник службы поддержки',
      industry: 'Telecom',
      direction: 'AI',
      score: 57,
      reply: 3,
      description:
        'Предложите концепцию помощника, который быстрее отвечает на частые вопросы пользователей.',
      tags: ['AI', 'NLP'],
    },
    {
      id: 4,
      title: 'Оптимизация складских процессов',
      industry: 'Logistics',
      direction: 'Analytics',
      score: 34,
      reply: 0,
      description:
        'Найдите возможности улучшить движение товаров и снизить время обработки заказов.',
      tags: ['Operations', 'Data'],
    },
  ]).map((task) => Object.freeze({ ...task, tags: Object.freeze(task.tags) })),
);

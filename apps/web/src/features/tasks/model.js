export function level(score) {
  if (score >= 90) return ['Приоритетная', 'priority'];
  if (score >= 70) return ['Готовая', 'ready'];
  if (score >= 40) return ['Рабочая', 'working'];
  return ['Черновик', 'draft'];
}

export function publishedTask(state) {
  return {
    id: 5,
    title: 'Анализ и прогнозирование оттока клиентов',
    industry: 'FinTech',
    direction: 'Analytics',
    score: state.rating,
    reply: 0,
    description: 'Исследуйте причины оттока и создайте модель оценки риска ухода клиентов.',
    tags: ['Machine Learning', 'Analytics'],
  };
}

function allTasks(state) {
  return state.published ? [...state.catalog.items, publishedTask(state)] : state.catalog.items;
}

export function getTask(state, id = state.currentTaskId) {
  return allTasks(state).find((task) => task.id === id);
}

export function selectTasks(state) {
  const filters = state.filters;
  const search = filters.search.trim().toLocaleLowerCase('ru');
  return allTasks(state)
    .filter((task) => {
      const text = [task.title, task.description, task.industry, ...task.tags].join(' ');
      return (
        (!search || text.toLocaleLowerCase('ru').includes(search)) &&
        (!filters.industry || task.industry === filters.industry) &&
        (!filters.direction || task.direction === filters.direction) &&
        (!filters.level || level(task.score)[0] === filters.level)
      );
    })
    .sort((a, b) => (filters.sort === 'new' ? b.id - a.id : b.score - a.score));
}

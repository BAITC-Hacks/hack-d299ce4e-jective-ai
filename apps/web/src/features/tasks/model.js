export function level(score) {
  if (score === null || score === undefined) return ['Нет оценки', 'soft'];
  if (score >= 90) return ['Приоритетная', 'priority'];
  if (score >= 70) return ['Готовая', 'ready'];
  if (score >= 40) return ['Рабочая', 'working'];
  return ['Черновик', 'draft'];
}

export function getTask(state, id = state.currentTaskId) {
  return state.catalog.items.find((task) => task.id === id);
}

export function selectTasks(state) {
  const filters = state.filters;
  const search = filters.search.trim().toLocaleLowerCase('ru');
  return state.catalog.items
    .filter((task) => {
      const text = [task.title, task.description, task.industry, ...task.tags].join(' ');
      return (
        (!search || text.toLocaleLowerCase('ru').includes(search)) &&
        (!filters.industry || task.industry === filters.industry) &&
        (!filters.direction || task.direction === filters.direction) &&
        (!filters.level || level(task.score)[0] === filters.level)
      );
    })
    .sort((a, b) => (filters.sort === 'new' ? b.id - a.id : (b.score ?? -1) - (a.score ?? -1)));
}

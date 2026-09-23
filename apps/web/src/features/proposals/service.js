import { dataErrorMessage } from '../../shared/data-error.js';

export function createProposalsService(db) {
  function client() {
    if (!db) throw new Error('Сохранение временно недоступно.');
    return db;
  }
  function check(result, duplicate = 'Вы уже отправили отклик на эту задачу.') {
    if (result.error)
      throw new Error(
        result.error.code === '23505'
          ? duplicate
          : dataErrorMessage(
              result.error,
              'Не удалось загрузить или сохранить данные. Попробуйте позже.',
            ),
      );
    return result.data;
  }
  return {
    async tasks() {
      const rows = check(
        await client().from('business_tasks').select('*').order('id', { ascending: false }),
      );
      return rows.map((row) => ({
        ...row,
        id: Number(row.id),
        ownerId: row.owner_id,
        industry: 'Бизнес',
        direction: 'Analytics',
        reply: 0,
        tags: [],
      }));
    },
    async publish(owner, state) {
      const title = (state.fields['Название'] || '').trim();
      const description = (
        state.fields['Описание проблемы'] ||
        state.fields['Контекст'] ||
        state.description ||
        ''
      ).trim();
      if (!title || !description)
        throw new Error('Добавьте название и описание задачи перед публикацией.');
      const row = {
        owner_id: owner,
        title,
        description,
        fields: state.fields,
        score: state.rating || 0,
      };
      return check(await client().from('business_tasks').insert(row).select('id').single());
    },
    async list() {
      return check(
        await client()
          .from('task_proposals')
          .select(
            '*,task:business_tasks(id,title,owner_id),student:profiles!task_proposals_student_id_fkey(id,full_name)',
          )
          .order('created_at', { ascending: false }),
      );
    },
    async send(studentId, taskId, values) {
      if (!Number.isSafeInteger(taskId) || taskId < 10000)
        throw new Error('Выберите опубликованную задачу.');
      const row = { student_id: studentId, task_id: taskId };
      for (const [key, max] of [
        ['team', 120],
        ['idea', 5000],
        ['plan', 5000],
        ['deadline', 120],
        ['link', 500],
      ]) {
        row[key] = String(values[key] || '').trim();
        if (row[key].length > max || (key !== 'link' && !row[key]))
          throw new Error('Заполните поля отклика и соблюдайте ограничения длины.');
      }
      if (row.link && !/^https:\/\//i.test(row.link))
        throw new Error('Ссылка должна начинаться с https://');
      if (row.link) {
        let url;
        try {
          url = new URL(row.link);
        } catch {
          throw new Error('Проверьте ссылку на прототип.');
        }
        if (url.username || url.password)
          throw new Error('Ссылка не должна содержать логин или пароль.');
      }
      return check(await client().from('task_proposals').insert(row).select('id').single());
    },
    async decide(id, status) {
      if (!['selected', 'rejected'].includes(status)) throw new Error('Неверный статус.');
      return check(
        await client().from('task_proposals').update({ status }).eq('id', id).select('id').single(),
        'Для этой задачи уже выбрана команда.',
      );
    },
  };
}

import { createClient } from '@supabase/supabase-js';
import { validateProposal } from '@ai-sana/contracts';
import { HttpError } from '../../shared/http-error.js';

const columns =
  'id,task_id,student_id,team_name,idea,plan,deadline,prototype_url,created_at,status,decided_at';

function databaseError(error) {
  if (['PGRST205', 'PGRST204', '42P01', '42703'].includes(error?.code)) {
    return new HttpError(
      503,
      'PROPOSALS_SCHEMA_MISSING',
      'Схема откликов ещё не настроена. Выполните SQL-миграции 20260923000400_proposals.sql и 20260923000500_proposal_decisions.sql в Supabase.',
    );
  }
  if (error?.code === '42501') {
    return new HttpError(
      403,
      'PROPOSALS_FORBIDDEN',
      'Нет доступа к отклику. Проверьте роль и политики доступа в Supabase.',
    );
  }
  if (error?.code === '23503') {
    return new HttpError(404, 'TASK_NOT_FOUND', 'Опубликованная задача не найдена.');
  }
  if (['23514', '22001', '22003', '22P02'].includes(error?.code)) {
    return new HttpError(
      400,
      'INVALID_PROPOSAL',
      'Данные отклика не соответствуют ограничениям таблицы.',
    );
  }
  return new HttpError(
    503,
    'PROPOSALS_UNAVAILABLE',
    'Не удалось загрузить или сохранить отклик. Попробуйте ещё раз.',
  );
}

function writeColumns(input) {
  return {
    task_id: input.taskId,
    team_name: input.teamName,
    idea: input.idea,
    plan: input.plan,
    deadline: input.deadline,
    prototype_url: input.prototypeUrl,
  };
}

function toProposal(row, taskTitle) {
  const dto = {
    id: row.id,
    taskId: row.task_id,
    taskTitle,
    teamName: row.team_name,
    idea: row.idea,
    plan: row.plan,
    deadline: row.deadline,
    prototypeUrl: row.prototype_url,
    createdAt: row.created_at,
    status: row.status,
    decidedAt: row.decided_at,
  };
  try {
    return validateProposal(dto);
  } catch (error) {
    if (dto.prototypeUrl == null) throw error;
    // Direct authenticated SQL/API writes may satisfy the database's conservative
    // URL check but fail WHATWG parsing. Hide that optional link, not all proposals.
    // All required fields remain strictly validated; links are never fetched here.
    return validateProposal({ ...dto, prototypeUrl: null });
  }
}

/** Every request uses the verified user's JWT. RLS remains active for reads and writes. */
export function createSupabaseProposalRepository({
  config = null,
  clientFactory = createClient,
} = {}) {
  function clientFor(accessToken) {
    if (!config) {
      throw new HttpError(
        503,
        'PROPOSALS_NOT_CONFIGURED',
        'Настройте SUPABASE_URL и SUPABASE_PUBLISHABLE_KEY в apps/api/.env.',
      );
    }
    return clientFactory(config.url, config.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
  }
  async function safely(run) {
    try {
      return await run();
    } catch (error) {
      if (error instanceof HttpError) throw error;
      // Never log SDK errors: they can contain headers or private proposal fields.
      throw databaseError(error);
    }
  }
  return {
    list({ userId, role, accessToken }) {
      return safely(async () => {
        const client = clientFor(accessToken);
        let titles;
        let query;
        if (role === 'business') {
          const { data: tasks, error } = await client
            .from('tasks')
            .select('id,title,owner_id')
            .eq('owner_id', userId);
          if (error) throw databaseError(error);
          if (!Array.isArray(tasks) || tasks.some((task) => task.owner_id !== userId))
            throw databaseError();
          titles = new Map(tasks.map((task) => [task.id, task.title]));
          if (!titles.size) return [];
          query = client
            .from('proposals')
            .select(columns)
            .in('task_id', [...titles.keys()]);
        } else {
          query = client.from('proposals').select(columns).eq('student_id', userId);
        }
        const { data: rows, error } = await query
          .order('created_at', { ascending: false })
          .order('id', { ascending: false });
        if (error) throw databaseError(error);
        if (!Array.isArray(rows)) throw databaseError();
        if (role === 'student') {
          if (rows.some((row) => row.student_id !== userId)) throw databaseError();
          if (!rows.length) return [];
          const { data: tasks, error: titleError } = await client
            .from('published_tasks')
            .select('id,title')
            .in('id', [...new Set(rows.map((row) => row.task_id))]);
          if (titleError) throw databaseError(titleError);
          if (!Array.isArray(tasks)) throw databaseError();
          titles = new Map(tasks.map((task) => [task.id, task.title]));
        }
        return rows.map((row) => {
          if (!titles.has(row.task_id)) throw databaseError();
          return toProposal(row, titles.get(row.task_id));
        });
      });
    },
    create(input, { userId, accessToken }) {
      return safely(async () => {
        const client = clientFor(accessToken);
        const { data: task, error: taskError } = await client
          .from('published_tasks')
          .select('id,title')
          .eq('id', input.taskId)
          .maybeSingle();
        if (taskError) throw databaseError(taskError);
        if (!task) throw new HttpError(404, 'TASK_NOT_FOUND', 'Опубликованная задача не найдена.');
        if (task.id !== input.taskId) throw databaseError();
        const values = writeColumns(input);
        const find = async () => {
          const { data, error } = await client
            .from('proposals')
            .select(columns)
            .eq('student_id', userId)
            .eq('task_id', input.taskId)
            .maybeSingle();
          if (error) throw databaseError(error);
          return data;
        };
        const existingProposal = (row) => {
          if (row.student_id !== userId || row.task_id !== input.taskId) throw databaseError();
          if (Object.entries(values).some(([key, value]) => row[key] !== value)) {
            throw new HttpError(
              409,
              'PROPOSAL_EXISTS',
              'Вы уже отправили отклик на эту задачу. Он доступен в разделе «Мои отклики».',
            );
          }
          return toProposal(row, task.title);
        };
        const existing = await find();
        if (existing) return existingProposal(existing);
        const { data, error } = await client
          .from('proposals')
          .insert(values)
          .select(columns)
          .single();
        if (!error) return existingProposal(data);
        if (error.code === '23505') {
          const concurrent = await find();
          if (concurrent) return existingProposal(concurrent);
        }
        throw databaseError(error);
      });
    },
    decide(id, input, { userId, accessToken }) {
      return safely(async () => {
        const client = clientFor(accessToken);
        const notFound = () => new HttpError(404, 'PROPOSAL_NOT_FOUND', 'Отклик не найден.');
        const conflict = () =>
          new HttpError(
            409,
            'PROPOSAL_DECISION_CONFLICT',
            'Статус отклика уже изменился. Обновите список и повторите решение.',
          );
        const readOwn = async () => {
          const { data: row, error } = await client
            .from('proposals')
            .select(columns)
            .eq('id', id)
            .maybeSingle();
          if (error) throw databaseError(error);
          if (!row || row.id !== id) throw notFound();
          const { data: task, error: taskError } = await client
            .from('tasks')
            .select('id,title,owner_id')
            .eq('id', row.task_id)
            .eq('owner_id', userId)
            .maybeSingle();
          if (taskError) throw databaseError(taskError);
          if (!task || task.id !== row.task_id || task.owner_id !== userId) throw notFound();
          return { row, dto: toProposal(row, task.title) };
        };
        const current = await readOwn();
        // A timed-out successful request may be safely retried using its old expectation.
        if (current.row.status === input.status) return current.dto;
        if (current.row.status !== input.expectedStatus) throw conflict();
        const { data, error } = await client
          .from('proposals')
          .update({ status: input.status })
          .eq('id', id)
          .eq('task_id', current.row.task_id)
          .eq('status', input.expectedStatus)
          .select(columns)
          .maybeSingle();
        if (error) throw databaseError(error);
        if (data) {
          if (
            data.id !== id ||
            data.task_id !== current.row.task_id ||
            data.student_id !== current.row.student_id ||
            data.status !== input.status
          )
            throw databaseError();
          return toProposal(data, current.dto.taskTitle);
        }
        // Compare-and-set lost a race; never blindly overwrite the newer decision.
        const latest = await readOwn();
        if (latest.row.status === input.status) return latest.dto;
        throw conflict();
      });
    },
  };
}

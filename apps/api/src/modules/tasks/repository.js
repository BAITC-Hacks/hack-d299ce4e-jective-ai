import { createClient } from '@supabase/supabase-js';
import { TASK_CARD_FIELDS, validateTask, validateTaskWorkspace } from '@ai-sana/contracts';
import { HttpError } from '../../shared/http-error.js';

const columnByField = {
  expectedResult: 'expected_result',
  successCriteria: 'success_criteria',
  businessContact: 'business_contact',
  interactionFormat: 'interaction_format',
};
const column = (field) => columnByField[field] || field;
const publicColumns = [
  'id',
  ...TASK_CARD_FIELDS.filter((field) => field !== 'businessContact').map(column),
  'industry',
  'direction',
  'tags',
  'score',
  'status',
  'created_at',
  'updated_at',
  'published_at',
];
const ownColumns = [
  ...publicColumns,
  'owner_id',
  'request_id',
  'original_description',
  'business_contact',
  'analysis_snapshot',
].join(',');
const publishedColumns = [...publicColumns, 'description'].join(',');

function databaseError(error) {
  if (['PGRST205', 'PGRST204', '42P01', '42703'].includes(error?.code))
    return new HttpError(
      503,
      'TASKS_SCHEMA_MISSING',
      'Таблица задач ещё не настроена. Выполните SQL-миграцию задач в Supabase.',
    );
  if (['23514', '22001', '22003', '22P02'].includes(error?.code))
    return new HttpError(
      400,
      'INVALID_TASK',
      'Данные задачи не соответствуют ограничениям таблицы.',
    );
  if (error?.code === '42501')
    return new HttpError(
      403,
      'TASKS_FORBIDDEN',
      'Нет доступа к задаче. Проверьте роль и политики доступа в Supabase.',
    );
  return new HttpError(
    503,
    'TASKS_UNAVAILABLE',
    'Не удалось обратиться к базе задач. Попробуйте ещё раз.',
  );
}

function toTask(row, ownerId = null) {
  if (ownerId && row.owner_id !== ownerId) throw databaseError();
  return validateTask({
    id: row.id,
    title: row.title,
    description: row.description ?? row.need ?? row.context ?? row.title,
    industry: row.industry,
    direction: row.direction,
    tags: row.tags,
    score: row.score,
    reply: 0,
    card: Object.fromEntries(
      TASK_CARD_FIELDS.map((field) => [
        field,
        field === 'businessContact' && !ownerId ? null : (row[column(field)] ?? null),
      ]),
    ),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
    ...(ownerId
      ? {
          requestId: row.request_id,
          originalDescription: row.original_description,
          analysisSnapshot: row.analysis_snapshot,
        }
      : {}),
  });
}

function writeColumns(input, snapshot) {
  return {
    status: input.status,
    original_description: input.description,
    ...Object.fromEntries(TASK_CARD_FIELDS.map((field) => [column(field), input.card[field]])),
    industry: input.industry,
    direction: input.direction,
    tags: input.tags,
    score: input.score,
    analysis_snapshot: snapshot,
  };
}

/** Request-scoped Supabase adapter; public reads use the safe view, private writes retain RLS. */
export function createSupabaseTaskRepository({ config = null, clientFactory = createClient } = {}) {
  function clientFor(accessToken) {
    if (!config)
      throw new HttpError(
        503,
        'TASKS_NOT_CONFIGURED',
        'Настройте SUPABASE_URL и SUPABASE_PUBLISHABLE_KEY в apps/api/.env.',
      );
    return clientFactory(config.url, config.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      ...(accessToken ? { global: { headers: { Authorization: `Bearer ${accessToken}` } } } : {}),
    });
  }
  async function safely(run) {
    try {
      return await run();
    } catch (error) {
      if (error instanceof HttpError) throw error;
      // Transport errors can contain headers and private data. Do not log or forward them.
      throw databaseError(error);
    }
  }
  return {
    list() {
      return safely(async () => {
        const { data, error } = await clientFor()
          .from('published_tasks')
          .select(publishedColumns)
          .order('published_at', { ascending: false })
          .order('id', { ascending: false });
        if (error) throw databaseError(error);
        if (!Array.isArray(data)) throw databaseError();
        return data.map((row) => toTask(row));
      });
    },
    findById(id) {
      return safely(async () => {
        const { data, error } = await clientFor()
          .from('published_tasks')
          .select(publishedColumns)
          .eq('id', id)
          .maybeSingle();
        if (error) throw databaseError(error);
        return data ? toTask(data) : null;
      });
    },
    listMine({ ownerId, accessToken }) {
      return safely(async () => {
        const { data, error } = await clientFor(accessToken)
          .from('tasks')
          .select(ownColumns)
          .eq('owner_id', ownerId)
          .order('updated_at', { ascending: false })
          .order('id', { ascending: false });
        if (error) throw databaseError(error);
        if (!Array.isArray(data)) throw databaseError();
        return data.map((row) => toTask(row, ownerId));
      });
    },
    save(input, { ownerId, accessToken }, snapshot) {
      return safely(async () => {
        const client = clientFor(accessToken);
        const find = async () => {
          const { data, error } = await client
            .from('tasks')
            .select(ownColumns)
            .eq('owner_id', ownerId)
            .eq('request_id', input.requestId)
            .maybeSingle();
          if (error) throw databaseError(error);
          return data;
        };
        const update = async (existing) => {
          // Retried/stale draft requests cannot demote or overwrite a published task.
          if (existing.status === 'published' && input.status === 'draft')
            return toTask(existing, ownerId);
          const { data, error } = await client
            .from('tasks')
            .update(writeColumns(input, snapshot))
            .eq('owner_id', ownerId)
            .eq('request_id', input.requestId)
            .select(ownColumns)
            .single();
          if (error) throw databaseError(error);
          return toTask(data, ownerId);
        };
        const existing = await find();
        if (existing) return update(existing);
        const { data, error } = await client
          .from('tasks')
          .insert({ request_id: input.requestId, ...writeColumns(input, snapshot) })
          .select(ownColumns)
          .single();
        if (!error) return toTask(data, ownerId);
        if (error.code === '23505') {
          const concurrent = await find();
          if (concurrent) return update(concurrent);
        }
        throw databaseError(error);
      });
    },
    getWorkspace({ ownerId, accessToken }) {
      return safely(async () => {
        const { data, error } = await clientFor(accessToken)
          .from('task_workspaces')
          .select('owner_id,snapshot')
          .eq('owner_id', ownerId)
          .maybeSingle();
        if (error) throw databaseError(error);
        if (!data) return null;
        if (data.owner_id !== ownerId) throw databaseError();
        return validateTaskWorkspace(data.snapshot);
      });
    },
    saveWorkspace(snapshot, { ownerId, accessToken }) {
      return safely(async () => {
        const client = clientFor(accessToken);
        const update = async () => {
          const { data, error } = await client
            .from('task_workspaces')
            .update({ snapshot })
            .eq('owner_id', ownerId)
            .select('owner_id,snapshot')
            .single();
          if (error) throw databaseError(error);
          if (data.owner_id !== ownerId) throw databaseError();
          return validateTaskWorkspace(data.snapshot);
        };
        const { data: existing, error: readError } = await client
          .from('task_workspaces')
          .select('owner_id')
          .eq('owner_id', ownerId)
          .maybeSingle();
        if (readError) throw databaseError(readError);
        if (existing) return update();
        const { data, error } = await client
          .from('task_workspaces')
          .insert({ snapshot })
          .select('owner_id,snapshot')
          .single();
        if (error?.code === '23505') return update();
        if (error) throw databaseError(error);
        if (data.owner_id !== ownerId) throw databaseError();
        return validateTaskWorkspace(data.snapshot);
      });
    },
  };
}

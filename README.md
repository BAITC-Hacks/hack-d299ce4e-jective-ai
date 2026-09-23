# Task Readiness Platform

MVP для AI-хакатона: подготовка бизнес-задач для студенческих команд.
AI структурирует, детерминированный rating engine считает, человек принимает решение.

## Итерация 1 — scaffold

Готово: React + TypeScript + Vite, Tailwind CSS, lucide-react, маршрутизация,
модели данных из задания и типизированное localStorage с проверкой данных через Zod.
Главная страница объясняет продукт; неизвестные URL показывают 404.
Создание задач, рейтинг, AI, каталог и proposals ещё не реализованы.

## Запуск

Нужен Node.js 22.12+ (проверено на Node.js 24). Из корня репозитория:

```sh
npm install
npm run dev
```

Открыть http://127.0.0.1:5173. Переменные окружения для этой итерации не нужны.
Для воспроизводимой установки по package-lock.json используйте `npm ci`.

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

`preview` показывает собранное приложение на http://127.0.0.1:4173.
Проверка вручную: открыть главную, перейти на `/unknown`, нажать «Вернуться на главную».

## Структура

```text
package.json                    # npm workspaces и команды из корня
.env.example                    # будущие серверные настройки, без секретов
apps/web/
  package.json
  index.html
  tsconfig.json
  vite.config.ts                # React, Tailwind, proxy /api → localhost:3001
  tailwind.config.ts            # тема; подключена через @config в styles.css
  src/
    main.tsx
    App.tsx                     # только роутинг
    styles.css
    components/Layout.tsx
    routes/Dashboard.tsx
    routes/NotFound.tsx
    types/index.ts              # все семь интерфейсов из задания
    storage/
      localStore.ts
      schemas.ts
      localStore.test.ts
```

Каркас создан напрямую файлами, без повторного запуска генератора в репозитории.
Эквивалентная последовательность для нового пустого проекта (не нужно запускать здесь):

```sh
npm create vite@6 apps/web -- --template react-ts
npm install --workspace apps/web react-router@7 lucide-react zod@3
npm install --workspace apps/web -D tailwindcss@4 @tailwindcss/vite@4 vitest@^4.1.11
```

Перед workspace-командами нужен корневой `package.json` с `"workspaces": ["apps/*"]`.
Tailwind 4 подключён через Vite plugin; отдельный конфиг темы явно загружается директивой `@config`.

## Хранилище

```ts
import { localStore } from './storage/localStore';

localStore.drafts.upsert({
  id: crypto.randomUUID(),
  rawDescription: 'Хотим снизить отсев учеников',
  questions: [],
  answers: {},
  createdAt: new Date().toISOString(),
});
const drafts = localStore.drafts.list();
const draft = localStore.drafts.get(drafts[0].id);
if (draft) localStore.drafts.remove(draft.id);
```

Коллекции: `drafts`, `tasks`, `teams`, `proposals`. Методы: `list`, `get`, `upsert`, `remove`.
Ключи имеют префикс `task-readiness:v1:`. Неизвестные факты задачи сохраняются как `null`.
Отсутствующая коллекция возвращает `[]`; отсутствующая запись — `undefined`.
Невалидный JSON, несовместимые данные, запрет доступа и переполнение вызывают `LocalStoreError`:
экран должен поймать её и показать `error.message`. Повреждённые данные не затираются.
Обёртка не вычисляет рейтинг, не создаёт фиктивные факты и не обновляет даты автоматически.
Связи `taskId`/`proposalIds` управляются будущим слоем пользовательских сценариев.
Хранилище локально для браузера и origin; синхронизация нескольких вкладок не реализована.

## Следующая итерация

Чистая `src/domain/rating/calculateTaskRating.ts`, правила семи категорий,
граничные тесты уровней и примеры input/output. После этого — Express-прокси с двумя
AI-эндпоинтами и DEMO_MODE, затем экраны по порядку пользовательского сценария.
Будущий сервер будет читать `OPENAI_API_KEY`; ключ нельзя префиксовать `VITE_`.
`.env` и его варианты исключены из Git. Сейчас proxy настроен, но сервер ещё не создан.

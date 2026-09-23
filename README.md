# AI Sana

Локальный проект на JavaScript: Vite + Tailwind CSS на frontend и отдельный Node.js API.
Нужен Node.js 24 (либо совместимые версии из `engines` в `package.json`).

## Быстрый запуск

Из корня репозитория:

```bash
npm install
npm run dev
```

Интерфейс: http://localhost:3000, backend: http://127.0.0.1:3001.
`npm run dev` запускает оба процесса; остановка — `Ctrl+C` в терминале.
Регистрация и вход используют Supabase; каталог задач пока содержит демонстрационные данные.
Настройка окружения описана ниже и в [инструкции регистрации](docs/supabase-registration.md).

Альтернативное имя той же команды:

```bash
npm run dev:full
```

Команда автоматически включает API-режим каталога. Только frontend можно запустить через
`npm run dev:web`, но для загрузки проверенного профиля ему всё равно нужен API.
Не запускайте `dev` и `dev:full` одновременно: они используют один порт.

## Структура

```text
apps/
  web/
    src/
      app/                  запуск, маршрутизация, состояние и события
      pages/                страницы, возвращающие HTML
      components/           общие элементы интерфейса и layout
      features/
        auth/               Supabase Auth, сессия и проверенный профиль
        tasks/              модель задач, repository, загрузка и действия
        proposals/          действия с откликами
      shared/               API-клиент, экранирование, уведомления, анимации
      styles/               Tailwind и существующие стили
    test/                   тесты frontend
  api/
    src/
      modules/auth/         проверка токена и загрузка профиля
      modules/tasks/        маршруты, сервис и repository задач
      shared/               HTTP-ответы и ошибки
      app.js                сборка HTTP-приложения
      server.js             запуск и остановка сервера
packages/
  contracts/                общий формат данных, проверки и демоданные
scripts/
  dev.js                    совместный запуск frontend и API
docs/
  architecture.md           правила расширения проекта
```

Проект использует npm workspaces: зависимости всех приложений устанавливаются одной командой
из корня. Общий `package-lock.json` фиксирует версии.

## Команды

| Команда                     | Назначение                                      |
| --------------------------- | ----------------------------------------------- |
| `npm run dev` / `npm start` | Frontend и backend вместе                       |
| `npm run dev:web`           | Только Vite, настройки каталога из `.env.local` |
| `npm run dev:api`           | Только backend, с перезапуском при изменениях   |
| `npm run dev:full`          | Frontend + API, каталог загружается с сервера   |
| `npm run build`             | Сборка frontend в `apps/web/dist`               |
| `npm run preview`           | Локальный просмотр готовой сборки на порту 3000 |
| `npm run check`             | ESLint, тесты всех пакетов и сборка             |
| `npm run format`            | Форматирование кода с Prettier                  |
| `npm run format:check`      | Проверка форматирования                         |

Другой порт frontend: `npm run dev -- --port 3002`.
Настройки API находятся в `apps/api/.env.example`; пример можно скопировать в `apps/api/.env`.

## Подключение backend

Для регистрации заполните `apps/web/.env.local`:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
VITE_API_BASE_URL=/api
API_TARGET=http://127.0.0.1:3001
```

И `apps/api/.env` для того же Supabase-проекта:

```dotenv
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Оба файла исключены из Git. Достаточно publishable key (для старых проектов поддерживается anon key);
secret/service_role ключи не нужны и конфигурация их отклоняет.
В Supabase → Authentication → URL Configuration добавьте адреса локального приложения
`http://localhost:3000` и `http://127.0.0.1:3000` в разрешённые Redirect URLs.
Подтверждение email остаётся включённым: после регистрации перейдите по ссылке из письма.

В `apps/web/.env.example` перечислены настройки клиента. Для отдельного запуска приложений
создайте `apps/web/.env.local` с такими значениями:

```dotenv
VITE_DATA_SOURCE=api
VITE_API_BASE_URL=/api
API_TARGET=http://127.0.0.1:3001
```

Запустите `npm run dev:api` и `npm run dev:web` в двух терминалах. Vite перенаправляет `/api`
на backend. Если меняете порт API, измените и `API_TARGET`.
`VITE_*` попадает в браузерный bundle, поэтому эти переменные не подходят для секретов.
После изменения `.env` перезапустите Vite; для production создайте новую сборку.

| Маршрут            | Ответ                                                                               |
| ------------------ | ----------------------------------------------------------------------------------- |
| `GET /api/health`  | `{ "data": { "status": "ok" } }`                                                    |
| `GET /api/tasks`   | `{ "data": Task[] }`                                                                |
| `GET /api/tasks/2` | `{ "data": Task }`                                                                  |
| `GET /api/auth/me` | `{ "data": { "user": { "id", "email" }, "profile": { ... } } }`, нужен Bearer-токен |

Маршруты поддерживают `HEAD`. Ошибки имеют вид
`{ "error": { "code": "NOT_FOUND", "message": "..." } }` с соответствующим HTTP-статусом.
Если API недоступен, каталог показывает ошибку и кнопку повтора, а не подменяет ответ демоданными.

Сервер пока читает задачи из демонстрационного repository. Для базы данных достаточно добавить
адаптер с методами `list()` и `findById(id)` и передать его в `createApp({ taskRepository })`.
Подробности — в [описании архитектуры](docs/architecture.md).

## Текущие границы

Регистрация, вход, подтверждение email, восстановление сессии и выход подключены к Supabase.
Профиль и роль backend читает из `profiles` после проверки токена через Supabase Auth.
Кабинет недоступен до успешной проверки; при ошибке сети проверку можно повторить.
Задачи, команды, отклики, сохранения и AI пока демонстрационные и не записываются в Supabase.
Восстановление пароля через письмо пока не реализовано.

Страницы остаются на обычном JavaScript, без React. Tailwind доступен в HTML-шаблонах;
Preflight отключён для сохранения существующего оформления. Старые стили находятся в слое `components`,
поэтому utility-классы Tailwind могут их переопределять. Шрифт Manrope загружается из Google Fonts;
без интернета используется системный шрифт.

`vite preview` предназначен для локальной проверки. При публикации раздавайте `apps/web/dist`
и настройте перенаправление `/api` к серверу на уровне хостинга или reverse proxy.
Vite-конфигурация не переносится в статическую production-сборку.

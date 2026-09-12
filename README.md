# RIFT

**RIFT — Real-time Incident Tracker**

Небольшое fullstack-приложение для управления техническими инцидентами команды в реальном времени.

Пользователи могут создавать инциденты, менять их статус, назначать ответственных, оставлять комментарии и наблюдать за изменениями без перезагрузки страницы. Для каждого инцидента существует отдельная real-time комната, где отображаются участники, timeline событий и текущий статус.

## Основной функционал

* регистрация и авторизация пользователей;
* создание и редактирование инцидентов;
* уровни критичности `P1 / P2 / P3`;
* статусы инцидента:

  * `Open`;
  * `Investigating`;
  * `Monitoring`;
  * `Resolved`;
* назначение ответственного;
* комментарии;
* история изменений;
* список активных участников инцидента;
* индикатор набора сообщения;
* real-time обновление статусов, комментариев и участников;
* dashboard со списком активных инцидентов;
* фильтрация и поиск;
* пагинация.

## Что представляет собой проект и какие технологии используются

### Frontend

* **Next.js**
* **React**
* **TypeScript**
* **App Router**
* **React Server Components**
* **Client Components**
* **Server Actions**
* **Suspense**
* **Streaming**
* **Socket.IO Client**
* **TanStack Query**
* **React Hook Form**
* **Zod**
* **Tailwind CSS**
* **shadcn/ui**

В проекте можно использовать возможности React:

* `useOptimistic`;
* `useTransition`;
* `useDeferredValue`;
* `useSyncExternalStore`;
* `useActionState`;
* `useId`;
* `useRef`.

Next.js используется не только как SPA-обёртка. Основные страницы должны преимущественно состоять из Server Components, а Client Components использоваться только там, где необходима интерактивность или WebSocket-соединение.

---

### Backend

* **NestJS**
* **TypeScript**
* **PostgreSQL**
* **чистый SQL без ORM**
* **pg / node-postgres**
* **Socket.IO**
* **Redis**
* **JWT**
* **Argon2**
* **Swagger / OpenAPI**
* **Docker Compose**

Работа с PostgreSQL выполняется напрямую через SQL-запросы.

Правила авторизации для frontend и backend: [docs/auth.md](docs/auth.md).

Это позволяет работать напрямую с:

* `JOIN`;
* индексами;
* foreign keys;
* constraints;
* транзакциями;
* блокировками;
* `SELECT FOR UPDATE`;
* `CTE`;
* `JSONB`;
* cursor pagination;
* `EXPLAIN ANALYZE`;
* connection pooling.

---

### PostgreSQL

PostgreSQL является основным постоянным хранилищем данных.

Пример основных таблиц:

```text
users

sessions

incidents

incident_participants

incident_comments

incident_events
```

`incident_events` хранит timeline изменений.

Например:

```json
{
  "type": "STATUS_CHANGED",
  "payload": {
    "from": "OPEN",
    "to": "INVESTIGATING"
  }
}
```

Для изменения нескольких связанных сущностей используются SQL-транзакции.

---

### Redis

Redis используется для временного и распределённого состояния.

Основные сценарии:

```text
presence
typing indicators
cache
rate limiting
Socket.IO Pub/Sub
```

Refresh-сессии пользователей хранятся в PostgreSQL. Redis не является
хранилищем credentials.

Например:

```text
incident:42:participants
```

может содержать список пользователей, которые сейчас находятся внутри комнаты инцидента.

Для временных состояний используются TTL.

```text
incident:42:typing:user:7
TTL = 3 seconds
```

Позже Redis также может использоваться через Socket.IO Redis Adapter для запуска нескольких экземпляров NestJS.

---

### WebSockets

Socket.IO используется для real-time обновлений.

Примеры событий:

```text
incident:join
incident:leave

incident:updated
incident:status_changed

comment:created

user:typing
user:stop_typing

presence:joined
presence:left

participant:assigned
```

HTTP остаётся основным способом изменения постоянных данных.

Например:

```http
POST /incidents

PATCH /incidents/:id

POST /incidents/:id/comments

PATCH /incidents/:id/status
```

После успешного изменения backend отправляет WebSocket-событие остальным подключённым клиентам.

```text
HTTP request
     ↓
NestJS
     ↓
PostgreSQL
     ↓
commit
     ↓
Socket.IO event
     ↓
other clients
```

---

# Backend architecture

Backend строится как **modular monolith**.

```text
src/
├── modules/
│   ├── auth/
│   ├── users/
│   ├── incidents/
│   ├── comments/
│   └── realtime/
│
├── infrastructure/
│   ├── database/
│   │   ├── database.module.ts
│   │   ├── postgres.service.ts
│   │   └── migrations/
│   │
│   ├── redis/
│   └── websocket/
│
├── common/
│   ├── guards/
│   ├── decorators/
│   ├── filters/
│   ├── interceptors/
│   └── pipes/
│
├── config/
│
└── main.ts
```

Внутри бизнес-модуля:

```text
incidents/
├── controllers/
│   └── incidents.controller.ts
│
├── gateways/
│   └── incidents.gateway.ts
│
├── services/
│   └── incidents.service.ts
│
├── repositories/
│   ├── incidents.repository.ts
│   └── incidents.sql.ts
│
├── dto/
│
├── types/
│
└── incidents.module.ts
```

SQL желательно хранить отдельно от контроллеров.

Например:

```text
Controller
    ↓
Service
    ↓
Repository
    ↓
SQL
    ↓
PostgreSQL
```

Gateway также не должен напрямую работать с базой:

```text
Socket.IO
    ↓
Gateway
    ↓
Service
    ↓
Repository / Redis
```

---

# Frontend architecture

Frontend можно построить на упрощённой Feature-Sliced архитектуре.

```text
src/
├── app/
│
├── widgets/
│   ├── incident-board/
│   ├── incident-timeline/
│   └── participants-list/
│
├── features/
│   ├── create-incident/
│   ├── change-incident-status/
│   ├── assign-user/
│   ├── add-comment/
│   └── join-incident/
│
├── entities/
│   ├── incident/
│   ├── user/
│   └── comment/
│
└── shared/
    ├── api/
    ├── socket/
    ├── ui/
    ├── hooks/
    ├── lib/
    └── config/
```

App Router:

```text
app/
├── (auth)/
│   ├── login/
│   └── register/
│
├── (dashboard)/
│   ├── layout.tsx
│   │
│   └── incidents/
│       ├── page.tsx
│       ├── loading.tsx
│       ├── error.tsx
│       │
│       └── [id]/
│           ├── page.tsx
│           └── loading.tsx
│
└── layout.tsx
```

Основное серверное состояние хранится через TanStack Query.

```text
REST API
   ↓
TanStack Query
   ↓
React
```

Socket.IO используется для обновления уже загруженных данных:

```text
Socket.IO event
       ↓
queryClient.setQueryData()
       ↓
TanStack Query cache
       ↓
React rerender
```

Локальное UI-состояние остаётся внутри React.

```text
modal state
selected tab
form state
filters
temporary input
```

Redis и Zustand не должны использоваться как универсальные хранилища состояния.

---

# Общая архитектура

```text
                         Browser
                            │
               ┌────────────┴────────────┐
               │                         │
              HTTP                   Socket.IO
               │                         │
               ↓                         ↓
        ┌─────────────────────────────────────┐
        │               NestJS                │
        │                                     │
        │ Controllers              Gateways   │
        │      │                       │       │
        │      └──────────┬────────────┘       │
        │                 ↓                    │
        │              Services                │
        │                 │                    │
        │        ┌────────┴─────────┐          │
        │        ↓                  ↓          │
        │   Repositories          Redis        │
        │        │                             │
        └────────┼─────────────────────────────┘
                 ↓
            PostgreSQL
            raw SQL
```

Frontend:

```text
Next.js App Router
        │
        ├── Server Components
        │        ↓
        │      REST API
        │
        └── Client Components
                 │
          ┌──────┴──────┐
          ↓             ↓
     TanStack Query   Socket.IO
          │             │
          └──────┬──────┘
                 ↓
              React UI
```

## Alias

**RIFT**

**Real-time Incident Tracker**

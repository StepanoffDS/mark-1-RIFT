# Frontend Architecture

Frontend RIFT построен на **Next.js App Router**, React и TypeScript.

Основной подход — Feature-Sliced Design, адаптированный под App Router.

## Структура

```text
src/
├── app/
│   ├── (auth)/
│   ├── (dashboard)/
│   ├── layout.tsx
│   └── providers.tsx
│
├── widgets/
│   ├── incident-board/
│   ├── incident-timeline/
│   ├── incident-header/
│   └── participants-list/
│
├── features/
│   ├── auth/
│   ├── create-incident/
│   ├── change-incident-status/
│   ├── assign-user/
│   ├── add-comment/
│   └── incident-presence/
│
├── entities/
│   ├── incident/
│   ├── comment/
│   └── user/
│
└── shared/
    ├── api/
    ├── socket/
    ├── ui/
    ├── hooks/
    ├── lib/
    ├── types/
    └── config/
```

## Слои

### `app`

Next.js routing и конфигурация приложения.

Содержит:

* routes;
* layouts;
* loading/error boundaries;
* metadata;
* providers;
* глобальные стили.

Бизнес-логика внутри `app` не размещается.

---

### `widgets`

Крупные самостоятельные части интерфейса.

Например:

```text
incident-timeline
incident-board
participants-list
```

Widget собирает несколько `features` и `entities` в законченный UI-блок.

---

### `features`

Действия пользователя и отдельные сценарии приложения.

Например:

```text
create-incident
change-incident-status
assign-user
add-comment
```

Feature может содержать:

```text
change-incident-status/
├── api/
├── model/
├── ui/
└── index.ts
```

---

### `entities`

Основные сущности предметной области frontend.

```text
incident
user
comment
```

Например:

```text
entities/incident/
├── api/
├── model/
├── ui/
└── index.ts
```

Здесь могут находиться:

* типы;
* базовые UI-компоненты сущности;
* query keys;
* функции получения данных;
* преобразование API-моделей.

---

### `shared`

Код, который не знает о конкретной бизнес-сущности.

```text
shared/
├── api/
├── socket/
├── ui/
├── hooks/
├── lib/
├── types/
└── config/
```

Например:

```text
shared/api/http-client.ts
shared/socket/socket.ts
shared/ui/button/
shared/hooks/use-debounce.ts
shared/config/env.ts
```

---

# Dependency Rule

Зависимости направлены сверху вниз:

```text
app
 ↓
widgets
 ↓
features
 ↓
entities
 ↓
shared
```

Нижний слой не должен импортировать верхний.

Например:

```text
features → entities     ✓
features → shared       ✓

entities → shared       ✓

entities → features     ✗
shared → entities       ✗
shared → features       ✗
```

---

# Server и Client Components

По умолчанию компоненты являются Server Components.

```text
Server Component
    ↓
Server Component
    ↓
Server Component
    ↓
Client Component
```

`"use client"` добавляется только когда необходимы:

* state;
* effects;
* browser API;
* event handlers;
* WebSocket;
* client-side libraries.

Client boundary желательно размещать как можно ниже.

Пример Incident Room:

```text
IncidentPage [Server]
│
├── IncidentHeader [Server]
├── IncidentDescription [Server]
│
├── IncidentControls [Client]
├── IncidentTimeline [Client]
├── ParticipantsList [Client]
└── CommentForm [Client]
```

---

# Работа с API

HTTP является основным способом получения и изменения persistent-данных.

```text
Next.js
   ↓
HTTP
   ↓
NestJS
```

Для client-side server state используется **TanStack Query**.

Query keys должны быть централизованы на уровне entity:

```ts
export const incidentKeys = {
  all: ['incidents'] as const,

  list: (filters: IncidentFilters) =>
    [...incidentKeys.all, 'list', filters] as const,

  detail: (id: string) =>
    [...incidentKeys.all, 'detail', id] as const,
};
```

---

# WebSocket

Socket.IO используется только в Client Components.

Создаётся единый Socket.IO client:

```text
shared/socket/
├── socket.ts
├── socket-provider.tsx
└── hooks/
```

Не следует создавать новое соединение внутри каждого компонента.

```text
Application
     │
     └── Socket connection
              │
       ┌──────┼──────┐
       ↓      ↓      ↓
    Timeline Status Presence
```

WebSocket-события могут обновлять TanStack Query cache.

```text
Socket.IO
    ↓
event
    ↓
queryClient.setQueryData()
    ↓
React
```

Таким образом HTTP предоставляет первоначальное состояние, а Socket.IO доставляет последующие изменения.

---

# State Management

Состояние разделяется на несколько категорий.

### Server state

```text
incidents
comments
users
timeline
```

Хранится через TanStack Query.

### URL state

```text
search
status
severity
page
sort
```

Хранится в URL search parameters.

Например:

```text
/incidents?status=OPEN&severity=P1&page=2
```

### Form state

Управляется через React Hook Form.

### Local UI state

```text
modal
dropdown
selected tab
temporary value
```

Остаётся внутри React-компонентов.

Глобальный state manager не добавляется до появления реальной необходимости.

---

# Forms

Формы:

```text
React Hook Form
       ↓
Zod
       ↓
API
```

Frontend-валидация используется для UX.

Backend остаётся ответственным за окончательную валидацию входящих данных.

---

# Основной принцип

Frontend разделяет ответственность между:

```text
Next.js App Router
        ↓
Routing / SSR / RSC
        ↓
Widgets
        ↓
Features
        ↓
Entities
        ↓
Shared infrastructure
```

При этом:

```text
HTTP       → persistent server state
Socket.IO  → real-time updates
URL        → filters/navigation state
React      → local UI state
```

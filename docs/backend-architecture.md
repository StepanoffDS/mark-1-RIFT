# Backend Architecture

Backend RIFT построен на **NestJS**, PostgreSQL, Redis и Socket.IO.

Приложение представляет собой **modular monolith**.

ORM и query builders не используются. Работа с PostgreSQL выполняется через чистый SQL и `node-postgres`.

## Структура

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
├── app.module.ts
└── main.ts
```

---

# Modules

Приложение разделяется по бизнес-областям.

```text
auth
users
incidents
comments
realtime
```

Каждый модуль отвечает за собственную область приложения.

Пример:

```text
modules/incidents/
├── controllers/
│   └── incidents.controller.ts
│
├── services/
│   └── incidents.service.ts
│
├── repositories/
│   ├── incidents.repository.ts
│   └── incidents.sql.ts
│
├── dto/
│   ├── create-incident.dto.ts
│   ├── update-incident.dto.ts
│   └── change-status.dto.ts
│
├── types/
│
└── incidents.module.ts
```

---

# Request Flow

Обычный HTTP request проходит через:

```text
Request
   ↓
Controller
   ↓
Service
   ↓
Repository
   ↓
PostgreSQL
```

Ответственность слоёв:

```text
Controller
    HTTP transport
    DTO
    request/response

Service
    application logic
    orchestration
    transactions

Repository
    SQL
    database access

PostgreSQL
    persistent data
```

Controller не должен содержать SQL или основную логику обработки данных.

---

# Database

Доступ к PostgreSQL централизован:

```text
infrastructure/database/
├── database.module.ts
├── postgres.service.ts
├── transaction.ts
└── migrations/
```

`PostgresService` управляет connection pool через `pg`.

```text
NestJS
   ↓
PostgresService
   ↓
pg.Pool
   ↓
PostgreSQL
```

Repositories получают доступ к PostgreSQL через этот infrastructure layer.

---

# SQL

SQL хранится рядом с repository:

```text
repositories/
├── incidents.repository.ts
└── incidents.sql.ts
```

Например:

```ts
export const FIND_INCIDENT_BY_ID = `
    SELECT
        i.id,
        i.title,
        i.description,
        i.status,
        i.severity,
        i.created_at
    FROM incidents i
    WHERE i.id = $1
`;
```

Repository отвечает за:

```text
SQL execution
parameter binding
mapping database rows
database-specific operations
```

SQL никогда не формируется через конкатенацию пользовательских значений.

Используются parameterized queries:

```sql
WHERE id = $1
```

а не:

```ts
`WHERE id = '${id}'`
```

---

# Transactions

Операции, изменяющие несколько связанных данных, выполняются внутри одной PostgreSQL transaction.

Например смена статуса:

```text
BEGIN
   ↓
UPDATE incidents
   ↓
INSERT incident_events
   ↓
COMMIT
```

Если один запрос завершается ошибкой:

```text
ROLLBACK
```

WebSocket-событие отправляется только после успешного `COMMIT`.

---

# Redis

Redis используется для временных данных.

```text
Redis
├── presence
├── typing indicators
├── cache
├── rate limiting
└── Socket.IO Pub/Sub
```

Redis infrastructure:

```text
infrastructure/redis/
├── redis.module.ts
├── redis.service.ts
└── redis.constants.ts
```

Persistent business data не хранится только в Redis.

PostgreSQL остаётся source of truth.

Refresh-сессии авторизации также хранятся в PostgreSQL; Redis обслуживает
только rate limit и другое временное распределённое состояние. Полный
контракт: [auth.md](auth.md).

---

# WebSocket

Socket.IO transport отделён от основной логики приложения.

```text
Socket
   ↓
Gateway
   ↓
Service
   ↓
Redis / Repository
```

Gateway отвечает за:

* WebSocket connection;
* authentication;
* rooms;
* получение client events;
* отправку server events.

Gateway не должен напрямую выполнять SQL.

---

# Socket Rooms

Каждый инцидент имеет отдельную Socket.IO room.

```text
incident:{incidentId}
```

Например:

```text
incident:550e8400-e29b-41d4-a716-446655440000
```

При открытии Incident Room:

```text
Client
   ↓
incident:join
   ↓
Gateway
   ↓
authorization
   ↓
socket.join(room)
```

После этого пользователь получает real-time события конкретного инцидента.

---

# HTTP + WebSocket

HTTP используется для изменения persistent state.

```text
PATCH /incidents/:id/status
```

Поток:

```text
HTTP Request
      ↓
Controller
      ↓
Service
      ↓
SQL transaction
      ↓
PostgreSQL COMMIT
      ↓
Socket.IO
      ↓
incident:status_changed
```

Socket.IO используется для доставки результата другим клиентам.

WebSocket не заменяет REST API.

---

# Common

Общие NestJS-механизмы находятся в:

```text
common/
├── guards/
├── decorators/
├── filters/
├── interceptors/
└── pipes/
```

Примеры:

```text
JwtAuthGuard
CurrentUser decorator
HttpExceptionFilter
LoggingInterceptor
ValidationPipe
```

`common` не должен превращаться в место для бизнес-логики.

---

# Configuration

Environment configuration:

```text
config/
├── app.config.ts
├── database.config.ts
├── redis.config.ts
└── auth.config.ts
```

Переменные окружения валидируются при запуске приложения.

Например:

```text
DATABASE_URL
REDIS_URL
JWT_ACCESS_SECRET
JWT_ISSUER
JWT_AUDIENCE
ACCESS_TOKEN_TTL
REFRESH_SESSION_TTL
```

Приложение должно завершать запуск с ошибкой, если обязательная конфигурация отсутствует.

---

# Общая схема

```text
                     NestJS
                       │
          ┌────────────┴────────────┐
          │                         │
        HTTP                    Socket.IO
          │                         │
          ↓                         ↓
    Controllers                  Gateways
          │                         │
          └────────────┬────────────┘
                       ↓
                    Services
                       │
             ┌─────────┴─────────┐
             ↓                   ↓
        Repositories            Redis
             │
             ↓
        PostgresService
             │
             ↓
         PostgreSQL
```

Основное разделение ответственности:

```text
Controllers → HTTP
Gateways    → WebSocket
Services    → application logic
Repositories → SQL/PostgreSQL
Redis       → temporary/distributed state
PostgreSQL  → persistent state
```

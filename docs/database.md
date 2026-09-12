# Database Schema

RIFT использует PostgreSQL как основное постоянное хранилище данных.

Работа с БД выполняется через чистый SQL с использованием `pg` (`node-postgres`). ORM и query builder не используются.

## Общая схема

```text
users
 ├── sessions
 │
 ├── incidents (created_by)
 │     ├── incident_comments
 │     ├── incident_events
 │     └── incident_participants
 │
 └── incident_participants
```

## Enums

### incident_status

```sql
CREATE TYPE incident_status AS ENUM (
    'OPEN',
    'INVESTIGATING',
    'MONITORING',
    'RESOLVED'
);
```

### incident_severity

```sql
CREATE TYPE incident_severity AS ENUM (
    'P1',
    'P2',
    'P3'
);
```

---

# users

Пользователи системы.

| Column        | Type         | Constraints      |
| ------------- | ------------ | ---------------- |
| id            | UUID         | PRIMARY KEY      |
| email         | VARCHAR(255) | UNIQUE, NOT NULL |
| username      | VARCHAR(50)  | UNIQUE, NOT NULL |
| password_hash | TEXT         | NOT NULL         |
| created_at    | TIMESTAMPTZ  | NOT NULL         |
| updated_at    | TIMESTAMPTZ  | NOT NULL         |

Индексы:

```sql
CREATE UNIQUE INDEX users_email_idx
ON users(email);

CREATE UNIQUE INDEX users_username_idx
ON users(username);
```

---

# sessions

Refresh-сессии пользователей. PostgreSQL — source of truth для сессий;
Redis используется только для временного rate limit и realtime-state.

| Column             | Type        | Constraints             |
| ------------------ | ----------- | ----------------------- |
| id                 | UUID        | PRIMARY KEY             |
| user_id            | UUID        | FK → users.id, NOT NULL |
| refresh_token_hash | TEXT        | NOT NULL                |
| expires_at         | TIMESTAMPTZ | NOT NULL                |
| created_at         | TIMESTAMPTZ | NOT NULL                |
| last_used_at       | TIMESTAMPTZ | NOT NULL                |
| revoked_at         | TIMESTAMPTZ | NULL                    |
| user_agent         | TEXT        | NULL                    |

Relation:

```text
users 1 ─── N sessions
```

`refresh_token_hash` содержит только Argon2id-хеш случайной части refresh
cookie. Исходный token не сохраняется и не возвращается API. Нужен индекс по
`user_id`; устаревшие сессии очищаются по `expires_at`.

---

# incidents

Основная сущность проекта.

| Column      | Type              | Constraints             |
| ----------- | ----------------- | ----------------------- |
| id          | UUID              | PRIMARY KEY             |
| title       | VARCHAR(255)      | NOT NULL                |
| description | TEXT              | NULL                    |
| status      | incident_status   | NOT NULL                |
| severity    | incident_severity | NOT NULL                |
| created_by  | UUID              | FK → users.id, NOT NULL |
| assigned_to | UUID              | FK → users.id, NULL     |
| created_at  | TIMESTAMPTZ       | NOT NULL                |
| updated_at  | TIMESTAMPTZ       | NOT NULL                |
| resolved_at | TIMESTAMPTZ       | NULL                    |

Индексы:

```sql
CREATE INDEX incidents_status_idx
ON incidents(status);

CREATE INDEX incidents_severity_idx
ON incidents(severity);

CREATE INDEX incidents_created_at_idx
ON incidents(created_at DESC);

CREATE INDEX incidents_assigned_to_idx
ON incidents(assigned_to);
```

Для dashboard также можно добавить составной индекс:

```sql
CREATE INDEX incidents_status_created_at_idx
ON incidents(status, created_at DESC);
```

---

# incident_participants

Пользователи, участвующие в работе над инцидентом.

Это постоянное участие пользователя в инциденте.

Online presence хранится отдельно в Redis.

| Column      | Type        | Constraints       |
| ----------- | ----------- | ----------------- |
| incident_id | UUID        | FK → incidents.id |
| user_id     | UUID        | FK → users.id     |
| joined_at   | TIMESTAMPTZ | NOT NULL          |

Primary key:

```sql
PRIMARY KEY (incident_id, user_id)
```

Relation:

```text
incidents N ─── N users
```

---

# incident_comments

Комментарии внутри Incident Room.

| Column      | Type        | Constraints                 |
| ----------- | ----------- | --------------------------- |
| id          | UUID        | PRIMARY KEY                 |
| incident_id | UUID        | FK → incidents.id, NOT NULL |
| author_id   | UUID        | FK → users.id, NOT NULL     |
| content     | TEXT        | NOT NULL                    |
| created_at  | TIMESTAMPTZ | NOT NULL                    |
| updated_at  | TIMESTAMPTZ | NULL                        |
| deleted_at  | TIMESTAMPTZ | NULL                        |

Индекс:

```sql
CREATE INDEX incident_comments_timeline_idx
ON incident_comments(incident_id, created_at DESC);
```

Для комментариев используется soft delete через `deleted_at`.

---

# incident_events

История действий внутри инцидента.

Например:

```text
INCIDENT_CREATED
STATUS_CHANGED
SEVERITY_CHANGED
USER_ASSIGNED
USER_UNASSIGNED
INCIDENT_RESOLVED
INCIDENT_REOPENED
```

| Column      | Type        | Constraints                 |
| ----------- | ----------- | --------------------------- |
| id          | UUID        | PRIMARY KEY                 |
| incident_id | UUID        | FK → incidents.id, NOT NULL |
| actor_id    | UUID        | FK → users.id, NULL         |
| type        | VARCHAR(50) | NOT NULL                    |
| payload     | JSONB       | NOT NULL                    |
| created_at  | TIMESTAMPTZ | NOT NULL                    |

Пример `payload`:

```json
{
  "from": "OPEN",
  "to": "INVESTIGATING"
}
```

Индекс:

```sql
CREATE INDEX incident_events_timeline_idx
ON incident_events(incident_id, created_at DESC);
```

---

# Relationships

```text
users
 │
 ├──< sessions
 │
 ├──< incidents.created_by
 │
 ├──< incidents.assigned_to
 │
 ├──< incident_comments
 │
 ├──< incident_events
 │
 └──< incident_participants
            >── incidents

incidents
 │
 ├──< incident_comments
 ├──< incident_events
 └──< incident_participants
```

## PostgreSQL vs Redis

PostgreSQL хранит данные, которые должны пережить перезапуск приложения:

```text
Users
Sessions
Incidents
Participants
Comments
Events
```

Redis хранит временное состояние:

```text
online users
incident presence
typing indicators
cache
rate limits
Socket.IO Pub/Sub
```

Например:

```text
incident:{id}:presence
incident:{id}:typing:{userId}
```

Presence не должен записываться в PostgreSQL при каждом подключении/отключении пользователя.

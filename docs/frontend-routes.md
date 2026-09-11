# Frontend Routes

Frontend построен на Next.js App Router.

## Routes

```text
/
│
├── /login
├── /register
│
├── /incidents
│
├── /incidents/new
│
├── /incidents/[id]
│
└── /profile
```

---

# `/`

Главная точка входа.

Неавторизованный пользователь:

```text
/ → /login
```

Авторизованный:

```text
/ → /incidents
```

---

# `/login`

Авторизация.

Форма:

```text
Email
Password
```

После успешной авторизации:

```text
/login → /incidents
```

---

# `/register`

Регистрация пользователя.

Поля:

```text
Username
Email
Password
Confirm password
```

После регистрации пользователь авторизуется и перенаправляется:

```text
/register → /incidents
```

---

# `/incidents`

Основной dashboard.

Отображает список инцидентов.

Карточка содержит:

```text
Title
Severity
Status
Assignee
Created at
```

Поддерживаются:

* фильтрация по status;
* фильтрация по severity;
* поиск;
* сортировка;
* пагинация.

Фильтры хранятся в URL:

```text
/incidents?status=INVESTIGATING&severity=P1&page=2
```

Это позволяет сохранять состояние dashboard после reload и делиться ссылкой на конкретную выборку.

---

# `/incidents/new`

Создание инцидента.

Форма:

```text
Title
Description
Severity
Assignee
```

После создания:

```text
/incidents/new
        ↓
/incidents/{id}
```

---

# `/incidents/[id]`

Incident Room.

Основная real-time страница приложения.

Пример:

```text
/incidents/01990a2e-...
```

Страница содержит:

```text
Incident Header

Status
Severity
Assignee
Elapsed Time

Participants

Timeline

Comments

Comment Form
```

После первоначальной загрузки HTTP API используется Socket.IO для получения real-time изменений.

Например:

```text
incident:status_changed
comment:created
presence:joined
presence:left
user:typing
```

---

# `/profile`

Профиль текущего пользователя.

Отображает:

```text
Username
Email
Active sessions
```

Позволяет завершать другие активные сессии.

---

# App Router Structure

```text
src/app/
├── layout.tsx
├── page.tsx
│
├── (auth)/
│   ├── layout.tsx
│   │
│   ├── login/
│   │   └── page.tsx
│   │
│   └── register/
│       └── page.tsx
│
└── (dashboard)/
    ├── layout.tsx
    │
    ├── incidents/
    │   ├── page.tsx
    │   ├── loading.tsx
    │   ├── error.tsx
    │   │
    │   ├── new/
    │   │   └── page.tsx
    │   │
    │   └── [id]/
    │       ├── page.tsx
    │       ├── loading.tsx
    │       ├── error.tsx
    │       └── not-found.tsx
    │
    └── profile/
        └── page.tsx
```

## Rendering

По умолчанию страницы реализуются через Server Components.

Client Components используются для интерактивных частей:

```text
Incident page (Server Component)
│
├── Header
├── Description
│
├── StatusControls (Client)
├── Participants (Client + Socket.IO)
├── Timeline (Client + Socket.IO)
└── CommentForm (Client)
```

Client boundary должен располагаться как можно ниже по дереву компонентов.

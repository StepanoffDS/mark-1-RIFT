# Авторизация

RIFT использует browser-first схему: короткоживущий JWT access token и
ротацию opaque refresh token. Оба токена хранятся только в защищённых
cookies. PostgreSQL хранит refresh-сессии и остаётся source of truth.

Redis не участвует в проверке пользователя или хранении refresh token. Он
нужен для rate limiting login/register/refresh и других временных данных.

## Решение

| Подход | Решение для RIFT | Почему |
| --- | --- | --- |
| JWT только в `localStorage` | Нет | XSS позволяет украсть токен. |
| Server-side session только в Redis | Нет | Сессии нужны после рестарта, для logout и списка устройств. |
| JWT access + refresh-сессия в PostgreSQL | Да | Быстрая проверка access token, управляемые и отзываемые сессии. |

Redis можно добавить как backend для общего rate limit при нескольких
экземплярах API. Он не заменяет таблицу `sessions`.

## Токены и cookies

| Cookie | Значение | Срок | Атрибуты |
| --- | --- | --- | --- |
| `__Host-rift_access` | JWT: `sub`, `sid`, `role`, `iss`, `aud`, `iat`, `exp` | 15 минут | `HttpOnly; Secure; SameSite=Strict; Path=/` |
| `__Host-rift_refresh` | `sessionId.secret`, где `secret` — 256-битное случайное значение | до 30 дней | `HttpOnly; Secure; SameSite=Strict; Path=/` |
| `__Host-rift_csrf` | случайный CSRF token; не является credential | сессия браузера | `Secure; SameSite=Strict; Path=/` |

`__Host-` требует HTTPS, `Path=/` и отсутствия `Domain`. В production API
должен работать на том же host, что и frontend, например
`https://rift.example.com/api/v1`, через reverse proxy. Это даёт
host-only cookies и не требует cross-origin CORS.

Для локальной разработки допустимы обычные имена cookies и `Secure: false`.
Это только dev-исключение: production не должен запускаться с такими
настройками.

Access JWT не содержит email, пароль, refresh token, permissions snapshot
или другую чувствительную информацию. JWT подписывается отдельным ключом,
проверяется по `iss`, `aud`, `exp` и алгоритму, явно разрешённому в
конфигурации.

## Хранение сессий

Таблица `sessions` хранит только хеш refresh secret, никогда исходный
refresh token.

| Поле | Назначение |
| --- | --- |
| `id` | UUID сессии; первая часть refresh cookie. |
| `user_id` | Владелец сессии. |
| `refresh_token_hash` | Argon2id-хеш второй части refresh cookie. |
| `expires_at` | Абсолютный срок жизни сессии. |
| `created_at`, `last_used_at` | Аудит и отображение активных сессий. |
| `revoked_at` | Признак logout, отзыва или повторного использования токена. |
| `user_agent` | Необязательная подпись устройства для UI; не credential. |

Нужны индекс `sessions(user_id)` для списка устройств и индекс по
`expires_at` для фоновой очистки истёкших записей. Текущая SQL migration ещё
не создаёт эту таблицу: её нужно добавить вместе с реализацией auth-модуля.

## Backend: flow

### Регистрация и вход

1. `POST /auth/register` или `POST /auth/login` валидирует DTO и проходит
   rate limit.
2. Пароль сравнивается с Argon2id-хешем. В БД не бывает plaintext-password,
   SHA-256 или MD5.
3. В одной transaction создаётся `sessions` row, генерируется случайный
   refresh secret и записывается его Argon2id-хеш.
4. Backend выставляет access, refresh и CSRF cookies; в body возвращает
   только безопасную модель пользователя.

Пароль следует принимать длиной до 128 символов и не обрезать. Argon2id
должен быть настроен не слабее `memoryCost: 19456`, `timeCost: 2`,
`parallelism: 1`; значения нужно измерить на production-инфраструктуре.

### Проверка защищённых запросов

`JwtAuthGuard` читает access cookie, проверяет подпись и claims и помещает
`sub`/`sid`/`role` в request context. Контроллеры используют
`CurrentUser` decorator, а авторизация ресурса проверяется сервисом:
валидный JWT не даёт доступ к чужому incident.

Access JWT не проверяется через Redis или PostgreSQL на каждом запросе.
После logout он может действовать до 15 минут; это осознанный компромисс.
Для немедленного глобального отзыва потребуется отдельная проверка session
или `token_version` на каждом чувствительном запросе — добавлять её только
если это станет требованием.

### Обновление токенов

1. Frontend вызывает `POST /auth/refresh` при `401` от access token или при
   запуске приложения.
2. Backend разбирает `sessionId.secret`, берёт сессию `FOR UPDATE`, проверяет
   `revoked_at`, `expires_at` и Argon2id-хеш.
3. В той же transaction заменяет хеш новым случайным secret, обновляет
   `last_used_at` и выставляет новую пару cookies.
4. Если старый или неверный refresh token предъявлен повторно, сессия
   отзывается, cookies очищаются и возвращается `401`.

Клиент должен выполнять только один refresh одновременно; остальные запросы
ждут его результат. Иначе параллельные запросы сами создадут ложное
«повторное использование» токена.

### Logout и управление устройствами

`POST /auth/logout` отзывает текущую сессию и очищает все auth cookies.
`DELETE /users/me/sessions/:id` позволяет отозвать другую сессию только её
владельцу. Ответ списка сессий никогда не содержит token, hash, IP или
полный User-Agent.

## CSRF, CORS и HTTP

Cookies защищают от чтения из JavaScript, но браузер автоматически добавляет
их к запросу. Для каждого небезопасного метода (`POST`, `PUT`, `PATCH`,
`DELETE`) backend обязан:

1. сравнить заголовок `X-CSRF-Token` со значением CSRF cookie;
2. проверить `Origin` по точному allowlist;
3. вернуть `403`, если любая проверка не пройдена.

Это распространяется и на login/register, чтобы избежать login CSRF.
`SameSite=Strict` — дополнительная защита, а не замена CSRF-проверке.

Если frontend и API нельзя разместить на одном host, разрешаются только
явные origins, `credentials: true` и `SameSite=None; Secure`; wildcard `*`
в CORS запрещён. Такой режим сложнее и должен быть исключением.

На ответах, которые выставляют credentials, отправляйте
`Cache-Control: no-store`. TLS обязателен. В логах нельзя писать cookies,
Authorization headers, passwords или refresh token.

## Rate limit и Redis

Redis-ключи имеют TTL и не содержат credentials:

```text
rate-limit:login:{ip}
rate-limit:login:{normalized-email}:{ip}
rate-limit:refresh:{ip}
rate-limit:refresh:{sessionId}
```

Лимиты нужны как минимум для `register`, `login`, `refresh` и reset-password.
Сочетайте лимит по IP и по account identifier, но возвращайте одинаковую
ошибку входа для неизвестного email и неверного пароля. Это не даёт
enumerate пользователей.

## Frontend: Next.js

Frontend не читает, не сохраняет и не передаёт access/refresh token вручную:

ни `localStorage`, ни Zustand, ни TanStack Query не содержат credentials.
Browser сам отправляет `HttpOnly` cookies. Модель текущего пользователя
получается из `GET /users/me` и хранится как обычные query data.

Для любого mutation frontend считывает CSRF cookie и добавляет
`X-CSRF-Token`. HTTP-клиент отправляет credentials и при одном `401`
выполняет общий `POST /auth/refresh`, после чего повторяет исходный запрос
один раз. Если refresh завершился `401`, он очищает query cache и направляет
на `/login`.

После login/register frontend запрашивает `GET /users/me`, а не декодирует
JWT. Logout вызывает API, очищает локальный query cache и закрывает socket.
Socket.IO проходит тот же origin check и аутентифицируется access cookie в
handshake; gateway проверяет JWT до `join` любой room.

## API contract

| Endpoint | Поведение |
| --- | --- |
| `POST /auth/register` | Создаёт пользователя и первую сессию, `201`, выставляет cookies. |
| `POST /auth/login` | Создаёт сессию, `200`, выставляет cookies. |
| `POST /auth/refresh` | Ротирует refresh token и access token, `204`, выставляет cookies. |
| `POST /auth/logout` | Отзывает текущую сессию, очищает cookies, `204`. |
| `GET /users/me` | Возвращает безопасную модель текущего пользователя. |
| `GET /users/me/sessions` | Возвращает метаданные активных сессий. |
| `DELETE /users/me/sessions/:id` | Отзывает указанную сессию пользователя, `204`. |

## Необходимые NestJS-компоненты

```text
modules/auth/
├── auth.controller.ts
├── auth.service.ts
├── sessions.repository.ts
├── password.service.ts
├── jwt-auth.guard.ts
├── csrf.guard.ts
└── dto/
```

Используются `@nestjs/jwt` для подписи и проверки JWT, глобальный
`ValidationPipe` с `whitelist` и `forbidNonWhitelisted`, а также
`@nestjs/throttler` с Redis storage при нескольких экземплярах API. Secrets
валидируются на старте и приходят из environment/secret manager.

## Источники

- [NestJS authentication](https://docs.nestjs.com/security/authentication)
- [NestJS rate limiting](https://docs.nestjs.com/security/rate-limiting)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)

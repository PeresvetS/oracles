# AuthModule

## Что это / зачем

AuthModule отвечает за JWT-аутентификацию Oracle. Обеспечивает вход по email/паролю, выдачу токена, и верификацию токена на защищённых маршрутах.

**Модель доступа:** все пользователи Oracle — равноправные администраторы. Ролей нет. Регистрация через UI отсутствует — учётки создаются только через `yarn db:seed` или напрямую в БД.

## Структура файлов

```
src/core/auth/
├── auth.module.ts                          # NestJS модуль (imports: PassportModule, JwtModule)
├── auth.service.ts                         # Бизнес-логика: login, getMe
├── auth.controller.ts                      # REST: POST /login, GET /me
├── jwt.strategy.ts                         # Passport JWT-стратегия
├── dto/
│   └── login.dto.ts                        # email, password
└── interfaces/
    └── authenticated-user.interface.ts     # AuthenticatedUser, JwtPayload, LoginResponse

src/shared/
├── guards/
│   └── jwt-auth.guard.ts                   # extends AuthGuard('jwt')
└── decorators/
    └── current-user.decorator.ts           # @CurrentUser() — достаёт user из request
```

## API Endpoints

| Метод | Путь | Auth | Описание |
|-------|------|------|----------|
| POST | `/api/auth/login` | — | Вход: email + пароль → JWT + user |
| GET | `/api/auth/me` | JWT | Данные текущего пользователя |

Swagger: `/api/docs` → тег «Авторизация»

### POST `/api/auth/login`

**Тело запроса:**
```json
{ "email": "admin@besales.app", "password": "changeme" }
```

**Ответ `200 OK`:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "cuid-uuid",
    "email": "admin@besales.app",
    "name": "Admin",
    "createdAt": "2026-03-04T00:00:00.000Z"
  }
}
```

**Ошибки:**
- `401 Unauthorized` — неверный email или пароль (одно сообщение, не раскрывает причину)

### GET `/api/auth/me`

Требует `Authorization: Bearer <token>`. Возвращает `AuthenticatedUser` (без поля `password`).

**Ошибки:**
- `401 Unauthorized` — токен отсутствует, невалиден или истёк

## Ключевые сервисы и методы

### AuthService

| Метод | Описание |
|-------|----------|
| `login(email, password)` | Ищет user по email, сравнивает bcrypt-хэш, генерирует JWT |
| `getMe(userId)` | SELECT user по ID, бросает UnauthorizedException если не найден |

### JwtStrategy

- Извлекает Bearer-токен из заголовка `Authorization`
- Payload: `{ sub: userId, email }`
- Валидирует токен (подпись + TTL) + делает SELECT в БД для проверки существования пользователя
- Кладёт `AuthenticatedUser` в `request.user`

### JwtAuthGuard + @CurrentUser()

```typescript
import { JwtAuthGuard } from '@shared/guards/jwt-auth.guard';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import type { AuthenticatedUser } from '@core/auth/interfaces/authenticated-user.interface';

@Get('protected')
@UseGuards(JwtAuthGuard)
example(@CurrentUser() user: AuthenticatedUser) {
  // user: { id, email, name, createdAt }
}
```

`JwtAuthGuard` работает в любом модуле — JWT-стратегия регистрируется глобально при инициализации `AuthModule`.

## JWT Flow

```
Клиент → POST /api/auth/login
    │
    ├── AuthService.login()
    │    ├── prisma.user.findUnique({ where: { email } })
    │    ├── bcrypt.compare(password, user.password)
    │    └── jwt.sign({ sub: user.id, email }) → accessToken
    │
    └── Ответ: { accessToken, user }

Клиент → GET /api/protected (Authorization: Bearer <token>)
    │
    ├── JwtAuthGuard → JwtStrategy.validate()
    │    ├── Проверка подписи и TTL токена
    │    ├── prisma.user.findUnique({ where: { id: payload.sub } })
    │    └── request.user = AuthenticatedUser
    │
    └── @CurrentUser() извлекает user из request
```

## Конфигурация

### Обязательные переменные окружения

| Переменная | Описание | Пример |
|------------|----------|--------|
| `JWT_SECRET` | Секрет для подписи JWT | `openssl rand -hex 32` |

Настраивается через `ConfigModule` (`.env` или Railway Variables).

### Константы (`@oracle/shared`)

| Константа | Значение | Описание |
|-----------|----------|----------|
| `AUTH.JWT_EXPIRES_IN` | `'7d'` | TTL токена |
| `AUTH.BCRYPT_SALT_ROUNDS` | `10` | Сложность хэширования паролей |

## Seed — первоначальное создание пользователя

```bash
# Из apps/api/
yarn db:seed
```

Создаёт администратора с параметрами из env:

| Переменная seed | По умолчанию | Описание |
|----------------|--------------|----------|
| `SEED_ADMIN_EMAIL` | `admin@besales.app` | Email администратора |
| `SEED_ADMIN_PASSWORD` | `changeme` | Пароль (хэшируется bcrypt) |

Seed идемпотентен: повторный запуск не изменяет существующего пользователя.

**Смена пароля вручную (через Prisma Studio или миграцию):**
```bash
yarn db:studio  # открыть GUI и изменить запись в таблице users
```

## Тесты

```
src/core/auth/auth.service.spec.ts  — 6 тестов
```

| Кейс | Что проверяется |
|------|----------------|
| Успешный вход | `accessToken` и `user` без поля `password` |
| Неверный пароль | `UnauthorizedException` |
| Неизвестный email | `UnauthorizedException` |
| Одно сообщение ошибки | Не раскрывает причину (email vs. пароль) |
| `getMe` успешно | Пользователь без поля `password` |
| `getMe` не найден | `UnauthorizedException` |

## Зависимости

- `PrismaModule` (глобальный) — таблица `users`
- `ConfigModule` (глобальный) — `JWT_SECRET` из env
- `@nestjs/jwt` + `@nestjs/passport` + `passport-jwt`
- `bcrypt` — хэширование и проверка паролей
- `@oracle/shared` — `AUTH.JWT_EXPIRES_IN`, `AUTH.BCRYPT_SALT_ROUNDS`

## Как расширять

### Добавить нового пользователя без seed

```bash
# Прямой INSERT через Prisma Studio
yarn db:studio
# Или через psql:
INSERT INTO users (id, email, password, name, created_at, updated_at)
VALUES (gen_random_uuid(), 'user@example.com', '<bcrypt-hash>', 'Name', now(), now());
```

Получить bcrypt-хэш: `node -e "require('bcrypt').hash('password', 10).then(console.log)"`.

### Изменить TTL токена

В `@oracle/shared/src/constants/auth.constants.ts`:
```typescript
export const AUTH = {
  JWT_EXPIRES_IN: '30d',  // было '7d'
  ...
} as const;
```

### Добавить роли (если понадобятся в будущем)

1. Добавить поле `role` в модель `User` в `schema.prisma`
2. Расширить `AuthenticatedUser` и `JwtPayload` интерфейсы
3. Создать `RolesGuard` в `src/shared/guards/`
4. Добавить декоратор `@Roles()`

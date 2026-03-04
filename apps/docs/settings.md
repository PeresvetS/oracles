# SettingsModule

Глобальный модуль управления настройками Oracle.

## Назначение

Хранит API-ключи LLM-провайдеров и параметры конфигурации в таблице `settings` (PostgreSQL).
Предоставляет синхронный доступ через in-memory кэш — без лишних запросов к БД при каждом обращении.

## Файлы

```
src/settings/
├── settings.module.ts       # Global NestJS модуль
├── settings.service.ts      # Бизнес-логика + кэш
├── settings.controller.ts   # REST API
└── dto/
    └── update-settings.dto.ts
```

## API

### `GET /api/settings`

Возвращает все настройки. API-ключи маскируются: `****xxxx` (последние 4 символа).

**Ответ:**
```json
{
  "openrouter_api_key": "****ab12",
  "perplexity_api_key": "****",
  "default_max_rounds": "5"
}
```

### `PATCH /api/settings`

Обновляет одну или несколько настроек. Передавать только изменяемые ключи.

**Тело запроса:**
```json
{
  "openrouter_api_key": "sk-or-v1-...",
  "default_max_rounds": "7"
}
```

**Ответ:** `204 No Content`

Оба эндпоинта защищены `JwtAuthGuard` (Bearer-токен).

## SettingsService

### Публичные методы

| Метод | Описание |
|-------|----------|
| `get(key): string \| null` | Синхронно из кэша → fallback на `process.env[KEY]` |
| `set(key, value): Promise<void>` | Upsert в БД + обновление кэша |
| `getAll(): Promise<Record<string, string>>` | Все настройки из кэша |
| `getAllMasked(): Promise<Record<string, string>>` | Все настройки с маскированием API-ключей |
| `reloadCache(): Promise<void>` | Принудительная перезагрузка кэша из БД |

### Кэширование

- Кэш (`Map<string, string>`) загружается в `onModuleInit()` из БД
- `get()` — полностью синхронный, без обращения к БД
- `set()` — upsert в БД + обновление Map, без полной перезагрузки
- `reloadCache()` — полная перезагрузка (полезно после прямых изменений в БД)

### Маскируемые ключи

```
openrouter_api_key
perplexity_api_key
anthropic_api_key
openai_api_key
google_api_key
serper_api_key
```

### Стандартные ключи настроек

| Ключ | Описание | Дефолт |
|------|----------|--------|
| `openrouter_api_key` | API-ключ OpenRouter | `""` |
| `perplexity_api_key` | API-ключ Perplexity | `""` |
| `anthropic_api_key` | API-ключ Anthropic (прямой) | `""` |
| `openai_api_key` | API-ключ OpenAI (прямой) | `""` |
| `google_api_key` | API-ключ Google (прямой) | `""` |
| `serper_api_key` | API-ключ Serper (web search) | `""` |
| `default_max_rounds` | Дефолтный лимит раундов | `"5"` |
| `default_analyst_count` | Дефолтное кол-во аналитиков | `"3"` |
| `default_director_model` | Дефолтная модель директора | `"anthropic/claude-sonnet-4-6"` |
| `default_researcher_model` | Дефолтная модель ресерчера | `"sonar-reasoning-pro"` |

## Зависимости

- `PrismaModule` (глобальный) — доступ к таблице `settings`
- `@oracle/shared` — `maskApiKey()` для маскирования ключей
- `JwtAuthGuard` из `@shared/guards` — защита эндпоинтов (требует AuthModule)

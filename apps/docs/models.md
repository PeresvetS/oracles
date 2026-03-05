# ModelsModule

Модуль реестра LLM-моделей. Предоставляет информацию о доступных моделях и их характеристиках.

## Назначение

Хранит реестр всех поддерживаемых LLM-моделей (Claude, GPT, Gemini, Sonar) с их стоимостью, размером контекстного окна и возможностями. Определяет доступность каждой модели по наличию API-ключа провайдера.

## Файлы

```
src/config/
├── models.module.ts          # NestJS модуль
├── models.controller.ts      # GET /api/models endpoint
├── models.service.ts         # Бизнес-логика (available по SettingsService)
├── models.registry.ts        # MODEL_REGISTRY — статический реестр моделей
└── models.service.spec.ts    # Unit тесты
```

## API

### `GET /api/models`

Список всех моделей с флагом доступности.

| Параметр | Тип | Описание |
|----------|-----|----------|
| `family` | `string` | Фильтр по семейству: `claude`, `gpt`, `gemini`, `sonar` |
| `provider` | `string` | Фильтр по провайдеру: `openrouter`, `perplexity` |

**Ответ:** `ModelInfo[]`

```json
[
  {
    "id": "anthropic/claude-opus-4-6",
    "name": "Claude Opus 4.6",
    "provider": "openrouter",
    "family": "claude",
    "available": true,
    "costPer1kInput": 0.015,
    "costPer1kOutput": 0.075,
    "contextWindow": 200000,
    "capabilities": ["chat", "reasoning", "web_search"]
  }
]
```

## ModelsService

### Ключевые методы

| Метод | Описание |
|-------|----------|
| `findAll()` | Все модели с флагом `available` |
| `findByFamily(family)` | Фильтрация по семейству |
| `findByProvider(provider)` | Фильтрация по провайдеру |
| `findById(id)` | Поиск модели по ID |

### Логика `available`

Модель считается доступной, если для её провайдера задан непустой API-ключ в настройках:

| Провайдер | Ключ настройки |
|-----------|---------------|
| `openrouter` | `openrouter_api_key` |
| `perplexity` | `perplexity_api_key` |
| `anthropic` | `anthropic_api_key` |
| `openai` | `openai_api_key` |
| `google` | `google_api_key` |

## Реестр моделей

| ID | Название | Провайдер | Семейство | Контекст |
|----|----------|-----------|-----------|----------|
| `anthropic/claude-sonnet-4-6` | Claude Sonnet 4.6 | openrouter | claude | 200K |
| `anthropic/claude-opus-4-6` | Claude Opus 4.6 | openrouter | claude | 200K |
| `openai/gpt-5.2` | GPT-5.2 | openrouter | gpt | 128K |
| `openai/gpt-5.3-codex` | GPT-5.3 Codex | openrouter | gpt | 128K |
| `openai/gpt-5.3-chat` | GPT-5.3 Chat | openrouter | gpt | 128K |
| `google/gemini-3.1-pro-preview` | Gemini 3.1 Pro Preview | openrouter | gemini | 1M |
| `sonar-reasoning-pro` | Sonar Reasoning Pro | perplexity | sonar | 128K |
| `sonar-pro` | Sonar Pro | perplexity | sonar | 200K |

## Зависимости

- `SettingsModule` (глобальный) — проверка наличия API-ключей
- `@oracle/shared` — тип `ModelInfo`

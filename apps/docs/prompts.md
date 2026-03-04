# PromptsModule

Модуль управления шаблонами системных промптов агентов.

## Назначение

Хранит, управляет и обрабатывает промпт-шаблоны для трёх ролей агентов (Директор, Аналитик, Ресерчер).
Каждая модель может иметь свой дефолтный промпт, учитывающий её сильные стороны.

## Файлы

```
src/core/prompts/
├── prompts.module.ts
├── prompts.service.ts
├── prompts.controller.ts
├── dto/
│   ├── create-prompt.dto.ts
│   └── update-prompt.dto.ts
└── defaults/
    ├── director.prompt.ts          # Директор — универсальный
    ├── analyst-claude.prompt.ts    # Аналитик Claude — глубокий анализ
    ├── analyst-gpt.prompt.ts       # Аналитик GPT — креативность
    ├── analyst-gemini.prompt.ts    # Аналитик Gemini — data-driven
    └── researcher.prompt.ts        # Ресерчер Perplexity
```

## API

### `GET /api/prompts`

Список шаблонов с фильтрацией.

| Параметр | Тип | Описание |
|----------|-----|----------|
| `role` | `AgentRole` | Фильтр по роли (DIRECTOR/ANALYST/RESEARCHER) |
| `modelId` | `string` | Фильтр по ID модели |

### `POST /api/prompts`

Создание нового шаблона. Если `isDefault=true`, сбрасывает предыдущий дефолтный для той же role+modelId.

### `PATCH /api/prompts/:id`

Обновление. Поля: `name`, `content`, `isDefault`.

### `DELETE /api/prompts/:id`

Удаление шаблона. Возвращает `204 No Content`.

## PromptsService

### Ключевые методы

| Метод | Описание |
|-------|----------|
| `findAll(filters)` | Список с фильтрацией по role, modelId |
| `findDefault(role, modelId)` | Дефолтный промпт по приоритету (см. ниже) |
| `create(dto)` | Создание + сброс предыдущего дефолтного |
| `update(id, dto)` | Обновление |
| `delete(id)` | Удаление |
| `processPrompt(prompt, context)` | Подстановка {{SESSION_FILTERS}}, {{INPUT_PROMPT}}, {{EXISTING_IDEAS}} |
| `buildFiltersBlock(filters)` | Человекочитаемый текст фильтров |

### Приоритет выбора дефолтного промпта

1. `isDefault=true` для конкретной `role` + `modelId`
2. `isDefault=true` для `role` + `modelId=null` (универсальный fallback)

### Подстановки

| Переменная | Заменяется на |
|------------|---------------|
| `{{SESSION_FILTERS}}` | Текст фильтров сессии (сложность, бюджет, время и т.д.) |
| `{{INPUT_PROMPT}}` | Вводный промпт пользователя |
| `{{EXISTING_IDEAS}}` | Существующие идеи (для режима VALIDATE) |

## Seed

`yarn db:seed` загружает 9 дефолтных промптов:

| Роль | Модель | Описание |
|------|--------|----------|
| DIRECTOR | null | Универсальный директор |
| ANALYST | null | Универсальный fallback (Claude) |
| ANALYST | anthropic/claude-sonnet-4-6 | Claude Sonnet 4.6 |
| ANALYST | anthropic/claude-opus-4-6 | Claude Opus 4.6 |
| ANALYST | openai/gpt-5.2-thinking | GPT-5.2 Thinking |
| ANALYST | openai/gpt-5.3-codex | GPT-5.3 Codex |
| ANALYST | openai/gpt-5.3-chat | GPT-5.3 Chat |
| ANALYST | google/gemini-3.1-pro | Gemini 3.1 Pro |
| RESEARCHER | null | Ресерчер Perplexity |

## Зависимости

- `PrismaModule` (глобальный) — таблица `prompt_templates`
- `@oracle/shared` — `SessionFilters` для `processPrompt()`

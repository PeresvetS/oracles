# AgentsModule

Модуль управления агентами. Отвечает за создание агентов для сессии с валидацией состава, разрешением системных промптов и автогенерацией имён.

## Назначение

Агенты — участники «совета директоров» в сессии. Каждый агент имеет роль (Директор, Аналитик, Ресерчер), модель LLM и системный промпт. AgentsModule не имеет собственного контроллера — агенты создаются и управляются через SessionsModule.

## Файлы

```
src/core/agents/
├── agents.module.ts                  # NestJS модуль (imports: PromptsModule)
├── agents.service.ts                 # Бизнес-логика
├── agents.service.spec.ts            # 15 unit тестов
├── dto/
│   └── create-agent.dto.ts           # role, provider, modelId, prompt config
└── constants/
    └── agent-names.constants.ts      # DEFAULT_AGENT_NAMES, generateAnalystName()
```

## AgentsService — ключевые методы

| Метод | Описание |
|-------|----------|
| `createForSession(sessionId, dtos[])` | Создание агентов с валидацией и промптами |
| `findBySession(sessionId)` | Все агенты сессии (по дате создания) |

## Валидация состава агентов

При создании агентов проверяется:
- Ровно **1 DIRECTOR**
- От **2 до 6 ANALYST** (SESSION_LIMITS.MIN_ANALYSTS / MAX_ANALYSTS)
- Ровно **1 RESEARCHER**

Если состав невалиден → `BadRequestException`.

## Разрешение системного промпта

Приоритет (от высшего к низшему):
1. `customSystemPrompt` — если передан напрямую в DTO
2. `promptTemplateId` — загружается из БД по UUID
3. `PromptsService.findDefault(role, modelId)` — дефолтный промпт (specific model → universal fallback)

Если промпт не найден ни одним из способов → `BadRequestException`.

## Автогенерация имён

Если `name` не указан в DTO:
- DIRECTOR → «Директор»
- RESEARCHER → «Ресерчер»
- ANALYST → «Аналитик 1», «Аналитик 2», ...

## CreateAgentDto

| Поле | Тип | Обязательно | Описание |
|------|-----|-------------|----------|
| `role` | AgentRole | да | DIRECTOR / ANALYST / RESEARCHER |
| `provider` | string | да | openrouter / perplexity |
| `modelId` | string | да | ID модели из MODEL_REGISTRY |
| `name` | string | нет | Имя агента (автогенерация) |
| `promptTemplateId` | UUID | нет | ID шаблона промпта |
| `customSystemPrompt` | string | нет | Кастомный промпт (приоритет) |
| `webSearchEnabled` | boolean | нет | Разрешён ли web_search (по умолчанию true) |

## Зависимости

- `PromptsModule` — разрешение дефолтных промптов
- `PrismaModule` (глобальный) — работа с БД
- `@oracle/shared` — AGENT_ROLE, SESSION_LIMITS

# Модуль IdeasModule + ReportsModule

## Обзор

Два модуля управляют жизненным циклом идей и финальными отчётами сессии Oracle.

- **IdeasModule** — создание, скоринг и финализация бизнес-идей
- **ReportsModule** — агрегация результатов и экспорт отчётов

---

## Жизненный цикл идеи

```
create()
   │
   ▼
PROPOSED ──→ ACTIVE ──→ FINAL
   │             │
   └─────────────┴──→ REJECTED
```

| Переход | Метод | Описание |
|---------|-------|----------|
| → PROPOSED | `create()` / `createFromAgentResponse()` | Создание |
| PROPOSED → ACTIVE | `updateStatus()` | Директор активирует |
| PROPOSED/ACTIVE → REJECTED | `updateStatus()` | Отклонение |
| ACTIVE → FINAL | `finalizeTopIdeas()` | ТОП-N по скорингу |
| ACTIVE → REJECTED | `finalizeTopIdeas()` | Не попала в ТОП-N |

---

## IdeasService

### Местоположение
`apps/api/src/core/ideas/ideas.service.ts`

### Зависимости
- `PrismaService` (глобальный)

### Методы

| Метод | Описание |
|-------|----------|
| `create(data)` | Создать одну идею со статусом PROPOSED |
| `createFromAgentResponse(sessionId, agentId, roundNumber, ideas[])` | Массовое создание из ответа агента |
| `parseIdeasFromText(content)` | Парсинг идей из markdown/list формата ответа аналитика |
| `updateStatus(ideaId, status, metadata?)` | Обновить статус с валидацией допустимых переходов |
| `addScores(ideaId, agentId, ice, rice)` | Добавить ICE/RICE скоринг аналитика, пересчитать avgIce/avgRice |
| `addScore(ideaId, agentId, score)` | Backward-compatible обёртка над addScores |
| `finalizeTopIdeas(sessionId, topCount)` | Финализировать ТОП-N идей, остальные → REJECTED |
| `findBySession(sessionId, status?, userId?)` | Идеи сессии с фильтром по статусу и проверкой доступа |
| `findRejected(sessionId, userId?)` | Отклонённые идеи сессии с проверкой доступа |
| `findActiveForScoring(sessionId)` | PROPOSED + ACTIVE идеи для скоринга |

### Скоринг

Поле `scores` в Prisma — JSON типа `Record<agentId, AnalystScore>`:

```typescript
interface AnalystScore {
  ice: { impact: number; confidence: number; ease: number; total: number };
  rice: { reach: number; impact: number; confidence: number; effort: number; total: number };
}
```

После каждого `addScore()` автоматически пересчитываются:
- `avgIce = mean(scores[*].ice.total)`
- `avgRice = mean(scores[*].rice.total)`

### Финализация

`finalizeTopIdeas(sessionId, topCount)`:
1. Выбирает все PROPOSED/ACTIVE идеи
2. Сортирует по `avgIce DESC` (tiebreaker: `avgRice DESC`)
3. Первые N → `FINAL`
4. Остальные → `REJECTED` с причиной «Не вошла в ТОП-N по скорингу ICE/RICE»

---

## ScoringParserService

### Местоположение
`apps/api/src/core/orchestrator/scoring-parser.service.ts`

### Описание

Парсит ICE/RICE скоры из текстовых ответов аналитиков после SCORING раунда. Чистая логика (нет зависимостей на БД).

### Ожидаемый формат (SCORING_INSTRUCTION)

```
### [Название идеи]
ICE: Impact=X, Confidence=Y, Ease=Z → Total=T
RICE: Reach=X, Impact=Y, Confidence=Z, Effort=W → Total=T
Обоснование: ...
```

### Важные детали

- Значение Total **пересчитывается локально** (LLM-значению не доверяем)
  - ICE total = `(impact + confidence + ease) / 3`
  - RICE total = `(reach * impact * confidence) / effort`
- Компоненты clamping: ICE [1,10], RICE reach/impact/effort [1,10], RICE confidence [0,1]
- Если ICE или RICE не распарсились → блок пропускается + warning
- `normalizeIdeaTitle()` — для сопоставления распарсенных названий с DB (lowercase, trim, убрать кавычки)

---

## ReportsService

### Местоположение
`apps/api/src/core/reports/reports.service.ts`

### Зависимости
- `PrismaService` (глобальный)

### Методы

| Метод | Описание |
|-------|----------|
| `create(sessionId)` | Создать/обновить отчёт (upsert — идемпотентно) |
| `findBySession(sessionId, userId?)` | Получить отчёт; NotFoundException если нет или нет доступа |
| `exportCsv(sessionId, userId?)` | `Buffer` (UTF-8 BOM, `;`-разделитель) |
| `exportJson(sessionId, userId?)` | JSON как ReportContent |

### Структура Report.content (ReportContent)

```typescript
interface ReportContent {
  finalIdeas: {
    title: string;
    summary: string;
    avgIce: number;
    avgRice: number;
    details: Record<string, unknown>;
    scores: Record<string, unknown>;
  }[];
  rejectedIdeas: {
    title: string;
    summary: string;
    rejectionReason: string;
    rejectedInRound: number;
  }[];
  summary: string;         // текстовое резюме
  totalRounds: number;     // количество завершённых раундов
  totalCostUsd: number;    // общая стоимость LLM-вызовов
}
```

### CSV-экспорт

- `\uFEFF` BOM в начале (совместимость с Excel)
- Разделитель `;`
- Заголовки: `Название;Описание;Средний ICE;Средний RICE;Количество оценок`
- После финальных идей — секция «Отклонённые идеи»

### Идемпотентность

`create()` использует `upsert` по `sessionId` (уникальный индекс). Повторный вызов безопасен — обновляет существующий отчёт.

---

## REST API

### Ideas

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/sessions/:sessionId/ideas` | Идеи сессии (опц. `?status=FINAL`) |
| GET | `/api/sessions/:sessionId/ideas/rejected` | Отклонённые идеи |

### Reports

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/sessions/:sessionId/report` | Финальный отчёт |
| GET | `/api/sessions/:sessionId/report/export?format=csv` | Экспорт CSV |
| GET | `/api/sessions/:sessionId/report/export?format=json` | Экспорт JSON |

Все эндпоинты требуют `Authorization: Bearer <JWT>`.

---

## Интеграция с Orchestrator

### SCORING раунд

После того как все аналитики завершили SCORING раунд:
1. `ideasService.findActiveForScoring(sessionId)` → список идей
2. Для каждого аналитика: `scoringParser.parseAnalystScoring(content)` → `Map<title, AnalystScore>`
3. Сопоставление по нормализованному названию (exact + substring fallback)
4. `ideasService.addScore(ideaId, agentId, score)` для каждого совпадения

### FINAL раунд

После завершения FINAL раунда:
1. `ideasService.finalizeTopIdeas(sessionId, DEFAULT_TOP_COUNT)` → `{ finalized, rejected }`
2. `reportsService.create(sessionId)` → создание/обновление отчёта
3. `eventEmitter.emitReportReady(sessionId, report.id)` → WebSocket уведомление

Дополнительно:
- после каждого ответа аналитика в INITIAL/DISCUSSION/USER_INITIATED выполняется `parseIdeasFromText` + `createFromAgentResponse`
- при сохранении отчёта `scores` обогащаются метаданными аналитика (`agentName`, `modelId`)

### WebSocket события

- `report:ready` — отчёт готов (payload: `{ reportId }`)
- `idea:update` — идея обновлена (в будущем, сейчас не используется автоматически)

---

## Модули NestJS

### IdeasModule
```
providers: [IdeasService]
controllers: [IdeasController]
exports: [IdeasService]
```

### ReportsModule
```
providers: [ReportsService]
controllers: [ReportsController]
exports: [ReportsService]
```

Оба модуля:
- Не импортируют PrismaModule (глобальный)
- Не импортируют OrchestratorModule (нет circular dep)
- Импортируются в OrchestratorModule и AppModule

---

## Константы

### ideas.constants.ts
```typescript
IDEA_LIMITS = {
  ICE_MIN: 1, ICE_MAX: 10,
  RICE_CONFIDENCE_MIN: 0, RICE_CONFIDENCE_MAX: 1,
  RICE_COMPONENT_MIN: 1, RICE_COMPONENT_MAX: 10,
  DEFAULT_TOP_COUNT: 3,  // SESSION_LIMITS.DEFAULT_MAX_IDEAS_FINAL
  MAX_TOP_COUNT: 10,     // SESSION_LIMITS.MAX_IDEAS_FINAL
}
```

### reports.constants.ts
```typescript
CSV_SEPARATOR = ';'
CSV_UTF8_BOM = '\uFEFF'
EXPORT_FORMAT = { CSV: 'csv', JSON: 'json' }
```

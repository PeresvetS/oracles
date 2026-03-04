# Oracle Admin — Frontend (`apps/admin`)

## Что это

Next.js 16 (App Router) + React 19 приложение — панель управления мультиагентной системой Oracle.
Позволяет создавать и отслеживать сессии, видеть real-time стриминг ответов агентов через WebSocket, управлять промптами и API-ключами.

## Стек

| Технология | Версия | Назначение |
|-----------|--------|-----------|
| Next.js | ^16 | App Router, SSR/SSG |
| React | ^19 | UI |
| Tailwind CSS | ^4 | Стили |
| Shadcn UI | latest | UI-компоненты |
| Zustand | ^5 | Клиентское состояние (auth, session real-time) |
| TanStack React Query | ^5 | Серверное состояние (сессии, промпты, модели) |
| Socket.io client | ^4 | WebSocket для стриминга агентов |
| next-themes | ^0.4 | Управление тёмной темой |
| Sonner | ^2 | Toast-уведомления |
| Recharts | ^2 | Charts (ICE/RICE scoring) |

## Структура

```
apps/admin/src/
├── app/
│   ├── layout.tsx               # Root layout (провайдеры, геист-шрифты)
│   ├── page.tsx                 # Редирект → /sessions
│   ├── providers.tsx            # Client: ThemeProvider, QueryClient, I18nProvider, Toaster
│   ├── globals.css              # Tailwind v4 + CSS-переменные Shadcn (тёмная тема)
│   ├── login/page.tsx           # Форма входа
│   ├── sessions/
│   │   ├── page.tsx             # Список сессий (дашборд) + кнопка «+ Новая сессия»
│   │   ├── new/page.tsx         # Полная форма создания сессии (агенты, фильтры, лимиты)
│   │   └── [id]/page.tsx        # Страница сессии: Tabs «Чат» / «Отчёт»
├── components/
│   ├── ui/
│   │   ├── button.tsx, card.tsx, input.tsx, label.tsx, badge.tsx, textarea.tsx, skeleton.tsx
│   │   ├── select.tsx, slider.tsx, checkbox.tsx, tabs.tsx, collapsible.tsx, dialog.tsx
│   │   ├── status-badge.tsx     # StatusBadge: маппинг SessionStatus → Badge + i18n
│   │   ├── token-counter.tsx    # TokenCounter: отображение стоимости $X.XXXX
│   │   ├── app-shell.tsx        # AppShell: sidebar layout + мобильный хедер + ThemeToggle
│   │   └── error-boundary.tsx   # React Error Boundary (class component)
│   ├── admin/
│   │   ├── api-keys-form.tsx    # Форма API-ключей (GET/PATCH /api/settings), по ключу
│   │   ├── prompt-template-list.tsx # Таблица шаблонов + фильтры + создание/редакт./удал.
│   │   ├── prompt-template-editor.tsx # Shadcn Dialog: create/edit PromptTemplate
│   │   └── model-list.tsx       # Таблица моделей из useModels() с availability badge
│   ├── sessions/
│   │   ├── session-card.tsx     # Карточка сессии (статус, режим, раунды, стоимость)
│   │   └── session-list.tsx     # Список сессий + Skeleton загрузка + empty state
│   ├── session-config/
│   │   ├── model-selector.tsx   # Select с группировкой по family; disabled если !available
│   │   ├── prompt-editor.tsx    # Select шаблона + авто-выбор по modelId + Textarea
│   │   ├── agent-configurator.tsx # Карточка агента: роль, имя, модель, промпт, web-search
│   │   └── filters-config.tsx   # Slider, Input, Select, Checkbox для фильтров сессии
│   ├── report/
│   │   ├── scoring-chart.tsx    # Recharts BarChart: ICE avg / RICE avg по идеям
│   │   ├── idea-detail-card.tsx # Детальная карточка идеи + ScoringChart + оценки аналитиков
│   │   ├── rejected-ideas-list.tsx # Shadcn Collapsible: список отклонённых идей
│   │   ├── export-buttons.tsx   # Кнопки CSV/JSON с api.downloadBlob()
│   │   ├── idea-table.tsx       # @tanstack/react-table: сортировка, выделение строки
│   │   └── report-view.tsx      # Контейнер вкладки «Отчёт»: export + chart + table + details
│   └── chat/
│       ├── message-bubble.tsx   # Пузырь сообщения (REST + streaming), мигающий курсор, tool calls
│       ├── round-divider.tsx    # Горизонтальный разделитель раундов (номер + тип + Badge)
│       ├── tool-call-display.tsx# Сворачиваемый блок web_search / call_researcher
│       ├── agent-status-bar.tsx # Индикатор «думает...» для стримящих агентов
│       └── session-controls.tsx # Pause/Resume/Stop + раунд индикатор + поле ввода
├── hooks/
│   ├── use-auth.ts              # Проверка авторизации + редирект на /login
│   ├── use-session.ts           # useSessionDetail + useSessionMessagesInitial (однократно)
│   ├── use-session-socket.ts   # WebSocket хук: join/leave, все события → store
│   ├── use-models.ts            # GET /api/models — список моделей (staleTime: 5 min)
│   ├── use-prompts.ts           # GET /api/prompts?role=... — массив шаблонов
│   └── use-report.ts            # GET /api/sessions/:id/report (404 → null, без throw)
├── i18n/
│   ├── context.tsx              # I18nProvider + useI18n() hook
│   ├── en.ts                    # Английская локаль + интерфейс I18nKeys
│   └── ru.ts                    # Русская локаль
├── lib/
│   ├── api.ts                   # Fetch wrapper: JWT auto-inject, 401→logout
│   ├── socket.ts                # Socket.io синглтон: getSessionSocket(token), disconnectSessionSocket()
│   └── utils.ts                 # cn() (clsx + tailwind-merge), re-export formatCost/formatTokens
├── store/
│   ├── auth-store.ts            # Zustand + persist: token, user, login(), logout()
│   └── session-store.ts        # Zustand (not persisted): messages, rounds, toolCalls, streaming state
└── types/
    └── index.ts                 # Реэкспорт из @oracle/shared + UI-специфичные типы
```

## Конфигурация

### Переменные окружения

```env
NEXT_PUBLIC_API_URL=http://localhost:3001  # URL бэкенда
```

### Tailwind v4

Конфигурация **только через CSS-файл** (`src/app/globals.css`), не через `tailwind.config.ts`:
- `@import "tailwindcss"` вместо `@tailwind base/components/utilities`
- `@theme inline { ... }` для маппинга CSS-переменных в Tailwind-классы
- `@custom-variant dark (&:is(.dark *))` для тёмной темы через класс

PostCSS-плагин: `@tailwindcss/postcss`.

### Shadcn UI

Конфигурация в `components.json`. Компоненты добавляются вручную в `src/components/ui/`.
Для установки дополнительных: `yarn dlx shadcn@latest add <component>`.

### Тёмная тема

По умолчанию тёмная. `next-themes` с `defaultTheme="dark"` и `attribute="class"`.
CSS-переменные тёмной темы определены в `.dark { ... }` секции `globals.css`.

## i18n

Использует React Context. Текущая локаль: `ru` по умолчанию.
Форматирование даты/времени в UI (карточки сессий и сообщения чата) также привязано к текущей локали (`ru` → `ru-RU`, `en` → `en-US`).

```typescript
import { useI18n } from '@/i18n/context';

function Component() {
  const { t } = useI18n();
  return <span>{t.common.loading}</span>;
}
```

Добавление новых ключей:
1. Добавить в интерфейс `I18nKeys` в `en.ts`
2. Добавить значение в `en` объект
3. Добавить перевод в `ru.ts`

## API-клиент

```typescript
import { api } from '@/lib/api';

// GET
const sessions = await api.get<SessionsListResponse>('/api/sessions');

// POST
const session = await api.post<SessionDto>('/api/sessions', { ... });

// PATCH
await api.patch('/api/settings', { key: 'value' });

// Скачать файл (CSV/JSON экспорт)
const blob = await api.downloadBlob(`/api/sessions/${id}/report/export?format=csv`);
const url = URL.createObjectURL(blob);
// ... создать <a> и кликнуть ...
URL.revokeObjectURL(url);
```

- `NEXT_PUBLIC_API_URL` — базовый URL
- JWT автоматически инъектируется из `auth-store`
- 401 → logout + redirect `/login`
- `downloadBlob` — для бинарных файлов; JWT из store

## Auth Store (Zustand)

```typescript
import { useAuthStore } from '@/store/auth-store';

// В компоненте
const { token, user, login, logout } = useAuthStore();

// Вне компонента (в api.ts, socket.ts)
const token = useAuthStore.getState().token;
```

Данные сохраняются в `localStorage` под ключом `oracle-auth`.

## WebSocket интеграция

### Архитектура

```
Backend /session namespace (JWT auth)
    ↓ Socket.io events
lib/socket.ts (синглтон, кэш по токену)
    ↓
hooks/use-session-socket.ts (join/leave/reconnect, dispatch)
    ↓
store/session-store.ts (Zustand: messages, rounds, toolCalls, status)
    ↓
UI: MessageBubble, RoundDivider, AgentStatusBar, SessionControls
```

### socket.ts — синглтон

```typescript
import { getSessionSocket, disconnectSessionSocket } from '@/lib/socket';

// Получить (или создать) подключение
const socket = getSessionSocket(token);

// Отключить (при logout)
disconnectSessionSocket();
```

- Один сокет на один JWT-токен
- При смене токена — пересоздание
- Reconnection: 10 попыток, задержка 2s
- Namespace `/session`, auth: `{ token }`

### use-session-socket.ts — хук

```typescript
import { useSessionSocket } from '@/hooks/use-session-socket';

// В странице сессии
useSessionSocket(sessionId); // подключается и начинает слушать
```

Обрабатываемые события:

| Событие | Действие |
|---------|---------|
| `agent:message:start` | `store.addMessage(...)` |
| `agent:message:chunk` | `store.appendToMessage(id, chunk)` |
| `agent:message:end` | `store.finalizeMessage(id, meta)` |
| `agent:tool:start` | `store.addToolStart(agentId, tool, query)` |
| `agent:tool:result` | `store.addToolResult(agentId, tool, result)` |
| `round:start` | `store.addRound(...)` |
| `round:end` | `store.endRound(id)` |
| `session:status` | `store.updateStatus(status)` + invalidate query |
| `session:error` | `toast.error(...)` |
| `report:ready` | `queryClient.invalidateQueries(...)` |

### session-store.ts — Zustand

```typescript
import { useSessionStore } from '@/store/session-store';

// Чтение состояния
const messages = useSessionStore((s) => s.messages);
const streamingAgentIds = useSessionStore((s) => s.streamingAgentIds);
const connectionStatus = useSessionStore((s) => s.connectionStatus);

// Действия (вне компонентов)
const { addMessage, appendToMessage } = useSessionStore.getState();
```

**Не персистируется** — сбрасывается при уходе со страницы сессии.

**Защита от дубликатов**: `addMessage` проверяет `id` перед добавлением (защита от race condition REST ↔ WS).

## Хуки данных

### useSessionDetail

```typescript
import { useSessionDetail } from '@/hooks/use-session';

const { data: session, isLoading } = useSessionDetail(sessionId);
// GET /api/sessions/:id — данные с агентами, без авторефетча
```

### useSessionMessagesInitial

```typescript
import { useSessionMessagesInitial } from '@/hooks/use-session';

const { data: messagesData } = useSessionMessagesInitial(sessionId);
// GET /api/sessions/:id/messages — однократная загрузка, staleTime: Infinity
// Новые сообщения приходят через WebSocket в store
```

## Компоненты

### StatusBadge

```typescript
import { StatusBadge } from '@/components/ui/status-badge';

<StatusBadge status={session.status} />
// Отображает локализованный текст статуса с цветом
```

Маппинг: `CONFIGURING→muted`, `RUNNING→info`, `PAUSED→warning`, `COMPLETED→success`, `ERROR→destructive`.

### TokenCounter

```typescript
import { TokenCounter } from '@/components/ui/token-counter';

<TokenCounter costUsd={session.totalCostUsd} />
// Отображает: $0.0042
```

### MessageBubble

```typescript
import { MessageBubble } from '@/components/chat/message-bubble';

// Поддерживает оба типа: REST (MessageWithAgent) и WS (StreamingMessage)
<MessageBubble
  message={message}
  agentColor="blue"
  toolCalls={[{ tool: 'web_search', query: '...', result: '...', isLoading: false }]}
/>
```

- Определяет тип по type guard `isStreamingMessage()`
- При `isStreaming === true` — мигающий курсор `▌`
- Tool calls → `ToolCallDisplay` (сворачиваемый `<details>`)
- `MESSAGE_ROLE.SYSTEM` → центрированная пилюля

### RoundDivider

```typescript
import { RoundDivider } from '@/components/chat/round-divider';

<RoundDivider roundNumber={2} roundType="DISCUSSION" />
// Горизонтальная линия + Badge "Раунд 2 — Обсуждение"
```

Маппинг типов раундов: `INITIAL→info`, `DISCUSSION→secondary`, `RESEARCH→warning`, `SCORING→purple`, `USER_INITIATED→success`, `FINAL→default`.

### ToolCallDisplay

```typescript
import { ToolCallDisplay } from '@/components/chat/tool-call-display';

<ToolCallDisplay
  tool="web_search"
  query="SaaS market 2026"
  result="..."
  isLoading={false}
/>
// Сворачиваемый HTML <details>/<summary> с результатом
```

### AgentStatusBar

```typescript
import { AgentStatusBar } from '@/components/chat/agent-status-bar';

<AgentStatusBar agents={session.agents} agentColorMap={agentColorMap} />
// Показывает цветные пульсирующие точки для агентов из store.streamingAgentIds
```

### SessionControls

```typescript
import { SessionControls } from '@/components/chat/session-controls';

<SessionControls
  sessionId={id}
  status={currentStatus}
  currentRound={currentRound}
  maxRounds={maxRounds}
  onStatusChange={handleStatusChange}
/>
```

- **Pause** (при RUNNING) → `POST /api/sessions/:id/pause`
- **Resume** (при PAUSED) → `POST /api/sessions/:id/resume`
- **Stop** → inline confirm → pause
- **+ Добавить раунды** → Shadcn Dialog с Input (min=currentRound+1) → `PATCH /api/sessions/:id/max-rounds`
- **Input + Enter** → `POST /api/sessions/:id/message` (только при RUNNING)

### SessionCard

```typescript
import { SessionCard } from '@/components/sessions/session-card';

<SessionCard session={sessionDto} />
// Link → /sessions/:id
```

## Страница сессии /sessions/[id]

### Data flow

```
1. useSessionDetail → session metadata (агенты, статус, стоимость)
2. useSessionMessagesInitial → REST messages → convertToStreamingMessages → store
3. useSessionSocket → WS события → store (addMessage, appendToMessage, finalizeMessage...)
4. UI читает из store (не из React Query)
```

### Группировка по раундам

При рендере сообщений сравниваются соседние `msg.roundId`. При смене roundId вставляется `<RoundDivider>`.

### Auto-scroll

- Ref на `<main>` контейнер
- `isNearBottom`: true если `scrollHeight - scrollTop - clientHeight < 100px`
- Авто-скролл только если пользователь у дна (не прерывает чтение истории)

### Индикатор соединения

Точка в хедере: `🟢 connected`, `⚪ disconnected`, `🟡 reconnecting (пульсирует)`.

## Цвета агентов

Цвета определены в `AGENT_COLORS` (`packages/shared`):

| Роль | Цвет |
|------|------|
| DIRECTOR | blue |
| ANALYST_1 | emerald |
| ANALYST_2 | orange |
| ANALYST_3 | yellow |
| ANALYST_4 | cyan |
| ANALYST_5 | pink |
| ANALYST_6 | red |
| RESEARCHER | purple |
| USER | green |
| SYSTEM | gray |

В `sessions/[id]/page.tsx` строится маппинг `agentId → color` через `buildAgentColorMap()`.

## Страницы

| Путь | Статус | Описание |
|------|--------|---------|
| `/` | ✅ | Редирект → `/sessions` |
| `/login` | ✅ | Форма входа |
| `/sessions` | ✅ | Список сессий + кнопка создания |
| `/sessions/new` | ✅ | Полная форма: режим, вводные, агенты, фильтры, лимиты |
| `/sessions/[id]` | ✅ | Tabs: «Чат» (WebSocket стриминг) / «Отчёт» (RICE/ICE) |
| `/admin` | ✅ | API-ключи: GET/PATCH /api/settings, по провайдеру |
| `/admin/prompts` | ✅ | CRUD промпт-шаблонов + фильтры по роли/модели |
| `/admin/models` | ✅ | Таблица моделей с availability индикатором |

## Форма создания сессии (/sessions/new)

5 секций:
1. **Основное**: название (optional), режим (Generate / Validate)
2. **Вводные данные**: inputPrompt (Textarea); при Validate — existingIdeas (Textarea)
3. **Агенты**: `AgentConfigurator` для каждого; кнопка [+ добавить аналитика] (лимит MAX_ANALYSTS=6)
4. **Фильтры**: `FiltersConfig` (сложность, бюджет, timeToRevenue, marketSize, legalRisk, чекбоксы)
5. **Лимиты**: maxRounds, maxResearchCalls

Начальное состояние: 1 Директор + 3 Аналитика + 1 Ресерчер.
Модели автоподставляются автоматически:
- Директор/Аналитики: первая доступная OpenRouter модель
- Ресерчер: первая доступная Perplexity модель

### AgentConfigurator

```typescript
import { AgentConfigurator } from '@/components/session-config/agent-configurator';

<AgentConfigurator
  agent={agentState}         // AgentFormState
  onChange={updateAgent}
  onRemove={() => removeAgent(agent._tempId)}
  canRemove={isAnalyst && analystsCount > MIN_ANALYSTS}
/>
```

### ModelSelector

```typescript
import { ModelSelector } from '@/components/session-config/model-selector';

<ModelSelector
  value={modelId}
  onChange={(modelId, provider) => ...}
/>
// Группирует по family, disabled если !model.available, показывает причину (нет API-ключа)
```

### PromptEditor

```typescript
import { PromptEditor } from '@/components/session-config/prompt-editor';

<PromptEditor
  role="ANALYST"             // для фильтрации шаблонов
  modelId={currentModelId}   // при смене — авто-выбор дефолтного промпта
  value={systemPrompt}
  onChange={(v) => ...}
/>
```

## Вкладка «Отчёт»

Доступна при `status === COMPLETED` **или** если report уже создан. Реализована через Shadcn Tabs в `sessions/[id]/page.tsx`.

```
[ExportButtons (CSV/JSON)]
[ScoringChart — все финальные идеи]
[IdeaTable] | [IdeaDetailCard выбранной идеи]
[RejectedIdeasList (Collapsible)]
```

### ReportView

```typescript
import { ReportView } from '@/components/report/report-view';

<ReportView sessionId={id} sessionStatus={status} />
// useReport() обрабатывает 404 как «отчёт пока не готов»
```

### IdeaTable

```typescript
import { IdeaTable } from '@/components/report/idea-table';

<IdeaTable
  ideas={finalIdeas}
  onSelect={setSelectedIdea}
  selectedTitle={selectedIdea?.title ?? null}
/>
// @tanstack/react-table с сортировкой по ICE/RICE desc
```

## Как расширять

### Добавить новый Shadcn-компонент

```bash
yarn dlx shadcn@latest add dialog
```

Или вручную создать в `src/components/ui/<component>.tsx` по паттерну существующих.

## Навигация (AppShell)

Все страницы (кроме `/login`) оборачиваются в `<AppShell>`:

```typescript
import { AppShell } from '@/components/ui/app-shell';
import { ErrorBoundary } from '@/components/ui/error-boundary';

export default function SomePage() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return null;

  return (
    <AppShell>
      <ErrorBoundary>
        <div className="h-full overflow-y-auto">
          <div className="container mx-auto px-4 py-8">
            {/* контент */}
          </div>
        </div>
      </ErrorBoundary>
    </AppShell>
  );
}
```

`AppShell`:
- Десктоп: фиксированный sidebar (w-56) слева; main content — `flex-1`
- Мобайл: sidebar скрыт; открывается по кнопке-гамбургеру; overlay закрывает при клике
- Sidebar: Oracle logo → /sessions, навигация Sessions + Admin section (API Keys, Prompts, Models)
- Нижняя панель: ThemeToggle + email пользователя + кнопка Logout
- ThemeToggle: `useTheme()` из next-themes; защита от SSR через `resolvedTheme !== undefined`

**Для h-screen страниц** (например `/sessions/[id]`): используй `h-full flex-col` вместо `h-screen flex-col`, т.к. `AppShell` уже занимает `h-screen`.

## Error Boundary

```typescript
import { ErrorBoundary } from '@/components/ui/error-boundary';

// Оборачивает контент страницы
<ErrorBoundary>
  <PageContent />
</ErrorBoundary>

// С кастомным fallback
<ErrorBoundary fallback={<div>Custom error UI</div>}>
  <PageContent />
</ErrorBoundary>
```

## Страницы Admin

### /admin — API Keys

- Загружает все настройки: `GET /api/settings` → `Record<string, string>` (маскированные значения `****xxxx`)
- Каждый ключ — отдельный Input (type=password) + кнопка Save
- Сохранение только при изменении: `PATCH /api/settings` с `{ [settingKey]: value }`
- После сохранения: `queryClient.invalidateQueries(['settings'])` + toast.success

### /admin/prompts — Prompt Templates

- `GET /api/prompts?role=&modelId=` → `PromptTemplateDto[]`
- Фильтры: Select по роли (ALL/DIRECTOR/ANALYST/RESEARCHER) + Input по modelId
- Таблица: название, роль, modelId, isDefault badge, кнопки Edit/Delete
- Delete: инлайн-подтверждение (строка меняет кнопку Delete → Confirm/Cancel)
- Create/Edit: `<PromptTemplateEditor>` в Shadcn Dialog

### /admin/models — Models

- `GET /api/models` → `ModelInfo[]` (через `useModels()`)
- Таблица: name, family, provider, contextWindow, costPer1kInput, costPer1kOutput, available
- Availability: зелёный badge «Доступна» или серый «Нет ключа»

### Добавить новую страницу

1. Создать `src/app/<path>/page.tsx`
2. Обернуть в `<AppShell><ErrorBoundary>...</ErrorBoundary></AppShell>`
3. Добавить `useAuth()` хук
4. Добавить ссылку в `SidebarContent` в `app-shell.tsx`
5. Добавить ключи i18n в `en.ts` и `ru.ts`

### Добавить server state (React Query)

```typescript
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useSomething(id: string) {
  return useQuery({
    queryKey: ['something', id],
    queryFn: () => api.get<SomeDto>(`/api/something/${id}`),
    enabled: !!id,
  });
}
```

### Добавить WS-событие

1. Добавить в `WS_EVENTS` объект в `use-session-socket.ts`
2. Добавить action в `session-store.ts`
3. Добавить listener в `useEffect` хука
4. Не забыть добавить cleanup в `socket.off(...)` блок

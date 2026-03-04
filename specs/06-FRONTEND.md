# Oracle — Frontend (`apps/admin`, Next.js 16)

## Стек (из CLAUDE.md)

- **Framework**: Next.js 16 (App Router) + React 19
- **State**: Zustand 5 (auth store с persist) + TanStack React Query 5 (server state)
- **UI**: Shadcn UI + Radix + Tailwind CSS 4 + Lucide icons + Sonner toasts
- **Real-time**: Socket.io client для WebSocket стриминга
- **Auth**: JWT в localStorage, auto-inject через API client
- **i18n**: через context (en, ru). Все строки UI через локализацию, не хардкод.
- **Charts**: recharts
- **Tables**: @tanstack/react-table
- Functional components, TypeScript interfaces (prefer over types; avoid enums — use maps)
- Dark theme по умолчанию
- Named exports, lowercase-with-dashes директории
- Error Boundaries для обработки ошибок

## Структура проекта

```
apps/admin/src/
├── app/
│   ├── layout.tsx                     // Root layout + providers (auth, i18n, query)
│   ├── page.tsx                       // Redirect → /sessions
│   ├── login/
│   │   └── page.tsx                   // Авторизация
│   ├── sessions/
│   │   ├── page.tsx                   // Список сессий (дашборд)
│   │   ├── new/
│   │   │   └── page.tsx               // Создание сессии
│   │   └── [id]/
│   │       └── page.tsx               // Страница сессии (чат + отчёт)
│   └── admin/
│       ├── page.tsx                   // API keys
│       ├── prompts/
│       │   └── page.tsx               // Промпт-шаблоны
│       └── models/
│           └── page.tsx               // Доступные модели
├── components/
│   ├── sessions/
│   │   ├── session-list.tsx           // Список сессий с фильтрами
│   │   ├── session-card.tsx           // Карточка сессии
│   │   └── session-filters.tsx        // Фильтры по статусу, дате
│   ├── session-config/
│   │   ├── session-config-form.tsx    // Форма создания сессии
│   │   ├── agent-configurator.tsx     // Настройка агента: модель + промпт
│   │   ├── model-selector.tsx         // Выпадающий список моделей
│   │   ├── prompt-editor.tsx          // Выбор шаблона + inline-редактирование
│   │   └── filters-config.tsx         // Слайдеры и селекты для фильтров
│   ├── chat/
│   │   ├── session-chat.tsx           // Основной чат-контейнер
│   │   ├── message-list.tsx           // Список сообщений с разметкой по раундам
│   │   ├── message-bubble.tsx         // Одно сообщение агента
│   │   ├── round-divider.tsx          // Разделитель раундов
│   │   ├── agent-status-bar.tsx       // Статус: думает/ответил
│   │   ├── session-controls.tsx       // Pause/Resume/Stop/[+] раундов
│   │   ├── user-input.tsx             // Поле ввода сообщения
│   │   └── tool-call-display.tsx      // Блок web_search/call_researcher
│   ├── report/
│   │   ├── report-view.tsx            // Вкладка отчёта
│   │   ├── idea-table.tsx             // Таблица идей с ICE/RICE
│   │   ├── idea-detail-card.tsx       // Развёрнутая карточка идеи
│   │   ├── scoring-chart.tsx          // Bar chart оценок (recharts)
│   │   ├── rejected-ideas-list.tsx    // Сворачиваемый список
│   │   └── export-buttons.tsx         // CSV/JSON
│   ├── admin/
│   │   ├── api-keys-form.tsx          // API-ключи провайдеров
│   │   ├── prompt-template-list.tsx   // Список шаблонов
│   │   ├── prompt-template-editor.tsx // Редактор промпта
│   │   └── model-list.tsx             // Модели с индикатором доступности
│   └── ui/
│       ├── header.tsx
│       ├── sidebar.tsx
│       ├── token-counter.tsx          // Токены + стоимость
│       └── status-badge.tsx           // Статус: RUNNING/PAUSED/etc
├── hooks/
│   ├── use-auth.ts
│   ├── use-session.ts                // TanStack Query: данные сессии
│   ├── use-session-socket.ts         // WebSocket подключение + стриминг
│   └── use-models.ts                 // TanStack Query: список моделей
├── store/
│   ├── auth-store.ts                 // Zustand + persist
│   └── session-store.ts              // Zustand: messages, rounds, status в real-time
├── lib/
│   ├── api.ts                        // Fetch wrapper с JWT auto-inject
│   ├── socket.ts                     // Socket.io client instance
│   └── utils.ts                      // Форматирование стоимости, токенов
├── types/
│   └── index.ts
└── i18n/
    ├── context.tsx                    // I18nProvider
    ├── en.ts                          // Английская локаль
    └── ru.ts                          // Русская локаль
```

## Страницы

### 1. Login (`/login`)

Shadcn `Card` + `Input` + `Button`. Email + пароль. JWT → localStorage.
Redirect → `/sessions`. Нет регистрации, нет "забыл пароль".

### 2. Дашборд (`/sessions`)

```
┌──────────────────────────────────────────────────────────┐
│  Oracle                                    [Admin] [User]│
├──────────────────────────────────────────────────────────┤
│  [+ Новая сессия]                                        │
│  Фильтры: [Все ▼] [По дате ▼]                           │
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │ 🟢 AI-driven Email Analytics                     │    │
│  │ Generate • 4 раунда • 3 идеи • $8.50             │    │
│  │ Завершено: 2 часа назад                           │    │
│  └──────────────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────┐    │
│  │ 🟡 B2B Data Enrichment — На паузе                │    │
│  │ Validate • Раунд 3/5 • $4.20                      │    │
│  └──────────────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────┐    │
│  │ 🔵 Revenue Recovery SaaS — Идёт раунд 2          │    │
│  │ Generate • $3.20                                   │    │
│  └──────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

Каждая карточка: StatusBadge (цвет по статусу), название, режим, раунды, идеи, стоимость, время.
Загрузка через TanStack Query: `useQuery({ queryKey: ['sessions'], queryFn })`.

### 3. Создание сессии (`/sessions/new`)

**Секция 1: Основное**
- Название (опционально)
- Режим: Generate / Validate (Shadcn `Tabs` или `RadioGroup`)
- Промпт (Shadcn `Textarea`)
- Для Validate: поле существующих идей

**Секция 2: Агенты**

По умолчанию: 1 Директор + 3 Аналитика + 1 Ресерчер.

Каждый агент — `AgentConfigurator`:
```
┌─────────────────────────────────────────────┐
│  Аналитик 1                     [✕ удалить] │
│  Модель: [ModelSelector ▼]                   │
│  Промпт: [PromptEditor ▼] [✏️ Редактировать]│
│  ☑ Веб-поиск включён                        │
└─────────────────────────────────────────────┘
```

- `ModelSelector`: выпадающий список из `GET /api/models`, группировка по `family`. Недоступные модели (нет API-ключа) — greyed out.
- `PromptEditor`: при смене модели → автоматически меняется на дефолтный промпт для новой модели. Кнопка "Редактировать" → inline `Textarea`.
- Кнопка `[+ Добавить аналитика]` (до `SESSION_LIMITS.MAX_ANALYSTS`).
- Директор и Ресерчер — не удаляемые, но настраиваемые.

**Секция 3: Фильтры** (`FiltersConfig`)
- Сложность: Shadcn `Slider` (1-10)
- Бюджет: `Input` (number)
- Время до денег: `Select`
- Размер рынка: `Select`
- Конкуренты: `Checkbox`
- Юр. риск: `Select`
- Адекватность: `Checkbox`

**Секция 4: Лимиты**
- Макс раундов: `Input` (min: `SESSION_LIMITS.MIN_ROUNDS`, max: `SESSION_LIMITS.MAX_ROUNDS`)
- Макс вызовов ресерчера: `Input`

Кнопка `[Запустить сессию →]` → `POST /api/sessions` + `POST /api/sessions/:id/start`.

### 4. Страница сессии (`/sessions/[id]`)

Две вкладки (Shadcn `Tabs`): **Чат** и **Отчёт** (появляется после COMPLETED).

#### Вкладка: Чат

```
┌───────────────────────────────────────────────────────────────┐
│  AI-driven Email Analytics      RUNNING  Раунд 2/5     $3.20 │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  ═══════ Раунд 1: Генерация идей (INITIAL) ═══════          │
│                                                               │
│  🟦 Директор (Claude Sonnet 4.5)              12:30   $0.15  │
│  │ Задание: предложите 3-5 идей…                              │
│                                                               │
│  🟩 Аналитик 1 (Claude Sonnet 4.5)           12:31   $0.45  │
│  │ **Идея 1: AutoReply Optimizer**                            │
│  │ 🔍 web_search: "email automation SaaS competitors 2025"   │
│  │ ▼ Результаты поиска (3 результата)                        │
│                                                               │
│  🟧 Аналитик 2 (GPT-5)                      12:31   $0.38  │
│  │ **Идея 1: Pipeline Leak Detector**                         │
│                                                               │
│  🟨 Аналитик 3 (Gemini 2.5 Pro)             12:32   $0.22  │
│  │ **Идея 1: Churn Prediction API**                           │
│                                                               │
│  ═══════ Раунд 2: Обсуждение (DISCUSSION) ═══════           │
│                                                               │
│  🟦 Директор                                  12:33   $0.12  │
│  │ Обсудите идеи. AutoReply Optimizer…                        │
│  │ ⚡ call_researcher: "AI email optimization SaaS…"          │
│                                                               │
│  🟪 Ресерчер (Sonar Reasoning Pro)           12:33   $0.08  │
│  │ **Конкуренты**: Lavender AI, Regie.ai…                     │
│  │ 📎 Sources: [lavender.ai] [g2.com/…]                      │
│                                                               │
│  🟩 Аналитик 1 ● думает...                                   │
│                                                               │
├───────────────────────────────────────────────────────────────┤
│  [⏸ Пауза] [⏹ Стоп]   Раунды: 2/5 [+]                     │
│  [Написать сообщение...                              ] [↑]   │
└───────────────────────────────────────────────────────────────┘
```

**Элементы:**

1. **Шапка**: название, `StatusBadge`, раунды, `TokenCounter` (общая стоимость)

2. **RoundDivider**: горизонтальная линия + номер + тип. Цвета по типу:
   - INITIAL — синий, DISCUSSION — серый, RESEARCH — оранжевый
   - USER_INITIATED — зелёный, SCORING — фиолетовый, FINAL — золотой

3. **MessageBubble**:
   - Цвет по агенту (см. `AGENT_COLORS` из `@shared/constants/agent.constants`)
   - Заголовок: имя + модель
   - Время + стоимость (мелко справа)
   - `ToolCallDisplay`: сворачиваемый блок для web_search / call_researcher

4. **AgentStatusBar**: анимированная точка если "думает"

5. **SessionControls** (нижняя панель):
   - `[⏸ Пауза]` → `POST /api/sessions/:id/pause` (при RUNNING)
   - `[▶ Продолжить]` → `POST /api/sessions/:id/resume` (при PAUSED)
   - `[⏹ Стоп]` → confirm → принудительная финализация
   - `Раунды: N/M [+]` → Sonner dialog → `PATCH /api/sessions/:id/max-rounds`
   - `UserInput`: поле + кнопка → `POST /api/sessions/:id/message` (любой статус кроме CONFIGURING)

6. **Сообщения пользователя**: выровнены вправо, зелёный фон

#### Вкладка: Отчёт

Появляется при `status === 'COMPLETED'` (или есть Report).

**Финальные идеи** (`IdeaTable`):

Shadcn `Table` + @tanstack/react-table:
```
Идея            │ ICE avg │ RICE avg │ Бюджет   │ Время
────────────────┼─────────┼──────────┼──────────┼──────
AutoReply Opt.  │ 7.8     │ 8.2      │ $3,000   │ 1 мес
Lead Score Arb. │ 6.5     │ 7.1      │ $2,000   │ 2 мес
Pipeline Leak   │ 7.2     │ 6.8      │ $5,000   │ 3 мес
```

Клик → `IdeaDetailCard`: суть, механика, конкуренты, риски, возможности, unit-экономика (CAC/LTV/payback), оценки каждого аналитика, `ScoringChart` (bar chart recharts).

**Отброшенные идеи** (`RejectedIdeasList`): Shadcn `Collapsible`. Название + раунд + причина.

**Экспорт** (`ExportButtons`): `[📥 CSV]` `[📥 JSON]` → `GET /api/sessions/:id/report/export?format=...`

### 5. Админка (`/admin`)

**API Keys** (`/admin`):
```
OpenRouter:   [sk-or-v1-xxxx...xxxx    ] [💾]
Perplexity:   [pplx-xxxx...xxxx         ] [💾]
Serper:       [xxxx...xxxx               ] [💾]
Anthropic:    [                          ] [💾]  (будущее)
OpenAI:       [                          ] [💾]  (будущее)
Google:       [                          ] [💾]  (будущее)
```

Сохранение: `PATCH /api/settings`. Маскировка: отображается `sk-or-...xxxx`.

**Промпт-шаблоны** (`/admin/prompts`): Список + фильтры по роли/модели. CRUD через `/api/prompts`.

**Модели** (`/admin/models`): Из `GET /api/models`. Зелёный = API-ключ есть, серый = нет.

## WebSocket хук

```typescript
// hooks/use-session-socket.ts
import { io } from 'socket.io-client';
import { useSessionStore } from '@/store/session-store';

export function useSessionSocket(sessionId: string) {
  const addMessage = useSessionStore((s) => s.addMessage);
  const appendToMessage = useSessionStore((s) => s.appendToMessage);
  const finalizeMessage = useSessionStore((s) => s.finalizeMessage);
  const addRound = useSessionStore((s) => s.addRound);
  const updateStatus = useSessionStore((s) => s.updateStatus);

  useEffect(() => {
    const socket = io(`${API_URL}/session`, {
      auth: { token: getAuthToken() },
    });

    socket.emit('session:join', { sessionId });

    socket.on('agent:message:start', (data) => {
      addMessage({
        id: data.messageId,
        agentId: data.agentId,
        agentName: data.agentName,
        agentRole: data.agentRole,
        roundId: data.roundId,
        content: '',
        isStreaming: true,
      });
    });

    socket.on('agent:message:chunk', (data) => {
      appendToMessage(data.messageId, data.chunk);
    });

    socket.on('agent:message:end', (data) => {
      finalizeMessage(data.messageId, {
        tokensInput: data.tokensInput,
        tokensOutput: data.tokensOutput,
        costUsd: data.costUsd,
        latencyMs: data.latencyMs,
      });
    });

    socket.on('round:start', (data) => addRound(data));
    socket.on('round:end', (data) => { /* обновить статус раунда */ });
    socket.on('session:status', (data) => updateStatus(data));
    socket.on('report:ready', () => { /* invalidate report query */ });
    socket.on('session:error', (data) => { /* Sonner toast error */ });

    return () => {
      socket.emit('session:leave', { sessionId });
      socket.disconnect();
    };
  }, [sessionId]);
}
```

## Zustand Store

```typescript
// store/session-store.ts
interface SessionState {
  session: Session | null;
  messages: Message[];
  rounds: Round[];
  ideas: Idea[];

  setSession: (session: Session) => void;
  addMessage: (message: StreamingMessage) => void;
  appendToMessage: (messageId: string, chunk: string) => void;
  finalizeMessage: (messageId: string, meta: MessageMeta) => void;
  addRound: (round: RoundEvent) => void;
  updateStatus: (data: StatusUpdate) => void;
  updateIdeas: (ideas: Idea[]) => void;
}
```

Server state (список сессий, модели, промпты, отчёт) — через TanStack React Query.
Real-time state (текущие сообщения, статус стриминга) — через Zustand.

## Стилизация

Tailwind CSS 4 + Shadcn UI. **Тёмная тема по умолчанию** (внутренний инструмент).

Цвета агентов (из `AGENT_COLORS`):

| Роль | Tailwind-классы |
|------|----------------|
| Директор | `bg-blue-500/10 border-blue-500` |
| Аналитик 1 (Claude) | `bg-emerald-500/10 border-emerald-500` |
| Аналитик 2 (GPT) | `bg-orange-500/10 border-orange-500` |
| Аналитик 3 (Gemini) | `bg-yellow-500/10 border-yellow-500` |
| Аналитик 4 | `bg-cyan-500/10 border-cyan-500` |
| Аналитик 5 | `bg-pink-500/10 border-pink-500` |
| Аналитик 6 | `bg-red-500/10 border-red-500` |
| Ресерчер | `bg-purple-500/10 border-purple-500` |
| Пользователь | `bg-green-500/10 border-green-500` |
| Система | `bg-gray-500/10 border-gray-500` |

Маппинг через `AGENT_COLORS` → Tailwind-классы (без магических строк в компонентах).

## npm-зависимости

```json
{
  "next": "^16.x",
  "react": "^19.x",
  "tailwindcss": "^4.x",
  "zustand": "^5.x",
  "@tanstack/react-query": "^5.x",
  "@tanstack/react-table": "^8.x",
  "socket.io-client": "^4.x",
  "lucide-react": "*",
  "recharts": "^2.x",
  "sonner": "*"
}
```

Установка: `yarn add`.
Shadcn UI компоненты — через `yarn dlx shadcn@latest add ...`.

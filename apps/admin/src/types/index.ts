import type {
  SessionDto,
  SessionFilters,
  AgentDto,
  MessageDto,
  SessionMode,
  SessionStatus,
  AgentRole,
  RoundType,
  PromptTemplateDto,
} from '@oracle/shared';

export type {
  SessionDto,
  SessionFilters,
  AgentDto,
  RoundDto,
  MessageDto,
  ToolCallDto,
  IdeaDto,
  IdeaDetails,
  IceScore,
  RiceScore,
  AnalystScore,
  ReportDto,
  ReportContent,
  ReportIdea,
  ReportRejectedIdea,
  PromptTemplateDto,
  SettingDto,
  ModelInfo,
  ChatMessage,
  ToolCall,
  ToolDefinition,
  ToolCallResult,
  LlmChatParams,
  LlmChatResponse,
  LlmStreamChunk,
} from '@oracle/shared';

export {
  SESSION_MODE,
  SESSION_STATUS,
  AGENT_ROLE,
  ROUND_TYPE,
  ROUND_STATUS,
  MESSAGE_ROLE,
  IDEA_STATUS,
  SESSION_LIMITS,
  AGENT_DEFAULTS,
  AGENT_COLORS,
  LLM_DEFAULTS,
  PAGINATION,
  AUTH,
} from '@oracle/shared';

export type {
  SessionMode,
  SessionStatus,
  AgentRole,
  RoundType,
  RoundStatus,
  MessageRole,
  IdeaStatus,
} from '@oracle/shared';

/** Данные пользователя для UI */
export interface UserDto {
  id: string;
  name: string;
  email: string;
}

/** Ответ на логин */
export interface LoginResponse {
  accessToken: string;
  user: UserDto;
}

/** Сообщение в стриминге (с флагом isStreaming) */
export interface StreamingMessage {
  id: string;
  agentId: string | null;
  agentName: string | null;
  agentRole: string | null;
  roundId: string;
  content: string;
  isStreaming: boolean;
  tokensInput?: number;
  tokensOutput?: number;
  costUsd?: number;
  latencyMs?: number;
}

/** Событие раунда из WebSocket */
export interface RoundEvent {
  sessionId: string;
  roundId: string;
  roundNumber: number;
  roundType: string;
}

/** Событие обновления статуса из WebSocket */
export interface StatusUpdate {
  sessionId: string;
  status: string;
  currentRound?: number;
  totalCostUsd?: number;
}

/** Статус WebSocket-соединения */
export type ConnectionStatus = 'disconnected' | 'connected' | 'reconnecting';

/**
 * Расширенный SessionDto: детали сессии с агентами и счётчиками.
 * Возвращается из GET /api/sessions/:id
 */
export interface SessionDetailDto {
  id: string;
  userId: string;
  title: string;
  mode: SessionMode;
  status: SessionStatus;
  inputPrompt: string;
  existingIdeas: string | null;
  filters: SessionFilters;
  maxRounds: number;
  currentRound: number;
  maxResearchCalls: number;
  researchCallsUsed: number;
  totalTokensInput: number;
  totalTokensOutput: number;
  totalCostUsd: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  agents: AgentDto[];
  roundsCount: number;
  messagesCount: number;
  ideasCount: number;
}

/**
 * Расширенное сообщение: включает информацию об агенте и раунде.
 * Возвращается из GET /api/sessions/:id/messages
 */
export interface MessageWithAgent extends MessageDto {
  agent?: {
    name: string;
    role: AgentRole;
    modelId: string;
  };
  round?: {
    number: number;
    type: RoundType;
  };
}

/** Ответ на GET /api/sessions (пагинация) */
export interface SessionsListResponse {
  items: SessionDto[];
  total: number;
  page: number;
}

/** Ответ на GET /api/sessions/:id/messages */
export interface MessagesResponse {
  items: MessageWithAgent[];
  total: number;
}

/** DTO для создания агента (соответствует CreateAgentDto на бэкенде) */
export interface CreateAgentPayload {
  role: AgentRole;
  name?: string;
  provider: string;
  modelId: string;
  promptTemplateId?: string;
  customSystemPrompt?: string;
  webSearchEnabled?: boolean;
}

/** DTO для создания сессии (соответствует CreateSessionDto на бэкенде) */
export interface CreateSessionPayload {
  title?: string;
  mode: SessionMode;
  inputPrompt: string;
  existingIdeas?: string[];
  agents: CreateAgentPayload[];
  filters?: SessionFilters;
  maxRounds?: number;
  maxResearchCalls?: number;
}

/** Состояние одного агента в форме создания сессии (только фронтенд) */
export interface AgentFormState {
  /** React key (crypto.randomUUID()) */
  _tempId: string;
  role: AgentRole;
  name: string;
  modelId: string;
  provider: string;
  systemPrompt: string;
  webSearchEnabled: boolean;
}

/** Фильтры сессии в форме создания (только фронтенд) */
export interface FiltersFormState {
  /** Сложность реализации 1–10 */
  complexity: number;
  /** Бюджет в USD */
  budget: number | '';
  timeToRevenue: TimeToRevenueOption;
  marketSize: MarketSizeOption;
  legalRisk: LegalRiskOption;
  requireCompetitors: boolean;
  operabilityCheck: boolean;
}

/** Варианты select-поля «Время до выручки» */
export const TIME_TO_REVENUE_OPTIONS = ['1_month', '3_months', '6_months'] as const;
export type TimeToRevenueOption = (typeof TIME_TO_REVENUE_OPTIONS)[number];

/** Варианты select-поля «Размер рынка» */
export const MARKET_SIZE_OPTIONS = ['small', 'medium', 'large'] as const;
export type MarketSizeOption = (typeof MARKET_SIZE_OPTIONS)[number];

/** Варианты select-поля «Юридический риск» */
export const LEGAL_RISK_OPTIONS = ['low', 'medium', 'high'] as const;
export type LegalRiskOption = (typeof LEGAL_RISK_OPTIONS)[number];

/** Ответ GET /api/prompts */
export interface PromptsListResponse {
  items: PromptTemplateDto[];
  total: number;
}

/** Payload для PATCH /api/settings */
export interface UpdateSettingsPayload {
  openrouter_api_key?: string;
  perplexity_api_key?: string;
  anthropic_api_key?: string;
  openai_api_key?: string;
  google_api_key?: string;
  serper_api_key?: string;
  default_max_rounds?: string;
  default_analyst_count?: string;
  default_director_model?: string;
  default_researcher_model?: string;
}

/** Payload для POST /api/prompts */
export interface CreatePromptPayload {
  name: string;
  role: AgentRole;
  modelId?: string;
  content: string;
  isDefault?: boolean;
}

/** Payload для PATCH /api/prompts/:id */
export interface UpdatePromptPayload {
  name?: string;
  modelId?: string;
  content?: string;
  isDefault?: boolean;
}

import type { SessionMode } from "../enums/session-mode.enum";
import type { SessionStatus } from "../enums/session-status.enum";

/** Фильтры сессии */
export interface SessionFilters {
  maxComplexity?: number;
  maxBudget?: number;
  timeToRevenue?: string;
  minMarketSize?: string;
  requireCompetitors?: boolean;
  legalRiskTolerance?: string;
  operabilityCheck?: boolean;
  [key: string]: unknown;
}

/** Сессия (DTO для клиента) */
export interface SessionDto {
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
}

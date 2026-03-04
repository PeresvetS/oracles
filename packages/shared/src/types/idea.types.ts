import type { IdeaStatus } from "../enums/idea-status.enum";

/** ICE-скоринг */
export interface IceScore {
  impact: number;
  confidence: number;
  ease: number;
  total: number;
}

/** RICE-скоринг */
export interface RiceScore {
  reach: number;
  impact: number;
  confidence: number;
  effort: number;
  total: number;
}

/** Скоринг одного аналитика */
export interface AnalystScore {
  ice: IceScore;
  rice: RiceScore;
}

/** Детали идеи */
export interface IdeaDetails {
  implementation?: string;
  competitors?: string;
  risks?: string;
  opportunities?: string;
  budget?: string;
  cpl?: string;
  unitEconomics?: string;
  investmentsInNiche?: string;
  timeToRevenue?: string;
  [key: string]: unknown;
}

/** Идея (DTO для клиента) */
export interface IdeaDto {
  id: string;
  sessionId: string;
  title: string;
  summary: string;
  status: IdeaStatus;
  proposedByAgentId: string | null;
  proposedInRound: number | null;
  rejectedInRound: number | null;
  rejectionReason: string | null;
  details: IdeaDetails | null;
  scores: Record<string, AnalystScore> | null;
  avgIce: number | null;
  avgRice: number | null;
  createdAt: string;
  updatedAt: string;
}

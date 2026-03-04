/** Отчёт (DTO для клиента) */
export interface ReportDto {
  id: string;
  sessionId: string;
  content: ReportContent;
  createdAt: string;
  updatedAt: string;
}

/** Содержимое отчёта */
export interface ReportContent {
  finalIdeas: ReportIdea[];
  rejectedIdeas: ReportRejectedIdea[];
  summary: string;
  totalRounds: number;
  totalCostUsd: number;
  [key: string]: unknown;
}

/** Идея в отчёте */
export interface ReportIdea {
  title: string;
  summary: string;
  avgIce: number;
  avgRice: number;
  details: Record<string, unknown>;
  scores: Record<string, unknown>;
}

/** Отброшенная идея в отчёте */
export interface ReportRejectedIdea {
  title: string;
  summary: string;
  rejectionReason: string;
  rejectedInRound: number;
}

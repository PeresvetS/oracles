import type { RoundType } from "../enums/round-type.enum";
import type { RoundStatus } from "../enums/round-status.enum";

/** Раунд (DTO для клиента) */
export interface RoundDto {
  id: string;
  sessionId: string;
  number: number;
  type: RoundType;
  status: RoundStatus;
  userMessage: string | null;
  startedAt: string;
  completedAt: string | null;
}

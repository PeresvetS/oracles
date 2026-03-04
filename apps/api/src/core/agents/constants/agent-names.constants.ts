/** Дефолтные имена агентов по ролям */
export const DEFAULT_AGENT_NAMES: Record<string, string> = {
  DIRECTOR: 'Директор',
  RESEARCHER: 'Ресерчер',
};

/** Генерация имени аналитика по порядковому номеру */
export function generateAnalystName(index: number): string {
  return `Аналитик ${index}`;
}

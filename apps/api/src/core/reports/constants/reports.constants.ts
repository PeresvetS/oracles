/** Разделитель для CSV (совместим с Excel) */
export const CSV_SEPARATOR = ';';

/** UTF-8 BOM для корректного отображения в Excel */
export const CSV_UTF8_BOM = '\uFEFF';

/** Поддерживаемые форматы экспорта */
export const EXPORT_FORMAT = {
  CSV: 'csv',
  JSON: 'json',
} as const;

export type ExportFormat = (typeof EXPORT_FORMAT)[keyof typeof EXPORT_FORMAT];

/** Заголовки CSV для финальных идей */
export const CSV_IDEA_HEADERS = [
  'Название',
  'Описание',
  'Средний ICE',
  'Средний RICE',
  'Количество оценок',
];

/** Заголовок секции отклонённых идей в CSV */
export const CSV_REJECTED_SECTION_HEADER = 'Отклонённые идеи';

/** Заголовки CSV для отклонённых идей */
export const CSV_REJECTED_HEADERS = ['Название', 'Описание', 'Причина отклонения'];

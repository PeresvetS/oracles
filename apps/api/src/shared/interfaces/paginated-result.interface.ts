/** Обёртка для пагинированных результатов */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
}

import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * FastAPI: `page: int = Query(1, ge=1)`, `page_size: int = Query(50, ge=1, le=100)`.
 * Query params arrive as strings, so @Type(() => Number) is required here — that coercion is safe
 * for small integers and is NOT the money case, where coercion is banned.
 */
export class PageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page_size: number = 50;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface ListResponse<T> {
  items: T[];
  total: number;
}

/** `{items, total, page, page_size}` — income sources and transactions. */
export function paginated<T>(
  items: T[],
  total: number,
  query: PageQueryDto,
): PaginatedResponse<T> {
  return { items, total, page: query.page, page_size: query.page_size };
}

/** `{items, total}` — distribution rules, where FastAPI sets total = len(items), not a COUNT. */
export function listed<T>(items: T[]): ListResponse<T> {
  return { items, total: items.length };
}

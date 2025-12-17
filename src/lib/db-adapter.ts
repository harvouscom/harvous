/**
 * Database Adapter Interface
 * 
 * Provides a unified interface for database operations that works with both
 * Astro DB (SaaS) and PostgreSQL (self-hosted)
 */

export interface DbAdapter {
  select<T = any>(columns?: any): SelectBuilder<T>;
  insert<T = any>(table: any): InsertBuilder<T>;
  update<T = any>(table: any): UpdateBuilder<T>;
  delete<T = any>(table: any): DeleteBuilder<T>;
}

export interface SelectBuilder<T> {
  from(table: any): SelectBuilder<T>;
  where(condition: any): SelectBuilder<T>;
  orderBy(...columns: any[]): SelectBuilder<T>;
  limit(count: number): SelectBuilder<T>;
  innerJoin(table: any, condition: any): SelectBuilder<T>;
  leftJoin(table: any, condition: any): SelectBuilder<T>;
  all(): Promise<T[]>;
  get(): Promise<T | undefined>;
}

export interface InsertBuilder<T> {
  values(data: T | T[]): Promise<any>;
}

export interface UpdateBuilder<T> {
  set(data: Partial<T>): UpdateBuilder<T>;
  where(condition: any): Promise<any>;
}

export interface DeleteBuilder<T> {
  where(condition: any): Promise<any>;
}

/**
 * Get the appropriate database adapter based on environment
 */
export function getDbAdapter(): DbAdapter {
  const isSelfHosted = import.meta.env.SELF_HOSTED === 'true';
  
  if (isSelfHosted) {
    // Use PostgreSQL adapter
    return require('./db-postgres').default;
  } else {
    // Use Astro DB adapter
    return require('./db-astro').default;
  }
}


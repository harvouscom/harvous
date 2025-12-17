/**
 * PostgreSQL Database Adapter
 * 
 * Implements database operations using PostgreSQL for self-hosted mode
 */

import postgres from 'postgres';

// Connection pool (singleton)
let sql: ReturnType<typeof postgres> | null = null;

/**
 * Get PostgreSQL connection
 */
function getConnection() {
  if (!sql) {
    const databaseUrl = import.meta.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is required for self-hosted mode');
    }
    
    sql = postgres(databaseUrl, {
      max: 10, // Connection pool size
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return sql;
}

/**
 * Convert Astro DB column reference to PostgreSQL column name
 */
function getColumnName(column: any): string {
  if (typeof column === 'string') {
    return column;
  }
  // Handle Astro DB column references (e.g., Notes.id)
  if (column && typeof column === 'object' && 'name' in column) {
    return column.name;
  }
  return String(column);
}

/**
 * Convert Astro DB table reference to PostgreSQL table name
 */
function getTableName(table: any): string {
  if (typeof table === 'string') {
    return table;
  }
  // Handle Astro DB table references
  if (table && typeof table === 'object') {
    // Try common properties
    if ('name' in table) return table.name;
    if ('tableName' in table) return table.tableName;
  }
  // Fallback: convert to snake_case
  return String(table).toLowerCase().replace(/([A-Z])/g, '_$1').toLowerCase();
}

/**
 * Build WHERE clause from Astro DB conditions
 */
function buildWhereClause(condition: any, params: any[] = []): { sql: string; params: any[] } {
  if (!condition) {
    return { sql: '', params };
  }

  // Handle eq(column, value)
  if (condition.type === 'eq' || (condition.column && condition.value !== undefined)) {
    const column = condition.column || condition.left;
    const value = condition.value || condition.right;
    params.push(value);
    return {
      sql: `${getColumnName(column)} = $${params.length}`,
      params
    };
  }

  // Handle and(...conditions)
  if (condition.type === 'and' || Array.isArray(condition)) {
    const conditions = Array.isArray(condition) ? condition : condition.conditions || [];
    const clauses = conditions.map((c: any) => buildWhereClause(c, params));
    return {
      sql: clauses.map(c => c.sql).filter(Boolean).join(' AND '),
      params: clauses.reduce((acc: any[], c: any) => [...acc, ...c.params], [])
    };
  }

  // Handle or(...conditions)
  if (condition.type === 'or') {
    const conditions = condition.conditions || [];
    const clauses = conditions.map((c: any) => buildWhereClause(c, params));
    return {
      sql: `(${clauses.map(c => c.sql).filter(Boolean).join(' OR ')})`,
      params: clauses.reduce((acc: any[], c: any) => [...acc, ...c.params], [])
    };
  }

  // Handle like(column, pattern)
  if (condition.type === 'like' || (condition.column && condition.pattern)) {
    const column = condition.column || condition.left;
    const pattern = condition.pattern || condition.right;
    params.push(pattern);
    return {
      sql: `${getColumnName(column)} LIKE $${params.length}`,
      params
    };
  }

  // Handle ne(column, value)
  if (condition.type === 'ne') {
    const column = condition.column || condition.left;
    const value = condition.value || condition.right;
    params.push(value);
    return {
      sql: `${getColumnName(column)} != $${params.length}`,
      params
    };
  }

  // Handle isNull(column)
  if (condition.type === 'isNull') {
    return {
      sql: `${getColumnName(condition.column)} IS NULL`,
      params
    };
  }

  // Handle isNotNull(column)
  if (condition.type === 'isNotNull') {
    return {
      sql: `${getColumnName(condition.column)} IS NOT NULL`,
      params
    };
  }

  // Handle inArray(column, values)
  if (condition.type === 'inArray') {
    const column = condition.column || condition.left;
    const values = condition.values || condition.right;
    const placeholders = values.map((_: any, i: number) => {
      params.push(values[i]);
      return `$${params.length}`;
    }).join(', ');
    return {
      sql: `${getColumnName(column)} IN (${placeholders})`,
      params
    };
  }

  // Handle gte(column, value)
  if (condition.type === 'gte') {
    const column = condition.column || condition.left;
    const value = condition.value || condition.right;
    params.push(value);
    return {
      sql: `${getColumnName(column)} >= $${params.length}`,
      params
    };
  }

  // Handle lt(column, value)
  if (condition.type === 'lt') {
    const column = condition.column || condition.left;
    const value = condition.value || condition.right;
    params.push(value);
    return {
      sql: `${getColumnName(column)} < $${params.length}`,
      params
    };
  }

  // Default: treat as raw SQL condition
  return { sql: String(condition), params };
}

/**
 * PostgreSQL Database Adapter Implementation
 */
const dbAdapter = {
  select<T = any>(columns?: any) {
    let selectedColumns: string[] = [];
    let fromTable: any = null;
    let whereCondition: any = null;
    let orderByColumns: any[] = [];
    let limitCount: number | null = null;
    let joins: Array<{ type: 'inner' | 'left'; table: any; condition: any }> = [];

    const builder = {
      from(table: any) {
        fromTable = table;
        return builder;
      },

      where(condition: any) {
        whereCondition = condition;
        return builder;
      },

      orderBy(...columns: any[]) {
        orderByColumns = columns;
        return builder;
      },

      limit(count: number) {
        limitCount = count;
        return builder;
      },

      innerJoin(table: any, condition: any) {
        joins.push({ type: 'inner', table, condition });
        return builder;
      },

      leftJoin(table: any, condition: any) {
        joins.push({ type: 'left', table, condition });
        return builder;
      },

      async all(): Promise<T[]> {
        const sql = getConnection();
        const params: any[] = [];
        
        // Build column list
        let columnList = '*';
        if (columns && typeof columns === 'object' && !Array.isArray(columns)) {
          // Handle select({ column1: Table.column1, column2: Table.column2 })
          const columnEntries = Object.entries(columns);
          columnList = columnEntries.map(([alias, col]) => {
            const colName = getColumnName(col);
            return `${colName} AS ${alias}`;
          }).join(', ');
        } else if (Array.isArray(columns)) {
          columnList = columns.map(getColumnName).join(', ');
        }

        // Build FROM clause
        let fromClause = `FROM ${getTableName(fromTable)}`;
        
        // Add JOINs
        for (const join of joins) {
          const joinType = join.type === 'inner' ? 'INNER JOIN' : 'LEFT JOIN';
          const joinTable = getTableName(join.table);
          const joinCondition = buildWhereClause(join.condition, params);
          fromClause += ` ${joinType} ${joinTable} ON ${joinCondition.sql}`;
          params.push(...joinCondition.params);
        }

        // Build WHERE clause
        let whereClause = '';
        if (whereCondition) {
          const where = buildWhereClause(whereCondition, params);
          whereClause = `WHERE ${where.sql}`;
          params.push(...where.params);
        }

        // Build ORDER BY clause
        let orderByClause = '';
        if (orderByColumns.length > 0) {
          const orderByParts = orderByColumns.map(col => {
            const colName = getColumnName(col);
            // Handle desc(column)
            if (col && typeof col === 'object' && col.direction === 'desc') {
              return `${getColumnName(col.column)} DESC`;
            }
            return `${colName} DESC`; // Default to DESC for compatibility
          });
          orderByClause = `ORDER BY ${orderByParts.join(', ')}`;
        }

        // Build LIMIT clause
        let limitClause = '';
        if (limitCount !== null) {
          limitClause = `LIMIT ${limitCount}`;
        }

        // Execute query
        const query = `SELECT ${columnList} ${fromClause} ${whereClause} ${orderByClause} ${limitClause}`.trim();
        const results = await sql.unsafe(query, params);
        return results as T[];
      },

      async get(): Promise<T | undefined> {
        const results = await builder.all();
        return results[0];
      }
    };

    return builder;
  },

  insert<T = any>(table: any) {
    return {
      async values(data: T | T[]): Promise<any> {
        const sql = getConnection();
        const tableName = getTableName(table);
        const records = Array.isArray(data) ? data : [data];
        
        if (records.length === 0) {
          return [];
        }

        const columns = Object.keys(records[0]);
        const placeholders = records.map((_, i) => {
          const start = i * columns.length + 1;
          return `(${columns.map((_, j) => `$${start + j}`).join(', ')})`;
        }).join(', ');

        const values = records.flatMap(record => columns.map(col => (record as any)[col]));
        const query = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES ${placeholders} RETURNING *`;
        
        return await sql.unsafe(query, values);
      }
    };
  },

  update<T = any>(table: any) {
    let updateData: Partial<T> | null = null;
    let whereCondition: any = null;

    const builder = {
      set(data: Partial<T>) {
        updateData = data;
        return builder;
      },

      where(condition: any) {
        whereCondition = condition;
        return builder;
      },

      async execute(): Promise<any> {
        if (!updateData) {
          throw new Error('Update data is required. Call set() first.');
        }

        const sql = getConnection();
        const tableName = getTableName(table);
        const params: any[] = [];
        
        // Build SET clause
        const setClauses = Object.entries(updateData).map(([key, value], index) => {
          params.push(value);
          return `${key} = $${params.length}`;
        });
        const setClause = setClauses.join(', ');

        // Build WHERE clause
        let whereClause = '';
        if (whereCondition) {
          const where = buildWhereClause(whereCondition, params);
          whereClause = `WHERE ${where.sql}`;
          params.push(...where.params);
        } else {
          throw new Error('WHERE condition is required for UPDATE');
        }

        const query = `UPDATE ${tableName} SET ${setClause} ${whereClause} RETURNING *`;
        return await sql.unsafe(query, params);
      }
    };

    return builder;
  },

  delete<T = any>(table: any) {
    return {
      async where(condition: any): Promise<any> {
        const sql = getConnection();
        const tableName = getTableName(table);
        const params: any[] = [];
        
        const where = buildWhereClause(condition, params);
        const query = `DELETE FROM ${tableName} WHERE ${where.sql} RETURNING *`;
        
        return await sql.unsafe(query, params);
      }
    };
  }
};

export default dbAdapter;


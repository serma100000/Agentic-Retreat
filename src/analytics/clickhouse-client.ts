/**
 * ClickHouse client wrapper for OpenPulse analytics.
 *
 * Provides a simple interface over ClickHouse HTTP API.
 * In dev/testing mode, uses an in-memory implementation that stores
 * data in Maps and supports basic SQL-like filtering.
 */

import type { ClickHouseConfig } from './types.js';
import { DEFAULT_CLICKHOUSE_CONFIG } from './types.js';

interface ConnectionSlot {
  id: number;
  inUse: boolean;
  lastUsed: number;
}

export class ClickHouseClient {
  private readonly config: Required<ClickHouseConfig>;
  private readonly connectionPool: ConnectionSlot[];
  private readonly tables: Map<string, Map<string, Record<string, unknown>[]>>;
  private readonly ddlStatements: string[];
  private useInMemory: boolean;

  constructor(config?: Partial<ClickHouseConfig>) {
    this.config = {
      ...DEFAULT_CLICKHOUSE_CONFIG,
      maxConnections: DEFAULT_CLICKHOUSE_CONFIG.maxConnections ?? 10,
      retryAttempts: DEFAULT_CLICKHOUSE_CONFIG.retryAttempts ?? 3,
      retryDelayMs: DEFAULT_CLICKHOUSE_CONFIG.retryDelayMs ?? 1000,
      ...config,
    };

    this.connectionPool = Array.from({ length: this.config.maxConnections }, (_, i) => ({
      id: i,
      inUse: false,
      lastUsed: 0,
    }));

    this.tables = new Map();
    this.ddlStatements = [];
    this.useInMemory = true;
  }

  /**
   * Execute a SQL query and parse the JSON response.
   * In dev mode, applies basic in-memory filtering.
   */
  async query<T>(sql: string, params?: Record<string, unknown>): Promise<T[]> {
    if (this.useInMemory) {
      return this.inMemoryQuery<T>(sql, params);
    }

    return this.withRetry(async () => {
      const conn = this.acquireConnection();
      try {
        const resolvedSql = this.resolveParams(sql, params);
        const url = this.buildUrl(resolvedSql);
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-ClickHouse-User': this.config.username,
            'X-ClickHouse-Key': this.config.password,
          },
          body: resolvedSql + ' FORMAT JSON',
        });

        if (!response.ok) {
          const body = await response.text();
          throw new Error(`ClickHouse query failed (${response.status}): ${body}`);
        }

        const result = (await response.json()) as { data: T[] };
        return result.data;
      } finally {
        this.releaseConnection(conn);
      }
    });
  }

  /**
   * Insert rows into a table.
   */
  async insert(table: string, rows: Record<string, unknown>[]): Promise<void> {
    if (rows.length === 0) return;

    if (this.useInMemory) {
      this.inMemoryInsert(table, rows);
      return;
    }

    return this.withRetry(async () => {
      const conn = this.acquireConnection();
      try {
        const columns = Object.keys(rows[0]!);
        const values = rows
          .map(row => `(${columns.map(c => this.formatValue(row[c])).join(', ')})`)
          .join(', ');

        const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${values}`;
        const url = this.buildUrl(sql);

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-ClickHouse-User': this.config.username,
            'X-ClickHouse-Key': this.config.password,
          },
          body: sql,
        });

        if (!response.ok) {
          const body = await response.text();
          throw new Error(`ClickHouse insert failed (${response.status}): ${body}`);
        }
      } finally {
        this.releaseConnection(conn);
      }
    });
  }

  /**
   * Ping the ClickHouse server to check connectivity.
   */
  async ping(): Promise<boolean> {
    if (this.useInMemory) return true;

    try {
      const response = await fetch(`http://${this.config.host}:${this.config.port}/ping`);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Execute a DDL statement (CREATE TABLE, etc.).
   */
  async createTable(ddl: string): Promise<void> {
    if (this.useInMemory) {
      this.ddlStatements.push(ddl);
      const tableNameMatch = ddl.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i);
      if (tableNameMatch?.[1]) {
        const tableName = tableNameMatch[1];
        if (!this.tables.has(tableName)) {
          this.tables.set(tableName, new Map());
        }
      }
      return;
    }

    return this.withRetry(async () => {
      const conn = this.acquireConnection();
      try {
        const url = this.buildUrl(ddl);
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-ClickHouse-User': this.config.username,
            'X-ClickHouse-Key': this.config.password,
          },
          body: ddl,
        });

        if (!response.ok) {
          const body = await response.text();
          throw new Error(`ClickHouse DDL failed (${response.status}): ${body}`);
        }
      } finally {
        this.releaseConnection(conn);
      }
    });
  }

  /**
   * Enable or disable in-memory mode.
   */
  setInMemoryMode(enabled: boolean): void {
    this.useInMemory = enabled;
  }

  /**
   * Check if client is in in-memory mode.
   */
  isInMemoryMode(): boolean {
    return this.useInMemory;
  }

  /**
   * Get all rows stored in-memory for a given table.
   */
  getInMemoryTable(table: string): Record<string, unknown>[] {
    const tableData = this.tables.get(table);
    if (!tableData) return [];
    const allRows: Record<string, unknown>[] = [];
    for (const rows of tableData.values()) {
      allRows.push(...rows);
    }
    return allRows;
  }

  /**
   * Clear all in-memory data.
   */
  clearInMemory(): void {
    this.tables.clear();
    this.ddlStatements.length = 0;
  }

  // --- Private helpers ---

  private inMemoryInsert(table: string, rows: Record<string, unknown>[]): void {
    if (!this.tables.has(table)) {
      this.tables.set(table, new Map());
    }
    const tableData = this.tables.get(table)!;

    for (const row of rows) {
      const key = this.deriveRowKey(table, row);
      if (!tableData.has(key)) {
        tableData.set(key, []);
      }
      tableData.get(key)!.push({ ...row });
    }
  }

  private deriveRowKey(table: string, row: Record<string, unknown>): string {
    // Use outage_id if present for dedup, otherwise generate a key
    if (row['outage_id'] !== undefined) {
      return String(row['outage_id']);
    }
    if (row['service_id'] !== undefined && row['timestamp'] !== undefined) {
      return `${row['service_id']}_${row['timestamp']}`;
    }
    return `${table}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private inMemoryQuery<T>(sql: string, params?: Record<string, unknown>): T[] {
    const resolvedSql = this.resolveParams(sql, params);
    const normalizedSql = resolvedSql.trim().replace(/\s+/g, ' ');

    // Extract table name from FROM clause
    const fromMatch = normalizedSql.match(/FROM\s+(\w+)/i);
    if (!fromMatch?.[1]) return [];

    const tableName = fromMatch[1];
    const allRows = this.getInMemoryTable(tableName);

    if (allRows.length === 0) return [];

    // Apply WHERE filters
    let filtered = this.applyWhereClause(allRows, normalizedSql);

    // Apply ORDER BY
    filtered = this.applyOrderBy(filtered, normalizedSql);

    // Apply LIMIT and OFFSET
    filtered = this.applyLimitOffset(filtered, normalizedSql);

    return filtered as T[];
  }

  private applyWhereClause(
    rows: Record<string, unknown>[],
    sql: string,
  ): Record<string, unknown>[] {
    const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+ORDER|\s+LIMIT|\s+GROUP|\s*$)/i);
    if (!whereMatch?.[1]) return rows;

    const conditions = whereMatch[1];
    return rows.filter(row => this.evaluateConditions(row, conditions));
  }

  private evaluateConditions(row: Record<string, unknown>, conditions: string): boolean {
    // Split by AND
    const andParts = conditions.split(/\s+AND\s+/i);

    return andParts.every(part => {
      const trimmed = part.trim();

      // Handle equality: column = 'value'
      const eqMatch = trimmed.match(/(\w+)\s*=\s*'([^']*)'/);
      if (eqMatch) {
        return String(row[eqMatch[1]!] ?? '') === eqMatch[2];
      }

      // Handle numeric equality: column = number
      const numEqMatch = trimmed.match(/(\w+)\s*=\s*(\d+(?:\.\d+)?)/);
      if (numEqMatch) {
        return Number(row[numEqMatch[1]!] ?? 0) === Number(numEqMatch[2]);
      }

      // Handle >= comparison
      const gteMatch = trimmed.match(/(\w+)\s*>=\s*'([^']*)'/);
      if (gteMatch) {
        return String(row[gteMatch[1]!] ?? '') >= gteMatch[2]!;
      }

      // Handle <= comparison
      const lteMatch = trimmed.match(/(\w+)\s*<=\s*'([^']*)'/);
      if (lteMatch) {
        return String(row[lteMatch[1]!] ?? '') <= lteMatch[2]!;
      }

      // Handle numeric >= comparison
      const numGteMatch = trimmed.match(/(\w+)\s*>=\s*(\d+(?:\.\d+)?)/);
      if (numGteMatch) {
        return Number(row[numGteMatch[1]!] ?? 0) >= Number(numGteMatch[2]);
      }

      // Handle numeric <= comparison
      const numLteMatch = trimmed.match(/(\w+)\s*<=\s*(\d+(?:\.\d+)?)/);
      if (numLteMatch) {
        return Number(row[numLteMatch[1]!] ?? 0) <= Number(numLteMatch[2]);
      }

      // Default: pass
      return true;
    });
  }

  private applyOrderBy(
    rows: Record<string, unknown>[],
    sql: string,
  ): Record<string, unknown>[] {
    const orderMatch = sql.match(/ORDER\s+BY\s+(\w+)\s*(ASC|DESC)?/i);
    if (!orderMatch?.[1]) return rows;

    const column = orderMatch[1];
    const direction = orderMatch[2]?.toUpperCase() === 'ASC' ? 1 : -1;

    return [...rows].sort((a, b) => {
      const aVal = a[column];
      const bVal = b[column];
      if (aVal === bVal) return 0;
      if (aVal === undefined || aVal === null) return direction;
      if (bVal === undefined || bVal === null) return -direction;

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return direction * aVal.localeCompare(bVal);
      }
      return direction * (Number(aVal) - Number(bVal));
    });
  }

  private applyLimitOffset(
    rows: Record<string, unknown>[],
    sql: string,
  ): Record<string, unknown>[] {
    let offset = 0;
    let limit = rows.length;

    const offsetMatch = sql.match(/OFFSET\s+(\d+)/i);
    if (offsetMatch?.[1]) {
      offset = parseInt(offsetMatch[1], 10);
    }

    const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
    if (limitMatch?.[1]) {
      limit = parseInt(limitMatch[1], 10);
    }

    return rows.slice(offset, offset + limit);
  }

  private resolveParams(sql: string, params?: Record<string, unknown>): string {
    if (!params) return sql;
    let resolved = sql;
    for (const [key, value] of Object.entries(params)) {
      const placeholder = `{${key}}`;
      resolved = resolved.replaceAll(placeholder, this.formatValue(value));
    }
    return resolved;
  }

  private formatValue(value: unknown): string {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'string') return `'${value.replace(/'/g, "\\'")}'`;
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return value ? '1' : '0';
    if (value instanceof Date) return `'${value.toISOString()}'`;
    if (Array.isArray(value)) return `[${value.map(v => this.formatValue(v)).join(', ')}]`;
    return `'${String(value)}'`;
  }

  private buildUrl(sql: string): string {
    const base = `http://${this.config.host}:${this.config.port}`;
    const dbParam = `database=${encodeURIComponent(this.config.database)}`;
    return `${base}/?${dbParam}&query=${encodeURIComponent(sql)}`;
  }

  private acquireConnection(): ConnectionSlot {
    const available = this.connectionPool.find(c => !c.inUse);
    if (!available) {
      throw new Error('No available connections in pool');
    }
    available.inUse = true;
    available.lastUsed = Date.now();
    return available;
  }

  private releaseConnection(conn: ConnectionSlot): void {
    conn.inUse = false;
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt < this.config.retryAttempts; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < this.config.retryAttempts - 1) {
          await this.delay(this.config.retryDelayMs * (attempt + 1));
        }
      }
    }
    throw lastError ?? new Error('Retry failed');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

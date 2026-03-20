/**
 * Export generator for the OpenPulse Open Data API (Sprint 19).
 *
 * Produces bulk data exports in JSON, CSV, and simplified Parquet formats.
 * All exports include CC-BY-4.0 license metadata. Supports streaming for
 * large datasets via AsyncIterable.
 */

import type { AnonymizedOutage } from './types.js';
import { LICENSE_INFO } from './types.js';

/** Size of chunks when streaming large exports. */
const STREAM_CHUNK_SIZE = 500;

/**
 * Generates bulk data exports in multiple formats.
 */
export class ExportGenerator {
  /**
   * Export data as JSON with CC-BY-4.0 license header.
   */
  toJSON(data: AnonymizedOutage[]): string {
    const exportPayload = {
      license: {
        identifier: LICENSE_INFO.identifier,
        name: LICENSE_INFO.name,
        url: LICENSE_INFO.url,
        attribution: LICENSE_INFO.attribution,
      },
      exportedAt: new Date().toISOString(),
      recordCount: data.length,
      data: data.map(record => this.serializeRecord(record)),
    };

    return JSON.stringify(exportPayload, null, 2);
  }

  /**
   * Export data as CSV with proper escaping and header row.
   * First line is a license comment, second is column headers.
   */
  toCSV(data: AnonymizedOutage[]): string {
    const lines: string[] = [];

    // License comment line
    lines.push(`# License: ${LICENSE_INFO.identifier} - ${LICENSE_INFO.url}`);

    // Header row
    const headers = [
      'id',
      'serviceSlug',
      'serviceName',
      'category',
      'state',
      'confidence',
      'windowStart',
      'windowEnd',
      'durationMs',
      'city',
      'region',
      'country',
      'reportCount',
      'detectionSignals',
    ];
    lines.push(headers.join(','));

    // Data rows
    for (const record of data) {
      const row = [
        this.csvEscape(record.id),
        this.csvEscape(record.serviceSlug),
        this.csvEscape(record.serviceName),
        this.csvEscape(record.category),
        this.csvEscape(record.state),
        String(record.confidence),
        this.csvEscape(record.windowStart.toISOString()),
        record.windowEnd ? this.csvEscape(record.windowEnd.toISOString()) : '',
        String(record.durationMs),
        this.csvEscape(record.city),
        this.csvEscape(record.region),
        this.csvEscape(record.country),
        String(record.reportCount),
        this.csvEscape(record.detectionSignals.join(';')),
      ];
      lines.push(row.join(','));
    }

    return lines.join('\n');
  }

  /**
   * Export data in a simplified columnar (Parquet-like) format.
   *
   * Real Parquet is a binary format requiring native libraries.
   * This produces a JSON-based columnar representation that captures
   * the same structural concept: data organized by columns rather than rows.
   */
  toParquet(data: AnonymizedOutage[]): string {
    const columns: Record<string, unknown[]> = {
      id: [],
      serviceSlug: [],
      serviceName: [],
      category: [],
      state: [],
      confidence: [],
      windowStart: [],
      windowEnd: [],
      durationMs: [],
      city: [],
      region: [],
      country: [],
      reportCount: [],
      detectionSignals: [],
    };

    for (const record of data) {
      columns['id']!.push(record.id);
      columns['serviceSlug']!.push(record.serviceSlug);
      columns['serviceName']!.push(record.serviceName);
      columns['category']!.push(record.category);
      columns['state']!.push(record.state);
      columns['confidence']!.push(record.confidence);
      columns['windowStart']!.push(record.windowStart.toISOString());
      columns['windowEnd']!.push(record.windowEnd?.toISOString() ?? null);
      columns['durationMs']!.push(record.durationMs);
      columns['city']!.push(record.city);
      columns['region']!.push(record.region);
      columns['country']!.push(record.country);
      columns['reportCount']!.push(record.reportCount);
      columns['detectionSignals']!.push(record.detectionSignals);
    }

    const schema = Object.keys(columns).map(name => ({
      name,
      type: this.inferColumnType(name),
      count: data.length,
    }));

    const parquetPayload = {
      format: 'columnar',
      version: '1.0',
      license: LICENSE_INFO.identifier,
      schema,
      rowCount: data.length,
      columns,
    };

    return JSON.stringify(parquetPayload);
  }

  /**
   * Stream export data in chunks as an AsyncIterable.
   * Useful for large datasets to avoid loading everything into memory.
   */
  async *streamExport(
    data: AnonymizedOutage[],
    format: 'json' | 'csv' | 'parquet',
  ): AsyncIterable<string> {
    if (data.length <= STREAM_CHUNK_SIZE) {
      yield this.generateChunk(data, format, true, true);
      return;
    }

    const totalChunks = Math.ceil(data.length / STREAM_CHUNK_SIZE);

    for (let i = 0; i < totalChunks; i++) {
      const start = i * STREAM_CHUNK_SIZE;
      const end = Math.min(start + STREAM_CHUNK_SIZE, data.length);
      const chunk = data.slice(start, end);
      const isFirst = i === 0;
      const isLast = i === totalChunks - 1;

      yield this.generateChunk(chunk, format, isFirst, isLast);
    }
  }

  private generateChunk(
    data: AnonymizedOutage[],
    format: 'json' | 'csv' | 'parquet',
    isFirst: boolean,
    isLast: boolean,
  ): string {
    switch (format) {
      case 'json': {
        if (isFirst && isLast) {
          return this.toJSON(data);
        }
        const records = data.map(r => this.serializeRecord(r));
        const jsonLines = records.map(r => JSON.stringify(r));
        if (isFirst) {
          return `{"license":"${LICENSE_INFO.identifier}","data":[\n${jsonLines.join(',\n')}`;
        }
        if (isLast) {
          return `,\n${jsonLines.join(',\n')}\n]}`;
        }
        return `,\n${jsonLines.join(',\n')}`;
      }
      case 'csv': {
        const lines: string[] = [];
        if (isFirst) {
          lines.push(`# License: ${LICENSE_INFO.identifier} - ${LICENSE_INFO.url}`);
          lines.push(
            'id,serviceSlug,serviceName,category,state,confidence,' +
            'windowStart,windowEnd,durationMs,city,region,country,' +
            'reportCount,detectionSignals',
          );
        }
        for (const record of data) {
          const row = [
            this.csvEscape(record.id),
            this.csvEscape(record.serviceSlug),
            this.csvEscape(record.serviceName),
            this.csvEscape(record.category),
            this.csvEscape(record.state),
            String(record.confidence),
            this.csvEscape(record.windowStart.toISOString()),
            record.windowEnd ? this.csvEscape(record.windowEnd.toISOString()) : '',
            String(record.durationMs),
            this.csvEscape(record.city),
            this.csvEscape(record.region),
            this.csvEscape(record.country),
            String(record.reportCount),
            this.csvEscape(record.detectionSignals.join(';')),
          ];
          lines.push(row.join(','));
        }
        return lines.join('\n');
      }
      case 'parquet':
        return this.toParquet(data);
    }
  }

  /**
   * Escape a value for CSV output. Wraps in quotes if needed.
   */
  private csvEscape(value: string): string {
    if (
      value.includes(',') ||
      value.includes('"') ||
      value.includes('\n') ||
      value.includes('\r')
    ) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  /**
   * Serialize a record for JSON output, converting dates to ISO strings.
   */
  private serializeRecord(record: AnonymizedOutage): Record<string, unknown> {
    return {
      id: record.id,
      serviceSlug: record.serviceSlug,
      serviceName: record.serviceName,
      category: record.category,
      state: record.state,
      confidence: record.confidence,
      windowStart: record.windowStart.toISOString(),
      windowEnd: record.windowEnd?.toISOString() ?? null,
      durationMs: record.durationMs,
      city: record.city,
      region: record.region,
      country: record.country,
      reportCount: record.reportCount,
      detectionSignals: record.detectionSignals,
    };
  }

  private inferColumnType(name: string): string {
    const typeMap: Record<string, string> = {
      id: 'string',
      serviceSlug: 'string',
      serviceName: 'string',
      category: 'string',
      state: 'string',
      confidence: 'float64',
      windowStart: 'timestamp',
      windowEnd: 'timestamp',
      durationMs: 'int64',
      city: 'string',
      region: 'string',
      country: 'string',
      reportCount: 'int64',
      detectionSignals: 'list<string>',
    };
    return typeMap[name] ?? 'string';
  }
}

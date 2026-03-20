/**
 * Environment configuration with sensible defaults.
 * All values are read from environment variables at startup.
 */

export interface AppConfig {
  readonly port: number;
  readonly host: string;
  readonly databaseUrl: string;
  readonly redisUrl: string;
  readonly kafkaBrokers: string[];
  readonly rateLimitMax: number;
  readonly geoipDbPath: string | undefined;
  readonly nodeEnv: string;
  readonly logLevel: string;
}

function requireEnv(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export function loadConfig(): AppConfig {
  return {
    port: parseInt(process.env['PORT'] ?? '3001', 10),
    host: process.env['HOST'] ?? '0.0.0.0',
    databaseUrl: requireEnv(
      'DATABASE_URL',
      'postgresql://postgres:postgres@localhost:5432/openpulse',
    ),
    redisUrl: requireEnv('REDIS_URL', 'redis://localhost:6379'),
    kafkaBrokers: (process.env['KAFKA_BROKERS'] ?? 'localhost:9092')
      .split(',')
      .map((b) => b.trim()),
    rateLimitMax: parseInt(process.env['RATE_LIMIT_MAX'] ?? '100', 10),
    geoipDbPath: process.env['GEOIP_DB_PATH'],
    nodeEnv: process.env['NODE_ENV'] ?? 'development',
    logLevel: process.env['LOG_LEVEL'] ?? 'info',
  };
}

export const config = loadConfig();

import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

const DATABASE_URL =
  process.env['DATABASE_URL'] ?? 'postgresql://postgres:postgres@localhost:5432/openpulse';

const queryClient = postgres(DATABASE_URL);

export const db = drizzle(queryClient, { schema });

export { queryClient };

export type Database = typeof db;

import 'dotenv/config';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DATABASE_URL =
  process.env['DATABASE_URL'] ?? 'postgresql://postgres:postgres@localhost:5432/openpulse';

async function migrate(): Promise<void> {
  const sql = postgres(DATABASE_URL);

  try {
    console.log('Starting database migration...');
    console.log(`Connecting to: ${DATABASE_URL.replace(/:[^:@]+@/, ':****@')}`);

    // Ensure the migrations tracking table exists
    await sql`
      CREATE TABLE IF NOT EXISTS _migrations (
        id         SERIAL PRIMARY KEY,
        name       VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;

    // Read migration files sorted by name
    const migrationsDir = join(__dirname, 'migrations');
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.log('No migration files found.');
      return;
    }

    for (const file of files) {
      // Check if already applied
      const applied = await sql`
        SELECT id FROM _migrations WHERE name = ${file}
      `;

      if (applied.length > 0) {
        console.log(`  [skip] ${file} (already applied)`);
        continue;
      }

      console.log(`  [run]  ${file}`);
      const content = readFileSync(join(migrationsDir, file), 'utf-8');

      await sql.unsafe(content);

      // Record migration (the table may have been created by the migration itself,
      // so we do an upsert to handle the case where it was just created above)
      await sql`
        INSERT INTO _migrations (name) VALUES (${file})
        ON CONFLICT (name) DO NOTHING
      `;

      console.log(`  [done] ${file}`);
    }

    console.log('All migrations applied successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

migrate();

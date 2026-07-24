import pg from 'pg';
import { config } from './config.js';

const { Pool } = pg;

const databaseUrl = new URL(config.DATABASE_URL);
const sslMode = databaseUrl.searchParams.get('sslmode');
databaseUrl.searchParams.delete('sslmode');

export const pool = new Pool({
  connectionString: databaseUrl.toString(),
  ssl: sslMode === 'require'
    ? { rejectUnauthorized: false }
    : undefined,
  max: 12,
  idleTimeoutMillis: 30_000,
});

export async function closeDatabase() {
  await pool.end();
}

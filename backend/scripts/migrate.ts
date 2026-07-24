import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pool } from '../src/db.js';

async function migrate() {
  const directory = resolve(process.cwd(), 'migrations');
  const files = (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort();
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);

  for (const filename of files) {
    const applied = await pool.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [filename]);
    if (applied.rowCount) continue;
    const sql = await readFile(resolve(directory, filename), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
      await client.query('COMMIT');
      console.log(`Applied ${filename}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

migrate()
  .then(async () => pool.end())
  .catch(async (error) => {
    console.error(error);
    await pool.end();
    process.exitCode = 1;
  });

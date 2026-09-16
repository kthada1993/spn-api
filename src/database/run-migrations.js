import fs from 'node:fs/promises';
import path from 'node:path';

import { pool } from './connection.js';

function splitSqlStatements(sqlText) {
  return sqlText
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);
}

async function runMigrations() {
  const migrationsDir = path.resolve('src/database/migrations');
  const files = (await fs.readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();

  for (const file of files) {
    const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
    const statements = splitSqlStatements(sql);

    for (const statement of statements) {
      await pool.query(statement);
    }

    console.log(`Applied migration: ${file}`);
  }

  await pool.end();
}

runMigrations().catch(async (error) => {
  console.error('Migration failed', error.message);
  await pool.end();
  process.exit(1);
});

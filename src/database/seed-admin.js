import bcrypt from 'bcryptjs';

import { env } from '../config/env.js';
import { query, pool } from './connection.js';

async function seedAdmin() {
  if (!env.DEFAULT_ADMIN_PASSWORD) {
    throw new Error('DEFAULT_ADMIN_PASSWORD is required for seeding admin user');
  }

  const username = env.DEFAULT_ADMIN_USERNAME;
  const passwordHash = await bcrypt.hash(env.DEFAULT_ADMIN_PASSWORD, 12);

  await query(
    `
      INSERT INTO admins (username, password_hash, name, status)
      VALUES (?, ?, ?, 'ACTIVE')
      ON DUPLICATE KEY UPDATE
        password_hash = VALUES(password_hash),
        name = VALUES(name),
        status = 'ACTIVE'
    `,
    [username, passwordHash, 'System Administrator']
  );

  console.log(`Admin seed completed for username: ${username}`);
  await pool.end();
}

seedAdmin().catch(async (error) => {
  console.error('Admin seed failed', error.message);
  await pool.end();
  process.exit(1);
});

const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    await client.query('DROP SCHEMA public CASCADE');
    await client.query('CREATE SCHEMA public');
    console.log('Schema dropped and recreated.');

    // Run migrations via prisma
    const { execSync } = require('child_process');
    execSync('npx prisma migrate deploy', { stdio: 'inherit', cwd: '/app' });

    // Create organizer
    const hash = await bcrypt.hash('admin', 12);
    await client.query(
      `INSERT INTO "Organizer" (login, "passwordHash", "mustChangePassword", "createdAt", "updatedAt")
       VALUES ('admin', $1, true, NOW(), NOW())
       ON CONFLICT (login) DO UPDATE SET "passwordHash" = $1, "mustChangePassword" = true`,
      [hash]
    );
    console.log('Organizer created: admin / admin');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });

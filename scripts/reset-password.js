const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    const hash = await bcrypt.hash('admin', 12);
    const result = await client.query(
      `UPDATE "Organizer" SET "passwordHash" = $1, "mustChangePassword" = true WHERE login = 'admin'`,
      [hash]
    );
    if (result.rowCount === 0) {
      await client.query(
        `INSERT INTO "Organizer" (login, "passwordHash", "mustChangePassword", "createdAt", "updatedAt")
         VALUES ('admin', $1, true, NOW(), NOW())`,
        [hash]
      );
      console.log('Organizer created: admin / admin');
    } else {
      console.log('Password reset to "admin". Must change on next login.');
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });

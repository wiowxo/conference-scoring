const { Client } = require("pg");
const bcrypt = require("bcryptjs");

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const hash = await bcrypt.hash("admin", 12);
  await client.query(
    `UPDATE "Organizer" SET "passwordHash" = $1, "mustChangePassword" = true`,
    [hash]
  );

  const { rows } = await client.query(`SELECT COUNT(*) FROM "Organizer"`);
  console.log(`Password reset to "admin" for ${rows[0].count} organizer(s). Must change on next login.`);

  await client.end();
}

main().catch(console.error);

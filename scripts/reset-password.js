const { execSync } = require('child_process');
const bcrypt = require('bcryptjs');

async function main() {
  const hash = await bcrypt.hash('admin', 12);
  const sql = `UPDATE "Organizer" SET "passwordHash" = '${hash}', "mustChangePassword" = true WHERE login = 'admin';`;

  const result = execSync(`psql "${process.env.DATABASE_URL}" -c "${sql}"`).toString();
  console.log(result);
  console.log('Password reset to "admin". Must change on next login.');
}

main().catch(e => { console.error(e.message); process.exit(1); });

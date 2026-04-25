#!/bin/bash
# Resets organizer password back to 'admin' and forces change on next login
# Usage inside Docker: docker compose exec app sh scripts/reset-password.sh
# Usage for full DB wipe: docker compose exec app sh scripts/reset-password.sh --wipe

if [ "$1" = "--wipe" ]; then
  echo "WARNING: This will delete ALL data. Type YES to confirm:"
  read confirmation
  if [ "$confirmation" = "YES" ]; then
    # Drop and recreate schema
    node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.\$executeRawUnsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  .then(() => prisma.\$disconnect())
  .catch(e => { console.error(e); process.exit(1); });
" 2>/dev/null || true

    # Rerun migrations
    npx prisma migrate deploy

    # Recreate organizer
    ADMIN_HASH=$(node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('admin', 12).then(h => process.stdout.write(h));")

    node -e "
const { execSync } = require('child_process');
" 2>/dev/null || true

    # Use psql to insert organizer
    psql "$DATABASE_URL" -c "INSERT INTO \"Organizer\" (login, \"passwordHash\", \"mustChangePassword\", \"createdAt\", \"updatedAt\") VALUES ('admin', '$ADMIN_HASH', true, NOW(), NOW()) ON CONFLICT (login) DO UPDATE SET \"passwordHash\" = '$ADMIN_HASH', \"mustChangePassword\" = true;"

    echo "Database wiped. Organizer restored: admin / admin"
  else
    echo "Cancelled."
  fi
else
  node scripts/reset-password.js
fi

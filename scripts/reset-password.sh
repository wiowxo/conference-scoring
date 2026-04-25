#!/bin/bash
# Resets organizer password back to 'admin' and forces change on next login
# Usage inside Docker: docker compose exec app sh scripts/reset-password.sh
# Usage for full DB wipe: docker compose exec app sh scripts/reset-password.sh --wipe

if [ "$1" = "--wipe" ]; then
  echo "WARNING: This will delete ALL data. Type YES to confirm:"
  read confirmation
  if [ "$confirmation" = "YES" ]; then
    npx prisma migrate reset --force
    echo "Database wiped and migrations reapplied."
  else
    echo "Cancelled."
  fi
else
  node scripts/reset-password.js
fi

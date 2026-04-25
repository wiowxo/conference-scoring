#!/bin/bash

if [ "$1" = "--wipe" ]; then
  echo "WARNING: This will delete ALL data. Type YES to confirm:"
  read confirmation
  if [ "$confirmation" = "YES" ]; then
    node /app/scripts/wipe-db.js
    echo "Database wiped. Login: admin / admin"
  else
    echo "Cancelled."
  fi
else
  node /app/scripts/reset-password.js
fi

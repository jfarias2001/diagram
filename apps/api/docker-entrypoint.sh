#!/bin/sh
set -e
# Aplica migrations pendentes antes de subir (nunca `migrate reset` aqui).
./node_modules/.bin/prisma migrate deploy
exec node dist/server.js

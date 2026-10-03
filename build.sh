#!/usr/bin/env bash
# Descarga la última versión de cada juego e instala lo necesario.
set -e
VERSIONS=""
clone () {
  rm -rf "$2"; git clone --depth 1 "https://github.com/rischoker/$1.git" "$2"
  echo ">> $1: $(git -C "$2" log -1 --format='%h · %cd · %s' --date=format:'%Y-%m-%d %H:%M')"
  VERSIONS="$VERSIONS\"$(basename "$2" | tr A-Z a-z)\":$(git -C "$2" log -1 --format='{"hash":"%h","date":"%cI"}'),"
  rm -rf "$2/.git"
}

# Juegos estáticos (se sirven tal cual)
clone Battlecity   battlecity
clone planetcat    planetcat
clone ChickenHorde chickenhorde
clone flappyverbs  flappyverbs
clone wordclimbers wordclimbers

# Juegos con servidor
clone castlequest  apps/castlequest
(cd apps/castlequest && npm install --omit=dev --no-audit --no-fund)

# Versión de cada juego (el hub muestra "ACTUALIZADO" en la tarjeta)
echo "{${VERSIONS%,}}" > versions.json

# Dependencias del arcade
npm install --omit=dev --no-audit --no-fund

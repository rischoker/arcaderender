#!/usr/bin/env bash
# Descarga la última versión de cada juego e instala lo necesario.
set -e
clone () { rm -rf "$2"; git clone --depth 1 "https://github.com/rischoker/$1.git" "$2"; rm -rf "$2/.git"; }

# Juegos estáticos (se sirven tal cual)
clone Battlecity   battlecity
clone planetcat    planetcat
clone ChickenHorde chickenhorde
clone flappyverbs  flappyverbs

# Juegos con servidor
clone castlequest  apps/castlequest
(cd apps/castlequest && npm install --omit=dev --no-audit --no-fund)

# Dependencias del arcade
npm install --omit=dev --no-audit --no-fund

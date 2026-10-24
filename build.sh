#!/usr/bin/env bash
# Descarga la última versión de cada juego e instala lo necesario.
# Si un juego no se puede descargar (repo renombrado, privado, caído…), se omite y el arcade sigue funcionando.
set -u
VERSIONS=""
FAILED=""

note_version () {   # $1 = clave, $2 = carpeta con .git
  VERSIONS="$VERSIONS\"$1\":$(git -C "$2" log -1 --format='{"hash":"%h","date":"%cI"}'),"
}

clone () {          # $1 = repo en GitHub, $2 = carpeta destino
  rm -rf "$2"
  if git clone --depth 1 "https://github.com/rischoker/$1.git" "$2"; then
    echo ">> $1: $(git -C "$2" log -1 --format='%h · %cd · %s' --date=format:'%Y-%m-%d %H:%M')"
    note_version "$(basename "$2" | tr A-Z a-z)" "$2"
    git -C "$2" log -1 --format=%ct > "$2/.commit_time"
    rm -rf "$2/.git"
  else
    echo "!! $1: no se pudo descargar, se omite"; rm -rf "$2"; FAILED="$FAILED $1"
  fi
}

# Pone a todos los archivos de un juego la fecha de su último commit.
# Así su ETag (tamaño + fecha) no cambia en cada deploy ni cuando Render despierta el servicio,
# y los navegadores que ya lo tienen guardado reciben un 304 en vez de volver a bajarlo entero.
freeze_dates () {   # $1 = carpeta del juego
  [ -f "$1/.commit_time" ] || return 0
  find "$1" -exec touch -h -d "@$(cat "$1/.commit_time")" {} + 2>/dev/null || true
}

version_only () {   # juegos que viven en otro servicio: solo se anota su versión
  local tmp=".tmp_$2"; rm -rf "$tmp"
  if git clone --depth 1 --filter=blob:none --no-checkout "https://github.com/rischoker/$1.git" "$tmp" 2>/dev/null; then
    echo ">> $1 (servicio aparte): $(git -C "$tmp" log -1 --format='%h · %cd · %s' --date=format:'%Y-%m-%d %H:%M')"
    note_version "$2" "$tmp"
  else
    echo "!! $1: no se pudo leer su versión"
  fi
  rm -rf "$tmp"
}

# Juegos estáticos (se sirven tal cual)
clone flappyverbs  flappyverbs
clone wordclimbers wordclimbers
clone go-snail-go  gosnailgo
clone SyntCore     syntcore

# Juegos con servidor dentro del arcade
clone castlequest  apps/castlequest
if [ -d apps/castlequest ]; then
  (cd apps/castlequest && npm install --omit=dev --no-audit --no-fund) || { echo "!! castlequest: falló npm install, se omite"; rm -rf apps/castlequest; FAILED="$FAILED castlequest"; }
fi
# Los modelos 3D se descomprimen aquí (en el build) y no al arrancar: si se descomprimen al despertar,
# cada despertar estrena fechas y todos los navegadores vuelven a bajar ~19 MB.
if [ -f apps/castlequest/assets.zip ]; then
  (cd apps/castlequest && node -e "new (require('adm-zip'))('assets.zip').extractAllTo('public', true)") && echo ">> castlequest: assets.zip descomprimido en el build" || echo "!! castlequest: no se pudo descomprimir assets.zip (se hará al arrancar)"
fi

clone DuelArena    apps/duelarena
if [ -d apps/duelarena ]; then
  (cd apps/duelarena && npm install --omit=dev --no-audit --no-fund) || { echo "!! DuelArena: falló npm install, se omite"; rm -rf apps/duelarena; FAILED="$FAILED DuelArena"; }
fi

# Fechas estables para el caché del navegador
for d in flappyverbs wordclimbers gosnailgo syntcore apps/castlequest apps/duelarena; do [ -d "$d" ] && freeze_dates "$d"; done

# Juegos en su propio servicio de Render (solo versión para la cinta "ACTUALIZADO")
version_only ChickenHorde chickenhorde     # https://chicken-horde.onrender.com
version_only Battlecity   battlecity       # https://battlecity-fl0l.onrender.com
version_only MonkeyRail   monkeyrail       # https://monkeyrail.onrender.com
version_only planetcat    planetcat        # https://gato-swing.onrender.com
version_only phrasal-gp   phrasalgp        # https://phrasal-gp.onrender.com
version_only eye-of-the-beholder beholder  # https://eye-of-the-beholder.onrender.com
version_only SharkBait    sharkbait        # https://shark-bait-j1hs.onrender.com
version_only TheSyntaxCLub syntaxclub     # https://the-syntax-club.onrender.com

# Versión de cada juego (el hub muestra "ACTUALIZADO" en la tarjeta)
echo "{${VERSIONS%,}}" > versions.json

# Dependencias del arcade (esto sí es obligatorio)
set -e
npm install --omit=dev --no-audit --no-fund

[ -n "$FAILED" ] && echo "!! Juegos omitidos en este deploy:$FAILED" || echo ">> Todos los juegos listos"

# Rischoker Arcade

Hub de juegos (pantalla de inicio estilo consola) para lanzar Chicken Horde, Gato Swing, Battle City 3D y Flappy Verbs.

## Publicar en Render (Static Site)

- **Build Command:**

```
git clone --depth 1 https://github.com/rischoker/Battlecity.git battlecity && git clone --depth 1 https://github.com/rischoker/planetcat.git planetcat && git clone --depth 1 https://github.com/rischoker/ChickenHorde.git chickenhorde && git clone --depth 1 https://github.com/rischoker/flappyverbs.git flappyverbs && rm -rf */.git
```

- **Publish Directory:** `.`

Al publicar, Render descarga la última versión de cada juego y queda todo en un solo dominio:

- `/` → hub
- `/battlecity/` → Battle City 3D
- `/planetcat/` → Gato Swing
- `/chickenhorde/?host=1` → Chicken Horde
- `/flappyverbs/` → Flappy Verbs

## Agregar un juego

1. En `index.html`, copia un bloque dentro de `GAMES` y cambia nombre, `url`, colores e imágenes.
2. Agrega su `git clone` al Build Command de Render.
3. Pon sus imágenes en `img/` (portada vertical 3:4, logo con transparencia y arte 16:9 de fondo).

## Actualizar

Cuando hagas cambios en un juego, en Render pulsa **Manual Deploy → Deploy latest commit**.

# 🏰 Castle Quest – English Exam Defense

Juego multijugador de defensa de castillo que en realidad es un **simulador de examen EFL (A1–C1)**.
El proyector muestra el castillo en 3D y los estudiantes responden preguntas en su celular, cada uno a su ritmo.

- ✅ **Respuesta correcta:** el aldeano llega con suministros (virotes para las ballestas y reparaciones).
- ❌ **Respuesta incorrecta o sin tiempo:** el aldeano muere, el castillo recibe un daño leve y el celular muestra la respuesta correcta.
- ✨ **Preguntas doradas:** se responden escribiendo y quien acierta elige una mejora para todo el castillo (tipo roguelike).
- 👑 Seis oleadas cada vez más difíciles y un **jefe final** según el nivel: A1 Ogro Rey · A2 Gran Mimic · B1 Señor de la Guerra Orco · B2 Dragón · C1 Rey Lich. El modo *Final exam* mezcla todos los niveles.

## Cómo se juega en clase
1. Abre la página principal en el PC del proyector y haz clic en **Enter the castle**.
2. Los estudiantes escanean el QR (o entran a `tu-sitio/play`) y escriben el código de 4 letras.
3. Elige el nivel, el tiempo por pregunta, la duración, la dificultad y si quieres preguntas doradas. Luego presiona **Start the battle!**
4. Con **P** o **Esc** pausas la partida. En la pausa también puedes saltar a la siguiente oleada o terminar la batalla.
5. Al final, cada estudiante ve en su celular un **informe tipo examen** (aciertos por parte del examen) y puede enviar su puntaje a la **clasificación mundial**.

La dificultad se adapta al **ritmo** del grupo (cuántas preguntas responden), no a sus aciertos. Así, un grupo que acierta más gana con holgura y uno que acierta menos tiene que esforzarse. Si un grupo tiene problemas, usa la dificultad *Easy* o sube el tiempo por pregunta.

## Publicar en Render (gratis)
1. Sube esta carpeta a un repositorio de GitHub (por ejemplo `rischoker/castle-quest`).
2. En Render ve a **New → Blueprint**, elige el repositorio y Render lee `render.yaml` automáticamente.
   También puedes ir a **New → Web Service** con *Build* `npm install --omit=dev` y *Start* `node server.js`.
3. Listo: la URL de Render sirve tanto la pantalla del profesor (`/`) como la de los celulares (`/play`).

> Si el plan gratis de Render "se duerme", abre la página unos 30 segundos antes de la clase para despertarlo.

## Clasificación mundial (Supabase, opcional)
1. En Supabase, abre **SQL Editor**, pega el contenido de `supabase.sql` y ejecútalo.
2. En Render, en **Environment**, agrega estas variables:
   - `SUPABASE_URL` = la URL del proyecto (ej. `https://xxxx.supabase.co`)
   - `SUPABASE_KEY` = la *anon key*
3. Los celulares nunca hablan directo con Supabase: el servidor guarda el puntaje real de la partida. Eso evita trampas y también los bloqueos del proxy de la academia.

Sin Supabase, los puntajes se guardan en un archivo del servidor. Ese archivo se borra cada vez que Render vuelve a desplegar.

## Editar o agregar preguntas
Las preguntas están en `questions/src/A1.txt … C1.txt`, una por línea:

```
parte | pregunta (usa ___ para el espacio) | RESPUESTA CORRECTA | incorrecta | incorrecta | incorrecta
```

Las doradas van debajo de `#GOLDEN` y aceptan varias respuestas separadas por ` / `:

```
p3 | Word formation (SUCCEED): "She was ___ in her new career." | successful
```

Después de editar, ejecuta `python3 tools/build-questions.py`. Esto regenera los `.json` y avisa si hay líneas mal formadas. El orden de las opciones se mezcla solo en cada pregunta.

Banco actual: aproximadamente 500 preguntas de opción múltiple y 100 doradas, todas originales y escritas al estilo de Cambridge (no es material oficial).

## Sonidos propios (opcional)
Por defecto todos los sonidos se sintetizan y la princesa habla con la voz del navegador. Para usar archivos reales:

1. Pon los `.mp3` en `public/assets/sfx/` con estos nombres: `bolt, hit, crack, gate, horn, roar, cheer, sob, victory, defeat, coin, death, boom, build, whoosh, golden`.
2. Escribe la lista en `public/assets/sfx/list.json`, por ejemplo: `["roar","victory"]`.

## Rendimiento
Si el PC del salón va lento, el juego baja la resolución y luego apaga las sombras automáticamente.
Puedes forzar el modo ligero con `/?lite` o la calidad alta con `/?hq`.

## Créditos de modelos
KayKit (Kay Lousberg, CC0) · Kenney (Castle Kit, Fantasy Town Kit, CC0) · Quaternius (CC0, incl. Monkroose) · Poly Pizza: "Dragon" de jeremy, "Simple Goblin" de Thomas DR, "Bat wing" de Poly by Google (CC-BY).

Assets nuevos de Kenney: `python3 tools/kenney-tex.py && node tools/build-kenney.mjs` (ajusta colores y los copia a public/assets/kn). Música: public/assets/sfx/music_lobby.mp3 y music_battle.mp3.

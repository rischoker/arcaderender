# ScriptBoard Karaoke · servidor

Servidor pequeño (Node.js) que conecta el tablero (la extensión ScriptBoard) con los celulares de los estudiantes. También sirve la página que abren los celulares.

## Publicarlo en Render (una sola vez)

1. Crea un repositorio nuevo en GitHub (por ejemplo `scriptboard-karaoke`) y sube **todo el contenido de esta carpeta** (menos `node_modules`).
2. En Render: **New → Web Service** → elige ese repositorio.
3. Configura:
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance type**: Free
4. Crear. Cuando termine, Render te da una dirección tipo `https://scriptboard-karaoke.onrender.com`.
5. Pega esa dirección en la extensión: pestaña **🎤 Karaoke → Dirección del servidor**.

Para comprobar que está vivo abre `https://TU-DIRECCION.onrender.com/health` → debe decir `{"ok":true,...}`.

## Notas

- En el plan gratis Render duerme el servidor tras ~15 min sin uso; la extensión lo despierta sola al abrir la sala (tarda hasta 1 minuto).
- No guarda nada: las salas viven en memoria y se borran solas.
- Probarlo en tu PC: `npm install` y `npm start`, abre `http://localhost:3000`. (Para usar el micrófono desde otro celular hace falta HTTPS, por eso se usa Render.)

# TecnoFicha como PWA

App 100 % estática (HTML + CSS + JS con módulos ES, sin build). Los datos viven en
`localStorage` con la clave `tecnificha_v1` — **no la cambies** o los usuarios pierden sus registros.

## Estructura relevante

| Archivo | Rol |
|---|---|
| `sw.js` | Service worker. Precaché del app shell + `VERSION` (ver releases). |
| `js/pwa.js` | Registro del SW, botón de instalar y aviso de nueva versión (toast). |
| `css/pwa.css` | Estilos del botón instalar y del diálogo iOS. |
| `css/components/toast.css` | Estilos del toast y de su variante `.persistent` (aviso de versión). |
| `js/backup.js` | Núcleo del respaldo, sin DOM (ver "Respaldo de datos"). |
| `js/backup-ui.js` | Exportar / importar y el diálogo de confirmación. |
| `icons/` | Íconos 192/512 PNG, 180 apple-touch y el SVG fuente. |
| `fonts/` | DM Sans y DM Mono autoalojadas (OFL 1.1) para offline. |
| `site.webmanifest` | Manifest con `start_url`/`scope` relativos: funciona en raíz de dominio o subpath. |

Todo el proyecto usa rutas relativas, así que sirve igual en un dominio propio, en
`pages.dev` o en un subdirectorio.

## Releases

Cada vez que cambies **cualquier** archivo listado en `PRECACHE` de `sw.js`:

1. Subí `VERSION` en `sw.js` (`1.0.0` → `1.0.1`).
2. Si agregaste o borraste archivos (módulos JS, CSS, íconos, fuentes), actualizá la
   lista `PRECACHE`: si falta un archivo, el `install` del SW falla entero y la app pierde
   el modo offline; si sobra uno que ya no existe, pasa lo mismo.
3. Desplegá en Cloudflare Pages.
4. Los usuarios verán un toast persistente "Nueva versión disponible" la próxima vez que abran
   la app; al tocar **Actualizar** se activa el SW nuevo y se recarga una sola vez.

> Olvidar el paso 1 es el error más común: el SW no se reinstala y todos siguen viendo la
> versión cacheada para siempre.

No hace falta bumpear `VERSION` mientras la PWA no se haya publicado; poné la que corresponda
antes del primer deploy.

## Notas de despliegue (Cloudflare Pages)

- No hace falta `_headers`: Cloudflare ya sirve `Cache-Control: public, max-age=0, must-revalidate`
  para los assets, y el registro usa `updateViaCache: 'none'` para que el chequeo del SW vaya
  siempre a la red.
- El proyecto no necesita build command ni directorio de salida: publicá la raíz.
- La instalación solo se ofrece sobre HTTPS (o `localhost` para desarrollo).

## Probar localmente

El service worker no funciona con `file://`, así que levantá un servidor:

```bash
pnpm dlx serve .        # o: python3 -m http.server 8080
```

Después, en Chrome DevTools → **Application**:

- *Manifest*: sin errores, íconos previsualizados, "Installability" sin problemas.
- *Service Workers*: **activated and is running**.
- *Cache Storage*: existe `tecnoficha-shell-<VERSION>` con los 43 archivos del `PRECACHE`.
- Marcá **Offline** en *Network* y recargá: la app debe abrir y mostrar los datos guardados.

Para volver a disparar el prompt de instalación: desinstalá la PWA, en DevTools → Application
→ *Storage* → **Clear site data**, y recargá.

## Respaldo de datos

En la pantalla **Resumen** hay dos botones para bajar y subir los registros. Es la
única red de seguridad contra perderlos: borrados los datos del sitio, se recuperan
desde el archivo.

### Formato del archivo

```json
{
  "app": "tecnoficha",
  "schemaVersion": 1,
  "exportedAt": "2026-10-07T21:30:00.000Z",
  "count": 2,
  "data": [ { "id": "…", "nombre": "…", "cobrado": 25000, "…": "…" } ]
}
```

`app` y `schemaVersion` permiten rechazar archivos de otras apps y respaldos de
versiones más nuevas. El import también acepta un array pelado (`[…]`), por si
alguien copia a mano el contenido de `localStorage`.

El archivo se llama `tecnoficha-backup-AAAA-MM-DD.json`.

### Combinar o reemplazar

Al importar aparece un diálogo con cuántas cosas trae el archivo y qué va a pasar:

- **Combinar con mis datos** (recomendado): agrega los nuevos y, si un `id` ya
  existe, se queda con el que tenga `updatedAt` más reciente. No borra nada.
- **Reemplazar todo**: deja exactamente lo que trae el archivo. Borra lo que hubiera.

Reimportar el mismo archivo no duplica nada.

### El archivo de entrada no es confiable

Un `.json` puede estar corrupto, ser de otra app o haber sido editado a mano, así que
**el import nunca guarda el JSON tal cual**: `js/backup.js` reconstruye cada registro
campo por campo con los mismos sanitizadores del formulario.

Dos consecuencias a tener en cuenta al tocar ese código:

- **El `id` se valida contra `/^[a-z0-9]{1,40}$/i` y se regenera con `uid()` si no
  pasa.** No es cosmético: `js/views/list.js` y `js/views/detail.js` lo insertan sin
  escapar en `onclick="showDetail('${r.id}')"`, así que un `id` manipulado en el
  archivo ejecutaría código al tocar la tarjeta.
- **Un `cobrado` negativo tiene que dar 0, no su valor absoluto.** El sanitizador
  quita el signo `-`, así que hay que detectarlo antes de sanear.

### Estructura

| Archivo | Rol |
|---|---|
| `js/backup.js` | Núcleo **sin DOM**: `buildBackup`, `normalizeRecord`, `parseBackup`, `mergeRepairs`. |
| `js/backup-ui.js` | Capa del navegador: exportar, importar, `initBackup()`, el diálogo. |

La separación es a propósito: el núcleo se testea en `node --test` sin jsdom, y hay
un test que verifica que no toque `document`, `window` ni `localStorage`.

> **No cambies `tecnificha_v1` ni agregues claves.** Toda la app (y el respaldo) leen
> y escriben una sola clave de `localStorage`. El test `tests/backup-ui.test.js`
> comprueba que importar no cree ninguna otra.

## Tests

```bash
pnpm install                # devDependencies: jsdom y playwright-core
pnpm test                   # todo: 219 tests (~26 s)
pnpm test:unit              # 206 tests, sin navegador
pnpm test:e2e               # 13+12 tests en Chromium
```

Cuatro capas:

- `tests/toast.test.js` y `tests/pwa.test.js`: unitarios sobre jsdom con el `index.html` real,
  así que un id renombrado rompe los tests.
- `tests/validators.test.js`: los `sanitize*` / `validate*` de `js/utils.js` (puros, sin DOM):
  obligatorios, formatos, fechas imposibles, teléfono, RAM, monto y escapado de HTML.
- `tests/state.test.js` y `tests/form.test.js`: la capa de datos. Fijan la clave `tecnoficha_v1` de
  `localStorage` (cambiarla haría perder los registros) y cubren guardar, editar y borrar.
- `tests/static.test.js`: que los archivos del `PRECACHE` existan, que **todo módulo `js/` esté en
  el `PRECACHE`**, que los `@import` de `css/main.css` no estén rotos, que `VERSION` de `sw.js` esté
  sincronizada con `package.json` y que los ids del respaldo estén en el HTML.
- `tests/backup.test.js`, `tests/backup-export.test.js`, `tests/backup-import.test.js` y
  `tests/backup-ui.test.js`: el respaldo en jsdom, por capas (núcleo, exportar, importar, cableado).
- `tests/e2e/data-flow.test.js`: guardar una reparación y que siga ahí al recargar, incluso sin red.
- `tests/e2e/backup-flow.test.js`: en Chromium de verdad, la descarga por `<a download>`, el
  `<input type="file">` y el `<dialog>` nativo; incluye el flujo offline, el id malicioso y una
  ida y vuelta exportar → importar que compara todos los campos.
- `tests/e2e/update-flow.test.js`: el ciclo de actualización completo en Chromium de verdad
  (install → waiting → toast → `SKIP_WAITING` → activate → recarga), más que la app abra
  offline. Simula el deploy copiando el sitio a un temp y bumpeando `VERSION`.

Los e2e necesitan un Chromium: lo busca en la caché de Playwright, en el PATH, o podés
forzar `CHROMIUM_PATH=/ruta/al/chrome`. Si no hay ninguno se **saltan** (`skip`), no fallan.

jsdom no implementa `<dialog>`, `File.prototype.text()` ni `URL.createObjectURL`, así que
los tests de `backup-ui.test.js` llevan shims propios. Si tocás esos tests y empieza a
fallar raro, es probable que un shim haya dejado de reflejar algo de jsdom.

## Pendientes conocidos

- **Los datos son locales al dispositivo.** Desinstalar la PWA o borrar los datos del sitio
  borra los registros. En iOS el almacenamiento de la app instalada es separado del de Safari.
  **El respaldo solo sirve si el archivo se guarda fuera del navegador** (Drive, mail); guardado
  en el mismo navegador no protege de nada.
- **"Reemplazar todo" es irreversible.** No hay red de seguridad: la idea de guardar una copia
  de lo actual en una clave aparte antes de reemplazar quedó pendiente a propósito, porque suma
  una clave a `localStorage` y la cuota va en el mismo lugar que los datos que intenta proteger.
  Mientras tanto, el botón es rojo, el diálogo dice cuántas cosas se van a perder y está separado
  de "Combinar".
- `navigator.storage.persist()`, para pedirle al navegador que no purgue los datos, sigue pendiente.
- **La descarga por `<a download>` no está verificada en iOS.** En Safari y en la PWA instalada
  puede abrir una vista previa en vez de guardar el archivo. Si es un problema real, la salida
  es la Web Share API (`navigator.canShare({ files })`) para mandar el respaldo a Archivos,
  Drive o WhatsApp con un toque.
- En iOS no existe el evento de instalación: `js/pwa.js` muestra instrucciones manuales
  ("Compartir → Agregar a pantalla de inicio") en un `<dialog>`.

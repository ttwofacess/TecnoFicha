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
- *Cache Storage*: existe `tecnoficha-shell-<VERSION>` con los 41 archivos del `PRECACHE`.
- Marcá **Offline** en *Network* y recargá: la app debe abrir y mostrar los datos guardados.

Para volver a disparar el prompt de instalación: desinstalá la PWA, en DevTools → Application
→ *Storage* → **Clear site data**, y recargá.

## Tests

```bash
pnpm install                # devDependencies: jsdom y playwright-core
pnpm test                   # todo: 37 tests (~13 s)
pnpm test:unit              # 33 tests, sin navegador
pnpm test:e2e               # 4 tests en Chromium
```

Tres capas:

- `tests/toast.test.js` y `tests/pwa.test.js`: unitarios sobre jsdom con el `index.html` real,
  así que un id renombrado rompe los tests.
- `tests/static.test.js`: que los archivos del `PRECACHE` existan, que los `@import` de
  `css/main.css` no estén rotos, que `VERSION` de `sw.js` esté sincronizada con `package.json`
  y que no queden referencias al banner eliminado.
- `tests/e2e/update-flow.test.js`: el ciclo de actualización completo en Chromium de verdad
  (install → waiting → toast → `SKIP_WAITING` → activate → recarga), más que la app abra
  offline. Simula el deploy copiando el sitio a un temp y bumpeando `VERSION`.

Los e2e necesitan un Chromium: lo busca en la caché de Playwright, en el PATH, o podés
forzar `CHROMIUM_PATH=/ruta/al/chrome`. Si no hay ninguno se **saltan** (`skip`), no fallan.

## Pendientes conocidos

- **Los datos son locales al dispositivo.** Desinstalar la PWA o borrar los datos del sitio
  borra los registros. En iOS el almacenamiento de la app instalada es separado del de Safari.
- Exportar / Importar JSON como backup, y `navigator.storage.persist()`, son mejoras
  pendientes.
- En iOS no existe el evento de instalación: `js/pwa.js` muestra instrucciones manuales
  ("Compartir → Agregar a pantalla de inicio") en un `<dialog>`.

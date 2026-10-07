import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serve } from './server.js';

const ROOT = new URL('../../', import.meta.url).pathname;
const SKIP = new Set(['node_modules', '.git', 'tests', 'Instalar.md']);

/**
 * Copia el sitio a un directorio temporal para poder simular un deploy:
 * publicar una "v2" es cambiar VERSION de sw.js y el contenido del shell.
 */
export function createSite() {
  const dir = mkdtempSync(join(tmpdir(), 'tecnoficha-'));
  cpSync(ROOT, dir, {
    recursive: true,
    filter: (src) => !SKIP.has(src.replace(`${ROOT}/`, '').split('/')[0]),
  });

  const read = (p) => readFileSync(join(dir, p), 'utf8');
  const write = (p, content) => writeFileSync(join(dir, p), content);

  const site = {
    dir,
    read,
    write,
    version: () => read('sw.js').match(/const VERSION = '([^']+)'/)[1],
    precacheCount: () =>
      [...read('sw.js').match(/const PRECACHE = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].length,

    /** Simula el deploy de una versión nueva. */
    async deploy() {
      const [maj, min, patch] = site.version().split('.').map(Number);
      write('sw.js', read('sw.js').replace(/const VERSION = '[^']+'/, `const VERSION = '${maj}.${min}.${patch + 1}'`));
      const html = read('index.html');
      const marker = `v${maj}.${min}.${patch + 1}`;
      write('index.html', html.replace('<html lang="es">', `<html lang="es" data-build="${marker}">`));
      return marker;
    },

    async start() {
      const server = await serve(dir);
      return { ...server, async stop() { await server.close(); rmSync(dir, { recursive: true, force: true }); } };
    },

    cleanup() {
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    },
  };
  return site;
}
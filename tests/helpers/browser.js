import { chromium } from 'playwright-core';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Resuelve el Chromium de Playwright: variable de entorno, caché local de
 * Playwright, o un chromium del sistema. Devuelve null si no hay ninguno
 * (los tests e2e se saltan en vez de fallar).
 */
function findChromium() {
  if (process.env.CHROMIUM_PATH && existsSync(process.env.CHROMIUM_PATH)) return process.env.CHROMIUM_PATH;

  const cache = join(process.env.HOME || '/root', '.cache', 'ms-playwright');
  if (existsSync(cache)) {
    for (const dir of readdirSync(cache).filter((d) => d.startsWith('chromium-')).sort().reverse()) {
      for (const rel of ['chrome-linux64/chrome', 'chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
        const candidate = join(cache, dir, rel);
        if (existsSync(candidate)) return candidate;
      }
    }
  }

  for (const p of ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome']) {
    if (existsSync(p)) return p;
  }
  return null;
}

const executablePath = findChromium();
export const hasBrowser = Boolean(executablePath);
export const skipReason = hasBrowser ? false : 'no hay Chromium disponible (usá CHROMIUM_PATH=... o instalá Playwright)';

export async function launchBrowser() {
  return chromium.launch({
    executablePath: executablePath ?? undefined,
    args: process.getuid?.() === 0 ? ['--no-sandbox'] : [],
  });
}
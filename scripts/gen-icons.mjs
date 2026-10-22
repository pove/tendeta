// Renders the PWA icons (PNG) from the SVG artwork with headless Chromium.
// Usage: npm run icons
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const root = process.cwd();
const src = readFileSync(join(root, 'src/ui/svg/logo.ts'), 'utf8');
const body = /LOGO_BODY = `([\s\S]*?)`;/.exec(src)?.[1];
if (!body) throw new Error('LOGO_BODY not found');

const outDir = join(root, 'public/icons');
mkdirSync(outDir, { recursive: true });
const svg = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${inner}</svg>`;
writeFileSync(join(outDir, 'icon.svg'), svg(body) + '\n');

// Maskable: full-bleed background, artwork scaled into the 80 % safe zone.
const maskable = svg(`<rect width="512" height="512" fill="#1E5AA8"/><g transform="translate(51.2 51.2) scale(0.8)">${body}</g>`);

const targets = [
  ['icon-32.png', 32, svg(body)],
  ['icon-192.png', 192, svg(body)],
  ['icon-512.png', 512, svg(body)],
  ['apple-touch-icon.png', 180, maskable],
  ['icon-maskable-512.png', 512, maskable],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, markup] of targets) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${markup.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.locator('svg').screenshot({ path: join(outDir, name), omitBackground: true });
  console.log('✓', name);
}
await browser.close();

import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 256, height: 256 },
    deviceScaleFactor: 1,
  });
  await page.setContent(await readFile('resources/icon.svg', 'utf8'));
  await page.locator('svg').screenshot({ path: 'resources/icon.png', omitBackground: true });
} finally {
  await browser.close();
}

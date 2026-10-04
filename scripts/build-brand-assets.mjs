import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// Optional asset regeneration; normal builds serve the checked-in PNG/ICO files.
// Uses the existing browser dependency, without adding an image runtime to the Worker.
const browser = await chromium.launch({ headless: true });
try {
  for (const [name, width, height] of [['favicon', 96, 96], ['social-preview', 1200, 630]]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    const source = await readFile(new URL(`../assets/${name}.svg`, import.meta.url), 'utf8');
    await page.setContent(`<style>html,body{margin:0}svg{display:block}</style>${source}`);
    await writeFile(new URL(`../assets/${name}.png`, import.meta.url), await page.screenshot({ omitBackground: true }));
    await page.close();
  }
  const png = await readFile(new URL('../assets/favicon.png', import.meta.url));
  // ICO directory with one 96x96 PNG image (supported by modern browsers).
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header[6] = 96; header[7] = 96;
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18);
  await writeFile(new URL('../assets/favicon.ico', import.meta.url), Buffer.concat([header, png]));
  console.log('Generated favicon.png / favicon.ico / social-preview.png');
} finally {
  await browser.close();
}

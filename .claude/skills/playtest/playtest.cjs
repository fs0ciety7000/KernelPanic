// Usage: NODE_PATH=$(npm root -g) node playtest.cjs <outDir> [scenarioId]
const { chromium } = require('playwright');
const { mkdirSync } = require('node:fs');

const OUT = process.argv[2] ?? './playtest-shots';
const URL = process.env.KP_URL ?? 'http://localhost:4173/';
mkdirSync(OUT, { recursive: true });

const term = (line) => async (page) => {
  await page.keyboard.type(line, { delay: 4 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
};
const dock = (label) => async (page) => {
  await page.locator(`.dock .item[aria-label="${label}"]`).click();
  await page.waitForTimeout(600);
};

// Edit freely: [name, action]
const STEPS = [
  ['desktop', async () => {}],
  ['mail-briefing', async (p) => { await p.locator('.mail .item').first().click(); await p.waitForTimeout(400); }],
  ['terminal', async (p) => { await dock('Terminal')(p); await term('help')(p); await term('ls -la')(p); }],
  ['files', dock('Fichiers')],
  ['images', dock('Images')],
  ['logs', dock('Logs')],
  ['case', dock('Dossier')],
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && errors.push(`${m.type()}: ${m.text()}`));

  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(300);
  await page.keyboard.press('Space');
  await page.locator('.card .kp-btn.primary').first().click();
  await page.waitForTimeout(300);
  if (await page.getByText('Passer').isVisible().catch(() => false)) await page.getByText('Passer').click();
  await page.getByText('Ouvrir la session').click();
  await page.waitForTimeout(800);

  for (const [i, [name, action]] of STEPS.entries()) {
    await action(page);
    await page.screenshot({ path: `${OUT}/${String(i + 1).padStart(2, '0')}-${name}.png` });
  }
  console.log(`screenshots → ${OUT}`);
  console.log(errors.length ? errors.join('\n') : 'no console errors');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
